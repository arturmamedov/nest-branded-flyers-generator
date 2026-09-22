import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { UPLOADS_DIR, type StoredPhoto } from '../../src/shared/storage.js';
import type { DoodleRepository, FlyerRepository, HostelRepository, PhotoRepository } from './types.js';

/* Moving a library from one driver to another (SQLite <-> JSON files), through
   the storage seam so neither side knows what the other is. Ids, timestamps and
   `archived` survive: the result is the same library, not a re-import. The photo
   records travel here, their image files with copyUploads(). */

/** What copying reads — nothing more (ISP), so a snapshot, a live store or a fake all fit. */
export interface CopySource {
  hostels: Pick<HostelRepository, 'list'>;
  doodles: Pick<DoodleRepository, 'list'>;
  photos: Pick<PhotoRepository, 'all'>;
  flyers: Pick<FlyerRepository, 'all'>;
}

/** What copying writes: `put` is the id-preserving insert-or-replace every driver implements. */
export interface CopyTarget {
  hostels: Pick<HostelRepository, 'put'>;
  doodles: Pick<DoodleRepository, 'put'>;
  photos: Pick<PhotoRepository, 'put'>;
  flyers: Pick<FlyerRepository, 'put'>;
}

export interface CopyCounts {
  hostels: number;
  doodles: number;
  photos: number;
  flyers: number;
}

export interface UploadCounts {
  copied: number;
  /** Already in the target folder, left as they are. */
  skipped: number;
}

/**
 * Every record, in reference order: a flyer's `put` refuses a hostel slug or photo id
 * the target does not have yet, so hostels and photos go first.
 */
export async function copy(from: CopySource, to: CopyTarget): Promise<CopyCounts> {
  const hostels = await from.hostels.list();
  for (const hostel of hostels) await to.hostels.put(hostel);

  const doodles = await from.doodles.list();
  for (const doodle of doodles) await to.doodles.put(doodle);

  const photos = await from.photos.all();
  for (const photo of photos) await to.photos.put(photo);

  // all(): archived flyers included, which is the point of copying rather than re-creating.
  const flyers = await from.flyers.all();
  for (const flyer of flyers) await to.flyers.put(flyer);

  return { hostels: hostels.length, doodles: doodles.length, photos: photos.length, flyers: flyers.length };
}

const PREFIX = `${UPLOADS_DIR}/`;

/**
 * The image files the photo records point at, and only those: an uploads folder
 * also holds files from stores that were archived, tried out or deleted, and a
 * copy is not a backup. `YYYY/MM/<name>` is kept, because the stored path is the
 * record's own and must go on resolving against the new uploads folder.
 *
 * Nothing is copied until every file has been found, so a store with a missing
 * photo fails before the records are written rather than half-way through.
 *
 * @param fromDir the source uploads folder (the parent of `YYYY/`), not the data folder
 */
export function copyUploads(photos: readonly Pick<StoredPhoto, 'path'>[], fromDir: string, toDir: string): UploadCounts {
  const wanted = [...new Set(photos.map((p) => p.path))];
  const missing: string[] = [];
  const jobs: { from: string; to: string }[] = [];
  for (const path of wanted) {
    if (!path.startsWith(PREFIX) || path.includes('..')) throw new Error(`Photo path "${path}" is not inside ${PREFIX}`);
    const parts = path.slice(PREFIX.length).split('/');
    const source = join(fromDir, ...parts);
    if (existsSync(source)) jobs.push({ from: source, to: join(toDir, ...parts) });
    else missing.push(path);
  }
  if (missing.length > 0) {
    const shown = missing.slice(0, 5).join(', ');
    const rest = missing.length > 5 ? `, and ${missing.length - 5} more` : '';
    throw new Error(`${missing.length} of ${wanted.length} photo files are missing under ${fromDir}: ${shown}${rest}. Nothing was copied.`);
  }

  let copied = 0;
  let skipped = 0;
  for (const job of jobs) {
    // Names are random hex, so a file already there is the same file — as long
    // as all of it arrived. A run stopped half-way leaves a truncated image,
    // and "it exists" would skip it for ever, so the size has to agree too.
    if (existsSync(job.to) && statSync(job.to).size === statSync(job.from).size) {
      skipped++;
      continue;
    }
    mkdirSync(dirname(job.to), { recursive: true });
    // Written beside the target and renamed, so an interrupted copy leaves the
    // old file or nothing, never half an image (the same rule the store uses).
    const temp = `${job.to}.${randomBytes(6).toString('hex')}.part`;
    try {
      copyFileSync(job.from, temp);
      renameSync(temp, job.to);
    } catch (e) {
      rmSync(temp, { force: true });
      throw e;
    }
    copied++;
  }
  return { copied, skipped };
}
