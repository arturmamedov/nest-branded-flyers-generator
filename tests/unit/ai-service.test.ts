import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBundle } from '../../server/ai/bundle.js';
import { createAiPolicy, type AiPolicy } from '../../server/ai/policy.js';
import { LlmFailure, type LlmCall, type LlmProvider } from '../../server/ai/provider.js';
import { createMemoryAiPictures } from '../../server/ai/pictures.js';
import { FAKE_PICTURE_WIDTHS, FAKE_UNKNOWN_HOSTEL, FakeProvider } from '../../server/ai/providers/fake.js';
import { AiService, type AiServiceDeps } from '../../server/ai/service.js';
import { HttpError } from '../../server/errors.js';
import type { PreparedPhoto } from '../../server/services/photos.js';
import { SEED_FILE } from '../../server/paths.js';
import type { AiUsageCounts, AiUsageRepository } from '../../server/storage/types.js';
import { AI_ASSUMPTIONS_MAX, AI_DAILY_LIMIT, AI_FEATURES, AI_INPUT_MAX, AI_PICTURE_ASK, aiQuotaVars, type AiFeature } from '../../src/shared/ai.js';
import { newFlyerData } from '../../src/shared/defaults.js';
import { apiError, type ApiErrorKey } from '../../src/shared/errors.js';
import { AiFlyerResultSchema, AiPhotoResultSchema, type Hostel } from '../../src/shared/schema.js';
import { SeedFileSchema } from '../../src/shared/seed.js';
import { AI_PICTURE_PATH, type StoredAiUsage } from '../../src/shared/storage.js';
import { FakeClock } from '../storage/repositories.contract.js';

/* The rules of a generation (docs/api-contract.md, "The AI assistant"): the checks and their order, what counts
   against a feature's daily limit and when the day ends, what the ledger keeps. The provider is the fake, the ledger
   in memory: the drivers are proved by the storage contract, the HTTP shapes by the contract suite. */

class MemoryUsage implements AiUsageRepository {
  records: StoredAiUsage[] = [];
  async record(entry: StoredAiUsage) {
    this.records.push(entry);
  }
  async countOk(actorId: string, day: string) {
    const counts: AiUsageCounts = {};
    for (const r of this.records) if (r.ok && r.actorId === actorId && r.day === day) counts[r.feature] = (counts[r.feature] ?? 0) + 1;
    return counts;
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
type PerFeature = Partial<Record<AiFeature, number>>;
/** A daily limit for every feature: its own where `own` names it, else the shared default. */
const limits = (own: PerFeature = {}) => Object.fromEntries(AI_FEATURES.map((f) => [f, own[f] ?? AI_DAILY_LIMIT])) as Record<AiFeature, number>;
/** A site that names every feature, each at the default limit: what a test is about, it takes away. */
/** A model for every feature: its own where `own` names it, else the fake's. */
const models = (own: Partial<Record<AiFeature, string>> = {}) => Object.fromEntries(AI_FEATURES.map((f) => [f, own[f] ?? 'fake-1'])) as Record<AiFeature, string>;
const settings = { provider: 'fake' as const, apiKey: null, model: 'fake-1', models: models(), effort: null, timeoutMs: 1000, enabled: true, features: [...AI_FEATURES], dailyLimits: limits() };
/** api/config's `ai` block on a site that runs `named`: each with its limit (`own`, else the default) and what is
    `left` of it today (all of it, unless said). */
const on = (left: PerFeature = {}, named: readonly AiFeature[] = AI_FEATURES, own: PerFeature = {}) => ({
  enabled: true,
  features: named.map((name) => ({ name, limit: limits(own)[name], remaining: left[name] ?? limits(own)[name] })),
});

function make(over: Partial<AiServiceDeps> = {}) {
  const clock = new FakeClock();
  const usage = new MemoryUsage();
  const pictures = createMemoryAiPictures();
  const service = new AiService({
    provider: new FakeProvider(bundle),
    policy: createAiPolicy(settings),
    bundle,
    hostels: { list: async () => hostels, bySlug: async (slug) => hostels.find((h) => h.slug === slug) ?? null },
    usage,
    clock,
    timeoutMs: settings.timeoutMs,
    models: settings.models,
    pictures,
    ...over,
  });
  return { service, clock, usage, pictures };
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
  complete: async () => ({ json, raw: JSON.stringify(json), usage: { input: 10, output: 20 }, model: 'stub-1' }),
});
const shareBody = () => ({ hostel: null, template: 'activity' as const, data: newFlyerData(), idea: 'Pool party' });
/** A picture as the route hands it over: prepared (server/services/photos.ts). The service never decodes it, so its
    bytes are whatever; the fake is steered by its width (AI_FAKE.pictureWidths). */
const BYTES = Buffer.from('the prepared picture: not what a ledger or a log should ever hold');
const picture = (width = 640): PreparedPhoto => ({ bytes: BYTES, ext: 'jpg', mediaType: 'image/jpeg', width, height: 480 });

describe('the AI service', () => {
  it('is off without a provider: status says so and both features answer ai_off', async () => {
    const { service } = make({ provider: null, policy: createAiPolicy({ ...settings, provider: null, enabled: false }) });
    expect(await service.status(actor)).toEqual({ enabled: false });
    await failsWith(service.flyer(actor, idea()), 'ai_off');
    await failsWith(service.share(actor, shareBody()), 'ai_off');
  });

  // The owner's answer (2026-10-05): none until named. A provider and its key run nothing by themselves.
  it('is off when no feature is named: status says so and both features answer ai_off', async () => {
    const { service, usage } = make({ policy: createAiPolicy({ ...settings, features: [] }) });
    expect(await service.status(actor)).toEqual({ enabled: false });
    await failsWith(service.flyer(actor, idea()), 'ai_off');
    await failsWith(service.share(actor, shareBody()), 'ai_off');
    expect(usage.records).toEqual([]);
  });

  describe.each([...AI_FEATURES])('where every feature is named but %s', (off) => {
    const named = AI_FEATURES.filter((f) => f !== off);
    /** Each feature's call, with its own good body unless the test hands in another. */
    const call: Record<AiFeature, (service: AiService, body?: unknown) => Promise<unknown>> = {
      flyer: (service, body = idea()) => service.flyer(actor, body),
      share: (service, body = shareBody()) => service.share(actor, body),
      // A read has no body to be wrong: the route makes the photo's checks before the service is asked.
      photo: (service) => service.photo(actor, picture()),
    };

    it('that feature answers ai_off before its body is read: the provider is never asked, nothing is counted or recorded', async () => {
      const asked = vi.fn();
      const provider: LlmProvider = {
        name: 'fake',
        complete: async () => {
          asked();
          throw new Error('the provider was asked');
        },
      };
      const usage = new MemoryUsage();
      const counted = vi.spyOn(usage, 'countOk');
      const { service } = make({ provider, usage, policy: createAiPolicy({ ...settings, features: named }) });
      await failsWith(call[off](service), 'ai_off');
      await failsWith(call[off](service, {}), 'ai_off');
      expect(asked).not.toHaveBeenCalled();
      expect(counted).not.toHaveBeenCalled();
      expect(usage.records).toEqual([]);
    });

    it('the others run, each counts against its own limit and leaves the others alone, and is recorded under its own name', async () => {
      const { service, usage } = make({ policy: createAiPolicy({ ...settings, features: named }) });
      for (const feature of named) {
        await call[feature](service);
        expect(usage.records.at(-1)).toMatchObject({ feature, ok: true });
      }
      // Each one spent one of its own, and none of another's.
      expect(await service.status(actor)).toEqual(on(Object.fromEntries(named.map((f) => [f, AI_DAILY_LIMIT - 1])), named));
    });
  });

  it('refuses an actor the policy excludes, and shows them nothing', async () => {
    const guests: AiPolicy = { runs: () => true, mayUse: () => false, dailyLimit: () => AI_DAILY_LIMIT };
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
    expect(await service.status(actor)).toEqual(on({ flyer: AI_DAILY_LIMIT - 1 }));
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

  // The owner's answer (2026-10-06): "A model per feature, now". One provider and one key; the call names the model.
  it('asks each feature’s call of that feature’s own model, and the ledger names it when no answer came', async () => {
    const asked: string[] = [];
    const provider: LlmProvider = {
      name: 'fake',
      complete: async (call) => {
        asked.push(call.model);
        throw new LlmFailure('timeout', 'no answer');
      },
    };
    const { service, usage } = make({ provider, models: models({ share: 'model-b' }) });
    await failsWith(service.flyer(actor, idea()), 'ai_failed');
    await failsWith(service.share(actor, shareBody()), 'ai_failed');
    expect(asked).toEqual(['fake-1', 'model-b']);
    expect(usage.records.map((r) => [r.feature, r.model, r.ok])).toEqual([['flyer', 'fake-1', false], ['share', 'model-b', false]]);
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
    expect(await usage.countOk('anonymous', '2026-09-18')).toEqual({ flyer: 1 });
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
    expect(await service.status(actor)).toEqual(on());
  });

  it('answers ai_failed for an answer that fails the schema, records it, and charges nothing', async () => {
    const { service, usage } = make();
    await failsWith(service.flyer(actor, idea('[[fake:invalid]]')), 'ai_failed');
    expect(usage.records).toHaveLength(1);
    expect(usage.records[0]).toMatchObject({ ok: false, feature: 'flyer', output: JSON.stringify({ brief: 42, assumptions: [] }) });
    expect(await service.status(actor)).toEqual(on());
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

  // The owner's answer (2026-10-06): every feature its own daily limit. One used up leaves the others alone.
  it('stops each feature at its own limit, leaves the others alone, and starts again at midnight in the Canary Islands', async () => {
    const { service, clock } = make();
    for (let i = 0; i < AI_DAILY_LIMIT; i++) await service.flyer(actor, idea());
    await failsWith(service.flyer(actor, idea()), 'ai_quota', aiQuotaVars('flyer', AI_DAILY_LIMIT));
    expect(await service.status(actor)).toEqual(on({ flyer: 0 }));
    // The share text has its own count: the flyers did not touch it.
    expect((await service.share(actor, shareBody())).remaining).toBe(AI_DAILY_LIMIT - 1);
    expect(await service.status(actor)).toEqual(on({ flyer: 0, share: AI_DAILY_LIMIT - 1 }));
    for (let i = 1; i < AI_DAILY_LIMIT; i++) await service.share(actor, shareBody());
    await failsWith(service.share(actor, shareBody()), 'ai_quota', aiQuotaVars('share', AI_DAILY_LIMIT));
    // 10:00Z on 18 September is 11:00 WEST; thirteen hours on, it is 00:00 on the 19th there.
    clock.tick(13 * 3600 * 1000);
    expect(await service.status(actor)).toEqual(on());
    expect((await service.flyer(actor, idea())).remaining).toBe(AI_DAILY_LIMIT - 1);
  });

  // The owner's answers (2026-10-05, 2026-10-06): the limit is the site's own setting, and a feature may have its own.
  it('stops a feature at the number the site gives it, and says that number and what ran out', async () => {
    const own = { share: 1 };
    const { service } = make({ policy: createAiPolicy({ ...settings, dailyLimits: limits(own) }) });
    expect(await service.status(actor)).toEqual(on({}, AI_FEATURES, own));
    expect((await service.share(actor, shareBody())).remaining).toBe(0);
    await failsWith(service.share(actor, shareBody()), 'ai_quota', aiQuotaVars('share', 1));
    // The flyer keeps the default, and its own count.
    expect((await service.flyer(actor, idea())).remaining).toBe(AI_DAILY_LIMIT - 1);
    expect(await service.status(actor)).toEqual(on({ share: 0, flyer: AI_DAILY_LIMIT - 1 }, AI_FEATURES, own));
  });

  it('counts per actor', async () => {
    const { service } = make();
    for (let i = 0; i < AI_DAILY_LIMIT; i++) await service.flyer(actor, idea());
    expect(await service.status({ id: 'someone-else' })).toEqual(on());
  });

  // A record a later release wrote, met after going back to this one. While one limit covered every feature, every ok
  // record of the day counted against it. Now such a record is counted under its own name, which no feature here has.
  it('counts a record of a feature it does not know against no feature it runs', async () => {
    const { service, usage } = make();
    await service.flyer(actor, idea());
    for (let i = 0; i < AI_DAILY_LIMIT; i++) usage.records.push({ ...usage.records[0], feature: 'a-later-feature' as AiFeature });
    expect(await service.status(actor)).toEqual(on({ flyer: AI_DAILY_LIMIT - 1 }));
    expect((await service.flyer(actor, idea())).remaining).toBe(AI_DAILY_LIMIT - 2);
    expect((await service.share(actor, shareBody())).remaining).toBe(AI_DAILY_LIMIT - 1);
  });

  // api/config asks on every page load: every feature's count comes from one read of the ledger.
  it('reads the ledger once for status, however many features run', async () => {
    const usage = new MemoryUsage();
    const counted = vi.spyOn(usage, 'countOk');
    const { service } = make({ usage });
    expect(await service.status(actor)).toEqual(on());
    expect(counted).toHaveBeenCalledTimes(1);
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

/* A picture → its words (the owner's answers, 2026-10-06: "Two calls: read, then write", "Stop at the words"). The
   route has prepared the picture; the service counts, keeps it, asks the model and records. */
describe('the AI service reads a picture', () => {
  it('answers the words and what is left of the day’s reads, keeps the picture, and records one line that names it', async () => {
    const { service, clock, usage, pictures } = make();
    const result = await service.photo(actor, picture());
    expect(result).toEqual({ text: example.text, remaining: AI_DAILY_LIMIT - 1 });
    expect(AiPhotoResultSchema.safeParse(result).success).toBe(true);
    // Only the reads' count moved.
    expect(await service.status(actor)).toEqual(on({ photo: AI_DAILY_LIMIT - 1 }));

    const [path] = [...pictures.kept.keys()];
    expect(path).toMatch(AI_PICTURE_PATH);
    expect(path).toContain('/2026-09-18/');
    expect(pictures.kept.get(path)).toEqual(BYTES);
    expect(usage.records).toEqual([
      {
        at: clock.now(),
        day: '2026-09-18',
        actorId: 'anonymous',
        feature: 'photo',
        provider: 'fake',
        model: 'fake-1',
        tokens: { input: 10, output: 20 },
        ok: true,
        input: `${path} image/jpeg 640x480 ${BYTES.length} bytes`,
        output: JSON.stringify({ text: example.text }),
      },
    ]);
  });

  it('sends the model the reader’s rules and one turn: the picture as it was prepared, then the line that asks', async () => {
    const calls: LlmCall[] = [];
    const provider: LlmProvider = {
      name: 'fake',
      complete: async (call) => {
        calls.push(call);
        return { json: { text: 'Yoga' }, raw: '{"text":"Yoga"}', usage: null, model: 'stub-1' };
      },
    };
    const { service } = make({ provider, models: models({ photo: 'a-stronger-model' }) });
    await service.photo(actor, picture());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ model: 'a-stronger-model', system: bundle.prompts.photo, schemaName: 'nest_picture_text', schema: bundle.schemas.photoAnswer });
    expect(calls[0].messages).toEqual([
      { role: 'user', content: [{ type: 'image', mediaType: 'image/jpeg', data: BYTES.toString('base64'), width: 640, height: 480 }, { type: 'text', text: AI_PICTURE_ASK }] },
    ]);
  });

  // The owner's answer: "It says so, no flyer; it counts". The provider was paid.
  it('a picture with no words answers an empty text, and counts', async () => {
    const { service, usage } = make();
    expect(await service.photo(actor, picture(FAKE_PICTURE_WIDTHS.noWords))).toEqual({ text: '', remaining: AI_DAILY_LIMIT - 1 });
    expect(usage.records[0]).toMatchObject({ feature: 'photo', ok: true, output: '{"text":""}' });
  });

  it('answers the words trimmed: a read of spaces alone is a picture with no words', async () => {
    expect(await make({ provider: answering({ text: '  Yoga at 9\n\n' }) }).service.photo(actor, picture())).toMatchObject({ text: 'Yoga at 9' });
    expect(await make({ provider: answering({ text: ' \n ' }) }).service.photo(actor, picture())).toMatchObject({ text: '' });
  });

  it('answers ai_failed for words longer than the idea box takes, and charges nothing', async () => {
    const { service, usage } = make({ provider: answering({ text: 'x'.repeat(AI_INPUT_MAX + 1) }) });
    await failsWith(service.photo(actor, picture()), 'ai_failed');
    expect(usage.records.map((r) => [r.feature, r.ok])).toEqual([['photo', false]]);
    expect(await service.status(actor)).toEqual(on());
  });

  it('answers ai_failed for an answer that fails the schema, a timeout and a refusal: recorded, not counted, and the picture is kept', async () => {
    const { service, usage, pictures } = make();
    for (const width of [FAKE_PICTURE_WIDTHS.invalid, FAKE_PICTURE_WIDTHS.timeout, FAKE_PICTURE_WIDTHS.refused]) await failsWith(service.photo(actor, picture(width)), 'ai_failed');
    expect(usage.records.map((r) => [r.feature, r.ok, r.output])).toEqual([
      ['photo', false, '{"text":42}'],
      ['photo', false, null],
      ['photo', false, null],
    ]);
    // A failed read keeps its picture: those are the ones worth looking at.
    expect(pictures.kept.size).toBe(3);
    for (const [i, path] of [...pictures.kept.keys()].entries()) expect(usage.records[i].input.startsWith(`${path} `)).toBe(true);
    expect(await service.status(actor)).toEqual(on());
  });

  it('stops at the reads’ own limit, by its name, keeping nothing more, and leaves the flyers alone', async () => {
    const { service, pictures } = make({ policy: createAiPolicy({ ...settings, dailyLimits: limits({ photo: 1 }) }) });
    expect((await service.photo(actor, picture())).remaining).toBe(0);
    await failsWith(service.photo(actor, picture()), 'ai_quota', aiQuotaVars('photo', 1));
    expect(pictures.kept.size).toBe(1);
    expect((await service.flyer(actor, idea())).remaining).toBe(AI_DAILY_LIMIT - 1);
    expect(await service.status(actor)).toEqual(on({ photo: 0, flyer: AI_DAILY_LIMIT - 1 }, AI_FEATURES, { photo: 1 }));
  });

  it('a disk that cannot keep the picture stops the read before the provider is asked: nothing is spent or recorded', async () => {
    const asked = vi.fn();
    const provider: LlmProvider = { name: 'fake', complete: async () => (asked(), { json: { text: 'x' }, raw: '', usage: null, model: 'm' }) };
    const full = { keep: () => { throw new Error('ENOSPC: no space left on device'); } };
    const { service, usage } = make({ provider, pictures: full });
    await expect(service.photo(actor, picture())).rejects.toThrow('ENOSPC');
    expect(asked).not.toHaveBeenCalled();
    expect(usage.records).toEqual([]);
  });

  it('never puts the picture’s bytes in the ledger or the log', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { service, usage } = make();
      await service.photo(actor, picture());
      for (const width of [FAKE_PICTURE_WIDTHS.invalid, FAKE_PICTURE_WIDTHS.timeout]) await failsWith(service.photo(actor, picture(width)), 'ai_failed');
      const said = JSON.stringify(usage.records) + JSON.stringify(logged.mock.calls);
      expect(logged).toHaveBeenCalledTimes(2);
      expect(said).not.toContain(BYTES.toString('base64'));
      expect(said).not.toContain(BYTES.toString('utf8'));
    } finally {
      logged.mockRestore();
    }
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
    expect(await service.status(actor)).toEqual(on());
    state.broken = true;
    expect(await service.status(actor)).toEqual({ enabled: false });
    expect(logged).toHaveBeenCalledTimes(2);
  });
});
