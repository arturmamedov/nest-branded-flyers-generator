# The PHP shared-hosting port: what was built, what was proven, what was not

Branch `feat/php-shared-hosting`, phases 2–5, finished 2026-09-22. The briefs are
`docs/prompts/php-shared-hosting.md` (the spec) and `docs/prompts/php-shared-hosting-continue.md`.

**In one line:** the flyer generator now runs on an ordinary PHP host — no Node, no shell, no cron, no SQLite —
with the library in JSON files and the PNG/JPG made by the staff member's own browser, and the Node app is
unchanged in what it does.

## Definition of done, item by item

| # | The brief asked for | Result |
|---|---|---|
| 1 | `npm run build:php` → a release that works on Apache/LiteSpeed with writable `data/` and `uploads/`: library, editor, photos in all three modes with crop, PNG/JPG at exactly 1080 × 1920 | **Met.** Verified on Laragon's Apache 2.4 + mod_php 8.4 at `http://localhost/nest-flyers-php/` (a subfolder), with the real library. Upload by FTP was not exercised — the release was copied into place. |
| 2 | One frontend against either backend, learning what it can do from `GET /api/config` | **Met.** The editor picks its exporter and photo limits from `api/config`; PHP reports `exporters: ['client']`, Node `['client','server']`. |
| 3 | Storage chosen by config; PHP ships a JSON driver, Node keeps SQLite and gains a JSON driver in the **same** format; a copy tool migrates the library | **Met.** `STORAGE=sqlite\|json`; `npm run copy` moved the real library (3 hostels, 14 doodles, 6 photos, 9 flyers, 6 files). The interfaces leave room for a PDO/MySQL driver; none was written, as the brief says. |
| 4 | Substitutability enforced by tests: one HTTP contract suite against both backends, one repository contract per driver | **Met.** `npm run test:contract` runs `node`, `node-json`, `php` and `cross` (188 tests). The repository contract runs for SQLite and Node-JSON (Vitest) and for the PHP driver (PHPUnit). |
| 5 | Client-export fidelity proven against the Playwright export | **Met.** `tests/render/fidelity.spec.ts`: 6 samples + the highlighter-wrap record × 3 photo modes, downloaded through the real editor, each ≤ 0.5 % differing pixels outside the photo band **and** inside the art, highlighter, wonky-frame and text boxes; both files exactly 1080 × 1920, the JPG at IJG quality 90. A negative control breaks the highlighter and must fail. |
| 6 | On a public host: no data or code reachable, uploads cannot execute, the app refuses to serve until an access rule is configured | **Met.** 75 automated checks against the deployed release (denied folders and files, case variants, no directory listings, planted `.php`, `.phtml`, `.php.png`, `.svg`, `.html` in `uploads/` — all 403/404, never executed). With no `config.php`, Apache answered 503 `not_configured`. |
| 7 | `npm run typecheck && npm test && npm run test:render` stay green | **Met**, with the suites grown: 109 unit/storage tests, 29 render tests (24 of them client-export fidelity), 544 PHPUnit tests on PHP 8.4, 8.3 and 8.1. |
| 8 | A README section: upload, permissions, config, access, backup, updating | **Met** — "Deploy to shared hosting (PHP)", plus `docs/json-storage.md` and `docs/api-contract.md`. |

## How it hangs together

- **One contract, two backends.** `docs/api-contract.md` is the seam; `tests/contract/` is the judge and parses
  every answer with the shared zod schemas, so a backend cannot drift in shape unnoticed.
- **One source of truth.** The error catalogue, photo limits, HEIC brands and the storage layout are written once
  in `src/shared/` and generated into `schema/*.json` (`npm run gen`), which PHP reads at runtime. A staleness
  test fails if a generated file is out of date.
- **One renderer, two exporters.** `ClientExporter` mounts the same `<Flyer>` offscreen and captures it with
  modern-screenshot; `ServerExporter` is the old `POST /api/render`. Which one runs is `api/config`'s answer.
- **One store format.** `docs/json-storage.md`. `tests/cross/` writes a store with Node, serves it with PHP, and
  requires every list and payload to match and the files to stay byte-identical.

## Verified here

- The whole contract suite and the smoke test against the deployed release on Apache (`CONTRACT_BASE_URL`), in
  **both** URL shapes: the subfolder `http://localhost/nest-flyers-php/` and, after Artur reloaded Laragon on
  2026-09-22, the domain root `http://nest-flyers-php.test/` — 110 contract tests and the browser smoke test
  (create, all three photo modes, crop, reopen, library, PNG and JPG downloads) on each. The library was
  snapshotted before the root run and restored byte for byte afterwards, so the real one carries no test data.
- The library migrated with `npm run copy`; `data/flyers.db` and its `-wal` are byte-identical before and after.
  The sha256s were recorded before Phase 4 and re-checked at the end:

  ```
  flyers.db      853246919d26157d8ae3c33abe40428983a765436069049020e5117796b292b1
  flyers.db-wal  97f9909f8ba2f5b742f4cb5d044366e8e2149b6474cc73cc9ed3074ef978ee71
  ```
- The editor in Chrome on the deployment: library, preview, and a downloaded PNG (1080 × 1920, 1.1 MB) and JPG
  (273 KB) that look right — fonts, stretched art, the highlighter behind the WHEN line, even 5 px frames.
- PHP 8.1 as well as 8.4: the same 544 tests pass, so the `>=8.1` promise is real.
- A shared host's limits: the test server runs with `upload_max_filesize=2M`, `post_max_size=3M`,
  `memory_limit=128M` and a non-UTC timezone, so the 413s, the browser-side shrinking and UTC timestamps are
  proven the way a host will see them.

## Not verified here, and what it would take

Updated 2026-09-23 after the deploy rehearsal (below). Each item left is blocked on a real host, and
says what closes it.

- **PHP as CGI/FastCGI (IONOS runs it this way).** The login's hand-off to PHP through
  `REDIRECT_HTTP_AUTHORIZATION` has still only been unit-tested. Laragon runs mod_php, and enabling
  FastCGI here would mean editing Laragon's global `httpd.conf`, which Artur declined. *Closes with:*
  the preflight page's *Login* line on IONOS, reloaded behind the lock.
- **The upload itself.** An FTP transfer, and extracting a zip with the host's file manager.
  *Closes with:* `docs/deploy.md` step 2 on IONOS; the preflight page's *The release* line then
  names anything that did not arrive.
- **A restrictive `AllowOverride`.** `.htaccess-minimal` is held to the full files line by line,
  but no host here refuses `Options`. *Closes with:* the host itself, only if every page answers 500.
- **A host firewall (ModSecurity).** Some hosts block `PUT` and `DELETE`. *Closes with:*
  `curl -i -X DELETE https://…/api/flyers/1` signed in: our JSON 403 means the firewall let it through.
- **Server-side probes over a trusted certificate.** Laragon's certificate is self-signed, so PHP's
  curl refused it and the page fell back to its manual list, as designed. *Closes with:* the
  preflight page on IONOS, whose certificate is real.
- **The nginx snippet** in the README is written from the Apache rules, not run. No nginx host is
  planned.
- **Imagick.** The processor is written and contract-tested, but this machine has no `imagick`,
  so those 37 tests skip. GD is the default anyway.

## Known trade-offs

- **The export happens on the staff member's machine.** Layout and fit match their preview by construction — same
  DOM, same fonts, same fit passes. Glyph anti-aliasing can differ slightly between machines (Windows vs macOS),
  and a very old browser would not do at all: **Chrome or Edge stays the requirement.**
- **One backend per data folder.** PHP locks with `flock`, Node with a lock directory; they do not see each
  other. Point one app at a folder, not both.
- **Photos are re-encoded twice** when the browser shrinks a photo the server then re-encodes. That is the price
  of a 2 MB upload limit; a JPEG that already fits is passed through untouched.
- **PHP and sharp do not produce identical pixels.** GD's resampling and encoder differ from libvips, so the
  contract checks sizes, formats and rules, never bytes. The same photo uploaded to each backend looks the same
  but is not byte-identical.
- **No login, still.** The access rule is the whole defence: an IP allow-list or Basic auth, and HTTPS if it is
  Basic. Artur's decision (2026-09-23): the app does not go live until a real login exists, which is its own
  brief.

## Deploy rehearsal (2026-09-23)

`docs/prompts/php-deploy-readiness.md`, phase 5: `docs/deploy.md` followed literally, from a cold
empty folder, on Laragon's Apache 2.4.57 with mod_php 8.4.25, over `https://localhost/…`
(Laragon's certificate), at `A:\serverpath\laragon\nest-flyers-rehearsal\`. The folder, its
password file and the `.env` lines were deleted afterwards. The live Laragon deployment
(`nest-flyers-php`) was not touched. What the host answered is in `docs/reports/host-facts.md`.

- **1. The preflight page, alone.** It rendered with no `vendor/`, no `config.php` and no
  release. Every account check was green except `display_errors` (On in Laragon's `php.ini`;
  Off once the release's `.htaccess` was in).
- **2. The release,** copied in additively. *The release* went green: `5115b7ca1fdd (d4f1491)`,
  every file and all eight security dotfiles in place.
- **3. The password.** One password typed into the page gave `config.php`, the `.htpasswd`
  line and the two `.htaccess` blocks. They were saved exactly where the page said, including the
  password file outside the web root.
- **4. The lock, from an anonymous vantage.**
  - Over https, the editor page, a photo (a real one once the library was in), the API and
    `static/` each answered 401 with the challenge; `release.json` answered 403.
  - With the password, all of them answered 200; with a wrong one, 401.
  - Over `http://`, every path answered 302 to `https://`, with no `WWW-Authenticate`: the
    password is never asked for over http.
  - The page recognised the lock as "a block on top" of the shipped rules.
  - The login reached PHP through `PHP_AUTH_USER` and `HTTP_AUTHORIZATION`.
  - The rehearsal caught one real bug, fixed in the same commit. The page's stand-in photo
    path (`uploads/2000/01/…`) answered 403 even without a lock, because Apache judges the
    missing folder names by `uploads/.htaccess`'s images-only rule. That would have been a false
    green. The stand-in now sits directly in `uploads/`, where no lock means 404 (the same change
    was made in `lock.test.ts`).
- **The checks, run as Artur will run them,** from `.env` (`CONTRACT_BASE_URL`, the login and
  `CONTRACT_DEPLOY_DIR`), with Node pointed at Laragon's CA:
  - the full contract suite on the empty deployment: 121 passed, 1 skipped (the `post_max_size`
    overflow probe, since Laragon allows 5G);
  - the planted-file block, all 7 files refused with no `EXECUTED`;
  - `lock.test.ts`, 6 anonymous 401s;
  - the `allowPublic` row;
  - `npm run test:php-smoke` in Chromium, signed in over https: passed.
- **The library.**
  - `deploy:reset` emptied the tested deployment.
  - `npm run copy` moved in 3 hostels, 14 doodles, 6 photos and 9 flyers. The next request
    re-seeded 14 hostels from the release.
  - `deploy:backup` → `deploy:reset` → `deploy:restore` on that real library brought back all 9
    flyers and 6 photos, the sample photo byte for byte.
  - `data/flyers.db`, `-wal` and `-shm` were hashed before and after, and are unchanged (the two
    sums above, and `-shm` `7a1a6e7b…ff9bb0`).
- **The way back, JSON → SQLite**, never run before: the rehearsal's store copied into a scratch
  SQLite file holds 14 hostels, 14 doodles, 6 photos and 9 flyers, and 6 photo files, matching
  the store count for count.
- **The deliverable.** In Chromium, a new flyer for *Pura Vida by Nest* (a hostel added this
  session), with a photo, was saved and downloaded: a 1080 × 1920 PNG, in Shantell Sans and
  Montserrat, looked at by eye.
- **Cost.** The release check makes `api/config` about 90 ms slower on this Apache (0.50 s
  against 0.41 s time to first byte). That is under the 100 ms at which it would have been cut
  down to sizes only, so full hashes stay.
