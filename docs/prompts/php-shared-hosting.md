# Brief: run the flyer generator on PHP-only shared hosting, with JSON-file storage

You are picking this up in a fresh session. Read `CLAUDE.md`, `README.md`, and the handoff
`design_handoff_flyer_generator/README.md` (§5 fit, §7 data model, §8 API, §9 export) first.

## Why

The app works today on Node: Express 5, SQLite through better-sqlite3, and a Playwright/Chromium export
(branch `feat/flyer-generator-mvp`). The team now wants to host it on an **ordinary shared hosting
account**. That means PHP and a web server, a few writable folders, and nothing else:

- no Node,
- no shell or `exec`,
- no cron, no long-running processes,
- possibly no SQLite.

Storage must be **plain writable JSON files**.

Node must stay a **supported alternative**, not be deleted. Which backend and which storage run is
configuration. Implementations must be substitutable (Liskov), and the whole change follows **SOLID and
DRY** (the owner's standing rule).

## Definition of done

1. `npm run build:php` produces `release/php/`. Uploading it by FTP/SFTP to an Apache (or LiteSpeed) + PHP
   host, with writable `data/` and `uploads/` and no Node, gives a fully working app:
   - library: list, filter, reopen, duplicate, archive;
   - editor: create/edit with live preview, photo upload in all three photo modes with crop;
   - export: download PNG and JPG at **exactly 1080 × 1920**.
2. The same frontend runs unchanged against either backend. It learns what the backend can do from
   `GET /api/config`.
3. Storage is chosen by config. PHP ships a JSON-file driver; the interfaces allow a PDO/MySQL driver later.
   Node keeps SQLite and gains a JSON-file driver that uses **the same on-disk format**, so a data folder
   moves between backends. A generic copy tool migrates the current SQLite library into that format.
4. Substitutability is enforced by tests, not promised:
   - one HTTP contract suite (TypeScript, parameterised by base URL) passes against **both** backends;
   - one abstract repository test case (PHPUnit, and the Vitest equivalent) passes for **every** driver.
5. Client-side export fidelity is proven against the existing Playwright export, per the spike below.
6. Security on a public host: no data or code files are reachable over HTTP, uploads can't execute, and the
   app refuses to serve until an access rule is configured (see Security).
7. Existing checks stay green: `npm run typecheck && npm test && npm run test:render`.
8. README gains a "Deploy to shared hosting (PHP)" section: upload, permissions, config, access, backup,
   and updating without overwriting data or config.

## Architecture: the seams (build exactly these, no more)

- **REST contract = the frontend/backend seam.**
  - Write it down once: `docs/api-contract.md` or `api/openapi.yaml`, derived from the current Node
    routes. It covers the error shape `{error:{code,message,fields?}}`, the status codes, and the
    `X-Nest-Flyers` write guard.
  - Add `GET /api/config` → `{ backend, exporters: ['client'] | ['client','server'], limits: { maxUploadBytes } }`.
  - `/api/render/:id` exists only where server export exists.
- **Export seam (frontend).**
  - A `FlyerExporter` interface with two implementations:
    - `ClientExporter`: in-browser, the default when the backend has no server export;
    - `ServerExporter`: the current `POST /api/render/:id`.
  - Both use the **same `<Flyer>` component and `prepareFlyer()`**. A second renderer is not allowed.
- **Storage seam (each backend).**
  - Repository interfaces: hostels, flyers, photos, doodles.
  - Low-level pieces behind their own interfaces: atomic JSON file I/O with locking, id generation, clock.
  - A composition root picks the implementations from config. A new driver means a new class, not edits to
    its consumers.
  - Refactor the Node repos (currently plain functions over `db`) into the same shape.
- **Image seam.**
  - PHP `ImageProcessor`: GD by default, Imagick if present.
  - The browser pre-processes photos before upload, so neither backend has to decode a 48 MP phone photo
    inside a 128 MB `memory_limit`:
    - use `createImageBitmap(file, { imageOrientation: 'from-image' })`;
    - resize so the long edge is ≤ 3240 px;
    - encode as JPEG q0.88, or PNG if the photo has alpha.
  - The server still validates and re-encodes; never trust the client.
- **Single sources of truth (DRY).**
  - zod `src/shared/schema.ts` → generated `schema/flyer.schema.json` (`z.toJSONSchema`, via an npm
    script), committed. PHP validates against it.
  - `seed/hostels.json` is shared by both backends.
  - Sample flyers are generated from `src/shared/samples.ts` into `seed/samples.json`.
  - Filename slugs live in `src/shared` and are used by both exporters.
  - Never hand-copy a rule into a second language when it can be generated.
- **Paths.**
  - The app may live in a subfolder. Set Vite `base: './'` and use one `assetUrl()` / `apiUrl()` helper.
  - No hard-coded absolute `/assets` or `/api` strings anywhere else.
  - The renderer's art URLs must also go through the helper.

## Phase 1 is a spike: client-side export fidelity (the real risk)

The handoff (§9) rejected client-side export. `html-to-image`-style tools mis-rendered three things the
design depends on:

- stretched `background-size: 100% 100%` art,
- `box-decoration-break: clone` on the yellow highlighter,
- `vector-effect: non-scaling-stroke` on the wonky frames.

You now have a golden reference: the current Playwright export. Do this:

1. Render the same `<Flyer>` offscreen, unscaled, at 1080 × 1920 (not `display: none`). Run `prepareFlyer()`,
   then capture at pixel ratio 1.
2. Evaluate at least `@zumer/snapdom`, `modern-screenshot` and `html-to-image`.
3. For every sample × {bleed, band, none}:
   - pixel-diff each against the Playwright export (pixelmatch, photo band masked separately);
   - check explicitly: the three features above, real fonts embedded (not a fallback), output exactly
     1080 × 1920, JPG quality 0.9.
4. Report a table (library × case: % differing pixels, pass/fail per feature) with the diff images, and a
   recommendation. Agree the pass threshold with me; a starting point is ≤ 0.5% outside the photo band.
5. If nothing passes, propose the **smallest renderer change that keeps preview == export** (for example,
   art as `<img>` instead of a CSS background) and re-measure. Never fork the renderer.
6. **STOP and wait for my approval before building further.**

## PHP backend requirements

- **Runtime and dependencies.**
  - PHP ≥ 8.1 (confirm the host's version first).
  - No framework unless you justify one. Use Composer PSR-4 autoload; a small `vendor/` ships in the
    release, e.g. a JSON-Schema validator such as `opis/json-schema`.
  - Only common extensions: json, fileinfo, gd; exif and imagick optional.
  - No `exec`/`shell_exec`/`proc_open`, no cron, no background jobs.
- **Same API as Node.** Same routes, payloads, error shape, status codes and header guard. The contract
  suite is the judge.
- **JSON store.**
  - Layout: `data/hostels.json`, `data/doodles.json`, `data/photos.json`, `data/flyers/index.json` plus
    `data/flyers/{id}.json`, `data/meta.json` (format version plus migrations).
  - Writes are atomic: temp file in the same folder, then `rename`.
  - One `flock`ed lock file: LOCK_EX for writes, LOCK_SH for reads.
  - Integer ids from a locked counter, because the frontend routes use `#/flyers/7`.
  - Delete is a soft delete (`archived`).
  - Write JSON as UTF-8, pretty-printed, with unescaped unicode and slashes.
  - Document the format once, in `docs/json-storage.md` plus the JSON Schema. Both the PHP and the Node
    JSON drivers implement it.
- **Photos.**
  - Report `upload_max_filesize` / `post_max_size` / `memory_limit` through `/api/config`.
  - Reject HEIC by magic bytes with the same friendly message as today.
  - Re-encode through `ImageProcessor`, which also strips metadata. Use random filenames under
    `uploads/YYYY/MM/`.
- **Routing.**
  - A front controller.
  - `.htaccess` for Apache/LiteSpeed.
  - `router.php` for `php -S` (local tests).
  - An nginx snippet in the docs.

## Security: the handoff says it must never be publicly reachable

Shared hosting *is* the public internet, so:

- **Access rule required.**
  - Ship `.htaccess` examples for an office-IP allow-list (`Require ip`) and for HTTP Basic auth.
  - PHP also enforces it: if `config.php` has neither `access.allowIps` nor `access.basicAuth`, every
    request gets 503 "not configured". The only exception is an explicit `access.allowPublic = true`.
- **Data and code.**
  - `data/` goes outside the web root when the host allows it (`config.php` points to it). Otherwise it
    sits behind `Require all denied`.
  - Deny `src/`, `vendor/`, `config*.php`, `seed/`, `schema/`.
  - Turn directory listing off.
- **Uploads.**
  - Script execution disabled: `RemoveHandler` / `php_flag engine off` plus a deny for `*.php*`.
  - Serve images only.
- Keep the `X-Nest-Flyers` CSRF guard.

## Phases

Each phase ends green and gets its own commit, on branch `feat/php-shared-hosting` from
`feat/flyer-generator-mvp`. Don't push.

0. **Read, then ask me the questions below. Then plan it in plan mode and wait for approval.**
1. Client-export spike (above), then **stop for approval**.
2. Seams in the existing code, with no behaviour change:
   - the contract doc and the contract suite passing against Node;
   - `/api/config`;
   - `FlyerExporter` with both implementations;
   - the base-path helpers;
   - client-side photo pre-processing;
   - JSON Schema generation;
   - the Node repositories behind interfaces.
3. PHP backend with the JSON store:
   - PHPUnit, including the abstract repository contract test;
   - the contract suite passing against `php -S` with `router.php`;
   - a Playwright smoke test against the PHP backend: create, upload, save, reopen, duplicate, archive,
     download PNG and JPG at 1080 × 1920.
4. Node JSON-file driver (`STORAGE=sqlite|json`) and the copy tool (`copy(fromRepos, toRepos)`). Use it to
   move the current `data/flyers.db` library and uploads into the JSON layout.
5. `npm run build:php`, the README deploy section, and verification on **Laragon's Apache + PHP** (installed
   on this machine; closest to shared hosting). Then a final report covering what was verified, what
   wasn't, and the known trade-offs.

## Known trade-off to state honestly in the report

With client export, each staff member's browser renders the export. Layout and fit match the preview by
construction. Glyph anti-aliasing can differ slightly between machines (Windows vs macOS). Chrome or Edge
stay required.

## Ask me before starting (Phase 0)

- Host details: PHP version, extensions (gd/imagick/exif/fileinfo), and web server (Apache, LiteSpeed or
  nginx). Can I upload a `phpinfo()` page?
- Domain root or subfolder? What's the final URL?
- Can `data/` live outside `public_html`?
- Access: is the office public IP static (allow-list), or HTTP Basic auth, or both?
- Should the current local library be migrated to the host?
- Should the Node backend keep being maintained? (Default: yes, as the alternative with server-side export.)

## Out of scope

- Build steps 7–9: moving elements, This week template, icon uploads. They are waiting on purpose.
- Accounts/login beyond the access rule.
- A MySQL driver (the interface only).
- Library thumbnails.
