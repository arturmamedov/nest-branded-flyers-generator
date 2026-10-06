# Nest Branded Flyers Generator

Internal mini-app: staff pick a flyer template — **Activity** (one event, with a photo) or
**This week** (up to five of the week's activities) — fill in the details, and download it as
an Instagram story (1080 × 1920) or a WhatsApp image (1080 × 1440, 3:4): one flyer, two output
canvases, switched in the editor's toolbar. Flyers are saved to a shared library and can be
reopened and edited later.

Built from a design handoff — **read `design_handoff_flyer_generator/README.md` first.** It
carries exact geometry, colours, type, the text-fitting behaviour, the data model, the API
surface and the export pipeline. The `design/` folder in it holds working HTML prototypes of
the flyer; they are references, not the app.

## Stack

- Node on a small VPS the team controls (Node 24 LTS; `.nvmrc`)
- SQLite (`better-sqlite3`) — single file, easy backup
- Playwright (Chromium) for the PNG/JPG export, at each canvas's exact size
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

- Safe zones are hard limits, **per canvas**: the Instagram story's 250px top, 300px bottom,
  70px sides; WhatsApp's 40px all round (nothing covers a WhatsApp image's edges). Text and
  info blocks clamp inside them; only hand-drawn art may sit in the margins. Every canvas's
  geometry lives in the `CANVASES` registry in `src/shared/layout.ts`: adding a canvas is one
  entry there.
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
npm run seed:samples          # the six design records and three This week flyers, both stress tests included (dev only)
npm run dev                   # http://127.0.0.1:8787 — API, editor and render page on one port
```

`npm run dev` runs Express with Vite in middleware mode, so the editor hot-reloads and the
export renderer works in dev too.

### Checks

| Command | What it proves |
|---|---|
| `npm run typecheck` | client and server compile |
| `npm test` | shared logic (`·` split, layout, crop maths, copy rules, schema), the editor's history guard, the shared test vectors, the storage contract on every driver, SQLite migrations, that generated files are current, and the AI assistant on a fake provider: its checks in their order, each feature's daily limit and its day, and both providers' adapters against recorded answers |
| `npm run test:contract` | the HTTP contract (`docs/api-contract.md`) against every backend, the PHP one also behind a staff login (`php-basic`), and the access rule itself over HTTP (`php-access`: 401, 403, 503). The AI routes generate on the fake provider with every feature named (`node-ai`, `php-ai`); every other project proves them off. One feature switched off is proved in process on each backend (`tests/unit/ai-app.test.ts`, `php/tests/BootstrapTest.php`), with no server per case. `CONTRACT_BASE_URL` in `.env` points it at a deployment instead (`docs/deploy.md`) |
| `npm run test:render` | builds, then renders every Activity sample in all three photo modes, and every This week sample once, on every canvas: every block where `layout.ts` puts it, inside the safe box, no overlapping blocks, no clipped text, real fonts loaded, highlighter clone, each week row printing what `src/shared/week.ts` says (short names, two-line prices, empty cells collapsed), exports each canvas at its exact size as PNG/JPG, cached per canvas until a save; the in-browser client export matches the server export (`fidelity.spec.ts`, ≤ 0.5 % per feature). `tests/render/baseline.spec.ts` is opt-in (`RENDER_BASELINE=capture\|check`, `RENDER_BASELINE_DIR`): byte-identical PNGs of the story, every sample Activity and This week alike, before and after a change; a check skips, by name, a case its capture lacks. `ai.spec.ts` drives "Create with AI" and "Write with AI" on a second server with the fake provider; every other spec runs with the AI off, whatever `.env` holds |
| `npm run test:php` | the PHP backend's own tests (PHPUnit). `composer test` in `php/` does the same; `PHP_BIN` picks the interpreter |
| `npm run test:php-smoke` | builds, serves the release layout with `php -S`, and drives the editor on the PHP backend in a browser |
| `npm run build:php` | the release to upload to a PHP host, in `release/php/`, and the preflight page beside it (`docs/deploy.md`) |
| `npm run deploy:backup` / `deploy:restore` / `deploy:reset` | a local deployment's library out to a dated folder, back in, or emptied (`docs/deploy.md`, *Backups*) |
| `npm run deploy:update` | a newer release over a local copy of a deployment: backup, build, an additive copy that deletes nothing, and a git tag. `tests/cross/update-drill.test.ts` proves the library, the photos and `config.php` untouched |
| `npm run deploy:tag` | the git tag `release/<id>` for a deployed release, on the commit it was built from, with the site and the day in its message. It takes a deployment's folder or a site's address, refuses a release built from uncommitted changes, and never pushes |
| `npm run flyers:post` | saves flyers from staff-text briefs on a site through its API (`FLYERS_BASE_URL`, or `--to`; `--dry-run` checks only). Idempotent; `docs/ai-flyers/README.md` |
| `npm run ai:smoke` | one real AI generation, by hand, with the provider and key in `.env`: the brief, what it assumed, the share text, the tokens and the seconds. `--share` writes a flyer's share text; `--photo <picture or image example .json>` reads one picture into its words instead, and `--save <file>` writes that picture as it was sent; `--to <app root>` goes through a site's API and spends one of that feature's generations there for the day. It stops before spending anything when the feature it would call is off there. Never part of a test: no test touches a provider |
| `npm run copy` | moves a library between storage drivers (SQLite ⇄ JSON files) |
| `npm run compare:design` | with `npm run dev` running and samples seeded: pixel-diffs the app against the design prototype (needs internet for the prototype's React). Diff images in `test-results/design-compare/`. The MVP matched it to 0 pixels; since the design pass below it differs on purpose in the headline and art — check nothing else moved |

### Design pass (2026-09-18) — where the app departs from the prototype

- Headline block at **345** (was 382) with photo; the eyebrow box trimmed to 95px so they don't overlap.
- The two sparks sit on the **photo's top corners** (24,657 and 975,658 in band and bleed mode). They are anchored
  to the photo slot, so with no photo they hang off the brush rule's ends instead of landing on the headline.
- The bottom spark sits off the tag pill's end (776,1601.7, flipped, −137°). The clock doodle is gone.
- Flyers still carrying the old art untouched were migrated (DB migration 2); hand-arranged art is left alone.

Numbers live in `src/shared/layout.ts` (boxes) and `src/shared/defaults.ts` (art).

### Editor pass (2026-09-28) — where the app departs from the handoff

- A new flyer starts **In a frame**, and so does a photo dropped while "No photo" is on (`DEFAULT_PHOTO_MODE`
  in `src/shared/defaults.ts`). It supersedes handoff §1 item 4, "full bleed (default)". Saved flyers keep
  their mode.
- The copy may use up to `MAX_EXCLAMATIONS` exclamation marks (`src/shared/copyRules.ts`), and the tag pill's
  own is free. It supersedes §12's first bullet, one per flyer, which the pill always spent.
- The editor is a focus page: no shared bar, a sticky "← Library" at the top of its form, and a question
  before unsaved work is left (see the top bar, below).

### This week template (2026-09-29) — where the app departs from the handoff and the prototype

The report is `docs/reports/week-template.md`; the owner's decisions are quoted there.

- Rows are **122px, 15px apart** (§2). §3's "22px between week rows" is stale: at 138/22 the fifth
  row crossed the ask.
- The title lines (`What’s on` / `this week.` / the Spanish line) are **prefilled and editable**, in
  the headline's own fields; the prototype fixed them. The Spanish line names the hostel picked,
  until someone edits it.
- Rows are typed, or **taken from a saved Activity flyer** (a copy: its WHEN, its whole name, its
  first price). Fewer than five sit at the top. A price with a `·` prints on two lines.
- A row's time and price are capped at 250px and shrink when long, instead of squeezing the event
  name to nothing; the name may shrink below its longest word; every empty cell collapses.
- The two sparks hang from the **first row's corners**, 7px lower than on a photo so their ink stays
  out of the title. On WhatsApp the title sits at 162 and the rows run 464 → 1134.
- Switching template keeps every field: the photo, chips and extras wait on a week flyer, the rows
  on an Activity one. The title is the headline's lines, so it travels with the flyer.
- English and Spanish fields carry a small drawn flag in the editor (emoji flags show as letters
  on Windows).

The export checklist items that need eyes (5px strokes everywhere, the highlighter behind the
full WHEN line) — download the stress-test flyer and look.

### Where things live

| Path | What |
|---|---|
| `src/flyer/Flyer.tsx` | **the** renderer — used by the editor preview and the export page. Transcribed 1:1 from the prototype |
| `src/flyer/fit.ts` | the two-pass shrink-to-fit, from the prototype's `_fit()`; its height pass keeps each line's floor |
| `src/shared/` | DOM-free logic shared by client and server: schema, layout numbers, `·` parsing, crop maths, copy rules |
| `src/editor/` | the editor and library UI. The library's top bar is `<nest-nav tool="flyers">`, the bar every Nests tool shares; see below |
| `render.html`, `src/render/` | the bare page headless Chromium screenshots: one flyer on one canvas (`?canvas=`) |
| `server/` | Express API, migrations, photo processing, export renderer |
| `server/storage/` | the storage seam: the SQLite and JSON-file drivers, seeding, the copy tool |
| `src/shared/` → `schema/` | generated by `npm run gen`: the JSON Schemas, limits and error catalogue PHP reads |
| `php/` | the PHP backend (`src/`, `tests/`, `web/`), built into `release/php/` by `npm run build:php` |
| `tests/contract/`, `tests/cross/` | the HTTP contract both backends answer, and the proof PHP serves a store Node wrote |
| `tests/access/` | the PHP access rule over HTTP (who is refused, with what), and the preflight page |
| `php/preflight/` | the preflight page the owner uploads before a release (`docs/deploy.md`) |
| `docs/api-contract.md`, `docs/json-storage.md` | the two seams written down |
| `docs/deploy.md` | the shared-hosting deploy, step by step, for the owner |
| `src/shared/ai.ts`, `ai/prompts/`, `schema/ai.json` | the AI assistant's shared facts (each feature's daily limit, the day it counts in, the default models), its rules, and the generated bundle both backends send a provider |
| `server/ai/`, `php/src/Ai/` | the AI assistant on each backend: the provider seam (OpenAI, Anthropic, and a fake for the tests), the prompt, the service with its checks, the actor and the policy |
| `src/editor/AiPage.tsx`, `src/editor/handoff.ts` | "Create with AI" (`#/ai`), and the flyer it hands to the editor, unsaved |
| `scripts/ai/smoke.ts`, `scripts/site.ts` | one real generation by hand, and the one way the scripts call a site's API |
| `docs/ai-flyers/` | flyers from staff text: the examples (the model's few-shot and eval set), and how a site's ledger feeds them |
| `assets/art/` | the built-in hand-drawn art (served at `/assets/art/…`) |
| `php/web/robots.txt` | every crawler, search and AI, asked to stay out. The PHP release ships it and Express serves the same file at the app root; it counts when that is a domain's root. On nestpass.ai the domain's own copy (nestpass-tools) covers `/activities/`. |
| `fixtures/photos/` | development placeholder photos — **not licensed**, never shipped as content |
| `design_handoff_flyer_generator/` | the handoff: spec README + HTML prototypes |

To swap Shantell Sans for More Sugar (if a licence is ever bought): change `HEADLINE_FAMILY` in
`src/shared/fonts.ts` and the `@import`s in `src/flyer/fonts.css`.

**The top bar comes from nestpass.ai.**
- `index.html` loads `https://nestpass.ai/kit/nest-nav.js` (`async`). That file comes from the
  `nestpass-tools` repo, which also holds the list of tools the bar links to.
- The bar is drawn in a shadow root, so it can't touch the flyer.
- This app styles only its own links, and the fallback brand shown until the script arrives (or if
  nestpass.ai is down) at the same 54 px.
- The browser specs block the script (`tests/browser.ts`). `tests/render/chrome.spec.ts` checks both
  states.

**The editor has no bar.** The bar shows on the library; the editor (`#/new`, `#/flyers/:id`) keeps the
whole window for the form and the save and download toolbar, with a sticky "← Library" at the top of the
form. The bar comes back only if the app can't reach its server.

Unsaved work asks before it is left (`src/editor/leaveGuard.ts`, `tests/render/editor.spec.ts`):
- "← Library", the browser's Back and Forward (and jumps from their menus), a typed `#/…`: the app's
  own question. A refused move is cancelled before it happens (`src/editor/route.ts`, the Navigation
  API, in every major browser since January 2026), so the history stays as it was. A browser may refuse
  to let the page cancel a Back pressed with no fresh interaction on the page; that one happens and is
  stepped straight back. Browsers without the API (Safari before 26.2, Firefox before 147) ask on
  "← Library" and on leaving the page.
- Closing or reloading the tab: the browser's own question. Desktop browsers ask; phones (iOS Safari
  above all) may close without asking.
- A photo dropped beside the preview is refused instead of opening in the tab.

**The AI assistant is off until it has a key and its features are named.**
- It has two features. `flyer` is "✨ Create with AI" (`#/ai`): a staff member's own text becomes a new, unsaved
  flyer, with what it assumed and the flyer's share text. `share` is "✨ Write with AI", in the editor: a
  flyer's share text.
- Which provider runs, and which features, is configuration, never code: `AI_PROVIDER`, `AI_API_KEY` and
  `AI_FEATURES` in `.env` (below), or the `ai` block of `config.php` on the PHP host (`docs/deploy.md`, *The AI
  assistant*). A site runs the features it names, and none until it names them: a key alone runs nothing. A
  feature that is off shows nothing, and with none on the app is as it was.
- Every feature has its own daily limit: at most 3 generations a day of each, counted on the Canary Islands day.
  A flyer never uses up a share text. A site may set its own number for every feature, up to 20
  (`AI_DAILY_LIMIT`), and one feature's own (`AI_DAILY_LIMITS=share:10`); the default and the bound are in
  `src/shared/ai.ts`. There is no login, so today each limit is site-wide. A generation that fails is free. The
  picture read's failed ones are bounded all the same, since each keeps its picture: three tries for each read of
  its limit (`AI_TRIES_PER_LIMIT`), which is no setting.
- Every test runs on the fake provider or with the AI off, so a key in `.env` never reaches a test.
  `npm run dev` does use it.
- The brief is `docs/prompts/ai-assistant.md`, the report `docs/reports/ai-assistant.md`.

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
| `AI_PROVIDER` | unset: the AI is off | `openai`, `anthropic`, or `fake` (canned answers from the examples, for the tests and a demo; it needs no key) |
| `AI_API_KEY` | unset | the provider's key. Server-side only: it never reaches `api/config`, a log line, the ledger or git |
| `AI_FEATURES` | unset: no feature runs | the features this site runs, separated by commas: `flyer` ("Create with AI"), `share` ("Write with AI"), `photo` (a picture read into words; the server's half, its page is not built yet). `AI_FEATURES=flyer,share` runs the two with a page. A name that is no feature is refused at start-up |
| `AI_DAILY_LIMIT` | `3` | generations a day of each feature, for the whole site: a whole number from 1 to 20. Every feature has its own count |
| `AI_DAILY_LIMITS` | unset: every feature takes `AI_DAILY_LIMIT` | a feature's own number a day, as `feature:number` pairs separated by commas (`share:10,flyer:5`), 1 to 20 each. A name that is no feature, or a feature named twice, is refused at start-up |
| `AI_MODEL` | `gpt-6-luna` (OpenAI), `claude-haiku-4-5` (Anthropic) | the flyer's and the share text's model |
| `AI_MODELS` | unset: the picture read runs on `gpt-6.1-sol` (OpenAI) or `claude-sonnet-5-5` (Anthropic), the rest on `AI_MODEL` | a feature's own model, as `feature:model` pairs separated by commas (`photo:<model>`). One provider and one key serve them all. The read has a default of its own because the fast models misread handwriting; `AI_MODEL` does not change it, only its own pair does, and that model must read pictures |
| `AI_EFFORT` | unset | the provider's effort setting (`low` answers sooner). One for the whole site: leave it unset when any feature runs on a model that refuses it, as `claude-haiku-4-5` does |
| `AI_TIMEOUT_MS` | `25000` | how long a generation waits for the provider: a positive whole number |
| `AI_ENABLED` | on, with a provider and its key | `0` switches the whole AI off and keeps the key and the features |

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

**The AI on the PHP host** is the `ai` block of `config.php` (`docs/deploy.md`, *The AI assistant*):
`provider`, `apiKey` and `features`, and optionally `dailyLimit`, `dailyLimits`, `model`, `effort`,
`timeoutMs` and `enabled`, the same nine settings as the `AI_*` ones above. It needs PHP's curl, which
the preflight page checks. A release refuses a `config.php` with a key that came after it:
`dailyLimits` comes out before going back to the release of 2026-10-06 (`2ad58f28364e`), `features`
and `dailyLimit` as well before one built before that day, and the whole block before one built
before 2026-10-03 (`docs/deploy.md`, *Rolling back*).

**Against a local copy of a deployment** (a Laragon folder): `npm run deploy:update` puts the
current release there; `npm run deploy:backup`, `deploy:restore` and `deploy:reset` handle its
library (`docs/deploy.md`, *Backups*); and the checks run with
`CONTRACT_BASE_URL` in `.env` (`docs/deploy.md`, *Checking from the computer with the checkout*).
A Laragon copy answers over https only, with Laragon's own certificate, which Node does not trust.
Name it before a check or an `ai:smoke --to` there:

```sh
$env:NODE_EXTRA_CA_CERTS = 'C:\laragon\etc\ssl\laragon.crt'      # PowerShell; Git Bash: NODE_EXTRA_CA_CERTS='C:\laragon\etc\ssl\laragon.crt' npm run …
npm run ai:smoke -- --to https://localhost/nest-flyers-php/
```

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
duplicate and archive. Then output canvases: every flyer previews and downloads as an Instagram
story or a WhatsApp 3:4 image (`docs/reports/output-canvases.md`). Then handoff step 8, the
**This week** template, on both canvases and both backends (`docs/reports/week-template.md`).

Built, on branch `feat/ai-assistant` (`docs/reports/ai-assistant.md`): the **AI assistant**, on both
backends. "Create with AI" writes a flyer from a staff member's text, and "Write with AI" a flyer's
share text, with OpenAI or Anthropic behind one seam, at most 3 generations a day of each unless a
site sets its own. Each feature has its own switch (`docs/reports/ai-feature-switches.md`) and its own
daily limit (`docs/reports/ai-flyer-from-photo.md`): a site runs the ones it names, and it is off until
a site has a key and names them.

Next (handoff steps 7 and 9): per-element drag/nudge with snapping and safe-box clamping,
font-size multipliers, contrast-checked colour swatches, block reorder, Reset to template; the
doodle picker and staff doodle uploads. The data model already stores `overrides`, `colors` and
`doodles[]` for them.

Each hostel's badge prints beside the Nests wordmark, for a pilot: `assets/logos/<slug>.png`,
switched on per hostel by `logo_path` in `seed/hostels.json`, and one setting for every flyer,
`EYEBROW_MARKS` in `src/shared/defaults.ts` (`docs/reports/open-items.md`).

Open items: the eyebrow's final format after the pilot · licensed event photos · whether
`pill-teal.png` from the Canva export should join the built-in art.
