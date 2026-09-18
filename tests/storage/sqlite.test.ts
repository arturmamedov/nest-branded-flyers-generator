import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteRepositories } from '../../server/storage/sqlite/index.js';
import { describeRepositoryContract } from './repositories.contract.js';

describeRepositoryContract('SQLite', async (clock) => {
  const dir = mkdtempSync(join(tmpdir(), 'nest-flyers-sqlite-'));
  return {
    repos: createSqliteRepositories({ file: join(dir, 'flyers.db'), clock }),
    cleanup: async () => rmSync(dir, { recursive: true, force: true }),
  };
});
