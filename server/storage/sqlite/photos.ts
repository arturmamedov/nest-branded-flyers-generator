import type { StoredPhoto } from '../../../src/shared/storage.js';
import type { DB } from '../../db/open.js';
import type { Clock, PhotoRepository } from '../types.js';

interface PhotoRow {
  id: number;
  path: string;
  width: number;
  height: number;
  created_at: string;
}

const toPhoto = (r: PhotoRow): StoredPhoto => ({ id: r.id, path: r.path, width: r.width, height: r.height, createdAt: r.created_at });
const COLUMNS = 'id, path, width, height, created_at';

export class SqlitePhotoRepository implements PhotoRepository {
  constructor(
    private db: DB,
    private clock: Clock,
  ) {}

  async insert(p: { path: string; width: number; height: number }) {
    const createdAt = this.clock.now();
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO photo (path, width, height, created_at) VALUES (?, ?, ?, ?)')
      .run(p.path, p.width, p.height, createdAt);
    return { id: Number(lastInsertRowid), ...p, createdAt };
  }

  async get(id: number) {
    const r = this.db.prepare(`SELECT ${COLUMNS} FROM photo WHERE id = ?`).get(id) as PhotoRow | undefined;
    return r ? toPhoto(r) : null;
  }

  async all() {
    return (this.db.prepare(`SELECT ${COLUMNS} FROM photo ORDER BY id`).all() as PhotoRow[]).map(toPhoto);
  }

  async put(p: StoredPhoto) {
    this.db
      .prepare(`INSERT INTO photo (id, path, width, height, created_at) VALUES (@id, @path, @width, @height, @createdAt)
         ON CONFLICT(id) DO UPDATE SET path = excluded.path, width = excluded.width, height = excluded.height,
           created_at = excluded.created_at`)
      .run(p);
  }
}
