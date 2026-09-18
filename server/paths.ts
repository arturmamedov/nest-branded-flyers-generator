import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/* Works from both server/ (tsx) and dist-server/server/ (compiled). */
function findAppRoot(start: string): string {
  let dir = start;
  while (!existsSync(join(dir, 'package.json'))) {
    const up = dirname(dir);
    if (up === dir) throw new Error('package.json not found above ' + start);
    dir = up;
  }
  return dir;
}

export const APP_ROOT = findAppRoot(import.meta.dirname);
export const ASSETS_DIR = join(APP_ROOT, 'assets');
export const ART_DIR = join(ASSETS_DIR, 'art');
export const DIST_DIR = join(APP_ROOT, 'dist');
export const SEED_FILE = join(APP_ROOT, 'seed', 'hostels.json');
export const FIXTURE_PHOTOS_DIR = join(APP_ROOT, 'fixtures', 'photos');

export interface DataPaths {
  root: string;
  db: string;
  uploads: string;
  renders: string;
}

export function dataPaths(dataDir: string): DataPaths {
  const root = resolve(APP_ROOT, dataDir);
  return {
    root,
    db: join(root, 'flyers.db'),
    uploads: join(root, 'uploads'),
    renders: join(root, 'renders'),
  };
}

/** DB paths are POSIX-relative to DATA_DIR ("uploads/2026/09/x.jpg"). */
export function resolveDataFile(dataRoot: string, rel: string): string {
  return resolve(dataRoot, ...rel.split('/'));
}
