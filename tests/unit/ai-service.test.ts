import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBundle } from '../../server/ai/bundle.js';
import { createAiPolicy, type AiPolicy } from '../../server/ai/policy.js';
import type { LlmProvider } from '../../server/ai/provider.js';
import { FAKE_UNKNOWN_HOSTEL, FakeProvider } from '../../server/ai/providers/fake.js';
import { AiService, type AiServiceDeps } from '../../server/ai/service.js';
import { HttpError } from '../../server/errors.js';
import { SEED_FILE } from '../../server/paths.js';
import type { AiUsageRepository } from '../../server/storage/types.js';
import { AI_ASSUMPTIONS_MAX, AI_DAILY_LIMIT, AI_INPUT_MAX } from '../../src/shared/ai.js';
import { newFlyerData } from '../../src/shared/defaults.js';
import { apiError, type ApiErrorKey } from '../../src/shared/errors.js';
import { AiFlyerResultSchema, type Hostel } from '../../src/shared/schema.js';
import { SeedFileSchema } from '../../src/shared/seed.js';
import type { StoredAiUsage } from '../../src/shared/storage.js';
import { FakeClock } from '../storage/repositories.contract.js';

/* The rules of a generation (docs/api-contract.md, "The AI assistant"): the checks and their order, what counts
   against the cap and when the cap resets, what the ledger keeps. The provider is the fake, the ledger in memory: the
   drivers are proved by the storage contract, the HTTP shapes by the contract suite. */

class MemoryUsage implements AiUsageRepository {
  records: StoredAiUsage[] = [];
  async record(entry: StoredAiUsage) {
    this.records.push(entry);
  }
  async countOk(actorId: string, day: string) {
    return this.records.filter((r) => r.ok && r.actorId === actorId && r.day === day).length;
  }
  async all() {
    return [...this.records];
  }
}

const seed = SeedFileSchema.parse(JSON.parse(readFileSync(SEED_FILE, 'utf8')));
const hostels: Hostel[] = seed.hostels.map((h, i) => ({ id: i + 1, slug: h.slug, name: h.name, island: h.island, logoPath: h.logo_path, sortOrder: h.sort_order }));
const bundle = loadBundle();
const example = bundle.examples[0];
const actor = { id: 'anonymous' };
const settings = { provider: 'fake' as const, apiKey: null, model: 'fake-1', effort: null, timeoutMs: 1000, enabled: true };

function make(over: Partial<AiServiceDeps> = {}) {
  const clock = new FakeClock();
  const usage = new MemoryUsage();
  const service = new AiService({
    provider: new FakeProvider(bundle),
    policy: createAiPolicy(settings),
    bundle,
    hostels: { list: async () => hostels, bySlug: async (slug) => hostels.find((h) => h.slug === slug) ?? null },
    usage,
    clock,
    timeoutMs: settings.timeoutMs,
    ...over,
  });
  return { service, clock, usage };
}

async function failsWith(p: Promise<unknown>, key: ApiErrorKey, vars?: Record<string, string | number>) {
  const e = await p.then(() => null, (e: unknown) => e as HttpError);
  expect(e, `expected ${key}`).toBeInstanceOf(HttpError);
  const spec = apiError(key, vars);
  expect(e!.status).toBe(spec.status);
  expect(e!.message).toBe(spec.message);
  return e!;
}

const idea = (marker = '') => ({ text: marker ? `${example.text}\n${marker}` : example.text });
/** A provider that answers every call with this, whatever it is asked: for answers the fake has no marker for. */
const answering = (json: unknown): LlmProvider => ({
  name: 'fake',
  model: 'stub-1',
  complete: async () => ({ json, raw: JSON.stringify(json), usage: { input: 10, output: 20 }, model: 'stub-1' }),
});
const shareBody = () => ({ hostel: null, template: 'activity' as const, data: newFlyerData(), idea: 'Pool party' });

describe('the AI service', () => {
  it('is off without a provider: status says so and both features answer ai_off', async () => {
    const { service } = make({ provider: null, policy: createAiPolicy({ ...settings, provider: null, enabled: false }) });
    expect(await service.status(actor)).toEqual({ enabled: false });
    await failsWith(service.flyer(actor, idea()), 'ai_off');
    await failsWith(service.share(actor, shareBody()), 'ai_off');
  });

  it('refuses an actor the policy excludes, and shows them nothing', async () => {
    const guests: AiPolicy = { enabled: () => true, mayUse: () => false, dailyLimit: () => AI_DAILY_LIMIT };
    const { service } = make({ policy: guests });
    expect(await service.status(actor)).toEqual({ enabled: false });
    await failsWith(service.flyer(actor, idea()), 'ai_forbidden');
  });

  it('checks the body before anything is spent: ai_input with the field, unknown_hostel for a slug the site lacks', async () => {
    const { service, usage } = make();
    const e = await failsWith(service.flyer(actor, { text: '   ' }), 'ai_input', { max: AI_INPUT_MAX });
    expect(e.fields).toHaveProperty('text');
    await failsWith(service.flyer(actor, { text: 'x'.repeat(AI_INPUT_MAX + 1) }), 'ai_input', { max: AI_INPUT_MAX });
    await failsWith(service.share(actor, { hostel: null, template: 'activity' }), 'ai_input', { max: AI_INPUT_MAX });
    await failsWith(service.flyer(actor, { text: 'Yoga', hostel: 'no-such-nest' }), 'unknown_hostel');
    expect(usage.records).toEqual([]);
  });

  it('turns an idea into the brief, the assumptions and what is left, and keeps one ledger record', async () => {
    const { service, clock, usage } = make();
    const result = await service.flyer(actor, idea());
    expect(result).toEqual({ ...example.answer, remaining: AI_DAILY_LIMIT - 1 });
    expect(await service.status(actor)).toEqual({ enabled: true, limit: AI_DAILY_LIMIT, remaining: AI_DAILY_LIMIT - 1 });
    expect(usage.records).toEqual([
      {
        at: clock.now(),
        day: '2026-09-18',
        actorId: 'anonymous',
        feature: 'flyer',
        provider: 'fake',
        model: 'fake-1',
        tokens: { input: 10, output: 20 },
        ok: true,
        input: example.text,
        output: JSON.stringify(example.answer),
      },
    ]);
  });

  it('lets the hostel the staff member chose win over the model’s', async () => {
    const { service } = make();
    const chosen = hostels.find((h) => h.slug !== example.answer.brief.hostel)!.slug;
    const result = await service.flyer(actor, { ...idea(), hostel: chosen });
    expect(result.brief.hostel).toBe(chosen);
  });

  it('turns a hostel the model made up into chain-wide, with an assumption first, and still counts it', async () => {
    const { service, usage } = make();
    const result = await service.flyer(actor, idea('[[fake:unknown-hostel]]'));
    expect(result.brief.hostel).toBeNull();
    expect(result.assumptions[0].field).toBe('hostel');
    expect(result.assumptions[0].note).toContain('no-such-nest');
    expect(result.assumptions.slice(1)).toEqual(example.answer.assumptions);
    expect(await usage.countOk('anonymous', '2026-09-18')).toBe(1);
  });

  it('keeps to the assumptions the contract allows: its own note still comes first, and on a full list the model’s last goes', async () => {
    // One short of the limit, then full: the note joins the first, and takes the last one's place in the second.
    for (const n of [AI_ASSUMPTIONS_MAX - 1, AI_ASSUMPTIONS_MAX]) {
      const made = Array.from({ length: n }, (_, i) => ({ field: 'cost', note: `Assumption ${i + 1}` }));
      const json = { brief: { ...example.answer.brief, hostel: FAKE_UNKNOWN_HOSTEL }, assumptions: made };
      const { service, usage } = make({ provider: answering(json) });
      const result = await service.flyer(actor, idea());
      expect(result.assumptions, `${n} from the model`).toHaveLength(AI_ASSUMPTIONS_MAX);
      expect(result.assumptions[0].field).toBe('hostel');
      expect(result.assumptions[0].note).toContain(FAKE_UNKNOWN_HOSTEL);
      expect(result.assumptions.slice(1)).toEqual(made.slice(0, AI_ASSUMPTIONS_MAX - 1));
      expect(result.brief.hostel).toBeNull();
      expect(AiFlyerResultSchema.safeParse(result).success, `${n} from the model`).toBe(true);
      // The ledger keeps everything the model wrote, the dropped one included.
      expect(usage.records[0]).toMatchObject({ ok: true, output: JSON.stringify(json) });
    }
  });

  it('answers ai_failed for a flyer the model left without its share text, and charges nothing: one generation is a whole flyer', async () => {
    const { share: _, ...brief } = example.answer.brief;
    const json = { brief, assumptions: [] };
    const { service, usage } = make({ provider: answering(json) });
    await failsWith(service.flyer(actor, idea()), 'ai_failed');
    expect(usage.records).toHaveLength(1);
    expect(usage.records[0]).toMatchObject({ ok: false, feature: 'flyer', output: JSON.stringify(json) });
    expect(await service.status(actor)).toEqual({ enabled: true, limit: AI_DAILY_LIMIT, remaining: AI_DAILY_LIMIT });
  });

  it('answers ai_failed for an answer that fails the schema, records it, and charges nothing', async () => {
    const { service, usage } = make();
    await failsWith(service.flyer(actor, idea('[[fake:invalid]]')), 'ai_failed');
    expect(usage.records).toHaveLength(1);
    expect(usage.records[0]).toMatchObject({ ok: false, feature: 'flyer', output: JSON.stringify({ brief: 42, assumptions: [] }) });
    expect(await service.status(actor)).toEqual({ enabled: true, limit: AI_DAILY_LIMIT, remaining: AI_DAILY_LIMIT });
  });

  it('answers ai_failed for a timeout and a refusal, recording what is known', async () => {
    const { service, usage } = make();
    await failsWith(service.flyer(actor, idea('[[fake:timeout]]')), 'ai_failed');
    await failsWith(service.flyer(actor, idea('[[fake:refused]]')), 'ai_failed');
    expect(usage.records.map((r) => [r.ok, r.tokens, r.output])).toEqual([
      [false, null, null],
      [false, null, null],
    ]);
  });

  it('stops at the cap, and starts again at midnight in the Canary Islands', async () => {
    const { service, clock } = make();
    for (let i = 0; i < AI_DAILY_LIMIT; i++) await service.flyer(actor, idea());
    await failsWith(service.flyer(actor, idea()), 'ai_quota', { limit: AI_DAILY_LIMIT });
    await failsWith(service.share(actor, shareBody()), 'ai_quota', { limit: AI_DAILY_LIMIT });
    expect(await service.status(actor)).toEqual({ enabled: true, limit: AI_DAILY_LIMIT, remaining: 0 });
    // 10:00Z on 18 September is 11:00 WEST; thirteen hours on, it is 00:00 on the 19th there.
    clock.tick(13 * 3600 * 1000);
    expect(await service.status(actor)).toEqual({ enabled: true, limit: AI_DAILY_LIMIT, remaining: AI_DAILY_LIMIT });
    expect((await service.flyer(actor, idea())).remaining).toBe(AI_DAILY_LIMIT - 1);
  });

  it('counts per actor', async () => {
    const { service } = make();
    for (let i = 0; i < AI_DAILY_LIMIT; i++) await service.flyer(actor, idea());
    expect(await service.status({ id: 'someone-else' })).toEqual({ enabled: true, limit: AI_DAILY_LIMIT, remaining: AI_DAILY_LIMIT });
  });

  it('writes a share text from the flyer’s fields, counts it, and keeps what the model was given', async () => {
    const { service, usage } = make();
    const result = await service.share(actor, shareBody());
    expect(result).toEqual({ share: example.answer.brief.share, remaining: AI_DAILY_LIMIT - 1 });
    expect(usage.records[0]).toMatchObject({ feature: 'share', ok: true });
    expect(usage.records[0].input).toContain("The flyer's fields:");
    expect(usage.records[0].input).toContain('Pool party');
  });
});

/* api/config carries status(), and the editor renders nothing without api/config: so the AI's own storage must never
   be what decides whether the app loads. A ledger that cannot be read hides the AI, and the log says why. */
describe('a ledger that cannot be read', () => {
  const DAMAGED = 'ai-usage/2026-09.json is damaged: 0.tokens.input invalid input';
  /** A ledger whose count fails while `broken` is true. */
  const flaky = () => {
    const usage = new MemoryUsage();
    const state = { broken: true };
    const countOk = usage.countOk.bind(usage);
    usage.countOk = async (actorId, day) => {
      if (state.broken) throw new Error(DAMAGED);
      return countOk(actorId, day);
    };
    return { usage, state };
  };
  const silenced = () => vi.spyOn(console, 'error').mockImplementation(() => {});

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hides the AI in status, where it used to fail the whole of api/config', async () => {
    silenced();
    const { service } = make({ usage: flaky().usage });
    expect(await service.status(actor)).toEqual({ enabled: false });
  });

  it('says why in the log, once for as long as the reason is the same', async () => {
    const logged = silenced();
    const { service } = make({ usage: flaky().usage });
    await service.status(actor);
    await service.status(actor);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0].join(' ')).toContain(DAMAGED);
  });

  it('shows the AI again once the ledger reads, and speaks up again if it breaks again', async () => {
    const logged = silenced();
    const { usage, state } = flaky();
    const { service } = make({ usage });
    await service.status(actor);
    state.broken = false;
    expect(await service.status(actor)).toEqual({ enabled: true, limit: AI_DAILY_LIMIT, remaining: AI_DAILY_LIMIT });
    state.broken = true;
    expect(await service.status(actor)).toEqual({ enabled: false });
    expect(logged).toHaveBeenCalledTimes(2);
  });
});
