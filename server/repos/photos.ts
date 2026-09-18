import type { PhotoInfo } from '../../src/shared/schema.js';
import type { DB } from '../db/open.js';

interface PhotoRow {
  id: number;
  path: string;
  width: number;
  height: number;
}

const toInfo = (r: PhotoRow): PhotoInfo => ({ id: r.id, url: '/' + r.path, width: r.width, height: r.height });

export function insertPhoto(db: DB, p: { path: string; width: number; height: number }): PhotoInfo {
  const now = new Date().toISOString();
  const { lastInsertRowid } = db
    .prepare('INSERT INTO photo (path, width, height, created_at) VALUES (?, ?, ?, ?)')
    .run(p.path, p.width, p.height, now);
  return toInfo({ id: Number(lastInsertRowid), ...p });
}

export function photoById(db: DB, id: number | null): PhotoInfo | null {
  if (id == null) return null;
  const r = db.prepare('SELECT id, path, width, height FROM photo WHERE id = ?').get(id) as PhotoRow | undefined;
  return r ? toInfo(r) : null;
}

/** Stable identity for the render cache key. */
export function photoPath(db: DB, id: number | null): string | null {
  if (id == null) return null;
  const r = db.prepare('SELECT path FROM photo WHERE id = ?').get(id) as { path: string } | undefined;
  return r?.path ?? null;
}
