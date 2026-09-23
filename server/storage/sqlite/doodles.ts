import type { StoredDoodle } from '../../../src/shared/storage.js';
import type { DB } from '../../db/open.js';
import type { DoodleFields, DoodleRepository } from '../types.js';

interface DoodleRow {
  id: number;
  slug: string;
  label: string;
  path: string;
  kind: string;
  builtin: number;
}

const toDoodle = (r: DoodleRow): StoredDoodle => ({
  id: r.id,
  slug: r.slug,
  label: r.label,
  path: r.path,
  kind: r.kind,
  builtin: r.builtin === 1,
});

export class SqliteDoodleRepository implements DoodleRepository {
  constructor(private db: DB) {}

  async list() {
    return (this.db.prepare('SELECT * FROM doodle ORDER BY builtin DESC, kind, label, id').all() as DoodleRow[]).map(toDoodle);
  }

  async upsert(d: DoodleFields) {
    this.db
      .prepare(
        `INSERT INTO doodle (slug, label, path, kind, builtin) VALUES (@slug, @label, @path, @kind, @builtin)
         ON CONFLICT(slug) DO UPDATE SET label = excluded.label, path = excluded.path, kind = excluded.kind`,
      )
      .run({ ...d, builtin: d.builtin ? 1 : 0 });
  }

  async put(d: StoredDoodle) {
    this.db
      .prepare(`INSERT INTO doodle (id, slug, label, path, kind, builtin) VALUES (@id, @slug, @label, @path, @kind, @builtin)
         ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, label = excluded.label, path = excluded.path,
           kind = excluded.kind, builtin = excluded.builtin`)
      .run({ ...d, builtin: d.builtin ? 1 : 0 });
  }
}
