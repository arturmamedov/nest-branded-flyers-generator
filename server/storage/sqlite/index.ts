import { openDb } from '../../db/open.js';
import { systemClock, type Clock, type Repositories } from '../types.js';
import { SqliteDoodleRepository } from './doodles.js';
import { SqliteFlyerRepository } from './flyers.js';
import { SqliteHostelRepository } from './hostels.js';
import { SqlitePhotoRepository } from './photos.js';

/** The SQLite driver: one better-sqlite3 file, migrated on open (server/db/migrations.ts). */
export function createSqliteRepositories(opts: { file: string; clock?: Clock }): Repositories {
  const db = openDb(opts.file);
  const clock = opts.clock ?? systemClock;
  return {
    hostels: new SqliteHostelRepository(db),
    doodles: new SqliteDoodleRepository(db),
    photos: new SqlitePhotoRepository(db, clock),
    flyers: new SqliteFlyerRepository(db, clock),
    async close() {
      db.close();
    },
  };
}
