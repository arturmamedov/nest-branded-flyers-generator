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
npm run test:render    # builds, then Playwright render/export checks + client-export fidelity
npm run test:php       # PHPUnit (PHP_BIN picks the interpreter; composer test in php/ does the same)
npm run test:php-smoke # the editor driven against the PHP backend in a browser
npm run build:php      # the shared-hosting release in release/php/ (with release.json), and the preflight page beside it
npm run deploy:backup  # a local deployment's library to ./backups/ (deploy:restore, deploy:reset); docs/deploy.md
npm run copy           # move a library between storage drivers (SQLite <-> JSON files)
npm run ai:smoke       # one real AI generation by hand, with .env's AI_PROVIDER and AI_API_KEY (--share: a share text;
                       # --to <app root>: through a site, spending one of its 3 for the day). Never part of a test
npm run compare:design # reference pixel-diff vs the prototype (dev server running)
npm run build          # vite build → dist/, tsc → dist-server/
```

Before calling work done: `npm run typecheck && npm test && npm run test:contract && npm run test:render` all green, and look at UI
changes in a real browser (Chrome) — the preview and a downloaded export.

## Architecture (where things live)

- `src/flyer/Flyer.tsx` — **the only renderer.** The editor preview and the export page both mount it.
  Never create a second renderer (canvas redraw, server template, etc.): if preview and export can drift,
  they will.
- `src/flyer/fit.ts` — the prototype's `_fit()` (two-pass shrink-to-fit), with one departure: the height pass stops
  each line at its own `data-fit-min` floor, where `_fit()` scaled the whole box down to 0.55 (the owner's call,
  2026-09-30). Keep the `data-fit*` attributes. `ready.ts` loads fonts/images and fits before any export.
- `src/shared/` — DOM-free, used by client **and** server: `schema.ts` (zod, source of truth for the data
  shape), `layout.ts` (the `CANVASES` registry: every canvas's size, safe zones, both templates' box positions
  and art anchor points; a new canvas is one entry), `defaults.ts` (tokens, template art, each template's
  defaults and the switch between them, and `EYEBROW_MARKS`, which marks print at the eyebrow's right),
  `chips.ts` (the `·` convention), `week.ts` (the This week rows: their limits, a row taken from a saved flyer,
  what a row prints — zod-free, so the client imports it and `schema.ts` takes its limits from it), `names.ts`
  (what a flyer is called in the library: an untitled flyer's name, the title's limit, the library's date — also
  zod-free), `share.ts` (the share text's limit: a caption saved with the flyer, copied from the panel or the
  button floating by the preview, never printed), `brief.ts` (`flyerFromBrief`: a flyer from its copy alone, the shape the staff-text
  workflow in `docs/ai-flyers/` writes — zod-free; `BriefSchema` is in `schema.ts`), `photo.ts` (crop maths),
  `copyRules.ts`, `writeGuard.ts` (the write header, and the methods that need none), `ai.ts` (the AI assistant's
  facts: the daily cap, the idea's and the assumptions' limits, the day's zone, the provider defaults, the fake
  provider's markers — zod-free), `samples.ts` (the seed and
  test flyers). Relative imports here use `.js` extensions
  (NodeNext). The client never imports a value from `schema.ts`: that would bundle zod into the editor and the
  export page. Nothing the browser loads imports `samples.ts` either: it imports `seed/hostels.json` for the
  hostels' names, and Vite would bundle the whole seed.
- `src/editor/` — editor + library UI. `render.html` + `src/render/` — the bare page headless Chromium shoots.
- The library's top bar is `<nest-nav tool="flyers">` (`App.tsx`), the bar every Nests tool shares.
  - It is loaded `async` from `https://nestpass.ai/kit/nest-nav.js`. That file lives in the
    `nestpass-tools` repo (`A:\serverpath\laragon\nestpass-tools`), with the list of tools and the
    contract.
  - Its shadow root draws the bar. `editor.css` styles only the app's own links (the default
    slot) and the `slot="fallback"` brand, which shows at the same 54 px until the script runs or
    if it can't be reached.
  - The editor (`#/new`, `#/flyers/:id`) renders no bar: it is a focus page. Its way back is the
    panel's sticky "← Library"; the bar comes back only if the app can't load.
  - Browser specs import `test`/`expect` from `tests/browser.ts`, which blocks the script.
    `tests/render/chrome.spec.ts` holds both states; `tests/editor.ts` has the helpers that drive
    the editor (the render suite and the PHP smoke test share them).
- Leaving the editor with unsaved work asks first, on every way out (`src/editor/leaveGuard.ts`).
  `src/editor/route.ts` cancels a refused move in the Navigation API's `navigate` event (every major
  browser since January 2026), so it never happens. A Back or Forward the browser won't let the page
  cancel (no fresh interaction) is let through, the page on screen stays, and the tab returns to its
  entry by key. Replace the current entry's URL through `replaceHash(from, to)` (the editor's first
  save), never with `history.replaceState` directly: it skips a page the user has left, and waits while
  such an undo is on its way. A late answer checks the page in the URL (`onPage`), not React's unmount,
  which comes a few tasks after the move. Browsers without the API route on `hashchange` and ask only
  on "← Library" and on leaving the page. `tests/unit/route.test.ts` drives `createMoveGuard` through
  every case, the uncancellable Back included; `tests/render/editor.spec.ts` drives Chromium.
- `server/` — Express 5 API, append-only SQLite migrations (`server/db/migrations.ts`), photo processing
  (sharp), Playwright export with a content-hash cache. Storage lives behind `server/storage/` (the
  `sqlite` and `json` drivers, chosen by `STORAGE` in `server/composition.ts`) and the copy tool.
- `php/` — **the second backend**: the same API on PHP 8.1+ with the JSON store, for shared hosting with no
  Node. `php/web/` is the release root (api.php, router.php, the .htaccess hardening); `npm run build:php`
  assembles `release/php/`. It is a peer of `server/`, never a fork: both answer `docs/api-contract.md`.
- `schema/`, `seed/samples.json` — **generated** (`npm run gen`) from `src/shared/`. PHP reads `schema/` at
  runtime, so a rule is written once in TypeScript and never hand-copied into PHP; `seed/samples.json` is read
  only by PHP's tests.
- The export runs in the browser where a backend has no renderer (`src/editor/export/`): same `<Flyer>`,
  same `prepareFlyer()`, modern-screenshot. `tests/render/fidelity.spec.ts` holds it to the server export.
- The AI assistant: an idea → a flyer (`POST api/ai/flyer`) and a flyer → its share text (`POST api/ai/share`),
  one contract on both backends (`docs/api-contract.md`, "The AI assistant").
  - `server/ai/` and `php/src/Ai/` are twins: the provider seam (`LlmProvider`: OpenAI, Anthropic, and a fake for
    the tests; which one runs is configuration, never code), the prompt builder, the service with its checks in
    the contract's order, and the actor and the policy, which are the seam a login will fill.
    `tests/fixtures/ai-*.json` pin both backends: a change to an adapter, the prompt or a schema dialect is a
    vector first.
  - One source for everything shared: `src/shared/ai.ts`, the AI schemas in `schema.ts`, the rules in
    `ai/prompts/`, the examples in `docs/ai-flyers/examples/`. `npm run gen` writes `schema/ai.json` (the prompts
    with their limits, the few-shot, the schemas) and the `ai` block of `schema/shared.json`.
  - The model's answer only ever becomes data held to `AiFlyerAnswerSchema` / `AiShareAnswerSchema`. A flyer's
    answer always carries its share text (required there, not in `BriefSchema`): one generation is a whole flyer.
  - Settings: `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_EFFORT`, `AI_TIMEOUT_MS`, `AI_ENABLED` in `.env` (Node);
    the `ai` block of `config.php` (PHP). Off without a key, and then nothing of it shows. The key never reaches
    `api/config`, a log line, the ledger, a release or git, and a refusal names a setting, never its value.
  - The ledger (`aiUsage` in each storage driver; `ai-usage/YYYY-MM.json` in the JSON store) keeps one append-only
    record per generation attempted. The cap (`AI_DAILY_LIMIT`, 3) is the count of the Canary Islands day's `ok`
    records for the actor: today one anonymous actor, so site-wide.
  - The client: `src/editor/AiPage.tsx` (`#/ai`, a focus page like the editor), `handoff.ts` (the unsaved flyer
    handed to the editor in memory), `panel.tsx` and `share.tsx` (what both focus pages share), and "Write with AI"
    in `Editor.tsx`.
  - No test touches a provider. The render suite has two projects: `render` (every spec but `ai.spec.ts`, the AI
    off whatever `.env` holds) and `ai` (`ai.spec.ts` on a second server with the fake, port 8798, spending
    exactly the day's 3). The contract suite's `node-ai` and `php-ai` run the AI routes on the fake.
  - `npm run ai:smoke` (`scripts/ai/smoke.ts`) is the one thing that calls a real provider, by hand.
    `scripts/site.ts` is how a script calls a site's API (`flyers:post` too): it never follows a redirect.

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
- The owner's editor pass (2026-09-28) supersedes two handoff lines; the handoff itself stays as
  delivered:
  - a new flyer, and a photo dropped on "No photo", land "In a frame" (`DEFAULT_PHOTO_MODE` in
    `defaults.ts`; §1 item 4 said full bleed);
  - the copy may use `MAX_EXCLAMATIONS` exclamation marks (`copyRules.ts`), and the tag pill's own
    is free (§12 bullet 1 allowed one per flyer, which the pill always spent).
- The This week template (2026-09-29, `docs/reports/week-template.md`; the owner's answers are quoted there):
  - §3's "22px between week rows" is superseded: 15 px, as §2 explains (at 138/22 the fifth row crossed the ask).
  - The title lines are the headline's fields (`text.headline1/2/headlineEs`), prefilled and editable; the
    Spanish line follows the hostel while it still reads as the default. The handoff's §6 table marked those
    fields Activity-only and the prototype fixed the lines: both superseded.
  - Rows are typed, or taken from a saved Activity flyer as a copy. Fewer than five sit at the top of the
    five-row box. Switching template keeps every field; only untouched defaults follow (`switchTemplate`).
  - A price with a `·` prints on two lines, as the COST chip does.
  - The row departs from the prototype in four places (`Flyer.tsx`, `WeekRow`): the time and price are capped
    at 250 px so a long one shrinks instead of squeezing the name, the name can shrink below its longest word,
    every empty cell collapses, and the day wraps in its own fit box (114 px, 2026-09-30), so a day too tall for
    the row shrinks instead of spilling out. A shrunk day that wraps again can end its highlighter a few px past
    the column, and the editor then calls it cut off: accepted by the owner rather than changing `fit.ts`.
  - The photo-corner sparks hang from the first row's corners, 7 px lower (`artDrop`: their tilted ink
    otherwise reaches into the title box). WhatsApp's week: title 162/250, rows 464 → 1134. Both signed off
    from proof sheets on 2026-09-29.
  - English and Spanish fields carry a drawn flag in the editor (`LangFlag.tsx`; emoji flags are letters on
    Windows). Nothing of it reaches a flyer.
- The open items (2026-09-30, `docs/reports/open-items.md`; the owner's answers are quoted there):
  - The fit's height pass stops each line at its floor (`fit.ts`). At its floors the stress sample's address takes
    three lines, and on the story its WHERE chip runs 2 px into its own padding, so it counts as clipped and the
    editor says so: accepted by the owner, and the render tests expect exactly that chip.
  - An untitled week flyer whose English title lines are still the defaults is named `This week · <hostel> · <day>`
    (`libraryName`, `names.ts`); every automatic name is cut to the title's 80 code points.
  - Per-hostel badges: one round "ONE PASS · Nest" badge per hostel, in its colour, at `assets/logos/<slug>.png`
    (256 px PNG, transparent outside the disc; the handoff's `uploads/logos/` is superseded: the release ships
    `assets/`). A hostel prints its badge through `logo_path` in `seed/hostels.json` (all 14 on). Which marks print
    is `EYEBROW_MARKS` in `defaults.ts`: `'nests'`, `'hostel'` or `'both'` (the badge beside the wordmark, 20 px
    apart), one setting for every flyer and never per flyer; the owner chose `'both'` for a pilot and will settle on
    one after it. A badge that fails to load drops out, and `ready.ts` waits for what takes its place. The marks may
    shrink in their 56 px row, so the widest eyebrow never pushes them past the safe edge.

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
- Done: step 8, the This week template, on every canvas and both backends (branch `feat/week-template`,
  2026-09-29). The brief is `docs/prompts/week-template.md`, the report `docs/reports/week-template.md`.
- Done: the This week follow-up (branch `feat/week-template-followup`, 2026-09-30; brief
  `docs/prompts/week-template-followup.md`, report: the "Follow-up" section of `docs/reports/week-template.md`).
  - Staff see a named red note when a taken row can't join, a "Try again" when the saved flyers can't load, and
    one action at a time in the editor (a photo dropped meanwhile is refused with a reason).
  - The library applies only its latest answer, and a long day shrinks inside its row.
  - The samples read the hostels' names from `seed/hostels.json`, and eight gaps in the tests are closed.
  - `baseline.spec.ts` takes every sample, lists its cases in `manifest.json`, and names what it skips.
  - Declined by Artur: flagging a slash between two times (`15:00/17:00`).
- Done: the open items (branch `feat/open-items`, 2026-09-30; brief `docs/prompts/open-items.md`, report
  `docs/reports/open-items.md`): the fit's floors, an untitled week flyer's name, the per-hostel badges (a pilot
  at `'both'`), `copy.test.ts`'s timeout, and the baseline's overlays, which are now shot from a context with no
  route (a route made Chrome's raster vary from load to load). Both proof sheets signed off; committed, unpushed.
- Built: flyers from staff text, and the share text (branch `feat/flyer-briefs`, 2026-10-01; the plan's record is
  `docs/ai-flyers/README.md`).
  - `data.share` is a caption saved with the flyer, and never printed. It is defaulted, so no migration; an older
    release drops it (live has kept captions since release `d1f7ddb40170`, 2026-10-01).
  - Staff copy it with "Copy text" under the caption in the panel. A small "Share text" pill also floats over the
    stage's corner and copies it in one tap: bottom-left on desktop, bottom-right on a phone. It takes no layout
    space, so the flyer keeps the whole stage (Artur's markup, 2026-10-01: a card under the preview took too much).
  - `npm run flyers:post` saves briefs on a site through its API (`FLYERS_BASE_URL`, or `--to`). It is idempotent,
    and it records each save in the example file.
  - `docs/ai-flyers/` holds every staff text with its brief (`examples/`): the AI assistant's few-shot and eval
    set. Add a correction there every time Artur makes one. The rules themselves are the prompt files in
    `ai/prompts/`.
  - Seen 2026-10-01: the live host reported `Disk quota exceeded` on `data/` and `uploads/`. Artur freed the IONOS
    space the same day.
- Built: the AI assistant (branch `feat/ai-assistant`, 2026-10-02 to 2026-10-04; brief `docs/prompts/ai-assistant.md`,
  continued by `ai-assistant-continue.md` and `ai-assistant-continue-phase5.md`; report
  `docs/reports/ai-assistant.md`). Committed, unpushed.
  - A "Create with AI" page (`#/ai`) and a "Write with AI" button in the editor's Share text section, on both
    backends, with OpenAI and Anthropic behind one seam. Artur's Phase 0 choices (2026-10-02): `gpt-6-luna` and
    `claude-haiku-4-5` as the default models.
  - Both providers answered real calls on 2026-10-04 (`npm run ai:smoke`), and one went through PHP on the Laragon
    copy. That copy now runs release `8b9c8556afa1` with the AI on: its `config.php` holds an OpenAI key.
  - The real calls found one fault, since fixed: Anthropic left the optional share text out, so
    `AiFlyerAnswerSchema` requires it.
  - Not on the live site yet. IONOS needs the new release, then the `ai` block with a key (`docs/deploy.md`, "The
    AI assistant"). Artur allowed it on live while it is unlocked (2026-10-02): the cap keeps it at 3 a day.
  - Next: Artur runs `docs/prompts/ai-assistant-review.md` in a fresh session on another model. It changes
    nothing; he picks what gets fixed. Don't start it unasked.
  - Known limits: two concurrent requests can both see `remaining: 1`; `claude-haiku-4-5` retires no sooner than
    2026-10-15 (a default: one line of settings changes it); IONOS's FastCGI time limit is unmeasured until a live
    call; Anthropic's first call after the answer's schema changes takes about 20 s of the 25 s limit.
- Waiting, don't start unasked: step 7 (drag/nudge everything on the canvas, sizes, colours, order, reset),
  step 9 (doodle picker + icon uploads). With two canvases and two templates: step 7's stored `overrides`
  (dx/dy) are shared by every canvas, so it must decide how they apply per canvas; step 9, when it stores
  the render-only anchors (`bottomLeft`, `bottomRight`, `floor`), must add a JSON migration id so an older
  release refuses the store cleanly.
- Next, once Artur supplies its prototype: a second flyer style, chosen in the editor while making a flyer.
  Not designed yet.
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
  - Still open: this app answers without a password (`allowPublic`; seen 2026-09-28, still so on
    2026-09-29), while the public tools page links to it. The lock is `docs/deploy.md` steps 3–4.
- Built: the editor as a focus page (branch `feat/editor-focus`, 2026-09-28, cut from `feat/shared-nav`).
  The bar shows on the library only; the editor has a back link, a guard on unsaved work, "In a frame" by
  default and an exclamation budget (the design decisions above).
- Done: the write guard is one constant (branch `refactor/write-header-constant`, 2026-09-29). The header,
  its value and the methods that need none live in `src/shared/writeGuard.ts`. `npm run gen` copies them to
  `schema/shared.json`, and `Shared::writeGuard()` feeds PHP's `WriteGuard`. Both backends, the editor and
  every test read them; only `WriteGuardTest` spells the header out, to pin the rule. PHP reads that block on
  every request, reads included, so upload a release whole: a stale `shared.json` answers 500.
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
- Open: whether the login reaches PHP under FastCGI (the preflight page's *Login* line, once a lock is
  on); the final format of the eyebrow's marks, after the pilot (`EYEBROW_MARKS`). The local Laragon deploy
  (`nest-flyers-php`) still runs `allowPublic`, so the contract row that forbids it fails there by design.
  The branch is unpushed, by the owner's choice.
