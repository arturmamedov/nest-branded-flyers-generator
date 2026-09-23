import type { JsonFiles } from './files.js';
import type { CounterEntity, JsonStore } from './store.js';

/**
 * One of the store's list files (hostels.json, doodles.json, photos.json,
 * flyers/index.json): a JSON array of records with integer ids, plus the id
 * counter those records draw from. Doesn't lock; the repository holds the
 * store's lock. The twin of php/src/Storage/Json/RecordFile.php.
 */
export class RecordFile<T extends { id: number }> {
  /**
   * @param path relative to the store, from STORAGE_FILES
   * @param entity the meta.json counter this file's ids come from
   */
  constructor(
    private readonly files: JsonFiles,
    private readonly path: string,
    private readonly store: JsonStore,
    private readonly entity: CounterEntity,
  ) {}

  /**
   * The records as stored, in file order (which readers must not rely on). A missing file is an empty list: the store
   * creates every file on first use, so that only happens after someone deletes one by hand.
   *
   * Only the id is checked, as the PHP driver does — the two backends must tolerate the same folder, and every
   * repository rebuilds each record in the schema's key order before writing it back.
   */
  async read(): Promise<T[]> {
    const records = (await this.files.read(this.path)) ?? [];
    if (!Array.isArray(records)) throw new Error(`${this.path} is damaged: expected a JSON array of records.`);
    for (const record of records) {
      if (record === null || typeof record !== 'object' || !Number.isInteger((record as { id?: unknown }).id)) {
        throw new Error(`${this.path} is damaged: every record needs an integer id.`);
      }
    }
    return records as T[];
  }

  /** Replaces the file. Records go out by id, so the file reads (and diffs) the same whoever wrote it last. */
  async write(records: T[]): Promise<void> {
    await this.files.write(this.path, [...records].sort((a, b) => a.id - b.id));
  }

  /**
   * A new id from the counter. The counter alone never reuses an id; skipping ids already present protects the
   * records when meta.json has been restored from an older backup than the data (a flyer's own file would be
   * overwritten otherwise, hence `taken`).
   *
   * @param records the file's current records
   * @param taken an extra "is this id in use?" check
   */
  async newId(records: { id: number }[], taken?: (id: number) => Promise<boolean>): Promise<number> {
    // The highest id in the file raises the counter in a single write, so a counter left far behind never costs one
    // meta.json rewrite per id while the store-wide lock is held.
    const highest = records.reduce((max, r) => (r.id > max ? r.id : max), 0);
    let id = await this.store.next(this.entity, highest);
    while (taken && (await taken(id))) id = await this.store.next(this.entity);
    return id;
  }
}
