import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../../server/db/open.js';
import { SqliteAiUsageRepository } from '../../server/storage/sqlite/aiUsage.js';
import { SqliteFlyerRepository } from '../../server/storage/sqlite/flyers.js';
import { createSqliteRepositories } from '../../server/storage/sqlite/index.js';
import { LABEL_SLUGS, NO_LABEL } from '../../src/shared/labels.js';
import { SAMPLE_FLYERS } from '../../src/shared/samples.js';
import { FakeClock, describeRepositoryContract } from './repositories.contract.js';

describeRepositoryContract('SQLite', async (clock) => {
  const dir = mkdtempSync(join(tmpdir(), 'nest-flyers-sqlite-'));
  return {
    repos: createSqliteRepositories({ file: join(dir, 'flyers.db'), clock }),
    cleanup: async () => rmSync(dir, { recursive: true, force: true }),
  };
});

/* SQLite-only, beside the contract every driver shares. */
describe('SQLite: the list on rows nobody saved through the app', () => {
  // The list read no flyer's data until it carried each flyer's labels (2026-10-14), so a row edited by hand, or
  // left by some older build, was always listed. It still is: the labels are read only from data that parses and
  // only where they are a list, or SQLite's JSON functions would fail the whole library on one such row.
  it('lists every flyer whatever its data holds, with the labels that are there to read', async () => {
    const db = openDb(':memory:');
    const flyers = new SqliteFlyerRepository(db, new FakeClock());
    const [first, second] = LABEL_SLUGS;
    const odd: [name: string, data: string, labels: string[]][] = [
      ['not JSON', '{ not json', []],
      ['empty', '', []],
      ['null', 'null', []],
      ['a word', JSON.stringify(first), []],
      ['a list', JSON.stringify([first]), []],
      ['labels as a word', JSON.stringify({ labels: first }), []],
      ['labels as a number', JSON.stringify({ labels: 7 }), []],
      ['labels with numbered keys', JSON.stringify({ labels: { 0: first } }), []],
      ['labels as text that holds a list', JSON.stringify({ labels: JSON.stringify([first]) }), []],
      ['labels of several kinds', JSON.stringify({ labels: [first, 7, null, { slug: second }, second] }), [first, second]],
      ['no labels', JSON.stringify({ labels: [] }), []],
      ['no such key', JSON.stringify({ share: '' }), []],
    ];
    for (const [title, data] of odd) {
      const id = await flyers.create({ title, hostel: null, template: 'activity', data: SAMPLE_FLYERS[0].data, photoId: null });
      db.prepare('UPDATE flyer SET data = ? WHERE id = ?').run(data, id);
    }
    expect(Object.fromEntries((await flyers.list({})).map((f) => [f.title, f.labels]))).toEqual(Object.fromEntries(odd.map(([title, , labels]) => [title, labels])));
    expect((await flyers.list({ label: first })).map((f) => f.title)).toEqual(['labels of several kinds']);
    expect((await flyers.list({ label: NO_LABEL })).map((f) => f.title).sort()).toEqual(odd.filter(([, , labels]) => labels.length === 0).map(([title]) => title).sort());
    db.close();
  });
});

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
    expect(await ledger.countDay('anonymous', '2026-09-18')).toEqual({ ok: { flyer: 1, 'a-later-feature': 1 }, tried: { flyer: 1, 'a-later-feature': 1 } });
    db.close();
  });
});
