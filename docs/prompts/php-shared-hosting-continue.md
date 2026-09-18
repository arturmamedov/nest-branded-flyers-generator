# Continue: PHP shared-hosting port, Phases 2–5

You are picking this up in a fresh session. Phases 0 and 1 of `docs/prompts/php-shared-hosting.md` are done,
and the spike is approved. Build Phases 2–5 now, straight through. No more approval gates: stop only for a
decision that genuinely belongs to the owner (Artur), and ask it with a clear recommended option.

## Read first

1. `CLAUDE.md`: the project rules. **SOLID/DRY, one source of truth, substitutable implementations
   proven by contract tests.** One renderer only.
2. `docs/prompts/php-shared-hosting.md`: **the spec.** Its Definition of done, Security section and
   "Out of scope" still apply in full.
3. `docs/spikes/client-export.md`: the approved Phase 1 result.
4. `README.md` and `design_handoff_flyer_generator/README.md` §5 (fit), §7 (data model), §8 (API),
   §9 (export).
5. The code this touches:
   - `server/app.ts`, `server/repos/*`, `server/db/*`, `server/services/{photos,renderer}.ts`,
     `server/config.ts`, `server/paths.ts`, `server/cli/*`;
   - `src/editor/{api,Editor,App,Library}.tsx`, `src/flyer/{Flyer.tsx,ready.ts}`, `src/render/main.tsx`,
     `src/shared/*`;
   - `tests/**`, `playwright.config.ts`, `vite.config.ts`, `vitest.config.ts`.

## Where things stand

- **Branch** `feat/php-shared-hosting` (from `main` = `feat/flyer-generator-mvp` @ `932084b`).
  - Phase 1 commit: `7e8cd7a`, "Spike: client-side export fidelity". It added `scripts/spike-client-export.ts`,
    `npm run spike:client-export`, the report, and devDependencies `@zumer/snapdom`, `modern-screenshot`,
    `html-to-image`.
- **Approved decision: `modern-screenshot` 4.7.0** for the client exporter, on the unchanged renderer.
  - Capture: `domToCanvas(flyerEl, { scale: 1 })`, then `canvas.toBlob('image/png')` or
    `toBlob('image/jpeg', 0.9)`. Assert the result is 1080 × 1920.
  - It matched the server export within 0.024 % outside the photo band on all 21 cases, at DPR 1 and 2.
  - Move it to `dependencies`, and remove `html-to-image` and `@zumer/snapdom` from devDependencies once
    the permanent fidelity test (Phase 2) replaces the spike. Keep the spike script working, or delete it
    along with its npm script. Pick one and say which.
- **Owner answers (don't re-ask):**
  - Host PHP is **8.4**. The app lives at the **domain root** of its server. Still build `base: './'` and
    the path helpers, as the spec asks.
  - Security comes later: *"everything is on local machines, I will put a password later."* Build the
    access-rule mechanism exactly as the spec says. Use `access.allowPublic = true` only in the local
    Laragon deploy's `config.php`, never in `config.sample.php`.
  - Whether `data/` can live outside `public_html` is unknown. Support both: `config.php` points to it, and
    the default is inside the web root behind `Require all denied`.
  - Migrate a **copy** of the local library. `data/flyers.db` must never be modified.
  - Node stays maintained, as the alternative with server-side export.
  - The pass threshold for export fidelity is **≤ 0.5 %** differing pixels outside the photo band
    (pixelmatch threshold 0.1).
- **Commits:** one per phase, each ending green, with the attribution line the harness gives you. Never
  push.

## Machine facts (Windows 10, Laragon)

- **PHP:**
  - 8.4.25 is at `C:\laragon\bin\php\php-8.4.25-Win32-vs17-x64\php.exe`. `php` on PATH is **8.3.4**. Use
    the 8.4 binary through a `PHP_BIN` env var (default `php`) in scripts and tests, and document it.
  - Extensions: gd, exif, fileinfo, json, mbstring, intl, pdo_sqlite. **No imagick**, so the Imagick
    processor's contract test must skip cleanly when the extension is missing.
- **Composer** 2.5.5 is on PATH.
- **Laragon Apache 2.4.57** with **mod_php 8.4**:
  - `DocumentRoot "A:/serverpath/laragon"` with `AllowOverride All`. mod_rewrite, headers, auth_basic,
    authn_file and authz_host are loaded.
  - Any top-level folder `X` gets the vhost `X.test` after Laragon reloads (the user clicks Reload). Until
    then it is at `http://localhost/X/`.
- **Node 25**, with `.nvmrc` = 24. npm scripts run in **cmd.exe**, so there is no `VAR=x cmd` syntax: use
  Vitest projects, a config file, or a tiny Node launcher.
- **The owner often runs `npm run dev`** (tsx watch, :8787). Editing `server/` or `src/shared/` restarts it
  and reloads the editor, so warn once at the start that unsaved flyer edits may be lost.
- **Gotchas already hit:**
  - tsx/esbuild wraps functions you send to Playwright's `page.evaluate` in `__name()`. Add
    `context.addInitScript('window.__name = (f) => f')`.
  - Don't `rmSync` a folder that your shell's cwd is inside (EPERM on Windows).
  - @fontsource serves woff2 **and** woff fallbacks.
  - Keep renderer styling inline or in attributes. A stylesheet rule on SVG children did not survive one
    capture library.

## Today's API (Node): the contract to preserve

- **Routes:** `GET /api/hostels`, `GET /api/doodles`, `GET /api/flyers?hostel=&template=`,
  `POST /api/flyers`, `GET|PUT|DELETE /api/flyers/:id`, `POST /api/photos` (multipart field `photo`),
  `POST /api/render/:id` `{format:'png'|'jpg'}`.
- **Errors:** always `{error:{code,message,fields?}}`.
  - 400 `invalid`: zod field paths joined with `.`. Unknown hostel gives `fields.hostel`; unknown photo
    gives `fields.photoId`. Malformed JSON gives "Malformed request."
  - 403 `forbidden`: a non-GET/HEAD/OPTIONS request without `X-Nest-Flyers: 1`.
  - 404 `not_found`: "No such flyer." or "No such endpoint."
  - 413 `too_large`: "That photo is over 15 MB. Use a smaller JPG."
  - 415 `heic` / `unsupported`, 500 `server_error`.
- **Statuses:** `POST /api/flyers` returns **201** `{id, flyer}`. `PUT` returns 200 `{id, flyer}`.
  `DELETE` returns **204** and is a soft archive. An id that isn't a positive integer gets 404.
- **Normalisation:** the title is trimmed. The template column wins over `data.template`. Zod fills
  defaults and strips unknown keys.
- **Lists:**
  - Flyers: newest first, by `updatedAt DESC, id DESC`. `hostel=none` means chain-wide. Items are
    `{id,title,template,hostel,hostelName,updatedAt}`.
  - Hostels: by `sort_order, name`. Doodles: by `builtin DESC, kind, label`.
- `GET /api/flyers/:id` returns `{flyer, hostel (full object or null), photo {id,url,width,height} or null}`.
- **Photos:** HEIC is rejected by magic bytes. The upload is re-encoded with EXIF rotation applied, long
  edge ≤ 3240, JPEG q88 (or PNG when it has alpha), metadata stripped, and saved as
  `uploads/YYYY/MM/<16 hex>.{jpg|png}`.
- Timestamps are ISO with milliseconds (`toISOString()`).

## Phase 2: seams in the Node app, no behaviour change

Everything below keeps the Node app working exactly as today, except the two deliberate changes marked
**(change)**.

- **Contract doc:** `docs/api-contract.md`, taken from `server/app.ts`. It covers the routes, payloads,
  statuses, error shape, the write guard, and URLs relative to the app root.
- **`GET /api/config`** returns:

  ```
  { backend: 'node'|'php', storage: 'sqlite'|'json', exporters: ['client'] | ['client','server'],
    limits: { maxUploadBytes, maxPhotoEdge }, server: { …free-form diagnostics } }
  ```

  PHP reports `upload_max_filesize`, `post_max_size`, `memory_limit` and its image processor under
  `server`. **(change)** `/api/render/:id` is registered only when a renderer exists. Without one it
  returns 404; today it returns 503.
- **Paths:**
  - Vite `base: './'`.
  - One helper module, `src/flyer/urls.ts`, with `assetUrl()` / `apiUrl()` resolved against
    `document.baseURI`. It replaces every hard-coded `/assets`, `/api` and `/uploads` in `Flyer.tsx`
    (`art()`, `logoUrl()`, `<img src={photo.url}>`), `editor/api.ts`, `App.tsx` and `render/main.tsx`.
  - **(change)** The API returns `url` **without** a leading slash (`uploads/…`, `assets/art/…`). Stored
    paths already have none. Update the tests.
- **Export seam:** `src/editor/export/` defines
  `FlyerExporter { export(id, format): Promise<{ blob, filename }> }`.
  - `ServerExporter` is today's `POST`.
  - `ClientExporter` does GET `/api/flyers/:id` (the saved, normalised payload), mounts the same `<Flyer>`
    offscreen (`position:fixed; left:-20000px`, never `display:none`) with `createRoot`, runs
    `prepareFlyer()`, captures with modern-screenshot, encodes, asserts 1080 × 1920, then unmounts.
  - The exporter is picked from `config.exporters`: server if listed, else client. The editor's
    `onDownload` keeps its save-then-export flow.
  - The filename slug moves from `server/app.ts` (the `normalize('NFKD')…` line) to
    `src/shared/filename.ts`, used by both exporters.
- **Photo pre-processing** before upload, in `src/editor/photoPrep.ts`:
  - `createImageBitmap(file, { imageOrientation: 'from-image' })`;
  - long edge ≤ `MAX_PHOTO_EDGE` (3240, moved into `src/shared/limits.ts` and used by
    `server/services/photos.ts` too);
  - JPEG 0.88, or PNG when a PNG/WebP actually has alpha;
  - step the edge down while the blob is over `limits.maxUploadBytes`, because shared hosts often allow
    only 2 MB;
  - if the browser can't decode the file (HEIC), upload the original untouched, so the server returns its
    friendly 415.
- **Generated single sources of truth:** `npm run gen` runs `scripts/gen-shared.ts`. All outputs are
  committed, and a Vitest test fails when any committed output is stale.
  - `schema/flyer.schema.json`: `z.toJSONSchema(FlyerInputSchema, { io: 'input' })`.
  - `schema/storage.schema.json`: zod schemas of the on-disk JSON records, in new
    `src/shared/storage.ts`.
  - `schema/shared.json`: photo limits, the HEIC brand list, and user-facing error messages. The messages
    move into `src/shared/messages.ts`, which Node uses too.
  - `seed/samples.json` from `src/shared/samples.ts`.
- **Storage seam (Node):**
  - `server/storage/types.ts` defines `HostelRepository`, `FlyerRepository`, `PhotoRepository`,
    `DoodleRepository` and `Repositories`.
  - The flyer repository takes the hostel **slug**; the SQLite implementation resolves it to an id.
  - `all()` and `put()` preserve ids, timestamps and `archived`. They exist for the copy tool.
  - Today's SQL moves into classes under `server/storage/sqlite/`. **Never edit an applied migration.**
  - `server/composition.ts` picks the driver from config (`STORAGE`). `createApp` receives the
    repositories, never a `db`.
- **Tests:**
  - `tests/storage/repositories.contract.ts`: `describeRepositoryContract(name, factory)`, run for SQLite
    now and JSON in Phase 4.
  - HTTP contract suite `tests/contract/*.test.ts` in TypeScript, using `inject('baseUrl')`.
    `vitest.contract.config.ts` has two projects:
    - `node`: in-process `createApp` on a temp dir and an ephemeral port;
    - `php`: `php -S 127.0.0.1:<port> router.php` on a temp data dir, `PHP_BIN`.

    `CONTRACT_BASE_URL` runs the suite against any deployment. `npm run test:contract` runs both
    projects.
  - The generic HTTP tests move out of `tests/api/api.test.ts` into the contract suite. `api.test.ts`
    keeps the SQLite migration and seed tests.
  - **Permanent fidelity check** in `test:render`: in the editor on Node, download each sample in each
    mode through the real `ClientExporter` and diff it against `POST /api/render/:id` with the 0.5 % rule.

## Phase 3: PHP backend with the JSON store, in `php/`

- **Package:** `composer.json`: PSR-4 `NestFlyers\` → `src/`, `"php": ">=8.1"`, `opis/json-schema`;
  dev: `phpunit ^10.5`. `phpunit.xml`, `composer test`. No framework.
- **`Http/`:** Request, JsonResponse, Router, HttpError, Kernel.
  - `AccessGuard`: 503 `not_configured` unless `config.php` sets `access.allowIps` (CIDR),
    `access.basicAuth` (user + `password_hash`) or `access.allowPublic`. For Basic auth under CGI/FPM, read
    `HTTP_AUTHORIZATION` through a rewrite env.
  - `WriteGuard`: `X-Nest-Flyers`.
  - Same routes, errors and statuses as Node. The contract suite is the judge.
- **Domain interfaces:** the four repositories, plus `Clock`, `IdGenerator`, `JsonFiles`, `Lock`. The
  composition root (`bootstrap.php`) picks implementations from config, so a MySQL driver later is just a
  new class.
- **`Storage/Json/`**, format documented once in `docs/json-storage.md` plus `storage.schema.json`:
  - `data/hostels.json`, `data/doodles.json`, `data/photos.json`, `data/flyers/index.json` +
    `data/flyers/{id}.json`, and `data/meta.json` (format version, applied migrations, id counters, seed
    hash).
  - `photo.path` is always `uploads/…`, resolved against the uploads folder. In PHP that folder is
    `<web root>/uploads`; in Node it is `DATA_DIR/uploads`.
  - Writes: temp file in the same folder, then `rename`, with a short retry on Windows.
  - Locking: one `flock`ed `data/.lock`, `LOCK_SH` for reads and `LOCK_EX` for writes.
  - Ids are integers from the locked counters. Delete is a soft delete.
  - JSON is UTF-8, pretty-printed, with `JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES`.
- **`Seeder`:** there's no shell on the host, so it runs inside a request. It applies
  `seed/hostels.json` on the first request and again whenever the file's hash changes: upsert by slug,
  never delete. Never invent hostel names.
- **`Validation/`:**
  - opis validates against the generated `schema/flyer.schema.json`.
  - A `SchemaNormalizer` driven by the same schema applies `default`s and strips unknown keys, which
    matches zod's output.
  - The title is trimmed with Unicode-aware whitespace, as JS `trim()` does.
  - Error paths are dotted, as zod's are.
  - Known gap to document: zod counts UTF-16 units and JSON Schema counts code points.
- **`Image/`:** an `ImageProcessor` interface with `GdImageProcessor` (default) and
  `ImagickImageProcessor` (when loaded), picked by a factory. `PhotoService`:
  - reports ini limits as 413 `too_large`, including a detected `post_max_size` overflow;
  - rejects HEIC by magic bytes with the same message as Node;
  - sniffs jpeg/png/webp from the bytes;
  - guards memory before decoding (width × height × bytes against the free `memory_limit`);
  - applies EXIF orientation, caps the long edge at 3240, and re-encodes as JPEG q88 (or PNG with alpha),
    which strips metadata;
  - saves random names under `uploads/YYYY/MM/`.
- **Web files** in `php/web/`, copied to the release root:
  - `api.php` (front controller) and `router.php` (for `php -S`);
  - `.htaccess`: rewrite `^api/` to `api.php`, pass `Authorization` through, `Options -Indexes`, deny
    `src/ vendor/ seed/ schema/ data/ config*.php router.php composer.*`;
  - `uploads/.htaccess`: `php_flag engine off` inside `<IfModule>` (it breaks FPM otherwise),
    `RemoveHandler`/`RemoveType` for PHP, deny `*.php*`, images only;
  - `data/.htaccess` (deny all), `config.sample.php`, and access examples for `Require ip` and Basic auth.
- **Tests:**
  - PHPUnit: an abstract `RepositoryContractTestCase` extended by `JsonRepositoriesTest`; tests for
    JsonFiles, lock and counter; an `ImageProcessorContractTestCase` for GD, and Imagick when present; the
    validator against the generated schema; written files checked against `storage.schema.json`.
  - The contract suite green on `php -S`.
  - A Playwright smoke test against PHP (`playwright.php.config.ts`): create, upload (all three photo
    modes, with crop), save, reopen, duplicate, archive, then download PNG and JPG **through the UI** and
    check both are exactly 1080 × 1920.

## Phase 4: Node JSON driver and the copy tool

- `server/storage/json/*` implements the **same on-disk format**: atomic temp+rename, a lock directory for
  cross-process safety, locked counters, a clock. Select it with `STORAGE=sqlite|json`.
  - The repository contract suite runs against both drivers.
  - The written files are validated against `storage.schema.json`.
  - A data folder is served by one backend at a time. Document that.
- `server/cli/copy.ts`: generic `copy(fromRepos, toRepos)` plus the uploads files. It preserves ids,
  timestamps and `archived`, and sets counters to the maximum id.
- A cross-backend test: PHP serves a store that Node wrote.
- Migrate a copy of `data/flyers.db` and its uploads into the Laragon deploy's `data/` and `uploads/`
  (Phase 5). Leave the SQLite file untouched.

## Phase 5: release, docs, Laragon verification, report

- `npm run build:php` runs `scripts/build-php.ts`:
  1. vite build (base `./`);
  2. gen;
  3. copy the web files, `php/src`, `schema/`, `seed/` and `assets/` into `release/php/`;
  4. `composer install --no-dev -o` inside it.

  The release never contains `config.php`, data or uploads, so re-uploading can't overwrite them. Add
  `release/` to `.gitignore`.
- README gains a **"Deploy to shared hosting (PHP)"** section: upload, permissions, `config.php`, access
  (IP allow-list / Basic auth), `data/` outside the web root, an nginx snippet, backup, and updating
  without overwriting data or config. Also write `docs/json-storage.md`.
- Laragon verification:
  - Copy `release/php/` to `A:\serverpath\laragon\nest-flyers-php\` with a local `config.php`
    (`allowPublic = true`) and the migrated library.
  - Verify at `http://localhost/nest-flyers-php/`, which also proves the subfolder case. Once the owner
    reloads Laragon, verify at `http://nest-flyers-php.test/` (the domain-root case).
  - Run the contract suite and the smoke test against it through `CONTRACT_BASE_URL`.
  - Check that `data/*.json`, `src/`, `vendor/`, `schema/`, `seed/`, `config.php` and a planted
    `uploads/x.php` all return 403 or 404, and never execute.
  - Look at the editor in real Chrome: the preview, and a downloaded PNG and JPG.
- Update the Status section of `CLAUDE.md` and the brief's status.
- **Final report:** what was verified, what wasn't, and the known trade-offs. Client export renders on each
  staff member's browser: layout and fit match the preview by construction, glyph anti-aliasing can differ
  between Windows and macOS, and Chrome or Edge stays required.

## Done means

- `npm run typecheck && npm test && npm run test:render` are green.
- `npm run test:contract` passes on node **and** php.
- `composer test` passes, and so does the PHP Playwright smoke test.
- `npm run build:php` produces a release that works on Laragon's Apache.
- Every item of the original brief's Definition of done is met or explicitly reported as not met.

## Out of scope

Build steps 7–9, accounts or login beyond the access rule, a MySQL driver (the interface only), library
thumbnails, and new hostel names.
