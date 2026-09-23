import { FlyerDataSchema, type FlyerInput, type FlyerListItem, type FlyerRecord, type Template } from '../../../src/shared/schema.js';
import type { StoredFlyer } from '../../../src/shared/storage.js';
import type { DB } from '../../db/open.js';
import { MissingReferenceError, type Clock, type FlyerFilter, type FlyerRepository } from '../types.js';

interface FlyerRow {
  id: number;
  hostel_slug: string | null;
  template: Template;
  title: string;
  data: string;
  photo_id: number | null;
  created_at: string;
  updated_at: string;
  archived: number;
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

export class SqliteFlyerRepository implements FlyerRepository {
  constructor(
    private db: DB,
    private clock: Clock,
  ) {}

  /** Flyers store the hostel's id; the seam speaks slugs. */
  private hostelId(slug: string | null): number | null {
    if (slug == null) return null;
    const r = this.db.prepare('SELECT id FROM hostel WHERE slug = ?').get(slug) as { id: number } | undefined;
    if (!r) throw new MissingReferenceError(`Unknown hostel ${slug}`);
    return r.id;
  }

  private checkPhoto(id: number | null) {
    if (id != null && !this.db.prepare('SELECT 1 FROM photo WHERE id = ?').get(id)) throw new MissingReferenceError(`Unknown photo ${id}`);
  }

  private columns(input: FlyerInput) {
    this.checkPhoto(input.photoId);
    return {
      hostel_id: this.hostelId(input.hostel),
      template: input.template,
      title: input.title,
      data: JSON.stringify(input.data),
      photo_id: input.photoId,
    };
  }

  async get(id: number) {
    const r = this.db.prepare(`${SELECT} WHERE f.id = ? AND f.archived = 0`).get(id) as FlyerRow | undefined;
    return r ? toRecord(r) : null;
  }

  async list(filter: FlyerFilter): Promise<FlyerListItem[]> {
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
    const rows = this.db
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

  async create(input: FlyerInput) {
    const now = this.clock.now();
    const { lastInsertRowid } = this.db
      .prepare(
        `INSERT INTO flyer (hostel_id, template, title, data, photo_id, created_at, updated_at)
         VALUES (@hostel_id, @template, @title, @data, @photo_id, @now, @now)`,
      )
      .run({ ...this.columns(input), now });
    return Number(lastInsertRowid);
  }

  async update(id: number, input: FlyerInput) {
    const { changes } = this.db
      .prepare(
        `UPDATE flyer SET hostel_id = @hostel_id, template = @template, title = @title, data = @data,
           photo_id = @photo_id, updated_at = @now WHERE id = @id AND archived = 0`,
      )
      .run({ ...this.columns(input), now: this.clock.now(), id });
    return changes > 0;
  }

  async archive(id: number) {
    return this.db.prepare('UPDATE flyer SET archived = 1, updated_at = ? WHERE id = ? AND archived = 0').run(this.clock.now(), id).changes > 0;
  }

  async all(): Promise<StoredFlyer[]> {
    const rows = this.db.prepare(`${SELECT} ORDER BY f.id`).all() as FlyerRow[];
    return rows.map((r) => ({ ...toRecord(r), archived: r.archived === 1 }));
  }

  async put(f: StoredFlyer) {
    this.db
      .prepare(
        `INSERT INTO flyer (id, hostel_id, template, title, data, photo_id, created_at, updated_at, archived)
         VALUES (@id, @hostel_id, @template, @title, @data, @photo_id, @created_at, @updated_at, @archived)
         ON CONFLICT(id) DO UPDATE SET hostel_id = excluded.hostel_id, template = excluded.template, title = excluded.title,
           data = excluded.data, photo_id = excluded.photo_id, created_at = excluded.created_at,
           updated_at = excluded.updated_at, archived = excluded.archived`,
      )
      .run({
        id: f.id,
        ...this.columns(f),
        created_at: f.createdAt,
        updated_at: f.updatedAt,
        archived: f.archived ? 1 : 0,
      });
  }
}
