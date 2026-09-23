# CLAUDE.md — Nest Branded Flyers Generator

Internal tool: Nests Hostels staff fill in a form, drop a photo, download a 1080 × 1920 Instagram-story
flyer. Read `README.md` (how to run and deploy) and `design_handoff_flyer_generator/README.md` (the spec:
geometry, tokens, fit algorithm, data model, API, export) before changing anything visual or structural.

## Commands

```sh
npm run dev            # Express + Vite middleware on http://127.0.0.1:8787 (API, editor, render page)
npm run seed:dev       # hostels + built-in doodles into ./data/flyers.db (idempotent)
npm run seed:samples   # the six design records incl. the stress test (dev only)
npm run typecheck      # client + server
npm test               # Vitest: shared logic, shared vectors, storage contract per driver, generated files current
npm run test:contract  # HTTP contract suite on every backend (CONTRACT_BASE_URL=… for a deployment)
npm run gen            # regenerate schema/*.json, seed/samples.json, the error table in docs/api-contract.md
npm run test:render    # builds, then Playwright render/export checks + client-export fidelity
npm run test:php       # PHPUnit (PHP_BIN picks the interpreter; composer test in php/ does the same)
npm run test:php-smoke # the editor driven against the PHP backend in a browser
npm run build:php      # the shared-hosting release in release/php/
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
  shape), `layout.ts` (every box position), `defaults.ts` (tokens + template art), `chips.ts` (the `·`
  convention), `photo.ts` (crop maths), `copyRules.ts`. Relative imports here use `.js` extensions (NodeNext).
- `src/editor/` — editor + library UI. `render.html` + `src/render/` — the bare page headless Chromium shoots.
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

- Safe zones are hard limits: 250 top, 300 bottom, 70 sides. Text/blocks stay inside; only art (and the
  full-bleed photo, horizontally) may enter the margins.
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
  step 8 (This week template), step 9 (doodle picker + icon uploads).
- Done: the PHP shared-hosting port, phases 2–5 (branch `feat/php-shared-hosting`): the seams, the PHP
  backend, the Node JSON driver and the copy tool, the release and the Laragon verification. The report is
  `docs/reports/php-port.md`; the briefs are `docs/prompts/php-shared-hosting*.md`.
- Next planned: deploy readiness for a real shared host — brief in `docs/prompts/php-deploy-readiness.md`.
  It proves the access rule over HTTP (no test does today), gives the release a manifest, adds a standalone
  preflight page the owner uploads first, and rehearses the whole deploy on Apache.
- Open: 10 of 13 hostel names, per-hostel logos, the real host (and its access rule — the local Laragon
  deploy runs with `allowPublic`).
