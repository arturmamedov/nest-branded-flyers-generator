import type { Hostel } from '../../src/shared/schema.js';
import type { DB } from '../db/open.js';

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

export function listHostels(db: DB): Hostel[] {
  return (db.prepare('SELECT * FROM hostel ORDER BY sort_order, name').all() as HostelRow[]).map(toHostel);
}

export function hostelBySlug(db: DB, slug: string): Hostel | null {
  const r = db.prepare('SELECT * FROM hostel WHERE slug = ?').get(slug) as HostelRow | undefined;
  return r ? toHostel(r) : null;
}

export function hostelById(db: DB, id: number | null): Hostel | null {
  if (id == null) return null;
  const r = db.prepare('SELECT * FROM hostel WHERE id = ?').get(id) as HostelRow | undefined;
  return r ? toHostel(r) : null;
}

/** Idempotent: slug is the stable key flyers are tagged by. */
export function upsertHostel(db: DB, h: Omit<Hostel, 'id'>): void {
  db.prepare(
    `INSERT INTO hostel (slug, name, island, logo_path, sort_order)
     VALUES (@slug, @name, @island, @logoPath, @sortOrder)
     ON CONFLICT(slug) DO UPDATE SET name = excluded.name, island = excluded.island,
       logo_path = excluded.logo_path, sort_order = excluded.sort_order`,
  ).run(h);
}
