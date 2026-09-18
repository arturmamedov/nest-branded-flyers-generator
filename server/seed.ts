import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { DB } from './db/open.js';
import { upsertDoodle } from './repos/doodles.js';
import { listHostels, upsertHostel } from './repos/hostels.js';

const SeedFileSchema = z.object({
  hostels: z.array(
    z.object({
      slug: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string().min(1),
      island: z.string().min(1),
      logo_path: z.string().nullable().default(null),
      sort_order: z.number().default(0),
    }),
  ),
  doodles: z.array(
    z.object({ slug: z.string(), label: z.string(), path: z.string(), kind: z.string() }),
  ),
});

export interface SeedReport {
  hostels: number;
  doodles: number;
  /** In the DB but no longer in the file — never deleted, flyers point at them. */
  orphanHostels: string[];
}

/** Idempotent: upsert by slug, never delete. Re-run after completing the file. */
export function applySeedFile(db: DB, file: string): SeedReport {
  const seed = SeedFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  db.transaction(() => {
    for (const h of seed.hostels) {
      upsertHostel(db, { slug: h.slug, name: h.name, island: h.island, logoPath: h.logo_path, sortOrder: h.sort_order });
    }
    for (const d of seed.doodles) upsertDoodle(db, { ...d, builtin: true });
  })();
  const inFile = new Set(seed.hostels.map((h) => h.slug));
  return {
    hostels: seed.hostels.length,
    doodles: seed.doodles.length,
    orphanHostels: listHostels(db).map((h) => h.slug).filter((s) => !inFile.has(s)),
  };
}
