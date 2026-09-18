import {
  FlyerDataSchema,
  type FlyerInput,
  type FlyerListItem,
  type FlyerRecord,
  type Template,
} from '../../src/shared/schema.js';
import type { DB } from '../db/open.js';

interface FlyerRow {
  id: number;
  hostel_slug: string | null;
  template: Template;
  title: string;
  data: string;
  photo_id: number | null;
  created_at: string;
  updated_at: string;
}

const SELECT = `SELECT f.*, h.slug AS hostel_slug FROM flyer f LEFT JOIN hostel h ON h.id = f.hostel_id`;

const toRecord = (r: FlyerRow): FlyerRecord => ({
  id: r.id,
  hostel: r.hostel_slug,
  template: r.template,
  title: r.title,
  data: FlyerDataSchema.parse(JSON.parse(r.data)),
  photoId: r.photo_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function getFlyer(db: DB, id: number): FlyerRecord | null {
  const r = db.prepare(`${SELECT} WHERE f.id = ? AND f.archived = 0`).get(id) as FlyerRow | undefined;
  return r ? toRecord(r) : null;
}

export function listFlyers(db: DB, filter: { hostel?: string; template?: string }): FlyerListItem[] {
  const where = ['f.archived = 0'];
  const params: unknown[] = [];
  if (filter.hostel === 'none') where.push('f.hostel_id IS NULL');
  else if (filter.hostel) {
    where.push('h.slug = ?');
    params.push(filter.hostel);
  }
  if (filter.template) {
    where.push('f.template = ?');
    params.push(filter.template);
  }
  const rows = db
    .prepare(
      `SELECT f.id, f.title, f.template, f.updated_at, h.slug AS hostel_slug, h.name AS hostel_name
       FROM flyer f LEFT JOIN hostel h ON h.id = f.hostel_id
       WHERE ${where.join(' AND ')} ORDER BY f.updated_at DESC, f.id DESC`,
    )
    .all(...params) as { id: number; title: string; template: Template; updated_at: string; hostel_slug: string | null; hostel_name: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    template: r.template,
    hostel: r.hostel_slug,
    hostelName: r.hostel_name,
    updatedAt: r.updated_at,
  }));
}

/** The template column wins over data.template. */
function rowValues(input: FlyerInput, hostelId: number | null) {
  return {
    hostel_id: hostelId,
    template: input.template,
    title: input.title,
    data: JSON.stringify({ ...input.data, template: input.template }),
    photo_id: input.photoId,
  };
}

export function createFlyer(db: DB, input: FlyerInput, hostelId: number | null): number {
  const now = new Date().toISOString();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO flyer (hostel_id, template, title, data, photo_id, created_at, updated_at)
       VALUES (@hostel_id, @template, @title, @data, @photo_id, @now, @now)`,
    )
    .run({ ...rowValues(input, hostelId), now });
  return Number(lastInsertRowid);
}

export function updateFlyer(db: DB, id: number, input: FlyerInput, hostelId: number | null): boolean {
  const { changes } = db
    .prepare(
      `UPDATE flyer SET hostel_id = @hostel_id, template = @template, title = @title, data = @data,
         photo_id = @photo_id, updated_at = @now WHERE id = @id AND archived = 0`,
    )
    .run({ ...rowValues(input, hostelId), now: new Date().toISOString(), id });
  return changes > 0;
}

export function archiveFlyer(db: DB, id: number): boolean {
  return db.prepare('UPDATE flyer SET archived = 1, updated_at = ? WHERE id = ? AND archived = 0').run(new Date().toISOString(), id).changes > 0;
}
