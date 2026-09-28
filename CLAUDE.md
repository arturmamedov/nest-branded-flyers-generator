# CLAUDE.md — Nest Branded Flyers Generator

Internal tool: Nests Hostels staff fill in a form, drop a photo, download the flyer as a 1080 × 1920
Instagram story or a 1080 × 1440 WhatsApp image (one flyer, two output canvases). Read `README.md` (how to run and deploy) and `design_handoff_flyer_generator/README.md` (the spec:
geometry, tokens, fit algorithm, data model, API, export) before changing anything visual or structural.

## Commands

```sh
npm run dev            # Express + Vite middleware on http://127.0.0.1:8787 (API, editor, render page)
npm run seed:dev       # hostels + built-in doodles into ./data/flyers.db (idempotent)
npm run seed:samples   # the six design records incl. the stress test (dev only)
npm run typecheck      # client + server
npm test               # Vitest: shared logic, shared vectors, storage contract per driver, generated files current
npm run test:contract  # HTTP contract suite on every backend, php-basic (behind a login), php-access (the lock over
                       # HTTP), cross; CONTRACT_BASE_URL (+ _BASIC_USER/_PASSWORD) in .env targets a deployment
npm run gen            # regenerate schema/*.json, seed/samples.json, the error table in docs/api-contract.md
npm run test:render    # builds, then Playwright render/export checks + client-export fidelity
npm run test:php       # PHPUnit (PHP_BIN picks the interpreter; composer test in php/ does the same)
npm run test:php-smoke # the editor driven against the PHP backend in a browser
npm run build:php      # the shared-hosting release in release/php/ (with release.json), and the preflight page beside it
npm run deploy:backup  # a local deployment's library to ./backups/ (deploy:restore, deploy:reset); docs/deploy.md
npm run copy           # move a library between storage drivers (SQLite <-> JSON files)
npm run compare:design # reference pixel-diff vs the prototype (dev server running)
npm run build          # vite build → dist/, tsc → dist-server/
```

Before calling work done: `npm run typecheck && npm test && npm run test:contract && npm run test:render` all green, and look at UI
changes in a real browser (Chrome) — the preview and a downloaded export.

## Architecture (where things live)

- `src/flyer/Flyer.tsx` — **the only renderer.** The editor preview and the export page both mount it.
  Never create a second renderer (canvas redraw, server template, etc.): if preview and export can drift,
  they will.
- `src/flyer/fit.ts` — the prototype's `_fit()` ported verbatim (two-pass shrink-to-fit). Keep the
  `data-fit*` attributes. `ready.ts` loads fonts/images and fits before any export.
- `src/shared/` — DOM-free, used by client **and** server: `schema.ts` (zod, source of truth for the data
  shape), `layout.ts` (the `CANVASES` registry: every canvas's size, safe zones, box positions and art
  anchor points; a new canvas is one entry), `defaults.ts` (tokens + template art), `chips.ts` (the `·`
  convention), `photo.ts` (crop maths), `copyRules.ts`. Relative imports here use `.js` extensions (NodeNext).
- `src/editor/` — editor + library UI. `render.html` + `src/render/` — the bare page headless Chromium shoots.
- The editor's top bar is `<nest-nav tool="flyers">` (`App.tsx`), the bar every Nests tool shares.
  - It is loaded `async` from `https://nestpass.ai/kit/nest-nav.js`. That file lives in the
    `nestpass-tools` repo (`A:\serverpath\laragon\nestpass-tools`), with the list of tools and the
    contract.
  - Its shadow root draws the bar. `editor.css` styles only the editor's own links (the default
    slot) and the `slot="fallback"` brand, which shows at the same 54 px until the script runs or
    if it can't be reached.
  - Browser specs import `test`/`expect` from `tests/browser.ts`, which blocks the script.
    `tests/render/chrome.spec.ts` holds both states.
- `server/` — Express 5 API, append-only SQLite migrations (`server/db/migrations.ts`), photo processing
  (sharp), Playwright export with a content-hash cache. Storage lives behind `server/storage/` (the
  `sqlite` and `json` drivers, chosen by `STORAGE` in `server/composition.ts`) and the copy tool.
- `php/` — **the second backend**: the same API on PHP 8.1+ with the JSON store, for shared hosting with no
  Node. `php/web/` is the release root (api.php, router.php, the .htaccess hardening); `npm run build:php`
  assembles `release/php/`. It is a peer of `server/`, never a fork: both answer `docs/api-contract.md`.
- `schema/`, `seed/samples.json` — **generated** (`npm run gen`) from `src/shared/`. PHP reads them at
  runtime, so a rule is written once in TypeScript and never hand-copied into PHP.
- The export runs in the browser where a backend has no renderer (`src/editor/export/`): same `<Flyer>`,
  same `prepareFlyer()`, modern-screenshot. `tests/render/fidelity.spec.ts` holds it to the server export.

## Non-negotiables (from the handoff — don't "fix" them)

- Safe zones are hard limits **per canvas**: the story's 250 top, 300 bottom, 70 sides; WhatsApp's 40 all
  round. Text/blocks stay inside; only art (and the full-bleed photo, horizontally) may enter the margins.
- `#53CED1` is never text on cream (contrast). Text teal is `#0D6F82`. Orange `#EA580C` is never flyer ink.
- Fonts are self-hosted (@fontsource, pinned); family names only in `src/shared/fonts.ts`.
- Optional fields collapse — no placeholders, no empty boxes, no dangling `·`.
- The hand-drawn style deliberately departs from the Nests website design system. Keep it.
- No login by design, so: loopback bind by default, every write needs the `X-Nest-Flyers: 1` header, and
  the app must never be publicly reachable without an access rule.
- Never invent hostel names — only Artur supplies them (`seed/hostels.json`).

## Design decisions already made

- The team's layout pass (2026-09-18) departs from the prototype on purpose: headline at 345, sparks
  anchored to the photo's top corners, no clock. The numbers live in `layout.ts` / `defaults.ts` with
  comments. `compare:design` is a reference report now, not a gate.
- Photo crop is stored per flyer in `data.photoCrop` (focal x/y + zoom ¼–4×, free positioning, the photo's
  centre stays in the frame).
- Output canvases (2026-09-23, `docs/reports/output-canvases.md`): the canvas is how a flyer is printed,
  never flyer data (a per-viewer toolbar choice; the export API takes `canvas`, default `story`). One crop
  serves every canvas because each photo frame keeps the story's aspect per mode. The template art follows
  each canvas through render-only anchors (`resolveDoodles`), so stored doodles never changed and an older
  release still reads every flyer. Every canvas is fitted in the editor, the others offscreen with the same
  `<Flyer>`. The story renders byte-identical to before (`tests/render/baseline.spec.ts`, opt-in).

## How to work here

- **SOLID and DRY, always** (the owner's standing rule). Infrastructure sits behind interfaces with
  config-selected implementations that are substitutable (Liskov) — prove substitutability with shared
  contract tests run against every implementation. One source of truth per fact (schema, seed, layout,
  renderer); generate derived copies rather than hand-maintaining them. No speculative abstractions
  beyond real seams.
- Match the surrounding code: inline styles in the renderer, no global CSS resets in the editor (they
  leak into the flyer), functional state updates, comments that explain *why*.
- Data changes go through a new migration; never edit an applied one.
- The owner often runs `npm run dev` (tsx watch). Server/shared edits restart it and reload the editor —
  warn before large edits if they may have unsaved work.
- Git: work on a feature branch, commit only when asked, never push unasked.

## Status

- Done: handoff build steps 1–6 (branch `feat/flyer-generator-mvp`).
- Waiting, don't start unasked: step 7 (drag/nudge everything on the canvas, sizes, colours, order, reset),
  step 8 (This week template), step 9 (doodle picker + icon uploads). With two canvases: step 7's stored
  `overrides` (dx/dy) are shared by every canvas, so it must decide how they apply per canvas; step 8's
  `WEEK` boxes are story-only today; step 9, when it stores the render-only anchors (`bottomLeft`,
  `bottomRight`, `floor`), must add a JSON migration id so an older release refuses the store cleanly.
- Done: output canvases, Instagram story 9:16 + WhatsApp 3:4 (branch `feat/output-canvases`, 2026-09-23).
  The review is `docs/reports/output-canvases-review.md`, the report `docs/reports/output-canvases.md`.
- Done: the PHP shared-hosting port, phases 2–5 (branch `feat/php-shared-hosting`): the seams, the PHP
  backend, the Node JSON driver and the copy tool, the release and the Laragon verification. The report is
  `docs/reports/php-port.md`; the briefs are `docs/prompts/php-shared-hosting*.md`.
- Done: deploy readiness (`docs/prompts/php-deploy-readiness.md`, same branch, 2026-09-23). It adds:
  - the access rule proven over HTTP (`tests/access`), and the checks can sign in (`.env`, `scripts/env.ts`);
  - `release.json` and the host facts in `api/config`;
  - the preflight page (`php/preflight/`);
  - `docs/deploy.md`, the owner's single copy of the deploy steps, with backup/restore/reset;
  - an Apache rehearsal, recorded in `docs/reports/php-port.md` and `docs/reports/host-facts.md`.
  `seed/hostels.json` now has all 14 hostels.
- Built: the shared top bar (branch `feat/shared-nav`, 2026-09-27; the plan's decisions are in
  `nestpass-tools/README.md`).
  - The same bar runs in Flyers, Newsletter, QR and Social vanity URLs (`nestpass.ai/vanity/`, in the
    website repo `H-Nests/www_cur/tools/vanity-links`), and the tools page `nestpass.ai/` lists them.
  - Live since 2026-09-28: SSL, the tools page and the kit, and Flyers and Newsletter with the bar.
    QR's part is on its branch `claude/shared-nav-7477311f`.
  - Still open: this app answered without a password on 2026-09-28 (`allowPublic`), while the public
    tools page links to it. The lock is `docs/deploy.md` steps 3–4.
- **Not live, by the owner's decision:** the host is IONOS (`https://nestpass.ai/activities/`), and the app
  goes public only once a real login exists. That login (Supabase, or the Laravel app as the issuer) is its
  own brief, and is not to be started unasked. It will have to exempt a sign-in route from the access check,
  and decide what guards the static files.
- IONOS answered the preflight page on 2026-09-28 (the IONOS column of `docs/reports/host-facts.md`):
  PHP 8.4 under FastCGI, gd, every account check green.
  - Its root `.htaccess` was a hand-edited older copy, so `release.json` was served.
  - `http://` was not redirected.
  - The then-shipped full `.htaccess` was refused: 403 on every URL, shown on IONOS's own page with
    a cookie banner. The likely line is `Options -Indexes -MultiViews`.
  - MultiViews is on and cannot be turned off from `.htaccess`.
  So the release's root `.htaccess` is now the one IONOS runs: rewrites, headers and `FilesMatch`
  only, with the https redirect first (taken from `THE_REQUEST`, because of MultiViews).
  `.htaccess-minimal`, step 1b and the separate https example are gone. The lock's `<If>` lines
  (http 403 → redirect) may be refused there too; the block says to delete them if so.
- Open: per-hostel logos; whether the login reaches PHP under FastCGI (the preflight page's *Login*
  line, once a lock is on). The local Laragon deploy
  (`nest-flyers-php`) still runs `allowPublic`, so the contract row that forbids it fails there by design.
  The branch is unpushed, by the owner's choice.
