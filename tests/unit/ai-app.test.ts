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
import { AI_DAILY_LIMIT, AI_FEATURES, type AiFeature } from '../../src/shared/ai.js';
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
    expect(config.body.ai).toEqual({ enabled: true, limit: AI_DAILY_LIMIT, remaining: AI_DAILY_LIMIT, features: named });
  });

  it('runs the features it names, and counts them', async () => {
    const { app, repos } = await site(named);
    for (const [i, feature] of named.entries()) {
      const res = await request(app).post(`/api/ai/${feature}`).set(WRITE_HEADERS).send(BODY[feature]());
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.remaining).toBe(AI_DAILY_LIMIT - i - 1);
    }
    expect((await repos.aiUsage.all()).map((r) => [r.feature, r.ok])).toEqual(named.map((feature) => [feature, true]));
  });
});

// The owner's answer (2026-10-05): the cap is a setting, 3 unless the site says otherwise.
it('a site that sets its own cap says it in api/config, and answers ai_quota in that number once it is reached', async () => {
  const { app } = await site(AI_FEATURES, { AI_DAILY_LIMIT: '1' });
  expect((await request(app).get('/api/config').expect(200)).body.ai).toEqual({ enabled: true, limit: 1, remaining: 1, features: AI_FEATURES });
  const first = await request(app).post('/api/ai/share').set(WRITE_HEADERS).send(BODY.share());
  expect(first.status, JSON.stringify(first.body)).toBe(200);
  expect(first.body.remaining).toBe(0);
  await refused(request(app).post('/api/ai/flyer').set(WRITE_HEADERS).send(BODY.flyer()), 'ai_quota', { limit: 1 });
  expect((await request(app).get('/api/config').expect(200)).body.ai).toMatchObject({ limit: 1, remaining: 0 });
});

// The owner's answer (2026-10-05): none until named. A provider, even keyed, runs nothing by itself.
it('a site that names no feature has no AI: api/config says off, every route answers ai_off, and nothing is kept', async () => {
  const { app, repos } = await site([]);
  expect((await request(app).get('/api/config').expect(200)).body.ai).toEqual({ enabled: false });
  for (const feature of AI_FEATURES) await refused(request(app).post(`/api/ai/${feature}`).set(WRITE_HEADERS).send(BODY[feature]()), 'ai_off');
  expect(await repos.aiUsage.all()).toEqual([]);
});
