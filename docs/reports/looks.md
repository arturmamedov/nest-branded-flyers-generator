# Report: looks, the seam for more than one flyer design

The brief and the design are `docs/prompts/looks-seam.md` (designed with Artur on 2026-10-13; the order of the build
approved on 2026-10-14). The first brief was `docs/prompts/design-style-switcher.md`. One section per session.

## Stages 1 and 2: the baseline on both canvases, and the hand-drawn look out of the renderer (2026-10-14)

Branch `feat/looks`, cut from `feat/flyer-labels` at `a55589d` on Artur's word that the labels work had landed.
Eleven commits, `c1d7e29..4139d14`, nothing pushed. Nothing a staff member sees changed.

### Artur's answers that day (not to be reopened)

| Question | His answer |
|---|---|
| M1: a look may move a box and never resize one | **Struck.** A look may give a box its own top and height per canvas, the week's row height and gap too. Widths, the order top to bottom and the safe zones stay shared. |
| With M1 struck, the photo frame's shape too? | **"Yes, its height too"**: a flyer switched to such a look shows another cut of its photo from the same stored crop, as Full bleed to In a frame does. |
| M2 to M6 | Kept, each asked by itself. |
| The labels session at work in the folder | **"Plan now, build after it lands"**, then, at 03:00, "Finished: start here, now". |
| The branch | **"feat/flyer-labels, once it lands"**. |
| The go | Stages 1 and 2; then "stages 3 and 4 in a new standalone session". |

What resizing cost, told to him before he kept it: the geometry is a top and a height per box where it was one
number; what fixed sizes gave by construction is checked; the proof look must resize on both canvases; about one
commit more. The crop maths take a frame of any shape, so the cost was smaller than the advice he struck assumed.

### What was built

| Commit | What |
|---|---|
| `c1d7e29` | The baseline shoots every canvas, the export and the safe-zone overlay, and four flyers with colours of their own (Pool party in each photo mode, a week flyer). The story keeps its file names, so a capture of the story alone still checks it. |
| `9c090f1` | Inert hooks: `data-deco` (highlighter, rule, frame, icon, clock, dot), `data-chip`, `data-anchor` on every piece of art. The specs find things by them, and `render.spec` holds every image, frame and background in the flyer to carry one. |
| `5d161cd` | The box tables are private to `layout.ts`; `boxesOf(canvas, geometry)` and every reader take a look's geometry. `tests/geometry.ts` names every problem: the safe zone, overlap, the stack upward from the floor, five rows 12 px above the ask, one photo shape on every canvas, fitted boxes at least the story's. |
| `a27adbb` | The registry `src/shared/looks.ts`, with hand-drawn first (`looks/handDrawn.ts`, which takes its colours and art out of `defaults.ts` unchanged). `lookOf(data)` reads loosely and falls back to hand-drawn. `registerLook()` only before the registry is read. A scan fails on a look's id written in `src/flyer` or `src/editor`. |
| `0eadafa` | Outside looks: the labels work's `library-labels.spec.ts` read the filter's options before the library had drawn them, once in a whole run. It waits for them now. |
| `d641491` | The palette: ground, ink, accent, muted, surface, highlight, placeholder, the pill's letters and dot. Hand-drawn takes ink, accent and ground from the flyer. |
| `01bf2c6` | The type: every line of copy by its place, one token for its size and its fit's start, its ink and its ground; each look's contrast minimum and forbidden inks, held by a test. |
| `5147c55` | The art: a look's pieces by anchor, its inline files, its wordmark. The pencil is hand-drawn's piece at `askEnd`, as the spark is at `pillEnd` (M4). `ASK_MAX_WIDTH` (760) names the ask's widest block. |
| `b13803c` | The frame: path, view box, stroke, the photo's corners; the editor's photo handle reads them too. |
| `3d06cd5` | The pill: corners, tilt, padding, gap, dot. `PILL_TILT_ROOM` moves to `layout.ts`, and every look's tilt is held to it. |
| `4139d14` | The faces: a look lists them, the flyer's root names its look (`data-look`), `prepareFlyer()` waits for them. Tests: every face its type uses, a family of `fonts.ts`, a pinned package, and `fonts.css` importing exactly the shipped looks' faces. |

### How it was held

- **The drawing did not move.** After every commit, `RENDER_BASELINE=check` against the capture taken first (the temp
  folder `nest-looks-baseline`, from `a55589d`): 36 cases, both canvases, the export and the overlay, byte-identical
  every time. That capture checks against the older `nest-ux4c-baseline` too (32 story cases).
- **The gates at the end of stage 2:** 782 unit tests, 299 in the `render` browser project (one skip, as before),
  75 in the `ai` project, 387 in the contract suite. The PHP tests and the PHP smoke test were not run: nothing
  PHP reads changed yet.
- Each commit ran the unit suite, a build, the baseline and the specs the commit touched; three of them ran the whole
  `render` project.

### Found on the way

Read from the code on 2026-10-14; `docs/prompts/looks-seam.md` was corrected to match:

- More readers of the box tables than the design listed: `defaults.ts` (at load), `Editor.tsx`, `exportActions.ts`,
  and ten places in the tests.
- The pencil was the last child of the ask's block, not the first. Kept so.
- `schema.ts` already loads `defaults.ts` by value (through `names.ts`): the looks files import no value from it.
- The chip's big line is two lines of type (1.3 on the highlighter, 1.1 elsewhere).
- The fidelity check masked the photo by the table; it masks the photo the page drew now.
- A colour the design missed: copy on the highlighter needs its own ground in the palette (`highlight`), for the
  contrast check alone. The renderer never paints it: the highlighter is art.

### Left

Stages 3 to 7: the field, the site's looks, the proof look, the switch, the docs. Stages 3 and 4 are for a new
session: `docs/prompts/looks-seam-stages-3-4.md`.

## Stages 3 and 4: a flyer stores its look, and a site names its looks (2026-10-14)

Branch `feat/looks`, on top of the stages 1 and 2 docs (`6ea7e06`). Five commits, `9a665cc..11773dc`, and their record;
nothing pushed. Nothing a staff member sees changed: with no setting a site offers Hand-drawn alone, and there is no
switch yet.

### The plan

Artur approved it as written: the five commits below, and eight points where the code disagreed with the design,
each with what I would do (the table under "Found on the way"). Started in plan mode; the launch prompt was
`docs/prompts/looks-seam-stages-3-4.md`.

### What was built

| Commit | What |
|---|---|
| `9a665cc` | **`data.look`**: an enum of the registry's ids, default `FIRST_LOOK`, the last key of the data. `newFlyerData(template, look)`. Four generated files. The two rollback rules held on both backends: on PHP a flyer in a look the release does not have opens as stored and its save is refused at `data.look`; on Node it is listed and does not open. A flyer with no look reads hand-drawn on every backend. |
| `df90737` | **The setting**: `LOOKS` in `.env` (`namedLooks`, `server/config.ts`), `'looks'` in `config.php` (`php/src/SiteLooks.php`, the ids from `schema/shared.json`'s new `looks` block). One table for both, `tests/fixtures/looks-settings.json`. `.env.example` shows it commented out, and so does `config.sample.php`. |
| `90853cd` | **`api/config` answers `looks`**, on both backends in one commit (`ApiConfigSchema` is strict). `AppDeps.looks` is optional: absent, the first look alone. A look `config.php` names that the release does not have is 503, and the log names the setting, never the value. |
| `79958f9` | **The client**: `siteLooks()` in `looks.ts` reads the answer loosely. `App.tsx` holds the site's looks and hands the first to the editor (both copies of `blankDraft`) and to the AI page (`flyerFromBrief`'s fourth argument). |
| `11773dc` | **`flyers:post` asks the site** (M6): `siteFirstLook()` in `scripts/site.ts`, tested against a local server. |

The setting's rules: names separated by commas, trimmed, empty pieces dropped, kept in the site's order; refused, a
name that is no look of the release, a name twice, no name at all (`LOOKS=` set to nothing too), or on PHP anything
but a list of strings; not set (or `null`), the first look alone. A refusal names `LOOKS` / `looks` and the looks
there are, never what was typed.

### How it was held

- **The drawing did not move.** After every commit that touched `src/` (the first, the third and the fourth),
  `RENDER_BASELINE=check` against `nest-looks-baseline`: 36 cases, both canvases, byte-identical every time.
- **Each commit's tests were seen to fail first**, for the reason expected (the field's contract rows against the code
  stashed, the PHP test of a flyer with no look against the generated schema stashed), except two that hold what was
  already so: the older-backend spec's no-look case (a guard, point b) and the contract's `api/config` row, whose
  in-process twins on each backend were seen to fail.
- **The gates at the end:** typecheck; 809 unit tests; 387 in the contract suite (235 skipped, as before); 374 in the browser (299 in `render`, one skipped as before, and 75 in `ai`); 958 PHP tests (38 skipped, as before); 3 in the PHP smoke test; and the baseline, 36 cases byte-identical. No provider was called.

### Found on the way

The plan's eight points, as approved:

| # | Point | What was done |
|---|---|---|
| a | `fitKey` and the look: no test can fail before an open editor can change its look | Moved to stage 6, with the switch and its spec |
| b | "Read the look loosely, as the labels": already so, every reader goes through `lookOf()` | No fill. `flyer-labels.spec.ts`'s older backend strips the look too, and the editor is checked to draw hand-drawn |
| c | One look in the registry: "the site's order, the first wins" cannot be seen | Both loaders and `siteLooks()` take the known looks as a parameter (the registry by default); the table carries two of its own. The browser proof waits for stage 5 |
| d | `post.ts` runs `main()` on import and has no test | Its question to the site is in `scripts/site.ts`, tested there |
| e | The AI page never calls `newFlyerData` | `flyerFromBrief` takes the look |
| f | `looks` is required in the strict `ApiConfigSchema` | `CONTRACT_BASE_URL` against an older release (live, the Laragon copy) fails at `api/config` until the release is up |
| g | Rule 1 ("from before looks") has no older release to run | Held by a flyer with no look opening hand-drawn on every backend, and by the tests that an unknown key is dropped |
| h | `config.sample.php` | `'looks'` as a commented-out line, checked by `ConfigTest` |

And while building:

- **PHP's repositories store data as given; the app fills the defaults** (`FlyerValidator::normalizeData`, on every
  read). Node's drivers parse on read instead. So "a flyer from before looks reads hand-drawn" is a driver test on Node
  (`repositories.contract.ts`) and an app test on PHP (`BootstrapTest`).
- `BootstrapTest` holds every test to an empty log unless the test is about its log line. The 503 for a look the
  release does not have became its own test, which also checks the log names `looks` and not the value.
- `schema.ts` calls `lookIds()` when it loads, and `loadConfig()` when it runs: the registry is sealed by either.
  Stage 5's proof server registers its look before both.
- `flyerFromBrief` takes the look as a fourth argument, after `now`: thirteen calls in `brief.test.ts` pass a day
  third.

### For Artur to decide

- **The points that are mine in the setting:** `LOOKS=` written with nothing after it is refused (a site offers one
  look at least), where `AI_FEATURES=` means "none"; a look's name must be spelt exactly (`Hand-drawn` is refused);
  the sample's `'looks'` line is commented out.
- **The words in `docs/deploy.md`**: the section "The looks a flyer prints in", the two rules under "Rolling back",
  and the troubleshooting row.

### Left

Stages 5 to 7: the proof look, the switch, the docs. Their launch prompt is `docs/prompts/looks-seam-stages-5-7.md`.

## Stages 5 to 7: the proof look, the switch, and the docs (2026-10-14)

Branch `feat/looks`, on top of `a96d1bf` (where `main` and origin were). Eight commits, `bfcb54c..ced1571`, and
their record; nothing pushed, no release, the live site and the Laragon copy not touched. Launched by
`docs/prompts/looks-seam-stages-5-7.md`, started in plan mode. Nothing a staff member sees changed: a site with one
look shows no switch, and the baseline was byte-identical (36 cases) after every commit that touched `src/`.

### The plan

Artur approved it as written: the commits below, and eight points where the code disagreed with the design.

| # | Found | What was done |
|---|---|---|
| a | Only Shantell Sans and Montserrat were installed, and the faces test wanted a family of `fonts.ts` in `dependencies` | The proof look's face is Space Mono, a pinned **devDependency** imported by the tests' build alone; its family lives in `tests/proof/`. The shared checks take where a look's faces may come from |
| b | The id `proof` is a common word for a walk of a release | The id is `proof-look`, the name "Proof" |
| c | Six art files hand-drawn never draws (`blob-teal`, `blob-yellow`, `spark-yellow`, three `frame-box*`) and `nest-logo-white.png` | The proof look draws only those: no new assets |
| d | `Editor` and `AiPage` got the site's first look alone | `Editor` gets the list; `AiPage` keeps the first (no switch there, answer 12) |
| e | A flyer from an older backend has no `data.look` | Pressing the look already shown changes nothing |
| f | The proof look could not join `looks.test.ts`'s registry | Its own unit file registers it first |
| g | `build:php`'s check walked nothing | A walk with `filesUnder` |
| h | `isProd` rests on `dist-server` in the path | The proof server runs in production; it seeds its own library |

### What was built

| Commit | What |
|---|---|
| `bfcb54c` | `server/start.ts`: the server as a function given the dist folder (`server/index.ts` calls it with none); `AppDeps.distDir`; `computeBuildId` reads that folder. |
| `3c896b3` | **The proof look**, `tests/proof/look.ts`: a dark ground under the white wordmark, Space Mono, the art files hand-drawn never draws, a plain frame, a square pill, stricter rules (7:1), and boxes of its own on both canvases, the photo's shape among them. `register.ts` adds it. The checks every look passes move to `tests/lookContract.ts`; `proof-look.test.ts` runs them on it, and holds it to differ from hand-drawn in every token. |
| `fada2e3` | **The tests' own build**: `vite.proof.config.ts` → `dist-proof/`, the registration first in both entries; `tests/proof/server.ts` registers, seeds its own library (the release's seed scripts refuse its `LOOKS`), refuses a data folder outside `test-results/`, and serves `dist-proof/`. Playwright project `looks` (port 8796, `LOOKS=hand-drawn,proof-look`); `npm run build:proof`; `test:render` builds both. render.spec's checklist moves to `tests/render/drawnChecks.ts`, reading the flyer's look. `looks.spec.ts`: every sample in the proof look on both canvases, the canary, client = server export on four flyers, the library card, M2. |
| `b9ec6ff` | **No trace**: no file of `dist/` names it while `dist-proof/` does; no generated file; `build:php` refuses a release that names it anywhere (`filesNaming`); `invalid` at `data.look` on node, node-json and php. |
| `c424407` | **The Look switch** under Template (`looksToPick()` in `looks.ts`: the site's looks, then the flyer's own when the site does not name it; shown with more than one). The closed Flyer line names the look **last**, and only where the switch shows. `looks-editor.spec.ts`. |
| `4f2ed99` | `fitKey` holds the look: a switch of look alone refits the canvas fitted offscreen, so its cut-off warning follows. |
| `00d39f9` | Every way out of a proof flyer is the proof look: the editor's PNG and JPG on both canvases, Copy image, a card's download, the lightbox. |
| `ced1571` | A proof flyer's copy has a title of its own (the whole `looks` project found three cards with one title). |

### Artur's answer

| Question | His answer |
|---|---|
| The switch under Template, from pictures at 1440 and 360 px, the section open and closed | Built as drawn |
| Where the closed Flyer line names the look | **"Look last in the line"** (over my "as drawn", after the template): `Activity · Duque Nest · Proof` |

### How it was held

- **Each test seen to fail first**, against the code without its change: the server's folder, the proof look's checks
  (by breaking the look), the data folder's guard, the no-trace checks (a planted file in `dist/`, a proof id in
  `shared.json`), the switch's four specs, the guard on the pressed look by itself, the offscreen refit, the ways out
  on a hand-drawn copy. The canary was seen to catch a frame stroked in hand-drawn's ink.
- **The baseline**, `RENDER_BASELINE=check` against `nest-looks-baseline` (36 cases), byte-identical after the switch
  and after `fitKey`. Stage 5 changed nothing under `src/`.
- **The gates at the end**: typecheck; 831 unit; 387 contract (235 skipped, as before); 390 in the browser (299 in
  `render`, one skipped as before, 75 in `ai`, 16 in `looks`); 958 PHP (38 skipped, as before); 3 in the PHP smoke
  test. In the whole run one `render` test failed once and passed alone ("the form keeps its place when the panel is
  folded": 404 px where 400 were scrolled), and passed in the next whole run: a flake to watch.
- **Chrome, by eye** (Claude in Chrome): the tests' build, Pool party switched to Proof (the preview redraws,
  "Unsaved changes"), saved, its library card in Proof, one PNG per look; the release build, no switch and the line
  as before.

### Found on the way

- **Playwright lists every project's specs in one process**, so the registry is already read when a looks spec
  loads: registering there throws. The specs never register the proof look; the page's build has it, and the checks
  are handed `PROOF_LOOK` (`checkDrawn()`'s last argument). What the server answers about a proof flyer is read as it
  came, never through this process's schema.
- **The fit can push a line sideways.** The height pass shrinks a box after the width pass, a line re-wraps, and
  nothing checks its width again: the proof look's WHEN day came out 7 px past its cell on the highlighter-wrap
  sample. Hand-drawn never meets it; `fit.ts` is unchanged; the proof look's chip line is 38 px. In
  `docs/adding-a-look.md`.
- **A look's `highlight` is not its highlighter.** The contrast test reads the colour a look declares under the day;
  the renderer paints the highlighter file. The proof look's days sit on a pale box and are hard to read, and the test
  passes. In `docs/adding-a-look.md`.
- **`build:php` empties `release/php/`.** I ran it once to see the walk pass on a real release (445 files, under
  30 s), which the brief had ruled out: what was in that folder is gone. What I built was removed (a dirty checkout's
  release). `release/activities-2` and `release/php-56b82bc7cab3` were not touched.

### For Artur to know

- Nothing in this session is his to decide. The switch's word ("Look") and its place were his already; "Proof" is
  the throwaway's name, shown on no real site.
- The proof look's face is a devDependency (`@fontsource/space-mono`): installed with every `npm install`, shipped in
  no release.
- `release/php/` is empty: the next `npm run build:php` makes it again.

### Left

Nothing of the seam. The real second look is a later session, from Claude Design's handoff folder, by
`docs/adding-a-look.md`.
