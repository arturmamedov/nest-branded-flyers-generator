import { readFileSync } from 'node:fs';
import { SeedFileSchema } from '../../src/shared/seed.js';
import type { SeedRepositories } from './types.js';

export interface SeedReport {
  hostels: number;
  doodles: number;
  /** In storage but no longer in the file — never deleted, flyers point at them. */
  orphanHostels: string[];
}

/** Idempotent, for any driver: upsert by slug, never delete. Re-run after completing the file. */
export async function applySeedFile(repos: SeedRepositories, file: string): Promise<SeedReport> {
  const seed = SeedFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  for (const h of seed.hostels) {
    await repos.hostels.upsert({ slug: h.slug, name: h.name, island: h.island, logoPath: h.logo_path, sortOrder: h.sort_order });
  }
  for (const d of seed.doodles) await repos.doodles.upsert({ ...d, builtin: true });
  const inFile = new Set(seed.hostels.map((h) => h.slug));
  return {
    hostels: seed.hostels.length,
    doodles: seed.doodles.length,
    orphanHostels: (await repos.hostels.list()).map((h) => h.slug).filter((s) => !inFile.has(s)),
  };
}
