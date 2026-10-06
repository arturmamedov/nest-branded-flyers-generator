import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express } from 'express';
import sharp from 'sharp';
import request, { type Test } from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { loadBundle } from '../../server/ai/bundle.js';
import { createAiService } from '../../server/ai/composition.js';
import { createMemoryAiPictures } from '../../server/ai/pictures.js';
import { createApp } from '../../server/app.js';
import { loadAiSettings } from '../../server/config.js';
import { SEED_FILE } from '../../server/paths.js';
import { applySeedFile } from '../../server/storage/seed.js';
import { createSqliteRepositories } from '../../server/storage/sqlite/index.js';
import { systemClock } from '../../server/storage/types.js';
import { AI_DAILY_LIMIT, AI_FAKE, AI_FEATURES, aiQuotaVars, type AiFeature } from '../../src/shared/ai.js';
import { newFlyerData } from '../../src/shared/defaults.js';
import { apiError, formatMb, type ApiErrorKey } from '../../src/shared/errors.js';
import { MAX_UPLOAD_BYTES } from '../../src/shared/limits.js';
import { AI_PICTURE_PATH } from '../../src/shared/storage.js';
import { WRITE_HEADERS } from '../../src/shared/writeGuard.js';

/* The whole Node app, in process, with the AI as a site's own settings set it up: the same loader and composition
   as server/index.ts, the fake provider, a store in memory. One feature is switched off at a time, so the proof
   needs no server per case; php/tests/BootstrapTest.php loops over the same generated names for the PHP backend.
   The contract suite (tests/contract/ai.test.ts) holds the two states it has a server for: off, and every feature on. */

const example = loadBundle().examples[0];

/** A good JSON body for each feature's route, which is api/ai/<the feature's name>. The read takes a picture, not
    JSON: its row is what a caller who thought otherwise would send. */
const BODY: Record<AiFeature, () => object> = {
  flyer: () => ({ text: example.text }),
  share: () => ({ hostel: null, template: 'activity', data: newFlyerData() }),
  photo: () => ({ picture: 'not how a picture is sent' }),
};
/** A small picture, as a staff member's phone would send it: any width the fake has no steer for. */
const PICTURE = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#88aacc' } }).jpeg().toBuffer();
/** A good request to each feature's route. */
const good = (app: Express, feature: AiFeature): Test =>
  feature === 'photo'
    ? request(app).post('/api/ai/photo').set(WRITE_HEADERS).attach('photo', PICTURE, 'picture.jpg')
    : request(app).post(`/api/ai/${feature}`).set(WRITE_HEADERS).send(BODY[feature]());

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
  const pictures = createMemoryAiPictures();
  const ai = createAiService(settings, { hostels: repos.hostels, usage: repos.aiUsage, clock: systemClock, pictures });
  const app = createApp({ repos, storage: 'sqlite', uploadsDir: join(tmpdir(), 'nest-flyers-ai-app-no-uploads'), buildId: 'test', ai });
  return { app, repos, pictures };
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
    await refused(good(app, off), 'ai_off');
    await refused(request(app).post(route).set(WRITE_HEADERS).send(BODY[off]()), 'ai_off');
    // Off comes before the body's shape, as it does with the whole AI off: a body that says nothing is ai_off too.
    await refused(request(app).post(route).set(WRITE_HEADERS).send({}), 'ai_off');
    await refused(request(app).post(route).send(BODY[off]()), 'forbidden');
    await refused(request(app).post(route).set('Content-Type', 'application/json').send('{"text": '), 'malformed');
    expect(await repos.aiUsage.all()).toEqual([]);
    const config = await request(app).get('/api/config').expect(200);
    expect(config.body.ai).toEqual(on(named));
  });

  it('runs the features it names: each spends one of its own and leaves the others alone, and is recorded under its name', async () => {
    const { app, repos } = await site(named);
    for (const feature of named) {
      const res = await good(app, feature);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
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
  // Each feature has its own one, untouched by the ones used up before it.
  for (const feature of [...AI_FEATURES].reverse()) {
    const first = await good(app, feature);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.remaining, feature).toBe(0);
    await refused(good(app, feature), 'ai_quota', aiQuotaVars(feature, 1));
  }
  expect((await request(app).get('/api/config').expect(200)).body.ai).toEqual(on(AI_FEATURES, Object.fromEntries(AI_FEATURES.map((f) => [f, 0])), all1));
});

it('a site that gives one feature its own number: that feature stops there, and the rest keep the site’s', async () => {
  const { app } = await site(AI_FEATURES, { AI_DAILY_LIMIT: '2', AI_DAILY_LIMITS: 'share:1' });
  const own = { ...Object.fromEntries(AI_FEATURES.map((f) => [f, 2])), share: 1 };
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
  for (const feature of AI_FEATURES) await refused(good(app, feature), 'ai_off');
  expect(await repos.aiUsage.all()).toEqual([]);
});

/* POST api/ai/photo through the whole app (docs/api-contract.md): the one AI route that takes a file. The contract
   suite holds its answers over HTTP on both backends; what only this app has is multer, which reads the upload before
   any handler runs. */
describe('POST api/ai/photo', () => {
  it('reads a picture into its words, keeps the picture as it was prepared, and names it in the ledger', async () => {
    const { app, repos, pictures } = await site(['photo']);
    const res = await good(app, 'photo');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ text: example.text, remaining: AI_DAILY_LIMIT - 1 });
    const [[path, bytes]] = [...pictures.kept];
    expect(path).toMatch(AI_PICTURE_PATH);
    const kept = await sharp(bytes).metadata();
    expect([kept.format, kept.width, kept.height]).toEqual(['jpeg', 64, 48]);
    expect((await repos.aiUsage.all()).map((r) => [r.feature, r.ok, r.input])).toEqual([['photo', true, `${path} image/jpeg 64x48 ${bytes.length} bytes`]]);
  });

  it('asks the feature’s switch before any of the photo’s checks: a site that does not run it says nothing about the file', async () => {
    const { app } = await site(['flyer']);
    // Were the file looked at first, these would be unreadable and no_photo_field.
    await refused(request(app).post('/api/ai/photo').set(WRITE_HEADERS).attach('photo', Buffer.from('not an image'), 'x.jpg'), 'ai_off');
    await refused(request(app).post('/api/ai/photo').set(WRITE_HEADERS).attach('other', PICTURE, 'picture.jpg'), 'ai_off');
    // And the write guard is in front of both.
    await refused(request(app).post('/api/ai/photo').attach('photo', PICTURE, 'picture.jpg'), 'forbidden');
  });

  it('refuses a picture over the upload limit as the photo route does', async () => {
    const { app } = await site(['photo']);
    await refused(request(app).post('/api/ai/photo').set(WRITE_HEADERS).attach('photo', Buffer.alloc(MAX_UPLOAD_BYTES + 1, 1), 'big.jpg'), 'too_large', { mb: formatMb(MAX_UPLOAD_BYTES) });
  });

  it('makes the photo route’s checks before the limit and the provider: a refused picture spends and keeps nothing', async () => {
    const { app, repos, pictures } = await site(['photo'], { AI_DAILY_LIMITS: 'photo:1' });
    await refused(request(app).post('/api/ai/photo').set(WRITE_HEADERS).send(BODY.photo()), 'no_photo_field');
    await refused(request(app).post('/api/ai/photo').set(WRITE_HEADERS).attach('photo', Buffer.from('not an image'), 'x.jpg'), 'unreadable');
    expect(pictures.kept.size).toBe(0);
    expect((await good(app, 'photo')).body.remaining).toBe(0);
    // The limit is reached: a picture that would be refused is still refused for what it is, as the order says.
    await refused(request(app).post('/api/ai/photo').set(WRITE_HEADERS).attach('photo', Buffer.from('not an image'), 'x.jpg'), 'unreadable');
    await refused(good(app, 'photo'), 'ai_quota', aiQuotaVars('photo', 1));
    expect(pictures.kept.size).toBe(1);
    expect(await repos.aiUsage.all()).toHaveLength(1);
  });

  // multer refuses a file under a name it was not told of with an error of its own: that was a 500 here, where PHP
  // answers no_photo_field. The photo route had it too: both read their upload through one intake.
  it('a picture sent under another field’s name is no_photo_field, on the read and on the photo route alike', async () => {
    const { app, repos, pictures } = await site(['photo']);
    await refused(request(app).post('/api/ai/photo').set(WRITE_HEADERS).attach('other', PICTURE, 'picture.jpg'), 'no_photo_field');
    await refused(request(app).post('/api/photos').set(WRITE_HEADERS).attach('other', PICTURE, 'picture.jpg'), 'no_photo_field');
    expect(pictures.kept.size).toBe(0);
    expect(await repos.aiUsage.all()).toEqual([]);
  });

  it('a tiny picture is never enlarged, so its width reaches the fake: no words is an empty text that counts', async () => {
    const { app } = await site(['photo']);
    const tiny = await sharp({ create: { width: AI_FAKE.pictureWidths.noWords, height: 8, channels: 3, background: '#fff' } }).png().toBuffer();
    const res = await request(app).post('/api/ai/photo').set(WRITE_HEADERS).attach('photo', tiny, 'blank.png');
    expect(res.body).toEqual({ text: '', remaining: AI_DAILY_LIMIT - 1 });
  });
});
