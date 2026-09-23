import { join } from 'node:path';
import type { Hostel } from '../../../src/shared/schema.js';
import { STORAGE_FILES, type FlyerIndexEntry, type StoredDoodle, type StoredPhoto } from '../../../src/shared/storage.js';
import { systemClock, type Clock, type Repositories } from '../types.js';
import { JsonDoodleRepository } from './doodles.js';
import { JsonFiles } from './files.js';
import { JsonFlyerRepository } from './flyers.js';
import { JsonHostelRepository } from './hostels.js';
import { StoreLock } from './lock.js';
import { JsonPhotoRepository } from './photos.js';
import { RecordFile } from './records.js';
import { JsonStore } from './store.js';

/**
 * The JSON-file driver (docs/json-storage.md, schema/storage.schema.json): the
 * one place its pieces are wired together. `STORAGE=json` picks it.
 *
 * The folder is opened lazily — created on first use, refused when a newer
 * build wrote it — because the composition root builds repositories
 * synchronously and the store's work is async. Every repository call waits for
 * that open, so the first call is where a bad store reports itself.
 *
 * **One backend at a time.** PHP locks the folder with `flock` on `.lock` and
 * this driver with the `.lock.d` directory beside it, so the two cannot keep
 * each other out. Serve a data folder with one of them, never both.
 */
export function createJsonRepositories(opts: { dir: string; clock?: Clock }): Repositories {
  const clock = opts.clock ?? systemClock;
  const files = new JsonFiles(opts.dir);
  const store = new JsonStore(files, new StoreLock(join(opts.dir, `${STORAGE_FILES.lock}.d`)));

  const hostels = new JsonHostelRepository(new RecordFile<Hostel>(files, STORAGE_FILES.hostels, store, 'hostel'), store);
  const photos = new JsonPhotoRepository(new RecordFile<StoredPhoto>(files, STORAGE_FILES.photos, store, 'photo'), store, clock);
  return {
    hostels,
    doodles: new JsonDoodleRepository(new RecordFile<StoredDoodle>(files, STORAGE_FILES.doodles, store, 'doodle'), store),
    photos,
    flyers: new JsonFlyerRepository(
      files,
      new RecordFile<FlyerIndexEntry>(files, STORAGE_FILES.flyerIndex, store, 'flyer'),
      store,
      clock,
      hostels,
      photos,
      STORAGE_FILES.flyerDir,
    ),
    // Nothing to close: every call releases the lock before it returns, and files are opened only while they are read
    // or written. The method is here because the seam promises it (SQLite closes its database handle).
    async close() {},
  };
}
