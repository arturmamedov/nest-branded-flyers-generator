import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import { AI_BUNDLE_FILE } from '../../server/paths.js';
import { AI_DAILY_LIMIT, AI_FEATURES, AI_INPUT_MAX, aiDay, aiQuotaVars, type AiFeature } from '../../src/shared/ai.js';
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
    expect(await status()).toEqual(on({ flyer: 0, share: 0 }));
  });
});
