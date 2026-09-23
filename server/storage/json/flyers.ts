import { FlyerDataSchema, type FlyerInput, type FlyerListItem, type FlyerRecord, type Template } from '../../../src/shared/schema.js';
import type { FlyerIndexEntry, StoredFlyer } from '../../../src/shared/storage.js';
import { MissingReferenceError, type Clock, type FlyerFilter, type FlyerRepository, type HostelRepository, type PhotoRepository } from '../types.js';
import type { JsonFiles } from './files.js';
import { byText } from './order.js';
import type { RecordFile } from './records.js';
import type { JsonStore } from './store.js';

/**
 * Flyers: one file per flyer (<flyerDir>/<id>.json, $defs.flyer) plus
 * flyers/index.json ($defs.flyerIndex), which the library lists from without
 * opening every flyer. The flyer's file is the truth; the index is written
 * after it, so a crash in between leaves the index one save behind (a stale or
 * missing list entry, put right by the flyer's next save), never an entry
 * pointing at a flyer that isn't there.
 *
 * The twin of php/src/Storage/Json/JsonFlyerRepository.php, plus the
 * all()/put() the copy tool needs.
 */

/** A flyer as it sits in its file: `data` untouched, because a soft delete writes the record back exactly as stored. */
type FlyerFile = Omit<StoredFlyer, 'data'> & { data: unknown };

/** What a stored flyer is built from: an input, or a record already on disk. */
interface FlyerFields {
  hostel: string | null;
  template: Template;
  title: string;
  data: unknown;
  photoId: number | null;
}

export class JsonFlyerRepository implements FlyerRepository {
  constructor(
    private readonly files: JsonFiles,
    private readonly index: RecordFile<FlyerIndexEntry>,
    private readonly store: JsonStore,
    private readonly clock: Clock,
    private readonly hostels: Pick<HostelRepository, 'list' | 'bySlug'>,
    private readonly photos: Pick<PhotoRepository, 'get'>,
    /** The folder of the flyer files, relative to the store (STORAGE_FILES.flyerDir). */
    private readonly flyerDir: string,
  ) {}

  async get(id: number): Promise<FlyerRecord | null> {
    const flyer = await this.store.run(() => this.current(id));
    return flyer && toRecord(flyer);
  }

  async list(filter: FlyerFilter): Promise<FlyerListItem[]> {
    const { entries, names } = await this.store.run(async () => ({ entries: await this.index.read(), names: await this.hostelNames() }));
    return entries
      .filter((entry) => !entry.archived && matches(entry, filter))
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        template: entry.template,
        hostel: entry.hostel,
        // Joined now, never stored in the index: renaming a hostel shows up in the library at once.
        hostelName: entry.hostel === null ? null : (names.get(entry.hostel) ?? null),
        updatedAt: entry.updatedAt,
      }))
      // Timestamps are fixed-width UTC, so text order is time order.
      .sort((a, b) => byText(b.updatedAt, a.updatedAt) || b.id - a.id);
  }

  async create(input: FlyerInput): Promise<number> {
    return this.store.run(async () => {
      await this.checkReferences(input);
      const entries = await this.index.read();
      const id = await this.index.newId(entries, (candidate) => this.files.exists(this.path(candidate)));
      const now = this.clock.now();
      await this.save(stored(id, input, now, now, false), entries);
      return id;
    });
  }

  async update(id: number, input: FlyerInput): Promise<boolean> {
    return this.store.run(async () => {
      // References first, as the SQLite driver does: a bad slug throws even when the flyer is missing.
      await this.checkReferences(input);
      const current = await this.current(id);
      if (!current) {
        await this.repairIndex(id);
        return false;
      }
      await this.save(stored(id, input, current.createdAt, this.clock.now(), false), await this.index.read());
      return true;
    });
  }

  async archive(id: number): Promise<boolean> {
    return this.store.run(async () => {
      const current = await this.current(id);
      if (!current) {
        await this.repairIndex(id);
        return false;
      }
      // Soft delete: everything stays on disk as stored (data not re-normalised), only hidden.
      await this.save(stored(id, current, current.createdAt, this.clock.now(), true), await this.index.read());
      return true;
    });
  }

  /**
   * Every flyer, archived included, by id. The folder is the truth, not the index: a flyer whose index row was lost
   * to a half-finished write is still a flyer, and the copy tool must carry it over.
   */
  async all(): Promise<StoredFlyer[]> {
    return this.store.run(async () => {
      const ids = (await this.files.names(this.flyerDir))
        .map((name) => /^(\d+)\.json$/.exec(name)?.[1])
        .filter((id) => id !== undefined)
        .map(Number)
        .sort((a, b) => a - b);
      const flyers: StoredFlyer[] = [];
      for (const id of ids) {
        const flyer = await this.read(id);
        if (flyer) flyers.push({ ...toRecord(flyer), archived: flyer.archived });
      }
      return flyers;
    });
  }

  async put(flyer: StoredFlyer): Promise<void> {
    await this.store.run(async () => {
      await this.checkReferences(flyer);
      await this.save(stored(flyer.id, flyer, flyer.createdAt, flyer.updatedAt, flyer.archived), await this.index.read());
      await this.store.raise('flyer', flyer.id);
    });
  }

  /** The stored flyer, or null when it is missing or archived. */
  private async current(id: number): Promise<FlyerFile | null> {
    const flyer = await this.read(id);
    return flyer?.archived === false ? flyer : null;
  }

  private async read(id: number): Promise<FlyerFile | null> {
    if (!Number.isInteger(id) || id < 1) return null;
    const raw = await this.files.read(this.path(id));
    if (raw === null) return null;
    if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${this.path(id)} is damaged: expected a flyer object.`);
    return raw as FlyerFile;
  }

  private path(id: number): string {
    return `${this.flyerDir}/${id}.json`;
  }

  /**
   * The flyer's own file first, then its index entry (see the class comment).
   * @param entries the index as read under the same lock
   */
  private async save(flyer: FlyerFile, entries: FlyerIndexEntry[]): Promise<void> {
    await this.files.write(this.path(flyer.id), flyer);
    await this.index.write([...entries.filter((e) => e.id !== flyer.id).map(entry), entry(flyer)]);
  }

  /**
   * Puts one index row back in step with the flyer's own file. The file is written first and the index second, so a
   * crash (or a disk that fills up) in between can leave a row saying "not archived" for a flyer that is. The flyer
   * itself can never repair that afterwards — it is archived, so update() and archive() both refuse it — hence this
   * runs exactly there, inside the same lock, and the next write of either kind clears the ghost from the library.
   * Costs nothing when the row is already right.
   */
  private async repairIndex(id: number): Promise<void> {
    const flyer = await this.read(id);
    const index: FlyerIndexEntry[] = [];
    let changed = false;
    for (const row of await this.index.read()) {
      if (row.id !== id) {
        index.push(entry(row));
        continue;
      }
      if (!flyer) {
        changed = true; // no flyer file at all: the row goes
        continue;
      }
      const fixed = entry(flyer);
      changed ||= JSON.stringify(fixed) !== JSON.stringify(entry(row));
      index.push(fixed);
    }
    if (changed) await this.index.write(index);
  }

  private async checkReferences(input: Pick<FlyerFields, 'hostel' | 'photoId'>): Promise<void> {
    if (input.hostel !== null && (await this.hostels.bySlug(input.hostel)) === null) throw new MissingReferenceError(`Unknown hostel ${input.hostel}`);
    if (input.photoId !== null && (await this.photos.get(input.photoId)) === null) throw new MissingReferenceError(`Unknown photo ${input.photoId}`);
  }

  /** Hostel name by slug. */
  private async hostelNames(): Promise<Map<string, string>> {
    return new Map((await this.hostels.list()).map((h) => [h.slug, h.name]));
  }
}

const matches = (entry: FlyerIndexEntry, filter: FlyerFilter): boolean => {
  const hostelOk = !filter.hostel ? true : filter.hostel === 'none' ? entry.hostel === null : entry.hostel === filter.hostel;
  return hostelOk && (!filter.template || entry.template === filter.template);
};

/** `data` is normalised on every read, as the SQLite driver does: a flyer saved by an older build gains today's defaults and loses dropped keys. */
const toRecord = (flyer: FlyerFile): FlyerRecord => ({
  id: flyer.id,
  hostel: flyer.hostel,
  template: flyer.template,
  title: flyer.title,
  data: FlyerDataSchema.parse(flyer.data),
  photoId: flyer.photoId,
  createdAt: flyer.createdAt,
  updatedAt: flyer.updatedAt,
});

/** A flyer file's record, in the schema's key order. */
const stored = (id: number, fields: FlyerFields, createdAt: string, updatedAt: string, archived: boolean): FlyerFile => ({
  id,
  hostel: fields.hostel,
  template: fields.template,
  title: fields.title,
  data: fields.data,
  photoId: fields.photoId,
  createdAt,
  updatedAt,
  archived,
});

/** An index entry, in the schema's key order. */
const entry = (flyer: Pick<FlyerFile, 'id' | 'title' | 'template' | 'hostel' | 'updatedAt' | 'archived'>): FlyerIndexEntry => ({
  id: flyer.id,
  title: flyer.title,
  template: flyer.template,
  hostel: flyer.hostel,
  updatedAt: flyer.updatedAt,
  archived: flyer.archived,
});
