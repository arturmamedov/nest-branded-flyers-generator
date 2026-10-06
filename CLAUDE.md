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
  and art anchor points; a new canvas is one entry; and `DEFAULT_CANVAS`, the canvas a viewer who never chose
  sees), `defaults.ts` (tokens, template art, each template's
  defaults and the switch between them, and `EYEBROW_MARKS`, which marks print at the eyebrow's right),
  `chips.ts` (the `·` convention), `week.ts` (the This week rows: their limits, a row taken from a saved flyer,
  what a row prints — zod-free, so the client imports it and `schema.ts` takes its limits from it), `names.ts`
  (what a flyer is called in the library: an untitled flyer's name, the title's limit, the library's date — also
  zod-free), `share.ts` (the share text's limit: a caption saved with the flyer, copied from the panel or the
  button floating by the preview, never printed), `brief.ts` (`flyerFromBrief`: a flyer from its copy alone, the shape the staff-text
  workflow in `docs/ai-flyers/` writes — zod-free; `BriefSchema` is in `schema.ts`), `photo.ts` (crop maths),
  `copyRules.ts`, `writeGuard.ts` (the write header, and the methods that need none), `ai.ts` (the AI assistant's
  facts: its features and what each one's generations are called, a feature's daily limit by default and its bound,
  the idea's and the assumptions' limits, the day's zone, the provider defaults, the fake provider's markers, and
  `aiFor`, which reads one feature's own limit and what is left of it off `api/config`'s answer — zod-free),
  `samples.ts` (the seed and
  test flyers). Relative imports here use `.js` extensions
  (NodeNext). The client never imports a value from `schema.ts`: that would bundle zod into the editor and the
  export page. Nothing the browser loads imports `samples.ts` either: it imports `seed/hostels.json` for the
  hostels' names, and Vite would bundle the whole seed.
- `src/editor/` — editor + library UI. `render.html` + `src/render/` — the bare page headless Chromium shoots.
- Each library card shows its flyer (`src/editor/FlyerThumb.tsx`, 2026-10-06): the same `<Flyer>`, on
  `DEFAULT_CANVAS` at its true size, scaled by a transform and prepared with `prepareFlyer()`. Never a stored
  thumbnail.
  - Each card asks `GET api/flyers/:id` for its own flyer when it nears the screen, so the list's contract did
    not change and nothing was added to either backend.
  - The box is the same size waiting, shown or failed. Its width on screen is `--thumb-w` in `editor.css`; the
    flyer's size comes from the registry.
  - It is decoration inside the card's link: `aria-hidden` and `inert`. `tests/render/library.spec.ts` holds
    all of it, and the fitted sizes to the export's.
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
- The AI assistant: an idea → a flyer (`POST api/ai/flyer`), a flyer → its share text (`POST api/ai/share`), and a
  picture → its words (`POST api/ai/photo`, the `photo` feature: the server's half, no page yet), one contract on
  both backends (`docs/api-contract.md`, "The AI assistant").
  - `server/ai/` and `php/src/Ai/` are twins: the provider seam (`LlmProvider`: OpenAI, Anthropic, and a fake for
    the tests; which one runs is configuration, never code), the prompt builder, the service with its checks in
    the contract's order, and the actor and the policy, which are the seam a login will fill.
    `tests/fixtures/ai-*.json` pin both backends: a change to an adapter, the prompt or a schema dialect is a
    vector first. PHP's `HttpClientFactory` picks curl, or on a host without it a client whose every call is a
    typed failure (`ai_failed`, never a 500).
  - One source for everything shared: `src/shared/ai.ts`, the AI schemas in `schema.ts`, the rules in
    `ai/prompts/`, the examples in `docs/ai-flyers/examples/`. `npm run gen` writes `schema/ai.json` (the prompts
    with their limits, the few-shot, the schemas) and the `ai` block of `schema/shared.json`.
  - The model's answer only ever becomes data held to `AiFlyerAnswerSchema` / `AiShareAnswerSchema`. A flyer's
    answer always carries its share text (required there, not in `BriefSchema`): one generation is a whole flyer.
  - Settings: `AI_PROVIDER`, `AI_API_KEY`, `AI_FEATURES`, `AI_DAILY_LIMIT`, `AI_DAILY_LIMITS`, `AI_MODEL`,
    `AI_EFFORT`, `AI_TIMEOUT_MS`, `AI_ENABLED` in `.env` (Node); the `ai` block of `config.php` (PHP: `features`,
    `dailyLimit`, `dailyLimits` and the rest). Off without a key or with no feature named, and then nothing of it
    shows. The key never reaches `api/config`, a log line, the ledger, a release or git, and a refusal names a
    setting, never its value. `tests/fixtures/ai-settings.json` holds both loaders to one table.
  - Each feature has its own switch (2026-10-06): a site runs the features its settings name, and none until
    they are named (the owner's answer: a key alone runs nothing). The setting `AI_FEATURES` shares its name with
    the constant in `src/shared/ai.ts`, which lists every feature the app has.
    - The policy decides, in one place: `runs(feature)`, `mayUse(actor)`, `dailyLimit(actor, feature)`. "The AI
      is on" is derived as "some feature runs". A feature that is off answers `ai_off` where the whole AI does.
    - `api/config` lists the features that run, and the client shows a feature only through `aiFor()`:
      `App.tsx` is the one place that asks. `flyer` off: no "Create with AI", and `#/ai` is the library.
      `share` off: no "Write with AI".
    - One feature off is proved in process on each backend, over the generated list of features
      (`tests/unit/ai-app.test.ts`, `php/tests/BootstrapTest.php`), with no server per case.
    - An older release refuses `features`, `dailyLimit` and `dailyLimits` (503): on a host the release goes up
      first, and the keys come out before going back (`docs/deploy.md`, "Rolling back").
  - Each feature has its own daily limit (2026-10-06, the owner's answer): a generation counts against its own
    feature alone.
    - The settings: `AI_DAILY_LIMIT` / `dailyLimit` is every feature's number (3 unless set, `AI_DAILY_LIMIT_MAX` =
      20 at most), and `AI_DAILY_LIMITS=share:10` / `'dailyLimits' => ['share' => 10]` a feature's own. Both
      loaders resolve a number for every feature.
    - `api/config` lists each running feature as `{ name, limit, remaining }`, and each route's `remaining` is its
      own feature's. `ai_quota` names what ran out, from `AI_FEATURE_NOUNS` (`aiQuotaVars()` fills the sentence).
    - The client keeps a count per feature: a limit reached empties that feature's alone. `aiFor()` shows a
      feature and `aiWithRemaining()` moves its count, both in `src/shared/ai.ts` and the only readers of the
      answer. They read it loosely: an entry they cannot read stays as it came and never costs the page, and an
      answer in an older shape shows no AI.
  - The ledger (`aiUsage` in each storage driver; `ai-usage/YYYY-MM.json` in the JSON store) keeps one append-only
    record per generation attempted. A feature's limit is counted from the Canary Islands day's `ok` records of
    that feature for the actor: today one anonymous actor, so site-wide. `countOk(actorId, day)` answers every
    feature's count from one read, because `api/config` asks on every page load. A ledger that cannot be read
    hides the AI (`status()` answers `enabled: false` and logs why) and never takes `api/config` down: the editor
    renders nothing without that answer. Node's drivers check a record before writing it (`checkedAiUsage`).
    A record of a feature a release does not know (a later release's, met after going back) counts under its own
    name on PHP and in SQLite, so it moves no count the release shows; Node's JSON driver refuses the month.
  - The client: `src/editor/AiPage.tsx` (`#/ai`, a focus page like the editor), `handoff.ts` (the unsaved flyer
    handed to the editor in memory), `panel.tsx` and `share.tsx` (what both focus pages share), and "Write with AI"
    in `Editor.tsx`. `fields.ts` holds what the panel calls each field: the editor's labels come from it, and
    `briefFieldLabel()` names a brief's key for "The AI assumed…" (an assumption's `field` is the model's to choose,
    so a key no field has is shown as written).
  - A picture is read into its words (`photo`, 2026-10-06; brief `docs/prompts/ai-flyer-from-photo.md`, stage 2).
    Artur's answers are in the brief and are not to be reopened: two calls (the read stops at the words, the flyer
    is the staff member's second call), the picture sent as a file, a read with no words counts, the picture kept
    30 days.
    - The seam carries a picture: a turn's content is a string, or parts (`LlmPart` in `server/ai/provider.ts`;
      the same arrays in PHP's `LlmCall`). A text turn goes out as the string it is. Each adapter fixture has a
      second call, `picture`.
    - A model per feature: `AI_MODELS=photo:<model>` / `'models' => ['photo' => '<model>']`. `AI_MODEL` / `'model'`
      is every other feature's. The call names its model (`LlmCall.model`); a provider is built from the key and
      the effort alone. One provider, one key and one effort per site.
    - One photo intake per backend, used by `api/photos` and `api/ai/photo`: `preparePhoto()` and `storePhoto()`
      in `server/services/photos.ts`; `Photos\PhotoIntake` (prepares) and `PhotoService` (stores) on PHP. The read
      prepares at `AI_PICTURE_MAX_EDGE` (2048) and never writes to `uploads/`.
    - The checks on `api/ai/photo`: the write guard, `ai_off`, `ai_forbidden`, the photo route's own checks, the
      reads' limit, the provider. On Node the switch is asked in front of multer (`admitPhoto` in `app.ts`).
    - The reader's rules are `ai/prompts/photo.md`; the answer is `AiPhotoAnswerSchema` (`{ text }`, at most
      `AI_INPUT_MAX`, trimmed by the service). No hostels, no day, no few-shot: the bundle never holds a picture.
    - The kept pictures (`server/ai/pictures.ts`, `Ai\AiPictures`): `<data folder>/ai-pictures/<Canary day>/`,
      written before the provider is asked, named by the ledger's one-line `input`, never held by it. `GET
      api/config` deletes what is past `AI_PICTURE_DAYS` (30), at most once a day (`.swept`), AI on or off: the
      one read that deletes. `deploy:backup` and `npm run copy` leave the folder out.
    - The fake answers a read with the first example's text, and is steered by the picture's width
      (`AI_FAKE.pictureWidths`: 11 invalid, 12 timeout, 13 refused, 14 no words).
    - `docs/ai-flyers/image-examples/` is the reads' eval set, never few-shot. A picture goes into git only after
      Artur has looked at it. `tests/unit/ai-image-examples.test.ts` holds each case.
  - No test touches a provider. The render suite has two projects: `render` (every spec but `ai.spec.ts`, the AI
    off whatever `.env` holds) and `ai` (`ai.spec.ts` on a second server with the fake, port 8798, every feature
    named and each feature's limit pinned in `playwright.config.ts`, since that server reads `.env` too; it spends
    two of the flyer's three and one of the share text's, and a test that needs another count, or a site that runs
    one feature, routes `api/config`). The contract suite's `node-ai` and `php-ai` run the AI routes on the fake
    with every feature named, both on the JSON driver, so `ai.test.ts` can damage the ledger's file.
  - `npm run ai:smoke` (`scripts/ai/smoke.ts`) is the one thing that calls a real provider, by hand.
    `scripts/site.ts` is how a script calls a site's API (`flyers:post` too): it never follows a redirect.
- Releases and git: a release's id names a build (two builds of one commit get two ids: composer's autoloader
  suffix), and `release.json`'s `commit` names its source.
  - `scripts/git.ts` says which commit a checkout is at. Always the commit, never a tag's name, and `-dirty` when
    anything outside `docs/` differs from it, a new file included.
  - `npm run deploy:tag` (`scripts/php/tag-release.ts`) makes the annotated tag `release/<id>` on that commit, for a
    folder or a site's address. It refuses a `-dirty` release, never moves a tag and never pushes.
  - `npm run deploy:update` (`scripts/php/update-deploy.ts`) puts a newer release over a local copy: backup, build,
    an additive copy, tag. A host is still updated by SFTP, then tagged with `deploy:tag`.
  - Git tests run on a throwaway repository (`tests/tempRepo.ts`): no test tags or builds from this one.

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
  A viewer who never chose sees WhatsApp (`DEFAULT_CANVAS`, the owner's answer, 2026-10-05): the editor (a stored
  choice still wins), the AI page's preview and the library's pictures. It is the screen's default alone: the
  export API and the render page keep `story` for a request that names no canvas.
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
    copy.
  - The real calls found one fault, since fixed: Anthropic left the optional share text out, so
    `AiFlyerAnswerSchema` requires it.
  - Not on the live site yet. IONOS needs the new release, then the `ai` block with a key (`docs/deploy.md`, "The
    AI assistant"). Artur allowed it on live while it is unlocked (2026-10-02): the cap keeps it at 3 a day.
  - Known limits: two concurrent requests can both see `remaining: 1`; `claude-haiku-4-5` retires no sooner than
    2026-10-15 (a default: one line of settings changes it); IONOS's FastCGI time limit is unmeasured until a live
    call; Anthropic's first call after the answer's schema changes takes about 20 s of the 25 s limit; a long staff
    text (a thousand characters) takes 14 to 20 s on `gpt-6-luna`, where a short one takes 6 to 9.
- Done: the AI assistant, closed (branch `feat/ai-assistant-followup`, 2026-10-05; brief
  `docs/prompts/ai-assistant-followup.md`; the report's *Follow-up* section). `main` is fast-forwarded to it,
  locally; nothing is pushed.
  - The review (2026-10-05, another model, changed nothing) found F1 to F4 and two suspicions. Artur: "Do
    everything". All fixed, each test first: the ledger never takes `api/config` down, the adapters and the
    ledger agree on field types, `__proto__` as an assumption's field, no bundle read when off, one home for the
    field names, a staff text cannot close its own fence, a key with a line break is refused by name.
  - The AI was used in a browser with a real provider on both backends, with Artur's own staff text. The Claude
    extension was not connected, so it was Playwright's Chrome, step by step. Two things looked wrong and were
    fixed: with none left the page said nothing about midnight, and "one of the 1 generations".
  - The five known items are done: PHP without curl, a brief's blanks (`flyerFromBrief`, `printedExtras`), "never
    Free" for a missing price (an invitation is not a price: seen to hold on both providers), the stretching
    example's notes, the `fetchJson` test's room.
  - Releases: `deploy:update`, `deploy:tag`, three tags (`release/d1f7ddb40170` live, `release/8b9c8556afa1` and
    `release/3f909ea91548` the Laragon copy). The copy runs `3f909ea91548` with the AI on (its key is set again).
  - Left then, Artur's: the release and the key on IONOS. The steps are in the next entry, which changed them
    (the block names its features, and the smoke takes `--share`).
  - For Artur to decide (the report has each): a text with both "daily" and "tomorrow" printed "Every day";
    `"autoloader-suffix"` in `php/composer.json` would make a release id repeatable.
- Done: the AI's feature switches, three editor changes and the library's pictures (branch
  `feat/ai-feature-switches`, 2026-10-06; the brief was pasted into the session, the report is
  `docs/reports/ai-feature-switches.md`). `main` is fast-forwarded to it, locally; nothing is pushed.
  - Artur's answers (2026-10-05, quoted in the report): none until named; the cap a setting, 3 by default and
    20 at most; WhatsApp the default on screen only; the library's pictures always WhatsApp, in today's row with
    a thumbnail; the placeholder in English; the Laragon copy left with the share text alone.
  - A fresh-context review found no way for a switched-off feature to run, be spent, be recorded or be shown.
    Seven of its points were fixed, each with a test that failed first: among them a blank page when the
    client met a backend older than itself (`aiFor` now reads any answer it does not know as "no AI").
  - The Laragon copy runs release `2ad58f28364e` (tag `release/2ad58f28364e`, on `2c9e5f8`) with
    `'features' => ['share']`. This machine's `.env` has `AI_FEATURES=flyer,share`.
  - Three real generations, all captions on the Laragon copy: 5.4, 3.7 and 5.3 s.
  - Left, Artur's, in this order: `npm run build:php` and upload, then `npm run deploy:tag -- <the site>`; the
    `ai` block in live's `config.php` with `'features' => ['share']`, never before the new release is up;
    `npm run ai:smoke -- --share --to <the site>`, once, whose seconds measure the host's time limit.
  - For Artur to decide (the report has each): a small copy of each photo for the library's pictures (both
    backends and a backfill); where a refused `config.php` logs its reason (the host's own PHP log today, not
    `data/php-errors.log`); Node reads a few number spellings PHP refuses; the Node start-up line prints
    `AI_MODEL` as typed.
- In progress: a flyer from a photo (brief `docs/prompts/ai-flyer-from-photo.md`, four stages, one session each;
  report `docs/reports/ai-flyer-from-photo.md`, one section per stage built). Designed with Artur on 2026-10-06:
  his answers are quoted in the brief, and are not to be reopened.
  - **Stage 1 is done: a daily limit per feature** (2026-10-06, on `feat/ai-feature-switches` by Artur's choice,
    on top of `684189e`). `main` stays at `684189e` until he says; nothing is pushed.
    - A review found no defect in the counting, the settings or the wording on either backend. What it and the
      look found is fixed, each test first: a `null` entry in `api/config`'s list that took the page down
      (`aiWithRemaining()`), the browser suite's unpinned limit, "Try again (uses one of 0 left)".
    - The look ran in Playwright's Chrome on both backends, with the fake: nothing was spent, and no provider
      was called in the stage. The Laragon copy, `.env` and the live site were not touched.
    - No release was built. A host needs the release first and `'dailyLimits'` second.
    - For Artur to decide (the report has each): the sentence at a limit of 1 ("Today’s 1 AI share texts are used
      up"); a feature with nothing for its number is refused (`['share' => null]`); the words "Try again (none
      left today)".
  - **Stage 2 is built: the read, on both backends, with no page** (2026-10-06, on `feat/ai-feature-switches` by
    Artur's choice again: "Stay on feat/ai-feature-switches"; 14 commits on top of `650d3a9`, committed as each
    piece went green, on his standing go-ahead for the stage). Nothing is pushed.
    - With `photo` not named the app looks and behaves as before: the baseline is byte-identical (32 cases).
    - A fresh-context review found no way for a switched-off read to run or spend. What it found is fixed, each
      test first: among them a 500 on Node for a file under another field's name, and a clean-up of kept pictures
      that one stuck folder stopped for good.
    - **Its checkpoint is open: the real reads.** Not run: they wait for Artur's go and his pictures (the Canva
      page, a handwritten board, a poster, a chat screenshot, a photo with no words), on both providers, on the
      default model and a stronger one through `AI_MODELS`, and one through the Laragon copy. He then chooses the
      photo's model and whether 2048 px stays. No provider was called in the stage.
    - `docs/ai-flyers/image-examples/` is still untracked: the first case's picture shows Artur's browser tabs
      and waits for his look. It should go in as the read sends it, a JPEG (154 KB, not the 1.4 MB PNG).
    - For Artur to decide (the report has each): a failed read is free and keeps its picture, so an unlocked site's
      disk can be filled; the reader's prompt's words; a PNG with transparency past Anthropic's 10 MB.
    - No release was built. A host needs the release first, then `'models'` and `'photo'`; both come out before
      going back (`docs/deploy.md`, "Rolling back").
  - **Stages 3 and 4 are not started,** and not to be started unasked: the page, and the picture as the flyer's
    photo. Ask Artur which branch first.
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
