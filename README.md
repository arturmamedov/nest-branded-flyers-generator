# Nest Branded Flyers Generator

Internal mini-app: staff pick a flyer template, fill in the event details, drop a photo, and
download an Instagram-story-ready image (1080 × 1920). Flyers are saved to a shared library
and can be reopened and edited later.

Built from a design handoff — **read `design_handoff_flyer_generator/README.md` first.** It
carries exact geometry, colours, type, the text-fitting behaviour, the data model, the API
surface and the export pipeline. The `design/` folder in it holds working HTML prototypes of
the flyer; they are references, not the app.

## Stack

- Node on a small VPS the team controls (Node 24 LTS; `.nvmrc`)
- SQLite (`better-sqlite3`) — single file, easy backup
- Playwright (Chromium) for the 1080 × 1920 PNG/JPG export
- Self-hosted Shantell Sans + Montserrat (do not hot-link Google Fonts — export timing)
- Express 5 API · React + Vite editor · TypeScript throughout · `sharp` for photo uploads
- **Or PHP shared hosting**: the same editor on a PHP 8.1+ backend with JSON-file storage, where the
  browser makes the export (no Chromium on the host). See 'Deploy to shared hosting' below.

## Access

No login by design. **Bind to the office network or put it behind a firewall / reverse-proxy
allow-list.** It must not be reachable from the public internet.

The server binds to `127.0.0.1` unless `HOST` says otherwise, and every write needs an
`X-Nest-Flyers: 1` header so other websites cannot post to it from a staff browser. Use
**Chrome or Edge** for the editor — the preview and the export are both Chromium, so they match.

## First run

1. `seed/hostels.json` holds all 14 hostels, from Artur's list. Seeding upserts by `slug` and
   never deletes, so re-run `npm run seed` after adding one (the PHP backend re-seeds by itself).
2. Seed the database, then verify the Activity template renders pixel-matched to
   `design/Nest Flyer Story Templates.dc.html` (`npm run compare:design`, below).
3. Work through the export checklist in the handoff README §9 before shipping.

## Ground rules

- Instagram safe zones are hard limits: 250px top, 300px bottom, 70px sides. Text and info
  blocks clamp inside them; only hand-drawn art may sit in the margins.
- `#53CED1` (bright teal) is never used for text on cream — it fails contrast. Text teal is
  `#0D6F82`.
- Orange `#EA580C` belongs to the website's "Book Now" button. Never a flyer accent.
- Preview and export share one renderer. If they can drift, they will.

---

## Develop (Windows or Linux)

```sh
npm install
npx playwright install chromium
cp .env.example .env          # optional; defaults are fine for dev
npm run seed:dev              # hostels + built-in doodles into ./data/flyers.db
npm run seed:samples          # the six design records, incl. the stress test (dev only)
npm run dev                   # http://127.0.0.1:8787 — API, editor and render page on one port
```

`npm run dev` runs Express with Vite in middleware mode, so the editor hot-reloads and the
export renderer works in dev too.

### Checks

| Command | What it proves |
|---|---|
| `npm run typecheck` | client and server compile |
| `npm test` | shared logic (`·` split, layout, crop maths, copy rules, schema), the shared test vectors, the storage contract on every driver, SQLite migrations, and that generated files are current |
| `npm run test:contract` | the HTTP contract (`docs/api-contract.md`) against every backend, the PHP one also behind a staff login (`php-basic`), and the access rule itself over HTTP (`php-access`: 401, 403, 503). `CONTRACT_BASE_URL` in `.env` points it at a deployment instead (`docs/deploy.md`) |
| `npm run test:render` | builds, then renders every sample in all three photo modes: inside the safe box, no overlapping blocks, no clipped text, real fonts loaded, highlighter clone, exports exactly 1080 × 1920 PNG/JPG, cache invalidates on save; the in-browser client export matches the server export (`fidelity.spec.ts`, ≤ 0.5 % per feature) |
| `npm run test:php` | the PHP backend's own tests (PHPUnit). `composer test` in `php/` does the same; `PHP_BIN` picks the interpreter |
| `npm run test:php-smoke` | builds, serves the release layout with `php -S`, and drives the editor on the PHP backend in a browser |
| `npm run build:php` | the release to upload to a PHP host, in `release/php/`, and the preflight page beside it (`docs/deploy.md`) |
| `npm run deploy:backup` / `deploy:restore` / `deploy:reset` | a local deployment's library out to a dated folder, back in, or emptied (`docs/deploy.md`, *Backups*) |
| `npm run copy` | moves a library between storage drivers (SQLite ⇄ JSON files) |
| `npm run compare:design` | with `npm run dev` running and samples seeded: pixel-diffs the app against the design prototype (needs internet for the prototype's React). Diff images in `test-results/design-compare/`. The MVP matched it to 0 pixels; since the design pass below it differs on purpose in the headline and art — check nothing else moved |

### Design pass (2026-09-18) — where the app departs from the prototype

- Headline block at **345** (was 382) with photo; the eyebrow box trimmed to 95px so they don't overlap.
- The two sparks sit on the **photo's top corners** (24,657 and 975,658 in band and bleed mode). They are anchored
  to the photo slot, so with no photo they hang off the brush rule's ends instead of landing on the headline.
- The bottom spark sits off the tag pill's end (776,1601.7, flipped, −137°). The clock doodle is gone.
- Flyers still carrying the old art untouched were migrated (DB migration 2); hand-arranged art is left alone.

Numbers live in `src/shared/layout.ts` (boxes) and `src/shared/defaults.ts` (art).

The export checklist items that need eyes (5px strokes everywhere, the highlighter behind the
full WHEN line) — download the stress-test flyer and look.

### Where things live

| Path | What |
|---|---|
| `src/flyer/Flyer.tsx` | **the** renderer — used by the editor preview and the export page. Transcribed 1:1 from the prototype |
| `src/flyer/fit.ts` | the two-pass shrink-to-fit, ported verbatim from the prototype's `_fit()` |
| `src/shared/` | DOM-free logic shared by client and server: schema, layout numbers, `·` parsing, crop maths, copy rules |
| `src/editor/` | the editor and library UI |
| `render.html`, `src/render/` | the bare 1080 × 1920 page headless Chromium screenshots |
| `server/` | Express API, migrations, photo processing, export renderer |
| `server/storage/` | the storage seam: the SQLite and JSON-file drivers, seeding, the copy tool |
| `src/shared/` → `schema/` | generated by `npm run gen`: the JSON Schemas, limits and error catalogue PHP reads |
| `php/` | the PHP backend (`src/`, `tests/`, `web/`), built into `release/php/` by `npm run build:php` |
| `tests/contract/`, `tests/cross/` | the HTTP contract both backends answer, and the proof PHP serves a store Node wrote |
| `tests/access/` | the PHP access rule over HTTP (who is refused, with what), and the preflight page |
| `php/preflight/` | the preflight page the owner uploads before a release (`docs/deploy.md`) |
| `docs/api-contract.md`, `docs/json-storage.md` | the two seams written down |
| `docs/deploy.md` | the shared-hosting deploy, step by step, for the owner |
| `assets/art/` | the built-in hand-drawn art (served at `/assets/art/…`) |
| `fixtures/photos/` | development placeholder photos — **not licensed**, never shipped as content |
| `design_handoff_flyer_generator/` | the handoff: spec README + HTML prototypes |

To swap Shantell Sans for More Sugar (if a licence is ever bought): change `HEADLINE_FAMILY` in
`src/shared/fonts.ts` and the `@import`s in `src/flyer/fonts.css`.

---

## Deploy to the VPS

Requirements: Linux, Node 24, a dedicated user (e.g. `nestflyers`), nginx or a firewall rule
limiting access to the office network.

```sh
# as the service user
git clone https://github.com/arturmamedov/nest-branded-flyers-generator.git /opt/nest-flyers
cd /opt/nest-flyers
npm ci
PLAYWRIGHT_BROWSERS_PATH=/opt/nest-flyers/.browsers npx playwright install chromium
npm run build
DATA_DIR=/var/lib/nest-flyers npm run seed

# as root, once, from the same checkout: system libraries Chromium needs
sudo npx playwright install-deps chromium
```

Then install `deploy/nest-flyers.service` (systemd) and `deploy/nginx.conf.example`, edited
for your office network range. Keep `HOST=127.0.0.1` when nginx fronts it; set `HOST` to the
VPS's LAN address only if staff reach it directly over the office network/VPN.

**Update:** `git pull && npm ci && npm run build && sudo systemctl restart nest-flyers`.
A new build changes the renderer's build id, so cached exports are re-rendered automatically.

### Configuration (`.env` or systemd `Environment=`)

| Variable | Default | |
|---|---|---|
| `HOST` | `127.0.0.1` | bind address — never a public interface |
| `PORT` | `8787` | |
| `DATA_DIR` | `./data` | `flyers.db`, `uploads/`, `renders/` — keep it outside the checkout on the VPS |
| `STORAGE` | `sqlite` | `sqlite` or `json` — the same JSON store the PHP backend serves (`docs/json-storage.md`) |
| `RENDER_ORIGIN` | `http://127.0.0.1:PORT` (or `http://HOST:PORT` for a specific IP) | where headless Chromium reaches the app |
| `RENDER_TIMEOUT_MS` | `30000` | per export |
| `PHP_BIN` | `php` | only for the PHP tests: which interpreter to run (8.1+) |

### Backup

Everything is in `DATA_DIR`. Back up the database with SQLite's online backup (safe while
running) plus the uploads folder; `renders/` is a cache and can be skipped.

```sh
sqlite3 /var/lib/nest-flyers/flyers.db ".backup '/backups/flyers-$(date +%F).db'"
rsync -a /var/lib/nest-flyers/uploads/ /backups/uploads/
```

---

## Deploy to shared hosting (PHP)

The same app on an ordinary hosting account: PHP and a web server, two writable folders, no
Node, no shell, no cron and no SQLite. The library is JSON files (`docs/json-storage.md`), and
the PNG/JPG is rendered by the staff member's own browser instead of headless Chromium.

**The deploy itself is [`docs/deploy.md`](docs/deploy.md)**, written for the owner (SFTP, the
hosting panel and a browser): the preflight page, the upload, the password and the lock, the
checks, backups, updates, rollback and troubleshooting. It is the only copy of those steps. This
section keeps what a developer runs from the checkout. (The VPS deploy above is the other,
developer-run path, with Node and a renderer; the two share no steps.)

**Needs on the host:** PHP 8.1 or newer with `json` and `gd` (or `imagick`), Apache or LiteSpeed
with `.htaccess` and `mod_rewrite` (an nginx snippet is below), and folders PHP can write to.

```sh
npm run build:php     # → release/php/ (Vite build + composer install --no-dev, with release.json)
                      #   and release/nest-preflight-<random>.php beside it, to upload first
```

The release never carries `config.php`, nor anything in `data/` or `uploads/` but their rules, so
re-uploading never overwrites the library or the settings. `release.json` lists every file with
its sha256; the preflight page and `GET api/config` (`server.release`) name whatever did not
arrive, the eight security dotfiles by name.

**Moving a library in** (into a local folder shaped like the host's, then uploaded):

```sh
npm run copy -- --from-sqlite ./data/flyers.db --to-json <folder>/data --uploads-to <folder>/uploads
```

The source database is never opened: a snapshot is read, so the Node app can keep running. The
same command works the other way (`--from-json <folder>/data --uploads-from <folder>/uploads
--to-sqlite …`). A data folder is served by one backend at a time.

**Against a local copy of a deployment** (a Laragon folder): `npm run deploy:backup`,
`deploy:restore` and `deploy:reset` (`docs/deploy.md`, *Backups*), and the checks with
`CONTRACT_BASE_URL` in `.env` (`docs/deploy.md`, *Checking from the computer with the checkout*).

### nginx

nginx ignores `.htaccess`, so the rules go in the server block:

```nginx
root /var/www/flyers;
index index.html;

location ^~ /api/ {                     # the only place PHP runs
    include fastcgi_params;
    fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    fastcgi_param SCRIPT_FILENAME $document_root/api.php;
    fastcgi_param SCRIPT_NAME /api.php;
}
location ~ ^/(src|vendor|seed|schema|data)/ { return 404; }
location ~ ^/(config.*\.php|router\.php|composer\.(json|lock)|\.user\.ini|release\.json)$ { return 404; }
location ^~ /uploads/ {                 # images only, never executed
    location ~ \.ph(p\d?|tml|ar|ps|t) { return 404; }
    add_header X-Content-Type-Options nosniff;
}
```

There is no generic `location ~ \.php$`: only `api.php` ever runs. Restricting the app to the
office is `allow`/`deny` or `auth_basic` in the server block.

The preflight page (`docs/deploy.md`, step 1) is written for Apache and LiteSpeed. On nginx it
is served as source unless it gets its own line, beside the `api/` one, for as long as it is up:

```nginx
location ~ ^/nest-preflight-[0-9a-f]+\.php$ { include fastcgi_params; fastcgi_pass unix:/run/php/php8.3-fpm.sock; fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name; }
```

---

## Status

Shipped: handoff build steps 1–6 — Activity template pixel-matched to the prototype,
Playwright export (PNG/JPG, cached), text fields with live preview and shrink-to-fit, photo
upload with three photo modes, drag-to-reposition and zoom, library with hostel filter, reopen,
duplicate and archive.

Next (handoff steps 7–9): per-element drag/nudge with snapping and safe-box clamping, font-size
multipliers, contrast-checked colour swatches, block reorder, Reset to template; the
**This week** template; the doodle picker and staff doodle uploads. The data model already
stores `overrides`, `colors`, `week[]` and `doodles[]` for them.

Open items: the other 10 hostel names · per-hostel logo variants (`hostel.logo_path`; default is
the teal Nests wordmark) · licensed event photos · whether `pill-teal.png` from the Canva
export should join the built-in art.
