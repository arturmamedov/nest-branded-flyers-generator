import type { Hostel } from '../../../src/shared/schema.js';
import type { DB } from '../../db/open.js';
import type { HostelFields, HostelRepository } from '../types.js';

interface HostelRow {
  id: number;
  slug: string;
  name: string;
  island: string;
  logo_path: string | null;
  sort_order: number;
}

const toHostel = (r: HostelRow): Hostel => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  island: r.island,
  logoPath: r.logo_path,
  sortOrder: r.sort_order,
});

export class SqliteHostelRepository implements HostelRepository {
  constructor(private db: DB) {}

  async list() {
    return (this.db.prepare('SELECT * FROM hostel ORDER BY sort_order, name, id').all() as HostelRow[]).map(toHostel);
  }

  async bySlug(slug: string) {
    const r = this.db.prepare('SELECT * FROM hostel WHERE slug = ?').get(slug) as HostelRow | undefined;
    return r ? toHostel(r) : null;
  }

  /** Idempotent: slug is the stable key flyers are tagged by. */
  async upsert(h: HostelFields) {
    this.db
      .prepare(
        `INSERT INTO hostel (slug, name, island, logo_path, sort_order)
         VALUES (@slug, @name, @island, @logoPath, @sortOrder)
         ON CONFLICT(slug) DO UPDATE SET name = excluded.name, island = excluded.island,
           logo_path = excluded.logo_path, sort_order = excluded.sort_order`,
      )
      .run(h);
  }

  async put(h: Hostel) {
    this.db
      .prepare(
        `INSERT INTO hostel (id, slug, name, island, logo_path, sort_order)
         VALUES (@id, @slug, @name, @island, @logoPath, @sortOrder)
         ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, name = excluded.name, island = excluded.island,
           logo_path = excluded.logo_path, sort_order = excluded.sort_order`,
      )
      .run(h);
  }
}
