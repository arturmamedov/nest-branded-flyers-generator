import type { StoredDoodle } from '../../../src/shared/storage.js';
import type { DoodleFields, DoodleRepository } from '../types.js';
import { byText } from './order.js';
import type { RecordFile } from './records.js';
import type { JsonStore } from './store.js';

/** Doodles in doodles.json ($defs.doodles); the twin of php/src/Storage/Json/JsonDoodleRepository.php. */
export class JsonDoodleRepository implements DoodleRepository {
  constructor(
    private readonly file: RecordFile<StoredDoodle>,
    private readonly store: JsonStore,
  ) {}

  async list(): Promise<StoredDoodle[]> {
    const doodles = await this.store.run(() => this.all());
    // Built-ins first, then kind, then label.
    return doodles.sort((a, b) => Number(b.builtin) - Number(a.builtin) || byText(a.kind, b.kind) || byText(a.label, b.label) || a.id - b.id);
  }

  async upsert(fields: DoodleFields): Promise<void> {
    await this.store.run(async () => {
      const doodles = await this.all();
      const existing = doodles.find((d) => d.slug === fields.slug);
      // builtin is fixed when the doodle is first stored: re-seeding never turns a staff upload into a built-in, or a
      // built-in back into an upload.
      const record = toRecord(existing?.id ?? (await this.file.newId(doodles)), { ...fields, builtin: existing?.builtin ?? fields.builtin });
      await this.file.write(existing ? doodles.map((d) => (d.id === record.id ? record : d)) : [...doodles, record]);
    });
  }

  async put(doodle: StoredDoodle): Promise<void> {
    await this.store.run(async () => {
      const doodles = await this.all();
      const clash = doodles.find((d) => d.slug === doodle.slug && d.id !== doodle.id);
      if (clash) throw new Error(`Cannot store doodle ${doodle.id}: the slug ${doodle.slug} already belongs to doodle ${clash.id}.`);
      const record = toRecord(doodle.id, doodle);
      await this.file.write(doodles.some((d) => d.id === record.id) ? doodles.map((d) => (d.id === record.id ? record : d)) : [...doodles, record]);
      await this.store.raise('doodle', record.id);
    });
  }

  private async all(): Promise<StoredDoodle[]> {
    return (await this.file.read()).map((d) => toRecord(d.id, d));
  }
}

/** The stored shape, in the schema's key order. */
const toRecord = (id: number, fields: DoodleFields): StoredDoodle => ({
  id,
  slug: fields.slug,
  label: fields.label,
  path: fields.path,
  kind: fields.kind,
  builtin: fields.builtin,
});
