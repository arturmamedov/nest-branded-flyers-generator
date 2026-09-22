import type { Hostel } from '../../../src/shared/schema.js';
import type { HostelFields, HostelRepository } from '../types.js';
import { byText } from './order.js';
import type { RecordFile } from './records.js';
import type { JsonStore } from './store.js';

/** Hostels in hostels.json ($defs.hostels); the twin of php/src/Storage/Json/JsonHostelRepository.php. */
export class JsonHostelRepository implements HostelRepository {
  constructor(
    private readonly file: RecordFile<Hostel>,
    private readonly store: JsonStore,
  ) {}

  async list(): Promise<Hostel[]> {
    const hostels = await this.store.run(() => this.all());
    return hostels.sort((a, b) => a.sortOrder - b.sortOrder || byText(a.name, b.name) || a.id - b.id);
  }

  async bySlug(slug: string): Promise<Hostel | null> {
    return this.store.run(async () => (await this.all()).find((h) => h.slug === slug) ?? null);
  }

  /** The slug is the stable key flyers are tagged by; the id never changes once handed out. */
  async upsert(fields: HostelFields): Promise<void> {
    await this.store.run(async () => {
      const hostels = await this.all();
      const existing = hostels.find((h) => h.slug === fields.slug);
      const record = toRecord(existing?.id ?? (await this.file.newId(hostels)), fields);
      await this.file.write(existing ? hostels.map((h) => (h.id === record.id ? record : h)) : [...hostels, record]);
    });
  }

  async put(hostel: Hostel): Promise<void> {
    await this.store.run(async () => {
      const hostels = await this.all();
      // The store's UNIQUE(slug), which SQLite enforces for us: two hostels with one slug would make bySlug a coin toss.
      const clash = hostels.find((h) => h.slug === hostel.slug && h.id !== hostel.id);
      if (clash) throw new Error(`Cannot store hostel ${hostel.id}: the slug ${hostel.slug} already belongs to hostel ${clash.id}.`);
      const record = toRecord(hostel.id, hostel);
      await this.file.write(hostels.some((h) => h.id === record.id) ? hostels.map((h) => (h.id === record.id ? record : h)) : [...hostels, record]);
      await this.store.raise('hostel', record.id);
    });
  }

  private async all(): Promise<Hostel[]> {
    return (await this.file.read()).map((h) => toRecord(h.id, h));
  }
}

/** The stored shape, in the schema's key order. */
const toRecord = (id: number, fields: HostelFields): Hostel => ({
  id,
  slug: fields.slug,
  name: fields.name,
  island: fields.island,
  logoPath: fields.logoPath,
  sortOrder: fields.sortOrder,
});
