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
| `npm test` | shared logic (`·` split, layout, crop maths, copy rules, schema) + the API on a temp DB |
| `npm run test:render` | builds, then renders every sample in all three photo modes: inside the safe box, no overlapping blocks, no clipped text, real fonts loaded, highlighter clone, exports exactly 1080 × 1920 PNG/JPG, cache invalidates on save |
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
| `server/` | Express API, SQLite repos, migrations, photo processing, export renderer |
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
| `RENDER_ORIGIN` | `http://127.0.0.1:PORT` (or `http://HOST:PORT` for a specific IP) | where headless Chromium reaches the app |
| `RENDER_TIMEOUT_MS` | `30000` | per export |

### Backup

Everything is in `DATA_DIR`. Back up the database with SQLite's online backup (safe while
running) plus the uploads folder; `renders/` is a cache and can be skipped.

```sh
sqlite3 /var/lib/nest-flyers/flyers.db ".backup '/backups/flyers-$(date +%F).db'"
rsync -a /var/lib/nest-flyers/uploads/ /backups/uploads/
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
