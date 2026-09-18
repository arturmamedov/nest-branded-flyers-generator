import type { Config } from './config.js';
import type { DataPaths } from './paths.js';
import { createSqliteRepositories } from './storage/sqlite/index.js';
import type { Clock, Repositories } from './storage/types.js';

/** The composition root for storage: STORAGE picks the driver, nothing else knows which one runs. */
export function createRepositories(config: Pick<Config, 'storage'>, paths: DataPaths, clock?: Clock): Repositories {
  switch (config.storage) {
    case 'sqlite':
      return createSqliteRepositories({ file: paths.db, clock });
  }
}
