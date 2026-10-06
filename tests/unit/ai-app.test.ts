import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request, { type Test } from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { loadBundle } from '../../server/ai/bundle.js';
import { createAiService } from '../../server/ai/composition.js';
import { createApp } from '../../server/app.js';
import { loadAiSettings } from '../../server/config.js';
import { SEED_FILE } from '../../server/paths.js';
import { applySeedFile } from '../../server/storage/seed.js';
import { createSqliteRepositories } from '../../server/storage/sqlite/index.js';
import { systemClock } from '../../server/storage/types.js';
import { AI_DAILY_LIMIT, AI_FEATURES, aiQuotaVars, type AiFeature } from '../../src/shared/ai.js';
import { newFlyerData } from '../../src/shared/defaults.js';
import { apiError, type ApiErrorKey } from '../../src/shared/errors.js';
import { WRITE_HEADERS } from '../../src/shared/writeGuard.js';

/* The whole Node app, in process, with the AI as a site's own settings set it up: the same loader and composition
   as server/index.ts, the fake provider, a store in memory. One feature is switched off at a time, so the proof
   needs no server per case; php/tests/BootstrapTest.php loops over the same generated names for the PHP backend.
   The contract suite (tests/contract/ai.test.ts) holds the two states it has a server for: off, and every feature on. */

const example = loadBundle().examples[0];

/** A good body for each feature's route, which is api/ai/<the feature's name>. */
const BODY: Record<AiFeature, () => object> = {
  flyer: () => ({ text: example.text }),
  share: () => ({ hostel: null, template: 'activity', data: newFlyerData() }),
};

const open: { close(): Promise<void> | void }[] = [];
afterEach(async () => {
  for (const repos of open.splice(0)) await repos.close();
});

/** The app of a site whose settings name these features, and whatever else `env` sets. */
async function site(named: readonly AiFeature[], env: Record<string, string> = {}) {
  const repos = createSqliteRepositories({ file: ':memory:' });
  open.push(repos);
  await applySeedFile(repos, SEED_FILE);
  const settings = loadAiSettings({ AI_PROVIDER: 'fake', AI_FEATURES: named.join(','), ...env });
  const ai = createAiService(settings, { hostels: repos.hostels, usage: repos.aiUsage, clock: systemClock });
  const app = createApp({ repos, storage: 'sqlite', uploadsDir: join(tmpdir(), 'nest-flyers-ai-app-no-uploads'), buildId: 'test', ai });
  return { app, repos };
}

/** api/config's `ai` block on a site that runs `named`: each with its limit (`own`, else the default) and what is
    `left` of it today (all of it, unless said). */
const on = (named: readonly AiFeature[], left: Partial<Record<AiFeature, number>> = {}, own: Partial<Record<AiFeature, number>> = {}) => ({
  enabled: true,
  features: named.map((name) => ({ name, limit: own[name] ?? AI_DAILY_LIMIT, remaining: left[name] ?? own[name] ?? AI_DAILY_LIMIT })),
});

async function refused(sent: Test, key: ApiErrorKey, vars?: Record<string, string | number>) {
  const res = await sent;
  const spec = apiError(key, vars);
  expect(res.status, JSON.stringify(res.body)).toBe(spec.status);
  expect(res.body.error).toMatchObject({ code: spec.code, message: spec.message });
}

describe.each([...AI_FEATURES])('a site that names every feature but %s', (off) => {
  const named = AI_FEATURES.filter((f) => f !== off);
  const route = `/api/ai/${off}`;

  it('answers ai_off on that route, after the body and the write guard, and spends nothing', async () => {
    const { app, repos } = await site(named);
    await refused(request(app).post(route).set(WRITE_HEADERS).send(BODY[off]()), 'ai_off');
    // Off comes before the body's shape, as it does with the whole AI off: a body that says nothing is ai_off too.
    await refused(request(app).post(route).set(WRITE_HEADERS).send({}), 'ai_off');
    await refused(request(app).post(route).send(BODY[off]()), 'forbidden');
    await refused(request(app).post(route).set('Content-Type', 'application/json').send('{"text": '), 'malformed');
    expect(await repos.aiUsage.all()).toEqual([]);
    const config = await request(app).get('/api/config').expect(200);
    expect(config.body.ai).toEqual(on(named));
  });

  it('runs the features it names, and counts each against its own limit', async () => {
    const { app, repos } = await site(named);
    for (const feature of named) {
      const res = await request(app).post(`/api/ai/${feature}`).set(WRITE_HEADERS).send(BODY[feature]());
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      // One of its own is spent, whatever the features before it spent of theirs.
      expect(res.body.remaining).toBe(AI_DAILY_LIMIT - 1);
    }
    expect((await repos.aiUsage.all()).map((r) => [r.feature, r.ok])).toEqual(named.map((feature) => [feature, true]));
    expect((await request(app).get('/api/config').expect(200)).body.ai).toEqual(on(named, Object.fromEntries(named.map((f) => [f, AI_DAILY_LIMIT - 1]))));
  });
});

// The owner's answers (2026-10-05, 2026-10-06): the limit is a setting, 3 unless the site says otherwise, and it is
// each feature's own: AI_DAILY_LIMIT is every feature's number, AI_DAILY_LIMITS a feature's own.
it('a site that sets its own number gives it to each feature, and answers ai_quota in that number and by what ran out', async () => {
  const { app } = await site(AI_FEATURES, { AI_DAILY_LIMIT: '1' });
  const all1 = Object.fromEntries(AI_FEATURES.map((f) => [f, 1]));
  expect((await request(app).get('/api/config').expect(200)).body.ai).toEqual(on(AI_FEATURES, {}, all1));
  const first = await request(app).post('/api/ai/share').set(WRITE_HEADERS).send(BODY.share());
  expect(first.status, JSON.stringify(first.body)).toBe(200);
  expect(first.body.remaining).toBe(0);
  await refused(request(app).post('/api/ai/share').set(WRITE_HEADERS).send(BODY.share()), 'ai_quota', aiQuotaVars('share', 1));
  // The flyer has its own one, untouched by the share text's.
  const flyer = await request(app).post('/api/ai/flyer').set(WRITE_HEADERS).send(BODY.flyer());
  expect(flyer.status, JSON.stringify(flyer.body)).toBe(200);
  expect(flyer.body.remaining).toBe(0);
  await refused(request(app).post('/api/ai/flyer').set(WRITE_HEADERS).send(BODY.flyer()), 'ai_quota', aiQuotaVars('flyer', 1));
  expect((await request(app).get('/api/config').expect(200)).body.ai).toEqual(on(AI_FEATURES, Object.fromEntries(AI_FEATURES.map((f) => [f, 0])), all1));
});

it('a site that gives one feature its own number: that feature stops there, and the rest keep the site’s', async () => {
  const { app } = await site(AI_FEATURES, { AI_DAILY_LIMIT: '2', AI_DAILY_LIMITS: 'share:1' });
  const own = { flyer: 2, share: 1 };
  expect((await request(app).get('/api/config').expect(200)).body.ai).toEqual(on(AI_FEATURES, {}, own));
  expect((await request(app).post('/api/ai/share').set(WRITE_HEADERS).send(BODY.share())).body.remaining).toBe(0);
  await refused(request(app).post('/api/ai/share').set(WRITE_HEADERS).send(BODY.share()), 'ai_quota', aiQuotaVars('share', 1));
  expect((await request(app).post('/api/ai/flyer').set(WRITE_HEADERS).send(BODY.flyer())).body.remaining).toBe(1);
  expect((await request(app).get('/api/config').expect(200)).body.ai).toEqual(on(AI_FEATURES, { flyer: 1, share: 0 }, own));
});

// The owner's answer (2026-10-05): none until named. A provider, even keyed, runs nothing by itself.
it('a site that names no feature has no AI: api/config says off, every route answers ai_off, and nothing is kept', async () => {
  const { app, repos } = await site([]);
  expect((await request(app).get('/api/config').expect(200)).body.ai).toEqual({ enabled: false });
  for (const feature of AI_FEATURES) await refused(request(app).post(`/api/ai/${feature}`).set(WRITE_HEADERS).send(BODY[feature]()), 'ai_off');
  expect(await repos.aiUsage.all()).toEqual([]);
});
