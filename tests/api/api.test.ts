import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.js';
import { migrate, openDb, type DB } from '../../server/db/open.js';
import { MIGRATIONS } from '../../server/db/migrations.js';
import { SEED_FILE, dataPaths } from '../../server/paths.js';
import { applySeedFile } from '../../server/seed.js';
import { DEFAULT_DOODLES, PROTOTYPE_DOODLES } from '../../src/shared/defaults.js';
import { SAMPLE_FLYERS } from '../../src/shared/samples.js';

let dir: string;
let db: DB;
let app: ReturnType<typeof createApp>;
const H = { 'X-Nest-Flyers': '1' };

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'nest-flyers-'));
  const data = dataPaths(dir);
  db = openDb(data.db);
  applySeedFile(db, SEED_FILE);
  app = createApp({ db, data, buildId: 'test' });
});

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const pool = SAMPLE_FLYERS[0];
const body = (over: Record<string, unknown> = {}) => ({
  title: pool.title,
  hostel: pool.hostel,
  template: 'activity',
  data: pool.data,
  photoId: null,
  ...over,
});

describe('database', () => {
  it('migrations and seed are idempotent', () => {
    expect(migrate(db, MIGRATIONS)).toEqual({ from: MIGRATIONS.length, to: MIGRATIONS.length });
    applySeedFile(db, SEED_FILE);
    expect(db.prepare('SELECT COUNT(*) n FROM hostel').get()).toEqual({ n: 3 });
    expect(db.prepare('SELECT COUNT(*) n FROM doodle').get()).toEqual({ n: 14 });
  });
});

describe('migration 2: template art', () => {
  it('moves untouched prototype art to the new defaults and leaves arranged art alone', () => {
    const old = openDb(':memory:', MIGRATIONS.slice(0, 1));
    const insert = old.prepare(
      "INSERT INTO flyer (template, title, data, created_at, updated_at) VALUES ('activity', ?, ?, 'x', 'x')",
    );
    const custom = [{ slug: 'spark-teal', x: 1, y: 2, w: 50, rot: 0 }];
    insert.run('untouched', JSON.stringify({ ...pool.data, doodles: PROTOTYPE_DOODLES }));
    insert.run('arranged', JSON.stringify({ ...pool.data, doodles: custom }));
    migrate(old, MIGRATIONS);
    const rows = old.prepare('SELECT title, data FROM flyer ORDER BY id').all() as { title: string; data: string }[];
    expect(JSON.parse(rows[0].data).doodles).toEqual(DEFAULT_DOODLES);
    expect(JSON.parse(rows[1].data).doodles).toEqual(custom);
    old.close();
  });
});

describe('API', () => {
  it('lists hostels in sort order and the built-in doodles', async () => {
    const hostels = await request(app).get('/api/hostels').expect(200);
    expect(hostels.body.map((h: { slug: string }) => h.slug)).toEqual(['duque-nest', 'los-amigos-nest', 'flamingo-nest']);
    const doodles = await request(app).get('/api/doodles').expect(200);
    expect(doodles.body).toHaveLength(14);
    expect(doodles.body[0].url).toMatch(/^\/assets\/art\/.+\.png$/);
  });

  it('refuses writes without the app header', async () => {
    await request(app).post('/api/flyers').send(body()).expect(403);
  });

  it('creates, reads, updates, lists and archives a flyer', async () => {
    const created = await request(app).post('/api/flyers').set(H).send(body()).expect(201);
    const id = created.body.id;

    const got = await request(app).get(`/api/flyers/${id}`).expect(200);
    expect(got.body.flyer.title).toBe('Pool party');
    expect(got.body.hostel.name).toBe('Duque Nest');
    expect(got.body.photo).toBeNull();

    const edited = { ...pool.data, text: { ...pool.data.text, headline2: 'pizza party.' } };
    await request(app).put(`/api/flyers/${id}`).set(H).send(body({ data: edited, hostel: null })).expect(200);
    const again = await request(app).get(`/api/flyers/${id}`).expect(200);
    expect(again.body.flyer.data.text.headline2).toBe('pizza party.');
    expect(again.body.hostel).toBeNull();

    await request(app).post('/api/flyers').set(H).send(body({ title: 'Second' })).expect(201);
    const list = await request(app).get('/api/flyers').expect(200);
    expect(list.body.map((f: { title: string }) => f.title)).toEqual(['Second', 'Pool party']);
    const filtered = await request(app).get('/api/flyers?hostel=duque-nest').expect(200);
    expect(filtered.body.map((f: { title: string }) => f.title)).toEqual(['Second']);
    const chainWide = await request(app).get('/api/flyers?hostel=none').expect(200);
    expect(chainWide.body.map((f: { title: string }) => f.title)).toEqual(['Pool party']);

    await request(app).delete(`/api/flyers/${id}`).set(H).expect(204);
    await request(app).get(`/api/flyers/${id}`).expect(404);
    const after = await request(app).get('/api/flyers').expect(200);
    expect(after.body.map((f: { title: string }) => f.title)).toEqual(['Second']);
  });

  it('rejects invalid input with field paths', async () => {
    const res = await request(app).post('/api/flyers').set(H).send(body({ title: '', hostel: 'nowhere-nest' })).expect(400);
    expect(res.body.error.fields).toHaveProperty('title');
    const res2 = await request(app).post('/api/flyers').set(H).send(body({ hostel: 'nowhere-nest' })).expect(400);
    expect(res2.body.error.fields).toHaveProperty('hostel');
  });

  it('stores a photo upload, rotated and downscaled', async () => {
    const big = await sharp({ create: { width: 4000, height: 2000, channels: 3, background: '#88aacc' } }).jpeg().toBuffer();
    const res = await request(app).post('/api/photos').set(H).attach('photo', big, 'big.jpg').expect(201);
    expect(res.body).toMatchObject({ width: 3240, height: 1620 });
    expect(res.body.url).toMatch(/^\/uploads\/\d{4}\/\d{2}\/[0-9a-f]+\.jpg$/);
    await request(app).get(res.body.url).expect(200);
  });

  it('rejects HEIC with a helpful message', async () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(64)]);
    const res = await request(app).post('/api/photos').set(H).attach('photo', heic, 'IMG_0001.HEIC').expect(415);
    expect(res.body.error.message).toMatch(/JPG/);
  });

  it('export reports unavailable without a renderer', async () => {
    const created = await request(app).post('/api/flyers').set(H).send(body({ title: 'Export me' })).expect(201);
    await request(app).post(`/api/render/${created.body.id}`).set(H).send({ format: 'gif' }).expect(400);
    await request(app).post(`/api/render/${created.body.id}`).set(H).send({ format: 'png' }).expect(503);
  });
});
