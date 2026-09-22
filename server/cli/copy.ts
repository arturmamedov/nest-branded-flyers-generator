import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { STORAGE_FILES, UPLOADS_DIR } from '../../src/shared/storage.js';
import { createRepositories } from '../composition.js';
import { STORAGE_DRIVERS, type StorageDriver } from '../config.js';
import { dataPaths, type DataPaths } from '../paths.js';
import { copy, copyUploads, type CopyCounts, type UploadCounts } from '../storage/copy.js';
import { systemClock, type Repositories } from '../storage/types.js';

/* Move a library between storage drivers:

     npm run copy -- --from-sqlite ./data/flyers.db --to-json ../nest-flyers-php/data

   Both directions, ids and timestamps kept, archived flyers included. The source
   database is never opened: SQLite writes to any file it opens (it checkpoints the
   -wal and rebuilds the -shm), so a snapshot of the three files is opened instead
   and deleted afterwards. That is what keeps the live data/flyers.db byte-identical
   while its contents are migrated. */

/** Where one side of the copy lives: a SQLite endpoint names the database file, every other driver its data folder. */
export interface CopyEndpoint {
  driver: StorageDriver;
  /** Absolute; resolved against the shell's working directory when it was parsed. */
  path: string;
}

export interface CopyOptions {
  from: CopyEndpoint;
  to: CopyEndpoint;
  /** The uploads folders themselves (the parents of `YYYY/`), defaulted from each side's data folder. */
  uploadsFrom: string;
  uploadsTo: string;
  /** Write into a target that already holds records. */
  force: boolean;
}

export interface CopyReport {
  counts: CopyCounts;
  uploads: UploadCounts;
}

const SIDES = ['from', 'to'] as const;
type Side = (typeof SIDES)[number];

/** `--from-sqlite`, `--from-json`, … — the driver list is config.ts's, so a new driver needs no flag of its own here. */
const endpointFlag = (side: Side, driver: StorageDriver): string => `--${side}-${driver}`;
const ENDPOINT_FLAGS = SIDES.flatMap((side) => STORAGE_DRIVERS.map((driver) => endpointFlag(side, driver)));
const VALUE_FLAGS = new Set([...ENDPOINT_FLAGS, '--uploads-from', '--uploads-to']);

export const USAGE = `Usage: npm run copy -- --from-<driver> <path> --to-<driver> <path> [options]

  --from-sqlite <file>   a flyers.db to read; a snapshot is opened, never the file itself
  --from-json <dir>      a JSON store folder to read
  --to-sqlite <file>     a flyers.db to write (created when missing)
  --to-json <dir>        a JSON store folder to write (created when missing)
  --uploads-from <dir>   default: the source's data folder / ${UPLOADS_DIR}
  --uploads-to <dir>     default: the target's data folder / ${UPLOADS_DIR}
  --force                write into a target that already holds records
  --help                 this text

Drivers: ${STORAGE_DRIVERS.join(', ')}. Only the photo files the records point at are copied.`;

/** Parses the flags and fills the defaults, so what the copy will do can be seen (and tested) without running it. */
export function parseArgs(argv: readonly string[]): CopyOptions {
  const values = new Map<string, string>();
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') {
      force = true;
      continue;
    }
    // Split on the first "=" only: a Windows path keeps its drive letter, whatever else it contains.
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    if (flag === '--force') throw new Error('--force takes no value.');
    if (!VALUE_FLAGS.has(flag)) throw new Error(`Unknown option "${flag}".\n\n${USAGE}`);
    if (values.has(flag)) throw new Error(`${flag} was given twice.`);
    const value: string | undefined = eq === -1 ? argv[i + 1] : arg.slice(eq + 1);
    if (value === undefined || value === '' || value.startsWith('--')) throw new Error(`${flag} needs a path.\n\n${USAGE}`);
    if (eq === -1) i++;
    values.set(flag, value);
  }

  const from = endpoint(values, 'from');
  const to = endpoint(values, 'to');
  // Folders, not paths: `--from-sqlite ./data/flyers.db --to-json ./data` would
  // otherwise scatter a JSON store through the live SQLite data folder.
  if (dataDir(from) === dataDir(to)) {
    throw new Error(`The source and the target are the same data folder: ${dataDir(from)}. A data folder is served by one backend at a time.`);
  }
  const uploads = (flag: string, side: CopyEndpoint): string => resolve(values.get(flag) ?? join(dataDir(side), UPLOADS_DIR));
  return { from, to, uploadsFrom: uploads('--uploads-from', from), uploadsTo: uploads('--uploads-to', to), force };
}

function endpoint(values: Map<string, string>, side: Side): CopyEndpoint {
  const given = STORAGE_DRIVERS.filter((driver) => values.has(endpointFlag(side, driver)));
  if (given.length !== 1) {
    const flags = STORAGE_DRIVERS.map((driver) => endpointFlag(side, driver)).join(' or ');
    throw new Error(`Give exactly one ${flags} (got ${given.length}).\n\n${USAGE}`);
  }
  return { driver: given[0], path: resolve(values.get(endpointFlag(side, given[0]))!) };
}

/** The data folder an endpoint belongs to: the file's folder for SQLite, the folder itself for the rest. */
const dataDir = (store: CopyEndpoint): string => (store.driver === 'sqlite' ? dirname(store.path) : store.path);

/** The composition root wants a full DataPaths; only the driver's own entry is read (db for SQLite, root for JSON). */
function pathsFor(store: CopyEndpoint): DataPaths {
  const paths = dataPaths(dataDir(store));
  return store.driver === 'sqlite' ? { ...paths, db: store.path } : paths;
}

/** Every driver comes from composition.ts, so the copy tool never names one. */
const openStore = (store: CopyEndpoint): Repositories => createRepositories({ storage: store.driver }, pathsFor(store), systemClock);

/**
 * The source, opened without touching it: a SQLite file is snapshotted first (see the file header),
 * and a folder that isn't there is a typo, not an empty library to copy.
 */
function openSource(store: CopyEndpoint): { repos: Repositories; dispose: () => Promise<void> } {
  if (!existsSync(store.path)) throw new Error(`There is no ${store.driver} store at ${store.path}`);
  if (store.driver !== 'sqlite') {
    // A folder without a store is a typo too. Opening it would *create* an
    // empty store there and then report a successful copy of nothing.
    const marker = join(store.path, ...STORAGE_FILES.meta.split('/'));
    if (!existsSync(marker)) throw new Error(`There is no ${store.driver} store at ${store.path} (no ${STORAGE_FILES.meta})`);
    const repos = openStore(store);
    return { repos, dispose: () => repos.close() };
  }
  const dir = mkdtempSync(join(tmpdir(), 'nest-flyers-copy-'));
  const remove = () => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  try {
    const file = join(dir, basename(store.path));
    // The -wal holds commits the .db does not, and the -shm the index into it; without them a snapshot loses the last saves.
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(store.path + suffix)) copyFileSync(store.path + suffix, file + suffix);
    }
    const repos = openStore({ driver: 'sqlite', path: file });
    return {
      repos,
      dispose: async () => {
        try {
          await repos.close();
        } finally {
          remove();
        }
      },
    };
  } catch (e) {
    remove(); // never leave a copy of the whole library in the temp folder
    throw e;
  }
}

const plural = (n: number, one: string): string => `${n} ${n === 1 ? one : `${one}s`}`;

/** The same refusal by file, before the target is opened (and so before it is created). */
function refuseExistingFiles(to: CopyEndpoint): void {
  const existing = to.driver === 'sqlite' ? to.path : join(to.path, ...STORAGE_FILES.meta.split('/'));
  if (existsSync(existing)) {
    throw new Error(`${existing} already exists. Copy into an empty store, or pass --force to write into this one.`);
  }
}

/** Refuses a target with records in it: copying into one merges two libraries by id, which is nobody's intention. */
async function refuseExisting(repos: Repositories, to: CopyEndpoint): Promise<void> {
  const held: string[] = [];
  const count = (n: number, what: string) => {
    if (n > 0) held.push(plural(n, what));
  };
  count((await repos.hostels.list()).length, 'hostel');
  count((await repos.doodles.list()).length, 'doodle');
  count((await repos.photos.all()).length, 'photo');
  count((await repos.flyers.all()).length, 'flyer');
  if (held.length > 0) {
    throw new Error(`${to.path} already holds ${held.join(', ')}. Copy into an empty store, or pass --force to write into this one.`);
  }
}

export async function runCopy(options: CopyOptions): Promise<CopyReport> {
  // Refused before anything is opened: opening a SQLite target would already
  // create it, switch it to WAL and migrate it.
  if (!options.force) refuseExistingFiles(options.to);
  const source = openSource(options.from);
  try {
    const target = openStore(options.to);
    try {
      if (!options.force) await refuseExisting(target, options.to);
      // Files before records: a flyer whose photo never arrived is a broken flyer, an unreferenced file is only a file.
      const uploads = copyUploads(await source.repos.photos.all(), options.uploadsFrom, options.uploadsTo);
      return { counts: await copy(source.repos, target), uploads };
    } finally {
      await target.close();
    }
  } finally {
    await source.dispose();
  }
}

// Only when run as the script: tests import parseArgs and runCopy from here.
const [, entryPoint] = process.argv;
if (entryPoint && resolve(entryPoint) === import.meta.filename) {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
  } else {
    try {
      const options = parseArgs(argv);
      const { counts, uploads } = await runCopy(options);
      console.log(`Copied ${options.from.driver} ${options.from.path} to ${options.to.driver} ${options.to.path}`);
      const records = [plural(counts.hostels, 'hostel'), plural(counts.doodles, 'doodle'), plural(counts.photos, 'photo'), plural(counts.flyers, 'flyer')];
      console.log(`  ${records.join(', ')} (archived flyers included)`);
      console.log(`  ${plural(uploads.copied, 'photo file')} copied to ${options.uploadsTo}, ${uploads.skipped} already there`);
      console.log('A data folder is served by one backend at a time: point the app at the copy, not at both.');
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}
