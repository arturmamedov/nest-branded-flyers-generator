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

- The whole contract suite and the smoke test against the deployed release on Apache (`CONTRACT_BASE_URL`).
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

- **A real shared host.** Everything ran on Laragon (Apache 2.4, mod_php 8.4). LiteSpeed, PHP-FPM/CGI and an FTP
  upload are untested. The CGI path matters for one thing only: Basic auth arrives through `HTTP_AUTHORIZATION`
  (the `.htaccess` passes it), which mod_php does not exercise.
- **`nest-flyers-php.test`, the domain-root case.** Laragon only creates that vhost after you click Reload. The
  routing it would exercise is covered by `php -S` (which serves at a root) and by the subfolder case on Apache,
  but the vhost itself was not tried. Rerun the two commands in the README's "Check it" against
  `http://nest-flyers-php.test/` after a reload.
- **The `.htaccess` access examples.** `allowIps`/`basicAuth` are unit-tested in PHPUnit (CIDR v4/v6, the 401
  challenge, the combination rule), but the Apache snippets in `access-examples/` were not pasted into a live
  `.htaccess`. The local deploy runs with `allowPublic`, as you asked.
- **A host firewall (ModSecurity).** Some cPanel hosts block `PUT` and `DELETE`, which the app needs. The README
  says how to check in one curl.
- **The nginx snippet** in the README is written from the Apache rules, not run.
- **Imagick.** The processor is written and contract-tested, but this machine has no `imagick`, so those 37 tests
  skip. GD is the default anyway.

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
  Basic. On the day this goes on a real domain, that is the first thing to set.
