# The JSON store

The flyer library as plain files, for hosting that offers nothing but PHP and a few writable folders. Two drivers read
and write it: the PHP backend (`php/src/Storage/Json/`) and the Node one (`server/storage/json/`, `STORAGE=json`). A
folder written by either is served by the other unchanged, which `tests/cross/` proves on every run.

The shapes below are not prose: they are generated from `src/shared/storage.ts` into `schema/storage.schema.json`
(`npm run gen`), and both drivers' tests validate what they wrote against it.

> **One backend at a time.** A data folder belongs to the backend currently serving it. The two use different locks
> (PHP `flock`, Node a lock directory), so running both against one folder can interleave writes. Move the folder, or
> stop one backend first.

## Layout

```
data/                     wherever config.php's dataDir points (PHP) or DATA_DIR (Node)
  meta.json               format version, applied migrations, id counters, the seed hash
  hostels.json            the hostels from seed/hostels.json
  doodles.json            the built-in art from seed/hostels.json
  photos.json             one row per uploaded photo
  flyers/
    index.json            what the library lists: one row per flyer, archived ones included
    <id>.json             the flyer itself, including its whole `data` object
  .lock                   the lock file (PHP) — Node uses a `.lock.d` folder next to it
  .htaccess, index.html   written by the drivers, so the folder denies itself wherever it lives
  php-errors.log          PHP's error log, when the folder is writable; not part of the library
uploads/                  always <web root>/uploads on PHP, DATA_DIR/uploads on Node
  YYYY/MM/<16 hex>.jpg|png
```

`photo.path` is `uploads/YYYY/MM/<16 hex>.jpg` — relative to the uploads folder's parent, never absolute, so a library
moves between machines. The API hands the same string out as the photo's `url`.

## File format

- UTF-8 JSON, pretty-printed with **4 spaces**, one trailing newline.
- Unicode, slashes and line terminators are written raw (`JSON_UNESCAPED_*` in PHP; that is what `JSON.stringify` does).
- Keys come out in the schema's order, so a record written by either driver is byte-identical.
- Floats are shortest round-trip (`serialize_precision=-1`). A whole-number float is written as an integer, and `-0`
  as `0`: PHP's validator normalises it on the way in, and JavaScript writes it that way anyway.
- Lone UTF-16 surrogates never reach a file: PHP refuses them, and the Node driver replaces them on write.
- Timestamps are UTC with milliseconds and a `Z` (`2026-09-18T12:31:27.522Z`), whatever the host's timezone.
- Text sorts by code point (PHP `strcmp`, JavaScript `<`), never by locale.

## Writing safely

- **Atomic.** A file is encoded in full, written to a temp file in the same folder, then renamed over the old one.
  A failed encode leaves the previous file untouched. On Windows the rename is retried briefly.
- **One writer.** Every read-modify-write (counters, a record file, the flyer index) happens inside one exclusive lock
  over the whole store. PHP uses `flock` on `data/.lock`; Node uses a lock directory with a stale-lock timeout.
- **Ids** come from the counters in `meta.json` and are never reused, even after a record is deleted by hand. A counter
  that has fallen behind its records catches up in a single write.
- **Deleting is archiving.** `archived: true` stays in the flyer's file and its index row; nothing is removed.
- **Order of writes.** A flyer's own file is written before `flyers/index.json`, so a crash in between can only leave
  the index one save behind. The next `update()` or `archive()` of that flyer repairs the row.

## meta.json

```json
{
    "formatVersion": 1,
    "migrations": [],
    "counters": { "hostel": 3, "doodle": 14, "photo": 6, "flyer": 9 },
    "seedHash": "6f1c…"
}
```

- `formatVersion` is the layout above. A store written by a **newer** version is refused with "update the app" rather
  than half-read.
- `migrations` lists the applied data migrations, the way `PRAGMA user_version` does for SQLite. It is empty today;
  the first JSON migration adds its id here and a runner alongside it.
- `seedHash` is the sha256 of `seed/hostels.json` as last applied. PHP re-seeds inside a request whenever the file
  changes (there is no cron on the host); Node seeds through `npm run seed`.

## Moving a library in

`npm run copy` reads a SQLite library and writes this format, keeping ids, timestamps and `archived`, and copying only
the uploads the photos reference:

```sh
npm run copy -- --from-sqlite ./data/flyers.db --to-json <deploy>/data --uploads-to <deploy>/uploads
```

The source database is never opened: the tool snapshots `flyers.db`, `-wal` and `-shm` into a temp folder and reads
that copy. The same command works the other way (`--from-json … --to-sqlite …`).

## Backing up

Copy the data folder and the uploads folder. Both are plain files, and a copy taken while the app is idle is
consistent; the store has no separate journal. Keep `config.php` with them — it is the only file the release does not
ship. `php-errors.log`, `.lock` and `.lock.d` are working files, not library: a backup can drop them.
