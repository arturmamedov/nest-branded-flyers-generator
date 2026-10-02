import type Database from 'better-sqlite3';
import { DEFAULT_DOODLES, PROTOTYPE_DOODLES, sameDoodles } from '../../src/shared/defaults.js';
import type { DoodlePlacement } from '../../src/shared/schema.js';

export interface Migration {
  version: number;
  name: string;
  /** SQL, or a function for data migrations. */
  up: string | ((db: Database.Database) => void);
}

/* Append only. Each runs once, in a transaction, tracked by PRAGMA user_version. */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'init',
    // Handoff README §7, verbatim, plus list indexes.
    up: `
      CREATE TABLE hostel (
        id          INTEGER PRIMARY KEY,
        slug        TEXT NOT NULL UNIQUE,
        name        TEXT NOT NULL,
        island      TEXT NOT NULL,
        logo_path   TEXT,
        sort_order  INTEGER DEFAULT 0
      );

      CREATE TABLE photo (
        id          INTEGER PRIMARY KEY,
        path        TEXT NOT NULL,
        width       INTEGER, height INTEGER,
        focal_x     REAL DEFAULT 0.5,
        focal_y     REAL DEFAULT 0.5,
        zoom        REAL DEFAULT 1,
        created_at  TEXT NOT NULL
      );

      CREATE TABLE flyer (
        id           INTEGER PRIMARY KEY,
        hostel_id    INTEGER REFERENCES hostel(id),
        template     TEXT NOT NULL,
        title        TEXT NOT NULL,
        data         TEXT NOT NULL,
        photo_id     INTEGER REFERENCES photo(id),
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        archived     INTEGER DEFAULT 0
      );

      CREATE TABLE doodle (
        id          INTEGER PRIMARY KEY,
        slug        TEXT NOT NULL UNIQUE,
        label       TEXT NOT NULL,
        path        TEXT NOT NULL,
        kind        TEXT NOT NULL,
        builtin     INTEGER DEFAULT 1
      );

      CREATE INDEX idx_flyer_list ON flyer(archived, updated_at DESC);
      CREATE INDEX idx_flyer_hostel ON flyer(hostel_id);
    `,
  },
  {
    version: 2,
    name: 'template art moved to the photo corners',
    // Flyers still carrying the prototype's art untouched get the new default
    // set; anything someone arranged by hand is left alone.
    up: (db) => {
      const rows = db.prepare('SELECT id, data FROM flyer').all() as { id: number; data: string }[];
      const write = db.prepare('UPDATE flyer SET data = ? WHERE id = ?');
      for (const row of rows) {
        const data = JSON.parse(row.data) as { doodles?: DoodlePlacement[] };
        if (!data.doodles || !sameDoodles(data.doodles, PROTOTYPE_DOODLES)) continue;
        data.doodles = DEFAULT_DOODLES.map((d) => ({ ...d }));
        write.run(JSON.stringify(data), row.id);
      }
    },
  },
  {
    version: 3,
    name: 'the AI ledger',
    // One row per generation the AI assistant attempted (docs/prompts/ai-assistant.md; $defs.aiUsage is the JSON
    // store's twin). The daily cap is the count of a day's ok rows for the actor, hence the index.
    up: `
      CREATE TABLE ai_usage (
        id            INTEGER PRIMARY KEY,
        at            TEXT NOT NULL,
        day           TEXT NOT NULL,
        actor_id      TEXT NOT NULL,
        feature       TEXT NOT NULL,
        provider      TEXT NOT NULL,
        model         TEXT NOT NULL,
        input_tokens  INTEGER,
        output_tokens INTEGER,
        ok            INTEGER NOT NULL,
        input         TEXT NOT NULL,
        output        TEXT
      );

      CREATE INDEX idx_ai_usage_quota ON ai_usage(actor_id, day, ok);
    `,
  },
];
