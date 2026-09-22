import { writeFile } from 'node:fs/promises';
import { API_ERRORS } from '../../../src/shared/errors.js';
import { emptyMeta, JSON_MIGRATIONS, MetaFileSchema, STORAGE_FILES, STORAGE_FORMAT_VERSION, type MetaFile } from '../../../src/shared/storage.js';
import { isCode, type JsonFiles } from './files.js';
import type { StoreLock } from './lock.js';

/* The store's meta.json ($defs.meta in schema/storage.schema.json): the format
   version and applied migrations that say which builds may read the folder,
   the id counters, and the seed hash PHP keeps.

   The twin of php/src/Storage/Json/JsonStore.php. Both backends read and write
   the same folder, so these version checks are what keep an older build from
   mangling a newer store. */

/** meta.json's counters, in the schema's key order — the one place a record type's id counter is named. */
const ENTITIES = Object.keys(MetaFileSchema.shape.counters.shape) as CounterEntity[];
export type CounterEntity = keyof MetaFile['counters'];

/** The record lists a fresh store gets, empty. A flyer's own file is made when the flyer is. */
const LIST_FILES = ['hostels', 'doodles', 'photos', 'flyerIndex'] as const;

const META = STORAGE_FILES.meta;

/** A store a newer build wrote. Staff see the same words on both backends (PHP throws ErrorCatalog's storage_too_new). */
export class StorageTooNewError extends Error {
  constructor() {
    super(API_ERRORS.storage_too_new.message);
    this.name = 'StorageTooNewError';
  }
}

export class JsonStore {
  private opening: Promise<void> | undefined;

  constructor(
    private readonly files: JsonFiles,
    private readonly lock: StoreLock,
  ) {}

  /**
   * Every repository call goes through here: the store is opened once (created
   * on first use, refused when a newer build wrote it), then the call gets the
   * folder to itself.
   */
  async run<T>(fn: () => T | Promise<T>): Promise<T> {
    await this.open();
    return this.lock.run(fn);
  }

  /**
   * Hands out the counter's next value and saves it before returning, so an id is never handed out twice.
   * @param atLeast the highest id already in the record file: a counter behind its records catches up in one write
   */
  async next(entity: CounterEntity, atLeast = 0): Promise<number> {
    // Re-entrant: repositories call this inside their own run(); called alone, it is still safe.
    return this.lock.run(async () => {
      const meta = await this.meta();
      const id = Math.max(meta.counters[entity], atLeast) + 1;
      meta.counters[entity] = id;
      await this.writeMeta(meta);
      return id;
    });
  }

  /**
   * Raises a counter to cover an id written directly (the copy tool's put()),
   * consuming nothing. Without it a copied store would hold records with high
   * ids and counters at 0, and meta.json would no longer say which ids are
   * taken — the next create would have to rediscover that from the records.
   */
  async raise(entity: CounterEntity, id: number): Promise<void> {
    await this.lock.run(async () => {
      const meta = await this.meta();
      if (meta.counters[entity] >= id) return;
      meta.counters[entity] = id;
      await this.writeMeta(meta);
    });
  }

  /** Memoised, and forgotten again when it fails, so a transient disk error does not need a restart. */
  private open(): Promise<void> {
    this.opening ??= this.load().catch((e: unknown) => {
      this.opening = undefined;
      throw e;
    });
    return this.opening;
  }

  private async load(): Promise<void> {
    // The common case is a store that is already there, and reading it needs no lock.
    const raw =
      (await this.files.read(META)) ??
      // Missing: look again under the lock, since another call may have created it in between.
      (await this.lock.run(async () => ((await this.files.exists(META)) ? await this.files.read(META) : await this.create())));
    this.refuseNewer(raw);
    this.refuseOlder(this.validMeta(raw));
    await this.denyOverHttp();
  }

  /** Record files first and meta.json last: a store with a meta.json is complete. */
  private async create(): Promise<unknown> {
    for (const key of LIST_FILES) {
      if (!(await this.files.exists(STORAGE_FILES[key]))) await this.files.write(STORAGE_FILES[key], []);
    }
    // A fresh store is already in the latest shape, so every migration this build knows counts as applied.
    await this.writeMeta(emptyMeta());
    return this.files.read(META);
  }

  /** Checked before the shape: a newer format may have changed it, and the answer should still be "update the app". */
  private refuseNewer(raw: unknown): void {
    if (raw === null || typeof raw !== 'object') return;
    const meta = raw as Partial<MetaFile>;
    if (typeof meta.formatVersion === 'number' && meta.formatVersion > STORAGE_FORMAT_VERSION) throw new StorageTooNewError();
    if (Array.isArray(meta.migrations) && meta.migrations.some((m) => !JSON_MIGRATIONS.includes(m))) throw new StorageTooNewError();
  }

  /**
   * An older store needs its migrations applied before use. None exist yet (JSON_MIGRATIONS is empty); when one is
   * added to src/shared/storage.ts, both backends implement it, and until then this refuses the store loudly rather
   * than serve data in a shape the code no longer expects.
   */
  private refuseOlder(meta: MetaFile): void {
    const pending = JSON_MIGRATIONS.filter((m) => !meta.migrations.includes(m));
    if (meta.formatVersion < STORAGE_FORMAT_VERSION || pending.length > 0) {
      throw new Error(
        `${META} is format ${meta.formatVersion} with migrations [${meta.migrations.join(', ')}]; ` +
          `this build needs format ${STORAGE_FORMAT_VERSION} and has no implementation for [${pending.join(', ')}].`,
      );
    }
  }

  private async meta(): Promise<MetaFile> {
    return this.validMeta(await this.files.read(META));
  }

  /** The shape $defs.meta promises, checked so a hand-edited file fails with its name rather than a TypeError. */
  private validMeta(raw: unknown): MetaFile {
    const parsed = MetaFileSchema.safeParse(raw);
    if (!parsed.success) {
      const problem = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message.toLowerCase()}`).join('; ');
      throw new Error(`${META} is damaged: ${problem}.`);
    }
    return parsed.data;
  }

  /** Rebuilt in the schema's key order, so the file is the same whichever driver last wrote it. */
  private async writeMeta(meta: MetaFile): Promise<void> {
    const counters = {} as MetaFile['counters'];
    for (const entity of ENTITIES) counters[entity] = meta.counters[entity];
    await this.files.write(META, {
      formatVersion: meta.formatVersion,
      migrations: [...meta.migrations],
      counters,
      seedHash: meta.seedHash,
    });
  }

  /**
   * The store's own deny rules, the same bytes php/src/Storage/Json/JsonRepositories.php writes (a data folder is
   * served by one backend at a time, but it outlives both). The folder may sit anywhere the admin pointed at,
   * including inside a web root, and a host without mod_authz_core would otherwise serve the whole library.
   * Written once, never overwritten; a host that ignores .htaccess is unaffected either way.
   */
  private async denyOverHttp(): Promise<void> {
    const files: Record<string, string> = {
      '.htaccess':
        '# The flyer library. Never served over HTTP.\n' +
        '<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n' +
        '<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\n',
      // A directory listing needs something to show even where Options -Indexes is not allowed.
      'index.html': '<!doctype html><title>Nest flyers</title>\n',
    };
    for (const [name, contents] of Object.entries(files)) {
      // 'wx' is the whole guard: whoever gets there first writes it, and nobody overwrites what an admin changed.
      await writeFile(this.files.path(name), contents, { encoding: 'utf8', flag: 'wx' }).catch((e: unknown) => {
        if (!isCode(e, 'EEXIST')) throw e;
      });
    }
  }
}
