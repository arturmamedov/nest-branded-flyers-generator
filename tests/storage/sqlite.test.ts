import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../../server/db/open.js';
import { SqliteAiUsageRepository } from '../../server/storage/sqlite/aiUsage.js';
import { createSqliteRepositories } from '../../server/storage/sqlite/index.js';
import { describeRepositoryContract } from './repositories.contract.js';

describeRepositoryContract('SQLite', async (clock) => {
  const dir = mkdtempSync(join(tmpdir(), 'nest-flyers-sqlite-'));
  return {
    repos: createSqliteRepositories({ file: join(dir, 'flyers.db'), clock }),
    cleanup: async () => rmSync(dir, { recursive: true, force: true }),
  };
});

/* SQLite-only, beside the contract every driver shares. */
describe('SQLite: the AI ledger', () => {
  // A row a later release wrote, met after going back to this one. The column takes any name and the count groups by
  // it, so the row neither closes the ledger nor counts for a feature this release runs. The JSON driver refuses the
  // month instead (tests/storage/json.test.ts).
  it('counts a row of a feature this release does not know under its own name', async () => {
    const db = openDb(':memory:');
    const ledger = new SqliteAiUsageRepository(db);
    await ledger.record({
      at: '2026-09-18T10:00:00.000Z',
      day: '2026-09-18',
      actorId: 'anonymous',
      feature: 'flyer',
      provider: 'fake',
      model: 'fake-1',
      tokens: { input: 10, output: 20 },
      ok: true,
      input: 'Yoga at 9',
      output: '{"brief":{}}',
    });
    const columns = 'at, day, actor_id, provider, model, input_tokens, output_tokens, ok, input, output';
    db.prepare(`INSERT INTO ai_usage (feature, ${columns}) SELECT 'a-later-feature', ${columns} FROM ai_usage`).run();
    expect(await ledger.countOk('anonymous', '2026-09-18')).toEqual({ flyer: 1, 'a-later-feature': 1 });
    db.close();
  });
});
