import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import { AI_BUNDLE_FILE } from '../../server/paths.js';
import { AI_DAILY_LIMIT, AI_INPUT_MAX, aiDay } from '../../src/shared/ai.js';
import { newFlyerData } from '../../src/shared/defaults.js';
import { AiFlyerResultSchema, AiShareResultSchema, ApiConfigSchema, type AiFlyerAnswer } from '../../src/shared/schema.js';
import { STORAGE_FILES } from '../../src/shared/storage.js';
import { config, fails, ok, seed, send } from './client.js';

/* The AI assistant's routes (docs/api-contract.md, "The AI assistant"). Off is the state every backend starts in: no
   provider, no key, so api/config says only `enabled: false` and the routes answer ai_off rather than 404, so a
   caller can tell "switched off" from "no such path". The generations themselves are proved on the node-ai and php-ai
   projects, whose setup wires the fake provider and says so (`aiProvider`); a deployment with a real key never runs
   them, so the suite can't spend its day's generations. */

const FAKE = inject('aiProvider') === 'fake';
/** The JSON store of the project that generates, on this machine's disk: where its ledger can be damaged. */
const STORE = inject('dataDir');
const shareBody = () => ({ hostel: null, template: 'activity', data: newFlyerData() });
/** api/config, fresh: the client's config() is cached, and `remaining` moves. */
const status = async () => (await ok(send('GET', 'api/config'), ApiConfigSchema)).ai;

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
});

describe.skipIf(!FAKE)('AI on, with the fake provider (one day, in order)', () => {
  const bundle = JSON.parse(readFileSync(AI_BUNDLE_FILE, 'utf8')) as { examples: { text: string; answer: AiFlyerAnswer }[] };
  const example = bundle.examples[0];
  const idea = (marker = '') => ({ text: marker ? `${example.text}\n${marker}` : example.text });

  it('api/config says the limit and what is left today', async () => {
    expect(await status()).toEqual({ enabled: true, limit: AI_DAILY_LIMIT, remaining: AI_DAILY_LIMIT });
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
    expect(await status()).toEqual({ enabled: true, limit: AI_DAILY_LIMIT, remaining: AI_DAILY_LIMIT });
  });

  it('turns a hostel the model made up into chain-wide, with an assumption first, and counts the generation', async () => {
    const result = await ok(send('POST', 'api/ai/flyer', idea('[[fake:unknown-hostel]]')), AiFlyerResultSchema);
    expect(result.brief).toEqual({ ...example.answer.brief, hostel: null });
    expect(result.assumptions[0].field).toBe('hostel');
    expect(result.assumptions.slice(1)).toEqual(example.answer.assumptions);
    expect(result.remaining).toBe(AI_DAILY_LIMIT - 1);
  });

  it('writes a share text for a flyer, and counts it', async () => {
    const result = await ok(send('POST', 'api/ai/share', { ...shareBody(), idea: example.text }), AiShareResultSchema);
    expect(result).toEqual({ share: example.answer.brief.share, remaining: AI_DAILY_LIMIT - 2 });
  });

  it('keeps the hostel the staff member chose', async () => {
    const chosen = seed.hostels.find((h) => h.slug !== example.answer.brief.hostel)!.slug;
    const result = await ok(send('POST', 'api/ai/flyer', { ...idea(), hostel: chosen }), AiFlyerResultSchema);
    expect(result.brief.hostel).toBe(chosen);
    expect(result.remaining).toBe(AI_DAILY_LIMIT - 3);
  });

  it('answers ai_quota once the day’s generations are used up, and api/config says 0 left', async () => {
    await fails(send('POST', 'api/ai/flyer', idea()), 'ai_quota', { limit: AI_DAILY_LIMIT });
    await fails(send('POST', 'api/ai/share', shareBody()), 'ai_quota', { limit: AI_DAILY_LIMIT });
    expect(await status()).toEqual({ enabled: true, limit: AI_DAILY_LIMIT, remaining: 0 });
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
    expect(await status()).toEqual({ enabled: true, limit: AI_DAILY_LIMIT, remaining: 0 });
  });
});
