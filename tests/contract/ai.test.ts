import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, inject, it } from 'vitest';
import { AI_BUNDLE_FILE } from '../../server/paths.js';
import { AI_DAILY_LIMIT, AI_FAKE, AI_FEATURES, AI_INPUT_MAX, AI_PICTURE_MAX_EDGE, aiDay, aiQuotaVars, type AiFeature } from '../../src/shared/ai.js';
import { newFlyerData } from '../../src/shared/defaults.js';
import { AiFlyerResultSchema, AiPhotoResultSchema, AiShareResultSchema, ApiConfigSchema, type AiFlyerAnswer } from '../../src/shared/schema.js';
import { AI_PICTURE_PATH, STORAGE_FILES, type StoredAiUsage } from '../../src/shared/storage.js';
import { config, fails, ok, seed, send, uploadTo } from './client.js';

/* The AI assistant's routes (docs/api-contract.md, "The AI assistant"). Off is the state every backend starts in: no
   provider, no key, so api/config says only `enabled: false` and the routes answer ai_off rather than 404, so a
   caller can tell "switched off" from "no such path". The generations themselves are proved on the node-ai and php-ai
   projects, whose setup wires the fake provider and says so (`aiProvider`); a deployment with a real key never runs
   them, so the suite can't spend its day's generations. */

const FAKE = inject('aiProvider') === 'fake';
/** The JSON store of the project that generates, on this machine's disk: where its ledger can be damaged. */
const STORE = inject('dataDir');
const shareBody = () => ({ hostel: null, template: 'activity', data: newFlyerData() });
/** A small picture, as multipart to the read's route. Its width steers the fake (AI_FAKE.pictureWidths); 64 is no steer. */
const picture = (width = 64, height = 48) => sharp({ create: { width, height, channels: 3, background: '#88aacc' } }).jpeg().toBuffer();
const read = (bytes: Uint8Array | Buffer, name = 'picture.jpg') => uploadTo('api/ai/photo', bytes, name);
/** What the flyer and the share text are left with once the tests above the reads have run. */
const USED_UP = { flyer: 0, share: 0 };
const TODAY = aiDay(new Date().toISOString());
/** The pictures this project's store keeps of today's reads, and its ledger for the month. */
const keptPictures = (): string[] => {
  const dir = STORE ? join(STORE, STORAGE_FILES.aiPicturesDir, TODAY) : null;
  return dir && existsSync(dir) ? readdirSync(dir) : [];
};
const ledger = (): StoredAiUsage[] => JSON.parse(readFileSync(join(STORE!, STORAGE_FILES.aiUsageDir, `${TODAY.slice(0, 7)}.json`), 'utf8'));
/** api/config, fresh: the client's config() is cached, and `remaining` moves. */
const status = async () => (await ok(send('GET', 'api/config'), ApiConfigSchema)).ai;
/** The `ai` block these servers answer: every feature runs, each at the default limit, with this `left` of it today
    (all of it, unless said). */
const on = (left: Partial<Record<AiFeature, number>> = {}) => ({
  enabled: true,
  features: AI_FEATURES.map((name) => ({ name, limit: AI_DAILY_LIMIT, remaining: left[name] ?? AI_DAILY_LIMIT })),
});

describe.skipIf(FAKE)('AI off', () => {
  it('api/config says only enabled: false', async () => {
    const c = await config();
    if (c.ai.enabled) return; // a deployment with a key: the on block is the proof there
    expect(c.ai).toEqual({ enabled: false });
  });

  it('both routes answer ai_off, after the body and the write guard are checked', async () => {
    if ((await config()).ai.enabled) return;
    await fails(send('POST', 'api/ai/flyer', { text: 'Yoga at 9' }), 'ai_off');
    await fails(send('POST', 'api/ai/share', shareBody()), 'ai_off');
    await fails(send('POST', 'api/ai/flyer', { text: 'Yoga at 9' }, {}), 'forbidden');
    await fails(send('POST', 'api/ai/flyer', '{"text": ', {}), 'malformed');
    await fails(send('GET', 'api/ai/flyer'), 'no_such_endpoint');
  });

  it('the picture read answers ai_off too, whatever it is sent, after the write guard', async () => {
    if ((await config()).ai.enabled) return;
    await fails(read(await picture()), 'ai_off');
    await fails(read(Buffer.from('not an image')), 'ai_off');
    await fails(send('POST', 'api/ai/photo', {}), 'ai_off');
    await fails(uploadTo('api/ai/photo', await picture(), 'picture.jpg', 'photo', {}), 'forbidden');
    await fails(send('GET', 'api/ai/photo'), 'no_such_endpoint');
  });
});

describe.skipIf(!FAKE)('AI on, with the fake provider (one day, in order)', () => {
  const bundle = JSON.parse(readFileSync(AI_BUNDLE_FILE, 'utf8')) as { examples: { text: string; answer: AiFlyerAnswer }[] };
  const example = bundle.examples[0];
  const idea = (marker = '') => ({ text: marker ? `${example.text}\n${marker}` : example.text });

  // Every feature has its own daily limit (the owner's answer, 2026-10-06): a generation counts against its own alone.
  it('api/config lists each feature that runs, with its own limit and what is left of it today', async () => {
    expect(await status()).toEqual(on());
  });

  it('needs the write header', async () => {
    await fails(send('POST', 'api/ai/flyer', idea(), {}), 'forbidden');
    await fails(send('POST', 'api/ai/share', shareBody(), {}), 'forbidden');
  });

  it('refuses an empty or over-long idea, and a share request without the flyer, as ai_input', async () => {
    const e = await fails(send('POST', 'api/ai/flyer', { text: '  ' }), 'ai_input', { max: AI_INPUT_MAX });
    expect(e.fields).toHaveProperty('text');
    await fails(send('POST', 'api/ai/flyer', { text: 'x'.repeat(AI_INPUT_MAX + 1) }), 'ai_input', { max: AI_INPUT_MAX });
    await fails(send('POST', 'api/ai/flyer', { text: 'Yoga', hostel: 'no-such-nest' }), 'unknown_hostel');
    await fails(send('POST', 'api/ai/share', { hostel: null, template: 'activity' }), 'ai_input', { max: AI_INPUT_MAX });
  });

  it('answers ai_failed when the model’s answer fails the schema, times out or is refused, and charges nothing', async () => {
    await fails(send('POST', 'api/ai/flyer', idea('[[fake:invalid]]')), 'ai_failed');
    await fails(send('POST', 'api/ai/flyer', idea('[[fake:timeout]]')), 'ai_failed');
    await fails(send('POST', 'api/ai/flyer', idea('[[fake:refused]]')), 'ai_failed');
    await fails(send('POST', 'api/ai/share', { ...shareBody(), idea: '[[fake:invalid]]' }), 'ai_failed');
    expect(await status()).toEqual(on());
  });

  it('turns a hostel the model made up into chain-wide, with an assumption first, and counts the generation', async () => {
    const result = await ok(send('POST', 'api/ai/flyer', idea('[[fake:unknown-hostel]]')), AiFlyerResultSchema);
    expect(result.brief).toEqual({ ...example.answer.brief, hostel: null });
    expect(result.assumptions[0].field).toBe('hostel');
    expect(result.assumptions.slice(1)).toEqual(example.answer.assumptions);
    expect(result.remaining).toBe(AI_DAILY_LIMIT - 1);
  });

  it('writes a share text for a flyer, and counts it against the share text’s own limit', async () => {
    const result = await ok(send('POST', 'api/ai/share', { ...shareBody(), idea: example.text }), AiShareResultSchema);
    // The flyer above spent one of its own: the share text still had all of its.
    expect(result).toEqual({ share: example.answer.brief.share, remaining: AI_DAILY_LIMIT - 1 });
    expect(await status()).toEqual(on({ flyer: AI_DAILY_LIMIT - 1, share: AI_DAILY_LIMIT - 1 }));
  });

  it('keeps the hostel the staff member chose', async () => {
    const chosen = seed.hostels.find((h) => h.slug !== example.answer.brief.hostel)!.slug;
    const result = await ok(send('POST', 'api/ai/flyer', { ...idea(), hostel: chosen }), AiFlyerResultSchema);
    expect(result.brief.hostel).toBe(chosen);
    expect(result.remaining).toBe(AI_DAILY_LIMIT - 2);
  });

  it('answers ai_quota for a feature once its own limit is used up, naming what ran out, while the other still runs', async () => {
    for (let left = AI_DAILY_LIMIT - 2; left > 0; left--) expect((await ok(send('POST', 'api/ai/flyer', idea()), AiFlyerResultSchema)).remaining).toBe(left - 1);
    await fails(send('POST', 'api/ai/flyer', idea()), 'ai_quota', aiQuotaVars('flyer', AI_DAILY_LIMIT));
    expect(await status()).toEqual(on({ flyer: 0, share: AI_DAILY_LIMIT - 1 }));
    // The share text is not stopped by the flyer's limit: it runs until its own.
    for (let left = AI_DAILY_LIMIT - 1; left > 0; left--) expect((await ok(send('POST', 'api/ai/share', shareBody()), AiShareResultSchema)).remaining).toBe(left - 1);
    await fails(send('POST', 'api/ai/share', shareBody()), 'ai_quota', aiQuotaVars('share', AI_DAILY_LIMIT));
    expect(await status()).toEqual(on({ flyer: 0, share: 0 }));
  });

  // A picture → its words (the owner's answers, 2026-10-06: "photo, sent as a file", "Stop at the words"). After the
  // tests above, so their counts stand: the reads have their own.
  it('the picture read needs the write header, and refuses what is not a picture as the photo route does, spending nothing', async () => {
    await fails(uploadTo('api/ai/photo', await picture(), 'picture.jpg', 'photo', {}), 'forbidden');
    await fails(send('POST', 'api/ai/photo', { picture: 'not how a picture is sent' }), 'no_photo_field');
    await fails(read(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(64)]), 'iphone.heic'), 'heic');
    await fails(read(await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).gif().toBuffer(), 'anim.gif'), 'unsupported_format', { format: 'GIF' });
    await fails(read(Buffer.from('not an image'), 'notes.jpg'), 'unreadable');
    await fails(read(Buffer.alloc((await config()).limits.maxUploadBytes + 1, 1), 'big.jpg'), 'too_large');
    expect(await status()).toEqual(on(USED_UP));
    expect(keptPictures()).toEqual([]);
  });

  it('answers ai_failed when the read’s answer fails the schema, times out or is refused: nothing is charged, and each picture is kept', async () => {
    for (const steer of ['invalid', 'timeout', 'refused'] as const) await fails(read(await picture(AI_FAKE.pictureWidths[steer], 8)), 'ai_failed');
    expect(await status()).toEqual(on(USED_UP));
    if (STORE) expect(keptPictures()).toHaveLength(3);
  });

  it('reads a picture into its words, counts it against the reads’ own limit, and keeps the picture the ledger names', async () => {
    const result = await ok(read(await picture()), AiPhotoResultSchema);
    // The fake answers the text its first example's flyer is made from.
    expect(result).toEqual({ text: example.text, remaining: AI_DAILY_LIMIT - 1 });
    expect(await status()).toEqual(on({ ...USED_UP, photo: AI_DAILY_LIMIT - 1 }));
    if (!STORE) return;
    const last = ledger().at(-1)!;
    expect(last).toMatchObject({ feature: 'photo', ok: true, output: JSON.stringify({ text: example.text }) });
    const [, path, bytes] = /^(\S+) image\/jpeg 64x48 (\d+) bytes$/.exec(last.input) ?? [];
    expect(path, last.input).toMatch(AI_PICTURE_PATH);
    expect(path).toContain(`/${TODAY}/`);
    const kept = readFileSync(join(STORE, path));
    expect(kept.length).toBe(Number(bytes));
    expect((await sharp(kept).metadata()).format).toBe('jpeg');
  });

  // The owner's answer: "It says so, no flyer; it counts". The provider was paid.
  it('a picture with no words answers an empty text, and counts', async () => {
    const result = await ok(read(await picture(AI_FAKE.pictureWidths.noWords, 8)), AiPhotoResultSchema);
    expect(result).toEqual({ text: '', remaining: AI_DAILY_LIMIT - 2 });
  });

  it('sends the model a picture no larger than the read’s edge, upright and without its metadata: what is kept is what was sent', async () => {
    const big = await sharp({ create: { width: 1500, height: 3000, channels: 3, background: '#88aacc' } })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'someone' } } })
      .toBuffer();
    await ok(read(big, 'poster.jpg'), AiPhotoResultSchema);
    if (!STORE) return;
    const { input } = ledger().at(-1)!;
    // Turned upright it is 3000 wide: its long edge comes down to the read's, never the photo's own 3240.
    expect(input).toMatch(new RegExp(`^\\S+ image/jpeg ${AI_PICTURE_MAX_EDGE}x${AI_PICTURE_MAX_EDGE / 2} \\d+ bytes$`));
    const meta = await sharp(readFileSync(join(STORE, input.split(' ')[0]))).metadata();
    expect([meta.width, meta.height, meta.exif, meta.orientation]).toEqual([AI_PICTURE_MAX_EDGE, AI_PICTURE_MAX_EDGE / 2, undefined, undefined]);
  });

  it('answers ai_quota once the day’s reads are used up, naming them, and keeps no picture it did not read', async () => {
    for (let left = AI_DAILY_LIMIT - 3; left > 0; left--) expect((await ok(read(await picture()), AiPhotoResultSchema)).remaining).toBe(left - 1);
    const kept = keptPictures().length;
    await fails(read(await picture()), 'ai_quota', aiQuotaVars('photo', AI_DAILY_LIMIT));
    // A picture that would be refused is still refused for what it is: the photo's checks come before the limit.
    await fails(read(Buffer.from('not an image')), 'unreadable');
    expect(keptPictures()).toHaveLength(kept);
    expect(await status()).toEqual(on({ ...USED_UP, photo: 0 }));
  });

  // Last, and it puts the file back: the tests above share this store and its day. The editor loads api/config before
  // anything else and renders nothing without it, so a ledger no read can take must cost the AI and nothing more.
  it.skipIf(!STORE)('hides the AI when its ledger cannot be read, and leaves the rest of the app up', async () => {
    const month = join(STORE!, STORAGE_FILES.aiUsageDir, `${aiDay(new Date().toISOString()).slice(0, 7)}.json`);
    const kept = readFileSync(month);
    writeFileSync(month, '{ damaged');
    try {
      expect(await status()).toEqual({ enabled: false });
      expect((await send('GET', 'api/hostels')).status).toBe(200);
    } finally {
      writeFileSync(month, kept);
    }
    expect(await status()).toEqual(on({ ...USED_UP, photo: 0 }));
  });
});
