import { describe, expect, it } from 'vitest';
import { migrate, openDb } from '../../server/db/open.js';
import { MIGRATIONS } from '../../server/db/migrations.js';
import { DEFAULT_DOODLES, PROTOTYPE_DOODLES } from '../../src/shared/defaults.js';
import { SAMPLE_FLYERS } from '../../src/shared/samples.js';

/* SQLite-only: the append-only migrations in server/db. Behaviour every driver
   shares is in repositories.contract.ts; the HTTP API in tests/contract. */

const pool = SAMPLE_FLYERS[0];

describe('SQLite migrations', () => {
  it('run once: re-running them is a no-op', () => {
    const db = openDb(':memory:');
    expect(migrate(db, MIGRATIONS)).toEqual({ from: MIGRATIONS.length, to: MIGRATIONS.length });
    db.close();
  });

  it('migration 2 moves untouched prototype art to the new defaults and leaves arranged art alone', () => {
    const old = openDb(':memory:', MIGRATIONS.slice(0, 1));
    const insert = old.prepare(
      "INSERT INTO flyer (template, title, data, created_at, updated_at) VALUES ('activity', ?, ?, 'x', 'x')",
    );
    const custom = [{ slug: 'spark-teal', x: 1, y: 2, w: 50, rot: 0 }];
    insert.run('untouched', JSON.stringify({ ...pool.data, doodles: PROTOTYPE_DOODLES }));
    insert.run('arranged', JSON.stringify({ ...pool.data, doodles: custom }));
    migrate(old, MIGRATIONS);
    const rows = old.prepare('SELECT title, data FROM flyer ORDER BY id').all() as { title: string; data: string }[];
    expect(JSON.parse(rows[0].data).doodles).toEqual(DEFAULT_DOODLES);
    expect(JSON.parse(rows[1].data).doodles).toEqual(custom);
    old.close();
  });
});
