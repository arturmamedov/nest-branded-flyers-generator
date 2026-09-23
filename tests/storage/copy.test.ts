import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs, runCopy } from '../../server/cli/copy.js';
import { createRepositories } from '../../server/composition.js';
import type { StorageDriver } from '../../server/config.js';
import { dataPaths } from '../../server/paths.js';
import type { Clock, Repositories } from '../../server/storage/types.js';
import { SAMPLE_FLYERS } from '../../src/shared/samples.js';
import {
  DoodlesFileSchema,
  FlyerIndexFileSchema,
  HostelsFileSchema,
  MetaFileSchema,
  PhotosFileSchema,
  STORAGE_FILES,
  StoredFlyerSchema,
} from '../../src/shared/storage.js';
import { FakeClock } from './repositories.contract.js';

/* The copy tool moves a library between drivers. What matters is that the copy
   IS the library: the same ids, timestamps, archived flags and photo files, and
   a store that goes on handing out ids above the ones it inherited. */

const data = SAMPLE_FLYERS[0].data;
const photoPath = (n: number) => `uploads/2026/09/${n.toString(16).padStart(16, '0')}.jpg`;
/** An image file in the uploads folder that no record points at: a copy is not a backup, so it must stay behind. */
const STRAY_UPLOAD = `uploads/2025/12/${'ab'.repeat(8)}.jpg`;

const open = (storage: StorageDriver, dir: string, clock: Clock = new FakeClock()): Repositories =>
  createRepositories({ storage }, dataPaths(dir), clock);

function writeDataFile(root: string, relativePath: string, contents: string): void {
  const file = join(root, ...relativePath.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

/** Every shape a copy has to survive: id gaps, an archived flyer, a chain-wide flyer, and an unreferenced upload. */
async function writeFixture(dir: string): Promise<void> {
  const repos = open('sqlite', dir);
  await repos.hostels.put({ id: 7, slug: 'duque-nest', name: 'Duque Nest', island: 'Tenerife', logoPath: null, sortOrder: 10 });
  await repos.hostels.upsert({ slug: 'flamingo-nest', name: 'Flamingo Nest', island: 'Tenerife', logoPath: 'assets/logos/flamingo.png', sortOrder: 20 });
  await repos.doodles.put({ id: 4, slug: 'spark', label: 'Spark', path: 'assets/art/spark.png', kind: 'spark', builtin: true });
  await repos.doodles.upsert({ slug: 'staff-pin', label: 'Pin', path: 'uploads/doodles/pin.png', kind: 'icon', builtin: false });
  await repos.photos.put({ id: 2, path: photoPath(2), width: 1200, height: 800, createdAt: '2026-01-02T03:04:05.678Z' });
  await repos.photos.put({ id: 9, path: photoPath(9), width: 3240, height: 2160, createdAt: '2026-02-03T04:05:06.789Z' });
  await repos.flyers.put({
    id: 5,
    hostel: 'duque-nest',
    template: 'activity',
    title: 'Archived pool party',
    data,
    photoId: 2,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    archived: true,
  });
  await repos.flyers.put({
    id: 12,
    hostel: null,
    template: 'activity',
    title: 'Chain-wide',
    data,
    photoId: 9,
    createdAt: '2026-03-03T00:00:00.000Z',
    updatedAt: '2026-03-04T00:00:00.000Z',
    archived: false,
  });
  await repos.flyers.create({ title: 'Made the usual way', hostel: 'flamingo-nest', template: 'activity', data, photoId: null });
  await repos.close();
  for (const path of [photoPath(2), photoPath(9), STRAY_UPLOAD]) writeDataFile(dir, path, `bytes of ${path}`);
}

/** Everything a driver can be asked for, so two stores can be compared in one assertion. */
async function readAll(repos: Repositories) {
  return {
    hostels: await repos.hostels.list(),
    doodles: await repos.doodles.list(),
    photos: await repos.photos.all(),
    flyers: await repos.flyers.all(),
    library: await repos.flyers.list({}),
  };
}

async function withStore<T>(storage: StorageDriver, dir: string, use: (repos: Repositories) => Promise<T>): Promise<T> {
  const repos = open(storage, dir);
  try {
    return await use(repos);
  } finally {
    await repos.close();
  }
}

describe('copy', () => {
  let root: string;
  let sourceDir: string;
  let targetDir: string;
  const args = (...extra: string[]) => parseArgs(['--from-sqlite', join(sourceDir, 'flyers.db'), '--to-json', targetDir, ...extra]);

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'nest-flyers-copy-test-'));
    sourceDir = join(root, 'sqlite');
    targetDir = join(root, 'json');
    await writeFixture(sourceDir);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

  it('gives the JSON store the same records, ids, timestamps and archived flags', async () => {
    const report = await runCopy(args());
    expect(report.counts).toEqual({ hostels: 2, doodles: 2, photos: 2, flyers: 3 });

    const before = await withStore('sqlite', sourceDir, readAll);
    const after = await withStore('json', targetDir, readAll);
    expect(after).toEqual(before);
    expect(after.flyers.map((f) => f.id)).toEqual([5, 12, 13]);
    expect(after.flyers.find((f) => f.id === 5)).toMatchObject({ archived: true, createdAt: '2026-03-01T00:00:00.000Z' });
    // The archived one stays out of the library, and the chain-wide one keeps its null hostel.
    expect(after.library.map((f) => f.id)).toEqual([13, 12]);
    expect(after.library.find((f) => f.id === 12)).toMatchObject({ hostel: null, hostelName: null });
  });

  it('leaves the target handing out ids above the ones it inherited', async () => {
    await runCopy(args());
    await withStore('json', targetDir, async (repos) => {
      expect(await repos.flyers.create({ title: 'Next', hostel: null, template: 'activity', data, photoId: null })).toBe(14);
      expect((await repos.photos.insert({ path: photoPath(10), width: 1, height: 1 })).id).toBe(10);
      await repos.hostels.upsert({ slug: 'new-nest', name: 'New Nest', island: 'La Palma', logoPath: null, sortOrder: 30 });
      expect((await repos.hostels.list()).find((h) => h.slug === 'new-nest')?.id).toBe(9);
      await repos.doodles.upsert({ slug: 'new-doodle', label: 'New', path: 'assets/art/n.png', kind: 'icon', builtin: true });
      expect((await repos.doodles.list()).find((d) => d.slug === 'new-doodle')?.id).toBe(6);
    });
  });

  it('copies the photo files the records point at, and only those', async () => {
    const report = await runCopy(args());
    expect(report.uploads).toEqual({ copied: 2, skipped: 0 });
    for (const path of [photoPath(2), photoPath(9)]) {
      expect(readFileSync(join(targetDir, ...path.split('/')), 'utf8')).toBe(`bytes of ${path}`);
    }
    expect(existsSync(join(targetDir, ...STRAY_UPLOAD.split('/')))).toBe(false);

    // Names are random hex: a file already in the target is that same file, so it is left alone.
    const again = await runCopy(args('--force'));
    expect(again.uploads).toEqual({ copied: 0, skipped: 2 });
  });

  it('counts the photo files it cannot find and writes nothing', async () => {
    rmSync(join(sourceDir, ...photoPath(9).split('/')));
    await expect(runCopy(args())).rejects.toThrow(/1 of 2 photo files are missing/);
    const after = await withStore('json', targetDir, readAll);
    expect(after).toEqual({ hostels: [], doodles: [], photos: [], flyers: [], library: [] });
    expect(existsSync(join(targetDir, ...photoPath(2).split('/')))).toBe(false);
  });

  it('refuses a target that already holds records unless --force is given', async () => {
    await runCopy(args());
    await expect(runCopy(args())).rejects.toThrow(/already exists.*--force/s);
    expect((await runCopy(args('--force'))).counts.flyers).toBe(3);
  });

  it('writes files the shared storage schemas accept unchanged, in the format PHP writes', async () => {
    await runCopy(args());
    // 4-space pretty with a trailing newline: the two backends produce the same bytes, so a diff shows only real changes.
    const read = (relativePath: string): unknown => {
      const text = readFileSync(join(targetDir, ...relativePath.split('/')), 'utf8');
      expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 4)}\n`);
      return JSON.parse(text);
    };
    // parse() is stricter than a plain check: zod strips unknown keys and fills defaults, so only a file that is
    // already exactly what the generated schema describes comes back identical.
    const meta = read(STORAGE_FILES.meta);
    expect(MetaFileSchema.parse(meta)).toStrictEqual(meta);
    const hostels = read(STORAGE_FILES.hostels);
    expect(HostelsFileSchema.parse(hostels)).toStrictEqual(hostels);
    const doodles = read(STORAGE_FILES.doodles);
    expect(DoodlesFileSchema.parse(doodles)).toStrictEqual(doodles);
    const photos = read(STORAGE_FILES.photos);
    expect(PhotosFileSchema.parse(photos)).toStrictEqual(photos);
    const index = read(STORAGE_FILES.flyerIndex);
    expect(FlyerIndexFileSchema.parse(index)).toStrictEqual(index);
    for (const id of [5, 12, 13]) {
      const flyer = read(`${STORAGE_FILES.flyerDir}/${id}.json`);
      expect(StoredFlyerSchema.parse(flyer)).toStrictEqual(flyer);
    }
  });

  it('round-trips back to SQLite with the same records and files', async () => {
    await runCopy(args());
    const backDir = join(root, 'back');
    const report = await runCopy(parseArgs(['--from-json', targetDir, '--to-sqlite', join(backDir, 'flyers.db')]));
    expect(report).toEqual({ counts: { hostels: 2, doodles: 2, photos: 2, flyers: 3 }, uploads: { copied: 2, skipped: 0 } });
    expect(await withStore('sqlite', backDir, readAll)).toEqual(await withStore('sqlite', sourceDir, readAll));
    expect(readFileSync(join(backDir, ...photoPath(2).split('/')), 'utf8')).toBe(`bytes of ${photoPath(2)}`);
  });

  describe('arguments', () => {
    it('takes --flag value and --flag=value, and keeps a Windows drive letter', () => {
      const db = resolve('C:\\nest flyers\\data\\flyers.db');
      const store = resolve('D:\\deploy\\nest-flyers-php\\data');
      const options = parseArgs(['--from-sqlite', db, `--to-json=${store}`, '--force']);
      expect(options.from).toEqual({ driver: 'sqlite', path: db });
      // Split on the first "=" only, or the drive letter's colon would be cut off the target path.
      expect(options.to).toEqual({ driver: 'json', path: store });
      expect(options.force).toBe(true);
      // A SQLite endpoint names the file inside the data folder; a JSON one names the folder itself.
      expect(options.uploadsFrom).toBe(join(dirname(db), 'uploads'));
      expect(options.uploadsTo).toBe(join(store, 'uploads'));
    });

    it('defaults the uploads folders from each side, and lets both be overridden', () => {
      const options = parseArgs([
        '--from-sqlite',
        join(sourceDir, 'flyers.db'),
        '--to-json',
        targetDir,
        '--uploads-from',
        join(root, 'old-photos'),
        '--uploads-to',
        join(root, 'new-photos'),
      ]);
      expect(options.uploadsFrom).toBe(join(root, 'old-photos'));
      expect(options.uploadsTo).toBe(join(root, 'new-photos'));
      expect(options.force).toBe(false);
    });

    it('refuses anything it cannot act on', () => {
      expect(() => parseArgs(['--from-sqlite', 'a.db'])).toThrow(/exactly one --to-sqlite or --to-json/);
      expect(() => parseArgs(['--from-sqlite', 'a.db', '--from-json', 'b', '--to-json', 'c'])).toThrow(/exactly one --from-/);
      expect(() => parseArgs(['--from-sqlite', 'a.db', '--to-json'])).toThrow(/needs a path/);
      expect(() => parseArgs(['--from-sqlite', 'a.db', '--to-json', '--force'])).toThrow(/needs a path/);
      expect(() => parseArgs(['--from-sqlite', 'a.db', '--to-json', 'c', '--to-json', 'd'])).toThrow(/twice/);
      expect(() => parseArgs(['--from-sqlite', 'a.db', '--to-json', 'c', '--uploads', 'u'])).toThrow(/Unknown option "--uploads"/);
      expect(() => parseArgs(['--from-json', 'store', '--to-json', 'store'])).toThrow(/same data folder/);
      // A JSON store written into the live SQLite data folder is the same mistake.
      expect(() => parseArgs(['--from-sqlite', 'data/flyers.db', '--to-json', 'data'])).toThrow(/same data folder/);
    });

    it('refuses a source that is not there, before opening anything', async () => {
      await expect(runCopy(parseArgs(['--from-sqlite', join(root, 'nope', 'flyers.db'), '--to-json', targetDir]))).rejects.toThrow(
        /no sqlite store at/i,
      );
      expect(existsSync(join(targetDir, STORAGE_FILES.meta))).toBe(false);
    });
  });
});
