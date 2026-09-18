import type { DB } from '../db/open.js';

export interface Doodle {
  id: number;
  slug: string;
  label: string;
  url: string;
  kind: string;
  builtin: boolean;
}

interface DoodleRow {
  id: number;
  slug: string;
  label: string;
  path: string;
  kind: string;
  builtin: number;
}

export function listDoodles(db: DB): Doodle[] {
  const rows = db.prepare('SELECT * FROM doodle ORDER BY builtin DESC, kind, label').all() as DoodleRow[];
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    label: r.label,
    url: '/' + r.path,
    kind: r.kind,
    builtin: r.builtin === 1,
  }));
}

export function upsertDoodle(
  db: DB,
  d: { slug: string; label: string; path: string; kind: string; builtin: boolean },
): void {
  db.prepare(
    `INSERT INTO doodle (slug, label, path, kind, builtin) VALUES (@slug, @label, @path, @kind, @builtin)
     ON CONFLICT(slug) DO UPDATE SET label = excluded.label, path = excluded.path, kind = excluded.kind`,
  ).run({ ...d, builtin: d.builtin ? 1 : 0 });
}
