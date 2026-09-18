export interface Migration {
  version: number;
  name: string;
  up: string;
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
];
