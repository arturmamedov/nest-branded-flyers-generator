import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PHP_DIR, requirePhp } from '../../scripts/php/phpBin.js';
import { startPhpServer, writeTestConfig, type PhpServer } from '../../scripts/php/serve.js';
import { stagePhp } from '../../scripts/php/stage.js';
import { createApp } from '../../server/app.js';
import { createRepositories } from '../../server/composition.js';
import { FIXTURE_PHOTOS_DIR, SEED_FILE, dataPaths } from '../../server/paths.js';
import { applySeedFile } from '../../server/storage/seed.js';
import type { Clock, Repositories } from '../../server/storage/types.js';
import { ApiConfigSchema, FlyerSavedSchema, PhotoInfoSchema, type FlyerInput, type PhotoInfo } from '../../src/shared/schema.js';
import { SAMPLE_FLYERS } from '../../src/shared/samples.js';
import {
  DoodlesFileSchema,
  FlyerIndexFileSchema,
  HostelsFileSchema,
  MetaFileSchema,
  PhotosFileSchema,
  STORAGE_FILES,
  StoredFlyerSchema,
  UPLOADS_DIR,
} from '../../src/shared/storage.js';
import { added, changed, removed, sha256, snapshot, type Snapshot } from './snapshot.js';

/* The cross-backend proof: one data folder, both backends.
 *
 * The Node JSON driver (STORAGE=json) writes a store — the seed, the sample
 * flyers, an archived one and real uploaded photos — and answers every read the
 * API offers. Then PHP serves *that same folder* and has to answer identically,
 * byte for byte where the store is concerned, and a flyer PHP writes has to
 * come back out through Node. Nothing here is skipped: if PHP or php/vendor is
 * missing the suite fails and says so, because a silent skip would leave the
 * one promise of Phase 4 — the two backends share a format — unproven.
 *
 * The folder is served by one backend at a time, as docs/json-storage.md
 * requires: the Node server is stopped and its repositories closed before PHP
 * starts, and PHP is stopped before Node reopens the folder.
 */

/** One instant for every Node write, so createdAt/updatedAt tie and list order has to fall back to `id DESC` on both backends. */
const FIXED_NOW = '2026-09-18T12:00:00.000Z';
const fixedClock: Clock = { now: () => FIXED_NOW };

/** What PHP is allowed to add to a store it serves (JsonRepositories::denyOverHttp, FlockLock's lock file). */
const PHP_MAY_ADD = ['.htaccess', 'index.html', STORAGE_FILES.lock];

/** PHP's own log lands in the data folder (Bootstrap::logIntoDataDir); if it appears, something went wrong and its text is the message. */
const PHP_ERROR_LOG = 'php-errors.log';

/** A hostel slug the seed really carries: taken from the samples, never written out here (CLAUDE.md: only Artur supplies names). */
const SAMPLE_HOSTEL = ((): string => {
  const slug = SAMPLE_FLYERS.find((s) => s.hostel)?.hostel;
  if (!slug) throw new Error('No sample flyer names a hostel, so the hostel filter cannot be proved across backends.');
  return slug;
})();

type Json = { status: number; body: unknown };
interface Answers {
  storage: string;
  hostels: Json;
  doodles: Json;
  flyers: Json;
  byHostel: Json;
  chainWide: Json;
  byTemplate: Json;
  /** Every flyer id that was created, the archived one included (both backends must 404 it the same way). */
  payloads: Record<string, Json>;
  /** Photo URL → `<status> <sha256>`: the same bytes must come back from DATA_DIR/uploads (Node) and <app root>/uploads (PHP). */
  photos: Record<string, string>;
}

const ROOT_PREFIX = 'nest-flyers-cross-';

let root = '';
let dataDir = '';
let stage = '';
let php: PhpServer | undefined;

let nodeAnswers: Answers;
let phpAnswers: Answers;
/** The store as Node left it, after PHP's first request (which re-seeds), and after PHP's read-only requests. */
let beforePhp: Snapshot;
let afterSeeding: Snapshot;
let afterReads: Snapshot;
let phpCreated: { id: number; flyer: unknown };
let nodeReadsPhpFlyer: unknown;
let nodeNextId = 0;
let lastNodeFlyerId = 0;
/** The photo the flyer PHP writes points at: Node stored it, so PHP has to resolve the reference out of photos.json. */
let phpFlyerPhoto: PhotoInfo;

beforeAll(async () => {
  const phpBin = requirePhpStack();
  root = mkdtempSync(join(tmpdir(), ROOT_PREFIX));
  dataDir = join(root, 'data');

  // 1. Node writes the store and says what the API answers on it.
  const { ids, photos } = await withNodeApp(async (baseUrl, repos) => {
    await applySeedFile(repos, SEED_FILE);
    return seedSamples(baseUrl);
  });
  lastNodeFlyerId = ids[ids.length - 1];
  phpFlyerPhoto = photos[0];
  const photoUrls = photos.map((p) => p.url);
  nodeAnswers = await withNodeApp((baseUrl) => readEverything(baseUrl, ids, photoUrls));
  beforePhp = snapshot(dataDir);

  // 2. PHP serves the same folder. Its uploads live under the app root, not the
  //    data folder, so the photos Node wrote are copied into the stage.
  stage = stagePhp(join(root, 'stage'), { dist: false, vendor: 'shim' });
  writeTestConfig(stage, dataDir);
  cpSync(join(dataDir, UPLOADS_DIR), join(stage, UPLOADS_DIR), { recursive: true, force: true });
  php = await startPhpServer({ stage, phpBin });
  // The first request applies seed/hostels.json when the store's seedHash differs (Node records none), so it is
  // taken before the byte comparisons: it is the one request allowed to write.
  const warm = await fetch(new URL('api/config', php.baseUrl));
  expect(warm.status, await warm.text()).toBe(200);
  afterSeeding = snapshot(dataDir);

  phpAnswers = await readEverything(php.baseUrl, ids, photoUrls);
  afterReads = snapshot(dataDir);

  // 3. PHP writes a flyer into the store, referencing a photo Node stored.
  const saved = await createFlyer(php.baseUrl, { ...flyerInput('Written by PHP'), photoId: phpFlyerPhoto.id });
  phpCreated = saved;

  // 4. Node reads it back, and its own next flyer continues from PHP's counter.
  await php.stop();
  php = undefined;
  await withNodeApp(async (baseUrl) => {
    nodeReadsPhpFlyer = (await json(baseUrl, `api/flyers/${saved.id}`)).body;
    nodeNextId = (await createFlyer(baseUrl, flyerInput('After PHP'))).id;
  });
});

afterAll(async () => {
  await php?.stop();
  if (root) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

describe('PHP serves a store the Node JSON driver wrote', () => {
  it('reports the same store', () => {
    expect(nodeAnswers.storage).toBe('json');
    expect(phpAnswers.storage).toBe('json');
  });

  it('lists the same hostels', () => {
    expect(phpAnswers.hostels).toEqual(nodeAnswers.hostels);
  });

  it('lists the same doodles', () => {
    expect(phpAnswers.doodles).toEqual(nodeAnswers.doodles);
  });

  it('lists the same flyers, filters included', () => {
    expect(phpAnswers.flyers).toEqual(nodeAnswers.flyers);
    expect(phpAnswers.byHostel).toEqual(nodeAnswers.byHostel);
    expect(phpAnswers.chainWide).toEqual(nodeAnswers.chainWide);
    expect(phpAnswers.byTemplate).toEqual(nodeAnswers.byTemplate);
    // The fixture is worth having: every flyer shares one updatedAt, so both backends had to tie-break on id.
    const list = nodeAnswers.flyers.body as { id: number; updatedAt: string }[];
    expect(list.length).toBeGreaterThan(1);
    expect(new Set(list.map((f) => f.updatedAt))).toEqual(new Set([FIXED_NOW]));
    expect(list.map((f) => f.id)).toEqual([...list.map((f) => f.id)].sort((a, b) => b - a));
  });

  it('answers every flyer payload identically, the archived one included', () => {
    expect(Object.keys(phpAnswers.payloads)).toEqual(Object.keys(nodeAnswers.payloads));
    for (const id of Object.keys(nodeAnswers.payloads)) {
      expect(phpAnswers.payloads[id], `GET api/flyers/${id}`).toEqual(nodeAnswers.payloads[id]);
    }
    // One of them is the archived flyer: both must hide it behind the same 404 envelope.
    const statuses = Object.values(nodeAnswers.payloads).map((p) => p.status);
    expect(statuses).toContain(404);
    expect(statuses).toContain(200);
  });

  it('serves the same photo bytes from its own uploads folder', () => {
    expect(Object.keys(phpAnswers.photos).length).toBeGreaterThan(0);
    expect(phpAnswers.photos).toEqual(nodeAnswers.photos);
    for (const value of Object.values(phpAnswers.photos)) expect(value).toMatch(/^200 /);
  });

  it('writes nothing but meta.seedHash on the request that re-applies the seed', () => {
    expect(removed(beforePhp, afterSeeding)).toEqual([]);
    expect(added(beforePhp, afterSeeding).filter((f) => !PHP_MAY_ADD.includes(f))).toEqual([]);
    // Re-seeding rewrites hostels.json and doodles.json with the same values: identical bytes, or the two
    // drivers disagree about the format.
    expect(changed(beforePhp, afterSeeding).filter((f) => f !== STORAGE_FILES.meta)).toEqual([]);
    const before = JSON.parse(beforePhp[STORAGE_FILES.meta]) as Record<string, unknown>;
    const after = JSON.parse(afterSeeding[STORAGE_FILES.meta]) as Record<string, unknown>;
    expect({ ...after, seedHash: null }).toEqual({ ...before, seedHash: null });
    expect(after.seedHash).toBe(sha256(readFileSync(SEED_FILE)));
  });

  it('leaves every byte alone while it only reads', () => {
    expect(afterReads).toEqual(afterSeeding);
  });

  it('logs no PHP error while serving the store', () => {
    const log = join(dataDir, PHP_ERROR_LOG);
    expect(existsSync(log) ? readFileSync(log, 'utf8') : '').toBe('');
  });

  it('leaves a store whose every file is exactly what the shared schema describes', () => {
    for (const [name, schema] of [
      [STORAGE_FILES.meta, MetaFileSchema],
      [STORAGE_FILES.hostels, HostelsFileSchema],
      [STORAGE_FILES.doodles, DoodlesFileSchema],
      [STORAGE_FILES.photos, PhotosFileSchema],
      [STORAGE_FILES.flyerIndex, FlyerIndexFileSchema],
    ] as const) {
      expectStoredFile(name, schema);
    }
    const dir = join(dataDir, STORAGE_FILES.flyerDir);
    const files = readdirSync(dir).filter((n) => /^\d+\.json$/.test(n));
    expect(files.length).toBe(SAMPLE_FLYERS.length + 2); // the samples, PHP's flyer and Node's answer to it
    for (const file of files) expectStoredFile(`${STORAGE_FILES.flyerDir}/${file}`, StoredFlyerSchema);
  });

  it('hands a flyer it wrote back to Node unchanged', () => {
    expect(phpCreated.id).toBe(lastNodeFlyerId + 1); // PHP continued Node's counter
    expect(nodeReadsPhpFlyer).toEqual({
      flyer: phpCreated.flyer,
      hostel: (nodeAnswers.hostels.body as { slug: string }[]).find((h) => h.slug === SAMPLE_HOSTEL),
      photo: phpFlyerPhoto,
    });
    expect(nodeNextId).toBe(phpCreated.id + 1); // and Node continued PHP's
  });
});

/* ---- helpers ---- */

/** The PHP binary, with a message that says what to install rather than skipping the proof. */
function requirePhpStack(): string {
  if (!existsSync(join(PHP_DIR, 'vendor', 'autoload.php'))) {
    throw new Error(
      'php/vendor is missing, so the cross-backend test cannot run: `composer install` in php/. ' +
        'It is never skipped — proving PHP serves a Node store is the whole point of this suite.',
    );
  }
  return requirePhp(); // logs which PHP this run proved, as the other PHP scripts do
}

/** The Node backend in-process on the store, stopped and closed before it returns: one backend per folder at a time. */
async function withNodeApp<T>(run: (baseUrl: string, repos: Repositories) => Promise<T>): Promise<T> {
  const paths = dataPaths(dataDir);
  const repos = createRepositories({ storage: 'json' }, paths, fixedClock);
  const server = createServer(createApp({ repos, storage: 'json', uploadsDir: paths.uploads, buildId: 'cross' }));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  try {
    return await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`, repos);
  } finally {
    await new Promise((done) => server.close(done));
    await repos.close();
  }
}

/** The six design records through the real API, with their fixture photos, and the last one archived. */
async function seedSamples(baseUrl: string): Promise<{ ids: number[]; photos: PhotoInfo[] }> {
  const photos = new Map<string, PhotoInfo>();
  const ids: number[] = [];
  for (const sample of SAMPLE_FLYERS) {
    if (sample.photo && !photos.has(sample.photo)) photos.set(sample.photo, await uploadPhoto(baseUrl, sample.photo));
    const saved = await createFlyer(baseUrl, {
      title: sample.title,
      hostel: sample.hostel,
      template: 'activity',
      data: structuredClone(sample.data),
      photoId: sample.photo ? photos.get(sample.photo)!.id : null,
    });
    ids.push(saved.id);
  }
  // An archived flyer, so the index carries an archived row both backends must hide.
  const archived = await fetch(new URL(`api/flyers/${ids[0]}`, baseUrl), { method: 'DELETE', headers: { 'X-Nest-Flyers': '1' } });
  expect(archived.status, await archived.text()).toBe(204);
  return { ids, photos: [...photos.values()] };
}

const flyerInput = (title: string): FlyerInput => ({
  title,
  hostel: SAMPLE_HOSTEL,
  template: 'activity',
  data: structuredClone(SAMPLE_FLYERS[0].data),
  photoId: null,
});

async function uploadPhoto(baseUrl: string, file: string): Promise<PhotoInfo> {
  const form = new FormData();
  form.append('photo', new Blob([new Uint8Array(readFileSync(join(FIXTURE_PHOTOS_DIR, file)))]), file);
  const res = await fetch(new URL('api/photos', baseUrl), { method: 'POST', headers: { 'X-Nest-Flyers': '1' }, body: form });
  const text = await res.text();
  expect(res.status, text).toBe(201);
  return PhotoInfoSchema.parse(JSON.parse(text));
}

async function createFlyer(baseUrl: string, input: FlyerInput): Promise<{ id: number; flyer: unknown }> {
  const res = await fetch(new URL('api/flyers', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nest-Flyers': '1' },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  expect(res.status, text).toBe(201);
  return FlyerSavedSchema.parse(JSON.parse(text));
}

async function json(baseUrl: string, path: string): Promise<Json> {
  const res = await fetch(new URL(path, baseUrl));
  const text = await res.text();
  expect(res.headers.get('content-type') ?? '', `${path} → ${text.slice(0, 300)}`).toMatch(/^application\/json/);
  return { status: res.status, body: JSON.parse(text) as unknown };
}

/** Every read the API offers on this store, in one shape the two backends can be compared by. */
async function readEverything(baseUrl: string, flyerIds: number[], photoUrls: string[]): Promise<Answers> {
  const answers: Answers = {
    storage: ApiConfigSchema.parse((await json(baseUrl, 'api/config')).body).storage,
    hostels: await json(baseUrl, 'api/hostels'),
    doodles: await json(baseUrl, 'api/doodles'),
    flyers: await json(baseUrl, 'api/flyers'),
    byHostel: await json(baseUrl, `api/flyers?hostel=${SAMPLE_HOSTEL}`),
    chainWide: await json(baseUrl, 'api/flyers?hostel=none'),
    byTemplate: await json(baseUrl, 'api/flyers?template=activity'),
    payloads: {},
    photos: {},
  };
  for (const id of flyerIds) answers.payloads[id] = await json(baseUrl, `api/flyers/${id}`);
  for (const url of photoUrls) {
    const res = await fetch(new URL(url, baseUrl));
    answers.photos[url] = `${res.status} ${sha256(new Uint8Array(await res.arrayBuffer()))}`;
  }
  return answers;
}

/** One store file: exactly its shared schema (zod would otherwise fill defaults and strip keys), and the store's byte format. */
function expectStoredFile(name: string, schema: { parse: (value: unknown) => unknown }): void {
  const text = readFileSync(join(dataDir, ...name.split('/')), 'utf8');
  const raw: unknown = JSON.parse(text);
  expect(schema.parse(raw), name).toStrictEqual(raw);
  // 4-space pretty JSON with a trailing newline, whichever backend wrote it last.
  // Both encoders write U+2028 and U+2029 raw (PHP through JSON_UNESCAPED_LINE_TERMINATORS),
  // so the comparison is exact for those too.
  expect(text, name).toBe(JSON.stringify(raw, null, 4) + '\n');
}
