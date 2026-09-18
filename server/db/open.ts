import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { MIGRATIONS, type Migration } from './migrations.js';

export type DB = Database.Database;

export function openDb(file: string, migrations: Migration[] = MIGRATIONS): DB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  migrate(db, migrations);
  return db;
}

export function migrate(db: DB, migrations: Migration[]): { from: number; to: number } {
  const from = db.pragma('user_version', { simple: true }) as number;
  let to = from;
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (m.version <= to) continue;
    db.transaction(() => {
      if (typeof m.up === 'string') db.exec(m.up);
      else m.up(db);
      db.pragma(`user_version = ${m.version}`);
    })();
    to = m.version;
  }
  return { from, to };
}
