import { closeSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.js';
import { encodeStoreJson } from '../../server/storage/json/files.js';
import { createJsonRepositories } from '../../server/storage/json/index.js';
import { StoreLock } from '../../server/storage/json/lock.js';
import type { Repositories } from '../../server/storage/types.js';
import { API_ERRORS } from '../../src/shared/errors.js';
import { SAMPLE_FLYERS } from '../../src/shared/samples.js';
import type { FlyerInput } from '../../src/shared/schema.js';
import {
  DoodlesFileSchema,
  FlyerIndexFileSchema,
  HostelsFileSchema,
  MetaFileSchema,
  PhotosFileSchema,
  STORAGE_FILES,
  STORAGE_FORMAT_VERSION,
  StoredFlyerSchema,
} from '../../src/shared/storage.js';
import { describeRepositoryContract, FakeClock } from './repositories.contract.js';

/* The shared driver contract, plus what only a file store can get wrong: the
   bytes on disk, the id counters, the lock, and the refusal of a store a newer
   build wrote. The PHP driver answers the same questions in
   php/tests/Storage/JsonRepositoriesTest.php — the two must stay in step,
   because they serve the same folder. */

const temp = (name: string) => mkdtempSync(join(tmpdir(), `nest-flyers-${name}-`));
const wipe = (dir: string) => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

describeRepositoryContract('JSON files', async (clock) => {
  const dir = temp('json');
  return { repos: createJsonRepositories({ dir, clock }), cleanup: async () => wipe(dir) };
});

describe('the JSON store on disk', () => {
  const dirs: string[] = [];
  let clock: FakeClock;

  const open = (dir = temp('json-store')): { dir: string; repos: Repositories } => {
    if (!dirs.includes(dir)) dirs.push(dir);
    return { dir, repos: createJsonRepositories({ dir, clock }) };
  };
  const fresh = () => {
    clock = new FakeClock();
    return open();
  };

  afterEach(() => {
    for (const dir of dirs.splice(0)) wipe(dir);
  });

  const data = SAMPLE_FLYERS[0].data;
  const input = (over: Partial<FlyerInput> = {}): FlyerInput => ({ title: 'A flyer', hostel: null, template: 'activity', data, photoId: null, ...over });
  const photoPath = (n: number) => `uploads/2026/09/${n.toString(16).padStart(16, '0')}.jpg`;
  const hostel = (slug: string, name: string, sortOrder = 10) => ({ slug, name, island: 'Tenerife', logoPath: null, sortOrder });
  const doodle = (slug: string, builtin = true) => ({ slug, label: 'Spark', path: 'assets/art/spark.png', kind: 'spark', builtin });

  const text = (dir: string, file: string) => readFileSync(join(dir, ...file.split('/')), 'utf8');
  const json = (dir: string, file: string): unknown => JSON.parse(text(dir, file)) as unknown;
  const put = (dir: string, file: string, value: unknown) => writeFileSync(join(dir, ...file.split('/')), encodeStoreJson(value), 'utf8');
  const tree = (dir: string, prefix = ''): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tree(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]));

  /** A library with one of everything, including an archived flyer and a flyer that was updated later. */
  const fill = async (repos: Repositories) => {
    await repos.hostels.upsert(hostel('duque-nest', 'Duque Nest'));
    await repos.hostels.upsert({ slug: 'logo-nest', name: 'Logo', island: 'Gran Canaria', logoPath: 'assets/logos/l.png', sortOrder: 2.5 });
    await repos.doodles.upsert(doodle('spark'));
    await repos.doodles.upsert({ slug: 'mine', label: 'Mine', path: 'uploads/doodles/m.png', kind: 'icon', builtin: false });
    const photo = await repos.photos.insert({ path: photoPath(0xabc), width: 3240, height: 1620 });
    const kept = await repos.flyers.create(input({ hostel: 'duque-nest', photoId: photo.id }));
    const archived = await repos.flyers.create(input({ title: 'Gone' }));
    clock.tick(1234);
    await repos.flyers.update(kept, input({ title: 'Renamed', hostel: 'duque-nest' }));
    await repos.flyers.archive(archived);
    return { kept, archived };
  };

  it('writes files the generated schema accepts exactly, in the format PHP writes', async () => {
    const { dir, repos } = fresh();
    const { kept, archived } = await fill(repos);

    const files = [
      [STORAGE_FILES.meta, MetaFileSchema],
      [STORAGE_FILES.hostels, HostelsFileSchema],
      [STORAGE_FILES.doodles, DoodlesFileSchema],
      [STORAGE_FILES.photos, PhotosFileSchema],
      [STORAGE_FILES.flyerIndex, FlyerIndexFileSchema],
      [`${STORAGE_FILES.flyerDir}/${kept}.json`, StoredFlyerSchema],
      [`${STORAGE_FILES.flyerDir}/${archived}.json`, StoredFlyerSchema],
    ] as const;
    for (const [file, schema] of files) {
      const raw = json(dir, file);
      // Stronger than a plain parse, and as strict as schema/storage.schema.json: zod would otherwise quietly fill
      // defaults and strip unknown keys, and the file would still be wrong.
      expect(schema.parse(raw), file).toStrictEqual(raw);
      // 4-space pretty JSON with a trailing newline, which is what NestFlyers\Json::encode($v, true) produces.
      // Spelled out rather than through the driver's own encoder, which would compare it with itself.
      expect(text(dir, file), file).toBe(JSON.stringify(raw, null, 4) + '\n');
    }

    // Keys in the schema's order, in every record, so a record is byte-identical whichever driver wrote it.
    expect(Object.keys(json(dir, STORAGE_FILES.meta) as object)).toEqual(Object.keys(MetaFileSchema.shape));
    expect(Object.keys((json(dir, STORAGE_FILES.meta) as { counters: object }).counters)).toEqual(Object.keys(MetaFileSchema.shape.counters.shape));
    const lists = [
      [STORAGE_FILES.hostels, HostelsFileSchema],
      [STORAGE_FILES.doodles, DoodlesFileSchema],
      [STORAGE_FILES.photos, PhotosFileSchema],
      [STORAGE_FILES.flyerIndex, FlyerIndexFileSchema],
    ] as const;
    for (const [file, schema] of lists) {
      const records = json(dir, file) as Record<string, unknown>[];
      expect(records.length, file).toBeGreaterThan(0);
      for (const record of records) expect(Object.keys(record), file).toEqual(Object.keys(schema.element.shape));
    }
    for (const id of [kept, archived]) {
      expect(Object.keys(json(dir, `${STORAGE_FILES.flyerDir}/${id}.json`) as object)).toEqual(Object.keys(StoredFlyerSchema.shape));
    }
  });

  it('holds exactly its own files, with no temp files left behind', async () => {
    const { dir, repos } = fresh();
    await fill(repos);

    expect(tree(dir).sort()).toEqual([
      '.htaccess',
      'doodles.json',
      'flyers/1.json',
      'flyers/2.json',
      'flyers/index.json',
      'hostels.json',
      'index.html',
      'meta.json',
      'photos.json',
    ]);
    // Belt and braces wherever the data folder lives: it denies itself, with the bytes the PHP driver writes.
    expect(text(dir, '.htaccess')).toContain('Require all denied');
  });

  it('keeps an empty object empty through a write and a read', async () => {
    const { dir, repos } = fresh();
    expect(data.overrides).toEqual({});
    const id = await repos.flyers.create(input());

    expect(text(dir, `${STORAGE_FILES.flyerDir}/${id}.json`)).toContain('"overrides": {}');
    for (const from of [repos, open(dir).repos]) expect((await from.flyers.get(id))?.data.overrides).toEqual({});
  });

  it('stores flyer data as given and normalises it on every read', async () => {
    const { dir, repos } = fresh();
    // A flyer saved by an older build: zod fills v and week on read, and the file keeps what was written.
    const id = await repos.flyers.create(input());
    const stored = json(dir, `${STORAGE_FILES.flyerDir}/${id}.json`) as { data: Record<string, unknown> };
    put(dir, `${STORAGE_FILES.flyerDir}/${id}.json`, { ...stored, data: { ...stored.data, week: undefined, gone: 'dropped' } });

    const read = await open(dir).repos.flyers.get(id);
    expect(read?.data.week).toEqual([]);
    expect(read?.data).not.toHaveProperty('gone');
    // archive() writes the record back as stored, so the soft delete cannot rewrite anyone's data.
    await open(dir).repos.flyers.archive(id);
    expect((json(dir, `${STORAGE_FILES.flyerDir}/${id}.json`) as { data: object }).data).toHaveProperty('gone');
  });

  it('never hands out an id twice, even after records are deleted by hand', async () => {
    const { dir, repos } = fresh();
    for (const slug of ['a', 'b']) await repos.hostels.upsert(hostel(slug, slug.toUpperCase()));
    await repos.photos.insert({ path: photoPath(1), width: 10, height: 10 });
    await repos.flyers.create(input());
    await repos.flyers.create(input());

    // Take the newest record of each kind out by hand: max(id) + 1 would hand its id out again.
    put(dir, STORAGE_FILES.hostels, (json(dir, STORAGE_FILES.hostels) as unknown[]).slice(0, 1));
    put(dir, STORAGE_FILES.photos, []);
    put(dir, STORAGE_FILES.flyerIndex, (json(dir, STORAGE_FILES.flyerIndex) as unknown[]).slice(0, 1));
    rmSync(join(dir, STORAGE_FILES.flyerDir, '2.json'));

    await repos.hostels.upsert(hostel('c', 'C'));
    expect((await repos.hostels.bySlug('c'))?.id).toBe(3);
    expect((await repos.photos.insert({ path: photoPath(2), width: 10, height: 10 })).id).toBe(2);
    expect(await repos.flyers.create(input())).toBe(3);
    expect((json(dir, STORAGE_FILES.meta) as { counters: unknown }).counters).toEqual({ hostel: 3, doodle: 0, photo: 2, flyer: 3 });
  });

  it('skips records ahead of a counter restored from an older backup', async () => {
    const { dir, repos } = fresh();
    await repos.flyers.create(input());
    await repos.flyers.create(input({ title: 'second' }));
    const meta = json(dir, STORAGE_FILES.meta) as { counters: Record<string, number> };
    put(dir, STORAGE_FILES.meta, { ...meta, counters: { hostel: 0, doodle: 0, photo: 0, flyer: 0 } });
    put(dir, STORAGE_FILES.flyerIndex, (json(dir, STORAGE_FILES.flyerIndex) as unknown[]).slice(0, 1));

    expect(await open(dir).repos.flyers.create(input({ title: 'third' }))).toBe(3);
    expect((json(dir, `${STORAGE_FILES.flyerDir}/2.json`) as { title: string }).title).toBe('second');
  });

  it('repairs an index row left behind by a half-finished write', async () => {
    const { dir, repos } = fresh();
    const id = await repos.flyers.create(input({ title: 'ghost' }));
    // The flyer's file is written before the index, so a crash in between can leave the library listing a flyer that
    // is really archived. Only the next write of that id can put the row right.
    put(dir, `${STORAGE_FILES.flyerDir}/${id}.json`, { ...(json(dir, `${STORAGE_FILES.flyerDir}/${id}.json`) as object), archived: true });
    expect((await repos.flyers.list({})).map((f) => f.title)).toEqual(['ghost']);

    expect(await repos.flyers.archive(id)).toBe(false);
    expect(await repos.flyers.list({})).toEqual([]);
    expect(json(dir, STORAGE_FILES.flyerIndex)).toEqual([expect.objectContaining({ id, archived: true })]);

    rmSync(join(dir, STORAGE_FILES.flyerDir, `${id}.json`));
    expect(await repos.flyers.update(id, input())).toBe(false);
    expect(json(dir, STORAGE_FILES.flyerIndex)).toEqual([]);
  });

  it('lists flyers the index lost, because the flyer files are the truth', async () => {
    const { dir, repos } = fresh();
    await repos.flyers.create(input({ title: 'orphan' }));
    put(dir, STORAGE_FILES.flyerIndex, []);

    expect((await repos.flyers.all()).map((f) => f.title)).toEqual(['orphan']);
  });

  it('reads a record file someone deleted as empty', async () => {
    const { dir, repos } = fresh();
    await repos.hostels.upsert(hostel('duque-nest', 'Duque Nest'));
    rmSync(join(dir, STORAGE_FILES.hostels));

    expect(await repos.hostels.list()).toEqual([]);
    expect(await repos.hostels.bySlug('duque-nest')).toBeNull();
  });

  it('refuses a store a newer build wrote, with the words staff see on both backends', async () => {
    const { dir, repos } = fresh();
    await repos.hostels.upsert(hostel('duque-nest', 'Duque Nest'));
    const meta = json(dir, STORAGE_FILES.meta) as object;

    put(dir, STORAGE_FILES.meta, { ...meta, formatVersion: STORAGE_FORMAT_VERSION + 1 });
    await expect(open(dir).repos.hostels.list()).rejects.toThrow(API_ERRORS.storage_too_new.message);

    put(dir, STORAGE_FILES.meta, { ...meta, migrations: ['0001-a-migration-from-the-future'] });
    await expect(open(dir).repos.hostels.list()).rejects.toThrow(API_ERRORS.storage_too_new.message);

    put(dir, STORAGE_FILES.meta, { ...meta, counters: { hostel: 0, doodle: 0, photo: 0 } });
    await expect(open(dir).repos.hostels.list()).rejects.toThrow(/meta\.json is damaged/);

    // Still readable by a build that knows the format: refusing is about this build, not about the folder.
    put(dir, STORAGE_FILES.meta, meta);
    expect(await open(dir).repos.hostels.list()).toHaveLength(1);
  });

  it('tells the staff member what is wrong with a too-new store, as the PHP backend does', async () => {
    const { dir, repos } = fresh();
    await repos.hostels.upsert(hostel('duque-nest', 'Duque Nest'));
    put(dir, STORAGE_FILES.meta, { ...(json(dir, STORAGE_FILES.meta) as object), formatVersion: STORAGE_FORMAT_VERSION + 1 });
    const app = createApp({ repos: open(dir).repos, storage: 'json', uploadsDir: join(dir, 'uploads'), buildId: 'test' });

    const res = await request(app).get('/api/hostels').expect(500);
    expect(res.body.error).toEqual({ code: API_ERRORS.storage_too_new.code, message: API_ERRORS.storage_too_new.message });
  });

  it('keeps meta.json in step with records written straight in (the copy tool)', async () => {
    const { dir, repos } = fresh();
    await repos.hostels.put({ id: 40, ...hostel('duque-nest', 'Duque Nest') });
    await repos.doodles.put({ id: 30, ...doodle('spark') });
    await repos.photos.put({ id: 20, path: photoPath(20), width: 10, height: 10, createdAt: '2025-01-01T00:00:00.000Z' });
    await repos.flyers.put({
      id: 10,
      hostel: null,
      template: 'activity',
      title: 'Copied',
      data,
      photoId: 20,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      archived: false,
    });

    // Without this, meta.json would still say 0 and only the records would know which ids are taken.
    expect((json(dir, STORAGE_FILES.meta) as { counters: Record<string, number> }).counters).toEqual({ hostel: 40, doodle: 30, photo: 20, flyer: 10 });
    expect(await repos.flyers.create(input())).toBe(11);
  });

  it('gives every concurrent write its own id', async () => {
    const { dir, repos } = fresh();
    const ids = await Promise.all([1, 2, 3, 4, 5].map(() => repos.flyers.create(input())));

    expect([...ids].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect((await repos.flyers.all()).map((f) => f.id)).toEqual([1, 2, 3, 4, 5]);
    expect((json(dir, STORAGE_FILES.meta) as { counters: { flyer: number } }).counters.flyer).toBe(5);
  });

  it('replaces lone surrogates, which PHP would refuse to read', async () => {
    const { dir, repos } = fresh();
    const id = await repos.flyers.create(input({ title: 'Lone \ud800 surrogate' }));

    const raw = text(dir, `${STORAGE_FILES.flyerDir}/${id}.json`);
    expect(raw).not.toMatch(/\\ud800/i);
    expect(raw).toContain('Lone � surrogate');
    expect(JSON.parse(raw)).toBeTruthy();
  });
});

describe('the store lock', () => {
  const dirs: string[] = [];
  const lockDir = () => {
    const dir = temp('json-lock');
    dirs.push(dir);
    return join(dir, `${STORAGE_FILES.lock}.d`);
  };

  afterEach(() => {
    for (const dir of dirs.splice(0)) wipe(dir);
  });

  it('is re-entrant inside one call chain', async () => {
    const lock = new StoreLock(lockDir(), { timeoutMs: 300, retryMs: 5 });
    // A repository calls another repository inside its own lock; without re-entrancy this would wait for itself.
    await expect(lock.run(() => lock.run(() => lock.run(() => 'inner')))).resolves.toBe('inner');
  });

  it('lets one caller in at a time and releases on a throw', async () => {
    const lock = new StoreLock(lockDir(), { timeoutMs: 2000, retryMs: 5 });
    let inside = 0;
    let most = 0;
    await Promise.all(
      [1, 2, 3, 4, 5].map(() =>
        lock.run(async () => {
          most = Math.max(most, ++inside);
          await delay(5);
          inside--;
        }),
      ),
    );
    expect(most).toBe(1);

    await expect(lock.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(lock.run(() => 'free again')).resolves.toBe('free again');
  });

  it('gives up on a lock another process holds, and says where', async () => {
    const dir = lockDir();
    const lock = new StoreLock(dir, { timeoutMs: 150, retryMs: 5 });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'owner'), 'another process', 'utf8');

    await expect(lock.run(() => 'never')).rejects.toThrow(/Timed out .* data folder/s);
    expect(readFileSync(join(dir, 'owner'), 'utf8')).toBe('another process');
  });

  it('times out on a stale lock it cannot remove, instead of spinning', async () => {
    // Another account's .lock.d, an antivirus handle: breaking it fails every
    // time. The wait must still end with the message that names the folder.
    const dir = lockDir();
    const lock = new StoreLock(dir, { timeoutMs: 200, retryMs: 5, staleMs: 10 });
    mkdirSync(dir, { recursive: true });
    const longAgo = new Date(Date.now() - 60_000);
    utimesSync(dir, longAgo, longAgo);
    // An open handle inside it: Windows then refuses to move or delete the folder.
    const held = openSync(join(dir, 'owner'), 'w');
    try {
      const started = Date.now();
      await expect(lock.run(() => 'never')).rejects.toThrow(/Timed out .* data folder/s);
      expect(Date.now() - started, 'gave up near the deadline').toBeLessThan(5_000);
    } finally {
      closeSync(held);
    }
  });

  it('breaks a lock left behind by a process that died', async () => {
    const dir = lockDir();
    const lock = new StoreLock(dir, { timeoutMs: 1000, retryMs: 5 });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'owner'), 'gone', 'utf8');
    const longAgo = new Date(Date.now() - 60_000);
    utimesSync(dir, longAgo, longAgo);

    await expect(lock.run(() => 'taken over')).resolves.toBe('taken over');
    expect(readdirSync(join(dir, '..'))).not.toContain(`${STORAGE_FILES.lock}.d`);
  });
});
