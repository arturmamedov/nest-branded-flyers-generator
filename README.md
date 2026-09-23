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

1. Complete `seed/hostels.json` — three of the 13 hostels are filled in; Artur has the rest.
   Seeding upserts by `slug` and never deletes, so re-run `npm run seed` after adding them.
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
| `npm run test:contract` | the HTTP contract (`docs/api-contract.md`) against every backend, the PHP one also behind a staff login (`php-basic`), and the access rule itself over HTTP (`php-access`: 401, 403, 503). `CONTRACT_BASE_URL` in `.env` points it at a deployment instead (see *Check it* below) |
| `npm run test:render` | builds, then renders every sample in all three photo modes: inside the safe box, no overlapping blocks, no clipped text, real fonts loaded, highlighter clone, exports exactly 1080 × 1920 PNG/JPG, cache invalidates on save; the in-browser client export matches the server export (`fidelity.spec.ts`, ≤ 0.5 % per feature) |
| `npm run test:php` | the PHP backend's own tests (PHPUnit). `composer test` in `php/` does the same; `PHP_BIN` picks the interpreter |
| `npm run test:php-smoke` | builds, serves the release layout with `php -S`, and drives the editor on the PHP backend in a browser |
| `npm run build:php` | the release to upload to a PHP host, in `release/php/` |
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
| `docs/api-contract.md`, `docs/json-storage.md` | the two seams written down |
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

**Needs:** PHP 8.1 or newer with `json` and `gd` (`exif` and `imagick` optional), Apache or
LiteSpeed with `.htaccess` and `mod_rewrite` (an nginx snippet is below), and folders you can
write to. Everything else ships in the release.

### 1. Build and upload

```sh
npm run build:php          # → release/php/  (Vite build + composer install --no-dev)
```

Upload the **contents** of `release/php/` to the folder the domain serves — a domain root or a
subfolder, both work. `data/` and `uploads/` must be writable by PHP (usually 755, or 775 where
PHP runs as another user). The release carries no `config.php` and nothing inside `data/` or
`uploads/` but the `.htaccess` that denies them, so re-uploading never overwrites the library or
your settings.

### 2. Configure and let it in

Copy `config.sample.php` to `config.php` and set **one** access rule. Until you do, every
request answers 503: no login means the app must not be open by accident.

```php
'access' => [
    'allowIps'    => ['203.0.113.7/32'],              // the office's public IP (IPv4 or IPv6, CIDR)
    'basicAuth'   => ['user' => 'staff', 'passwordHash' => password_hash('…', PASSWORD_DEFAULT)],
    'allowPublic' => false,                            // only on a machine nobody else can reach
],
'dataDir' => null,   // null = ./data (denied by .htaccess). Better: an absolute path outside public_html.
```

`config.php` guards the **API**. The editor page, the art and the photos are plain files, so
to put the whole app behind the office IP or a password, paste one of the snippets in
`access-examples/` at the top of `.htaccess`. Basic auth belongs behind HTTPS.

Open the URL: the hostels seed themselves on the first request (there is no cron), and the
library is ready.

### 3. Check it

Put the deployment in `.env` (see `.env.example`); that works in every shell:

```sh
CONTRACT_BASE_URL=https://flyers.example.org/
CONTRACT_BASIC_USER=staff            # a locked deployment: the staff login
CONTRACT_BASIC_PASSWORD=…
```

then `npm run test:contract` (the API contract, the deny rules, and the lock on the page and photos) and
`npm run test:php-smoke` (the editor, uploads and downloads). Both print which deployment they are
testing; remove the lines afterwards, or every later run is a remote one. The same without `.env`, in
PowerShell: `$env:CONTRACT_BASE_URL='https://flyers.example.org/'; npm run test:contract` (in Git Bash:
`CONTRACT_BASE_URL=https://flyers.example.org/ npm run test:contract`; cmd.exe has no inline form).

By hand: `GET api/config` should report `backend: php`; `data/meta.json`, `src/`, `vendor/`,
`seed/`, `schema/`, `config.php` and any `.php` under `uploads/` must all answer 403 or 404.
Some hosts run a firewall (ModSecurity) that blocks `PUT` and `DELETE`; the app needs both, so
check that `curl -i -X DELETE https://…/api/flyers/1` comes back as **our** JSON 403
(`Missing X-Nest-Flyers header.`) and not an HTML page from the host.

### 4. Move the current library in

```sh
npm run copy -- --from-sqlite ./data/flyers.db --to-json <deploy>/data --uploads-to <deploy>/uploads
```

Upload `data/` and `uploads/` afterwards. The source database is never opened: a snapshot is
read, so the Node app can keep running. A data folder is served by one backend at a time.

### Updating

Upload the release's contents again. `config.php`, `data/` and `uploads/` are not in it, so they
stay. If a release ever changes the store's format, the app says so rather than half-reading it.

### Backup

Copy `data/` and `uploads/` (plain files), and keep `config.php` with them.

### Troubleshooting

| What you see | Why |
|---|---|
| 503 `not_configured` | `config.php` has no access rule, or PHP could not read it |
| 500 on every page | the host does not allow `Options`/`php_flag` in `.htaccess`: remove those lines (the first block and the `IfModule` blocks) and set them in the host's panel |
| 404 on every `api/…` | `mod_rewrite` is off, or `AllowOverride` does not include `FileInfo` |
| a warning printed before the JSON | `display_errors` is on and `.user.ini` is ignored: turn it off in the panel |
| photos fail at a size the editor accepted | the host's `upload_max_filesize`/`post_max_size`; `GET api/config` reports what the app sees |

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
