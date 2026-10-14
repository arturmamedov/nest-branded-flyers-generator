# CLAUDE.md — Nest Branded Flyers Generator

Internal tool: Nests Hostels staff fill in a form, drop a photo, download the flyer as a 1080 × 1920
Instagram story or a 1080 × 1440 WhatsApp image (one flyer, two output canvases). Read `README.md` (how to run and deploy) and `design_handoff_flyer_generator/README.md` (the spec:
geometry, tokens, fit algorithm, data model, API, export) before changing anything visual or structural.

## Commands

```sh
npm run dev            # Express + Vite middleware on http://127.0.0.1:8787 (API, editor, render page)
npm run seed:dev       # hostels + built-in doodles into ./data/flyers.db (idempotent)
npm run seed:samples   # the six design records and three This week flyers, both stress tests included (dev only)
npm run typecheck      # client + server
npm test               # Vitest: shared logic, shared vectors, the editor's history guard, storage contract per driver,
                       # generated files current
npm run test:contract  # HTTP contract suite on every backend, php-basic (behind a login), php-access (the lock over
                       # HTTP), cross; CONTRACT_BASE_URL (+ _BASIC_USER/_PASSWORD) in .env targets a deployment
npm run gen            # regenerate schema/*.json, seed/samples.json, the error table in docs/api-contract.md
npm run gen:art        # remake the template's blobs and photo sparks in each other's ink (four derived files in assets/art/)
npm run test:render    # builds dist/ and dist-proof/ when their inputs changed, then Playwright: render/export checks,
                       # client-export fidelity, the AI page on the fake, and the looks specs on the tests' own build
                       # (the proof look)
npm run build:proof    # the tests' own build, dist-proof/: the release's client with the proof look (never shipped)
npm run test:php       # PHPUnit (PHP_BIN picks the interpreter; composer test in php/ does the same)
npm run test:php-smoke # the editor driven against the PHP backend in a browser (builds dist/ when its inputs changed)
npm run build:php      # the shared-hosting release in release/php/ (with release.json), and the preflight page beside it
npm run deploy:backup  # a local deployment's library to ./backups/ (deploy:restore, deploy:reset); docs/deploy.md
npm run deploy:update  # a newer release over a local copy of a deployment: backup, build, additive copy, git tag
npm run deploy:tag     # the git tag release/<id> for a deployed release (a folder, or a site's address); never pushes
npm run copy           # move a library between storage drivers (SQLite <-> JSON files)
npm run ai:smoke       # one real AI generation by hand, with .env's AI_PROVIDER and AI_API_KEY (--share: a share text;
                       # --photo <picture | image example .json>: a picture read, --save <file> the picture as sent;
                       # --to <app root>: through a site, spending one of that feature's generations for the day; it
                       # stops before spending when the feature it would call is off there). Never part of a test
npm run compare:design # reference pixel-diff vs the prototype (dev server running)
npm run build          # vite build → dist/, tsc → dist-server/
```

- `npm run test:render -- tests/render/pill.spec.ts` runs one spec: the arguments reach `playwright test`
  (`--project render`, `-g "<title>"` too).
- `test:render` and `test:php-smoke` build through `scripts/build-if-changed.ts`: a hash of everything a build reads,
  kept in `dist/.inputs-hash` and `dist-proof/.inputs-hash`. `FORCE_BUILD=1 npm run test:render` builds anyway.
  `npm run build` and `build:php` always build.

Before calling work done: the gates of the session's tier ("Ceremony tiers", below). The full gate,
`npm run typecheck && npm test && npm run test:contract && npm run test:render` all green, is mandatory before a
merge to `main` and before any release. Look at UI changes in a real browser (Chrome) — the preview and a downloaded
export.

## Architecture (where things live)

A map: each area in a line or two. Its full text, every rule with its date and its why, is under the same heading in
`docs/architecture.md`: read an area's section there before changing it.

- **[The renderer](docs/architecture.md#the-renderer)**: `src/flyer/Flyer.tsx`, **the only renderer**. The editor
  preview, the export page and the library cards mount it. Never a second one (canvas redraw, server template).
- **[The fit](docs/architecture.md#the-fit)**: `src/flyer/fit.ts`, the prototype's `_fit()`, each line stopping at its
  own `data-fit-min` floor. Keep the `data-fit*` attributes. `ready.ts` loads fonts and images and fits before export.
- **[Shared logic](docs/architecture.md#shared-logic)**: `src/shared/`, DOM-free, for client and server: `schema.ts`
  (zod, the data's source of truth), `layout.ts` (`CANVASES`), `defaults.ts`, `week.ts`, `text.ts`, `labels.ts`,
  `ai.ts`… `.js` imports. The browser never imports a value from `schema.ts`, nor anything from `samples.ts`.
- **[Looks](docs/architecture.md#looks)**: a flyer prints in a look (`src/shared/looks.ts`, `looks/handDrawn.ts`);
  `data.look`, an enum, the data's last key. No `if (look === …)`: components read tokens. The proof look
  (`tests/proof/`, `dist-proof/`) never ships. Adding one: `docs/adding-a-look.md`.
- **[The editor and the render page](docs/architecture.md#the-editor-and-the-render-page)**: `src/editor/` (the
  editor and the library); `render.html` and `src/render/`, the bare page headless Chromium shoots.
- **[Library cards](docs/architecture.md#library-cards)**: each card draws its flyer with the same `<Flyer>`
  (`FlyerThumb.tsx`), asked for when it nears the screen. Never a stored thumbnail.
- **[The reception flyer](docs/architecture.md#the-reception-flyer)**: the printed poster under the cards, as PNG and
  PDF from `assets/main-flyers/` (`MAIN_FLYER` in `Library.tsx`). No card, never filtered.
- **[Library views](docs/architecture.md#library-views)**: list or grid (`libraryView.ts`), the lightbox
  (`Lightbox.tsx`), the editor's ways out on every card (`pictureActions.ts`, `WaysOut.tsx`). One fetch per card;
  never add the caption to the list.
- **[Labels](docs/architecture.md#labels)**: `FLYER_LABELS` in `src/shared/labels.ts`, never printed, one rule on both
  backends. A label is held to a slug's shape, never to the list: never make `data.labels` an enum. No grouping.
- **[Library search](docs/architecture.md#library-search)**: `librarySearch.ts` (the rule) and `libraryFlyers.ts` (one
  store of answers per visit), the browser alone. The store saves the request, never the drawing.
- **[The top bar](docs/architecture.md#the-top-bar)**: `<nest-nav tool="flyers">` from `nestpass.ai/kit`, on the
  library alone. Browser specs import `test`/`expect` from `tests/browser.ts`, which blocks the script.
- **[Toasts](docs/architecture.md#toasts)**: what a focus page says about its flyer (`Toasts.tsx`, `toastFolds.ts`).
  A note never takes space from the flyer.
- **[The form folds](docs/architecture.md#the-form-folds)**: `.panel` and its sections (`panel.tsx`,
  `sectionFolds.ts`), in the order a flyer is made. `SECTIONS` and `Editor.tsx` change together.
- **[The ways out](docs/architecture.md#the-ways-out)**: copy, share, PNG and JPG, all through `picture(format)` in
  `Editor.tsx`. `copyImage()` is called inside the tap; `clipboard.ts` is the one way to the clipboard.
- **[The leave guard](docs/architecture.md#the-leave-guard)**: `leaveGuard.ts` and `route.ts`. Replace the entry's
  URL through `replaceHash(from, to)`, never `history.replaceState`.
- **[The Node server](docs/architecture.md#the-node-server)**: `server/`, Express 5, append-only SQLite migrations,
  sharp, the Playwright export; storage behind `server/storage/` (`sqlite`, `json`).
- **[The PHP backend](docs/architecture.md#the-php-backend)**: `php/`, the same API on PHP 8.1+ with the JSON store.
  A peer of `server/`, never a fork: both answer `docs/api-contract.md`.
- **[Generated files](docs/architecture.md#generated-files)**: `schema/` and `seed/samples.json`, made from
  `src/shared/` by `npm run gen`. A rule is written once in TypeScript, never hand-copied into PHP.
- **[The client export](docs/architecture.md#the-client-export)**: `src/editor/export/`, the export in the browser
  where a backend has no renderer. `fidelity.spec.ts` holds it to the server's.
- **[The AI assistant](docs/architecture.md#the-ai-assistant)**: an idea → a flyer, a flyer → its share text, a
  picture → its words. `server/ai/` and `php/src/Ai/` are twins behind one provider seam, each feature with its own
  switch and limit. No test touches a provider: `npm run ai:smoke` alone, by hand.
- **[Releases and git](docs/architecture.md#releases-and-git)**: a release's id names a build, `release.json` its
  commit (`scripts/git.ts`); `deploy:tag`, `deploy:update`. Git tests run on a throwaway repository.

## Non-negotiables (from the handoff — don't "fix" them)

- Safe zones are hard limits **per canvas**: the story's 250 top, 300 bottom, 70 sides; WhatsApp's 40 all
  round. Text/blocks stay inside; only art (and the full-bleed photo, horizontally) may enter the margins.
- `#53CED1` is never text on cream (contrast). Text teal is `#0D6F82`. Orange `#EA580C` is never flyer ink.
- Fonts are self-hosted (@fontsource, pinned); family names only in `src/shared/fonts.ts`.
- Optional fields collapse — no placeholders, no empty boxes, no dangling `·`.
- The hand-drawn style deliberately departs from the Nests website design system. Keep it.
- No login by design, so: loopback bind by default, every write needs the `X-Nest-Flyers: 1` header
  (defined once in `src/shared/writeGuard.ts`; PHP reads it from `schema/shared.json`), and the app must never
  be publicly reachable without an access rule.
- Never invent hostel names — only Artur supplies them (`seed/hostels.json`).

## Design decisions already made

One line each, so no session "fixes" them. The full text, with the owner's words, is in `docs/design-decisions.md`.

- **[The layout pass](docs/design-decisions.md#the-layout-pass)** (2026-09-18): headline at 345, sparks on the
  photo's top corners, no clock. `compare:design` is a reference report, not a gate.
- **[Photo crop](docs/design-decisions.md#photo-crop)**: per flyer in `data.photoCrop` (focal x/y, zoom ¼–4×).
- **[Output canvases](docs/design-decisions.md#output-canvases)** (2026-09-23): the canvas is how a flyer is printed,
  never flyer data; one crop serves every canvas. A viewer who never chose sees WhatsApp; the API keeps `story`.
- **[The editor pass](docs/design-decisions.md#the-editor-pass)** (2026-09-28): a new flyer lands "In a frame";
  `MAX_EXCLAMATIONS` exclamation marks, and the pill's own is free.
- **[This week](docs/design-decisions.md#this-week)** (2026-09-29): 15 px between rows; the title lines are the
  headline's fields; rows typed or taken from a saved flyer; the row's four departures from the prototype.
- **[The open items](docs/design-decisions.md#the-open-items)** (2026-09-30): each line's fit floor (a WHERE chip
  2 px into its padding, accepted); an untitled week flyer's name; a badge per hostel, `EYEBROW_MARKS` a pilot.
- **[The tag pill and the art](docs/design-decisions.md#the-tag-pill-and-the-art)** (2026-10-12): **never change a
  number or a slug in `DEFAULT_DOODLES`**. The pill one fitted line, a tag of 24; the spark hangs from the pill and
  goes with it; the blobs and the photo's sparks trade inks; the pencil after the ask; hand-arranged art as stored.
- **[The WHEN chip and the Spanish line](docs/design-decisions.md#the-when-chip-and-the-spanish-line)** (2026-10-09):
  the time one line that shrinks; the Spanish line 260; no "Book now" or slash warning.
- **[The AI copy rules](docs/design-decisions.md#the-ai-copy-rules)** (2026-10-06): no price the text does not give;
  no full stop ending a title line; the share text English first, then `-- 🇪🇸 --`; a range as `17:45-23:00`.

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
- A session records its work in its report and in one line of the log in `docs/status.md`, never in CLAUDE.md,
  unless it changes a rule, a command or the map.

### Ceremony tiers

A session names its tier in its first answer, with one line of why. Artur may raise it. When in doubt, the higher
tier.

| Tier | When | What it does |
|---|---|---|
| **Small** | Copy, a token, a CSS rule, one visual nudge, a test fix, docs. No schema, API, storage or PHP change. | The tests nearest the change (the spec or unit file named), typecheck, one look in Chrome at the width it concerns. A commit message; no report, no CLAUDE.md entry, no memory entry unless Artur gives a new rule. |
| **Medium** | A feature in one layer (the editor, the renderer) with no data or API change. | Small's, plus the full gate once at the end (`typecheck`, `test`, `test:contract`, `test:render`). A short section in an existing report or a new short one. Screenshots on one backend: a client-only change draws the same pixels on both. |
| **Large** | A schema or data change, an API change, anything in `php/` or `server/`, a migration, a release, the AI's prompts, anything that changes a printed flyer for stored flyers. | Today's full process: brainstorm, plan approved, tests first, the full gate plus `test:php` and `test:php-smoke`, a fresh-context review, screenshots on both backends, a signed sheet for a print change, a report, the status line. |

- The fresh-context review is for Large alone.
- Screenshots on both backends only when a backend changed, or the change is Large.
- A sheet of every sample before and after stays mandatory for any change to the print (it is Artur's own rule), at
  any tier: a print change is never Small.
- The full gate is mandatory before a merge to `main` and before any release, whatever the tiers of the work in it.

## Status

- Now: `main`, ahead of origin by the library's search and the faster sessions, unpushed. Next: the real second look
  (`docs/prompts/second-look.md`).
- Live: IONOS runs release `81639a1deb21` (from `74b6761`), unlocked; it goes public only once a real login exists.
- Everything else, open, waiting, Artur's to do and to decide, and the history: [docs/status.md](docs/status.md).
