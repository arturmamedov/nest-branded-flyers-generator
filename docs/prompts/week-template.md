# Brief: handoff step 8 — the “This week” template

> **Status: done, 2026-09-29.** Committed as `65f3ed3` on `feat/week-template` (from `a24442b`). Part 0's answers and
> the WhatsApp sign-off are recorded in the report, `docs/reports/week-template.md`. The review's deferred items are
> `docs/prompts/week-template-followup.md`. Everything below is the brief as written, kept for the record.

You are working in the Nest Branded Flyers Generator repo. Read `CLAUDE.md`, `README.md` and
`design_handoff_flyer_generator/README.md` first (§1, §2 “This week template”, §5, §6, §12). This brief closes the
handoff's build order: steps 1–6 are done, and 7 and 9 stay on hold. Your job has two parts: **settle the open
decisions with Artur, then build it.**

## Goal (from Artur, the owner)
- Staff can make a **This week** flyer: up to five of the week's activities on one flyer, beside the one-event
  **Activity** flyer they make today.
- It prints on every output canvas, as the Activity flyer does: Instagram story 1080×1920 and WhatsApp 1080×1440.
- It works on both backends (Node and the PHP release), with no rule hand-copied into PHP.

## Where things stand (checked at `097e554`, 2026-09-29; verify, line numbers move)
Already there, and tested:
- **Data.** `TemplateSchema` is `'activity' | 'week'`, and `FlyerDataSchema.week` holds up to five `WeekRowSchema`
  rows: `day` (30), `name` (80), `time` (20), `cost` (30) and an optional `shortName` (60), the handoff's short-name
  override (`src/shared/schema.ts`). Both backends store and validate it (PHP through the generated
  `schema/flyer.schema.json`). The record's `template` wins over `data.template` (`src/shared/normalize.ts`, and the
  contract test “the template column wins over data.template”).
- `newFlyerData('week')` sets the eyebrow to `THIS WEEK` (`src/shared/defaults.ts`).
- The library labels a week flyer “This week” (`src/editor/Library.tsx`), and `GET /api/flyers?template=week`
  filters on every storage driver.
- Story-only boxes: `WEEK` in `src/shared/layout.ts` (title 398/250; rows from 700, 122 tall, 15 apart, at most five),
  pinned by `tests/unit/shared.test.ts` (“five week rows end before the ask block”).

Missing:
- **The renderer.** `src/flyer/Flyer.tsx` never reads the template, so a week flyer renders as an Activity one.
- **The editor.** `src/editor/Editor.tsx` starts every draft from `newFlyerData('activity')`, and `toInput()` sends
  `template: 'activity'` on every save. A week flyer opened and saved in today's editor silently becomes an Activity
  flyer.
- **WhatsApp geometry** for the week template: `CanvasSpec` carries only an `activity` box set.
- **Copy rules.** `lintFlyer()` (`src/shared/copyRules.ts`) reads chips and extras, never week rows.
- **Samples and tests.** There is no week sample, and nothing renders one. Every sample also reaches the tests as an
  Activity flyer: these five places write `template: 'activity'` whatever the sample is.
  - `scripts/gen-shared.ts`, when it builds `seed/samples.json`;
  - `server/cli/seedSamples.ts`;
  - `tests/render/render.spec.ts`, `fidelity.spec.ts` and `baseline.spec.ts`, when they save a sample.

## The spec
The handoff's §2 “This week template”, with one correction:
- Same eyebrow (`THIS WEEK`), same ask and pill. Between them: a title block at top 398, height 250 (`What’s on` /
  `this week.` / a Spanish line), then up to five rows from top 700, each 122 px tall, 15 px apart, in the same
  wonky white box.
- A row has three parts:
  - the day: a fixed 250 px, Shantell 700 34 px on the yellow highlighter;
  - the event name: flex, Shantell 800 44 px `#0D6F82`;
  - on the right, the clock (30 px) with the time (Shantell 700 34 px), and the cost beneath it (Montserrat 600
    26 px `#3A3A34`).
- **The event name wraps; it is never a nowrap line.** It has its own 96 px fit box at line-height 1.06. Two lines
  fit; a third shrinks through the height pass.
- No photo, no extras line.
- **Five rows end by 1370** (5 × 122 + 4 × 15 = 670), 12 px clear of the ask at 1382. It's a constraint, not a
  suggestion.
- The correction: §3's “22px between week rows” is stale. §2 explains that 138/22 put the fifth row across the
  ask. Use 15.

The exact markup is in the prototype, `design_handoff_flyer_generator/design/Nest Flyer Story Templates.dc.html`:
the `isWeek` block (about lines 140–169) and the row derivation (about lines 351–365).
- The title lines there are fixed strings: `What’s on`, `this week.`, `El plan de la semana en <hostel>.`
- The rows are read from the other saved records: `day` and `time` from WHEN split on `·`; `name` from
  `headline1 + headline2`, joined, whitespace collapsed, a final `.` dropped; `cost` from the first part of COST.

Port it the way the Activity template was ported: inline styles, the `data-fit*` attributes, `WonkyBox`.
`src/flyer/fit.ts` is the prototype's `_fit()` verbatim and should need no change for this markup. If a row
misbehaves, compare its markup with the prototype first.

§6 still holds: a row's `name` is the **whole** event name, never `headline2` alone, and a long join gets the row's
own `shortName`. §12's copy rules cover the rows too, with the owner's exclamation budget (`MAX_EXCLAMATIONS`,
docs/design-decisions.md).

## Part 0 — settle these with Artur (before any code)
Ask him briefly, in Italian. The recommendation is in brackets. Record his answers in the report.
1. **The title lines.** Editable, kept in `text.headline1/headline2/headlineEs` with the week defaults `What’s on` /
   `this week.` / `El plan de la semana en <hostel>.`; or fixed, as in the prototype. [Editable: §1 says every
   string on the flyer is editable. The Spanish default takes the hostel's name once one is picked (`Nests Hostels`
   for a chain-wide flyer, as in the prototype), and the line collapses when emptied.]
2. **Filling rows.** Typed by hand, taken from a saved Activity flyer (the prototype's derivation above), or both.
   [Both. A taken row is a copy that stays editable, never a live link.]
3. **Fewer than five rows.** Top-aligned at the rows' top, or centred in the space. The handoff allows both.
4. **The template art.** The two sparks hang from the photo's top corners. With no photo, they hang from the ends of
   the Activity no-photo rule (`artAnchors()` in `layout.ts`, y 900 on the story), which is inside the rows. Where
   should they go on a week flyer: on the title block's corners, or in the top margin as in the prototype? The
   blobs and the pill's spark keep following the canvas.
5. **Switching template on an existing flyer** (Activity ↔ This week): allowed or not. [Allowed: it's one data
   shape, both sets of fields are kept, and nothing is lost.]
6. **The WhatsApp numbers.** You propose them in Part 1, and Artur signs them off from proof sheets, as he did for
   the Activity numbers.

Then **stop and wait for his go-ahead.**

## Part 1 — build it (after the go-ahead)
- Branch `feat/week-template` off `main`, once Artur has merged the branch line into it (`main` must contain
  `097e554`, the write-guard commit). Commit only when Artur asks. Never push.
- Artur often runs `npm run dev`. Tell him before the first `src/shared` or `server/` edit.
- Never tune or click around on `./data`, the real library: use a scratch `DATA_DIR` and `PORT`. Line endings are LF.
- The non-negotiables hold, in particular:
  - one renderer, with inline styles;
  - `#53CED1` is never text on cream;
  - optional fields collapse: an empty time or cost disappears, a row with nothing in it isn't printed, and no
    `·` is left dangling;
  - fonts only through `src/shared/fonts.ts`;
  - generated files only through `npm run gen`.

### Geometry — `src/shared/layout.ts`
- Every canvas gets week boxes beside its `activity` ones: a `week` set in `CanvasSpec`, built from the canvas's own
  column the way `defineCanvas` builds the activity boxes. It holds the title block, the rows (top, height, gap,
  maximum) and the art anchor from Part 0. The story keeps §2's numbers, and the story-only `WEEK` constant goes.
- Add a `weekGroups(canvas)` beside `activityGroups()`, so the render suite can check the week template the way it
  checks the Activity one.
- **WhatsApp.** A proposal to prove, built the way the Activity stack was (see the comment above `WHATSAPP`):
  - the same heights on the 1000 px column;
  - the pill (1324) and the ask (1164) are shared, so five rows must end by 1152;
  - the title block starts at 162 (the no-photo headline's distance from the eyebrow) and ends at 412;
  - the rows start at 464 (the story's 52 px gap) and end at 1134, 30 px above the ask.

  Make proof sheets of every week sample on both canvases, on a scratch instance, as `docs/reports/output-canvases.md`
  did. Get Artur's sign-off, then record the numbers with a *why* comment, as the Activity ones are.
- In `tests/unit/shared.test.ts`, check on every canvas that five rows end at least 12 px above the ask, and that
  every week box is inside the safe box.

### Renderer — `src/flyer/Flyer.tsx`
- Branch on `data.template`. The week body (the title block and the rows) replaces the headline, photo, chips and
  extras; the eyebrow, ask, pill and art are shared. Keep `data-group` and `data-fit*` on everything: the render
  suite and the fidelity check read them.
- A row prints its `shortName` when it has one, and its `name` otherwise.
- A week flyer never draws a photo, whatever `photoMode` and `photoId` say. A flyer switched from Activity keeps its
  photo, for switching back.
- Before an export, `ready.ts` must wait for every image the week body draws.

### Editor — `src/editor/`
- A template choice, `Activity | This week`, like the photo-mode buttons: on a new flyer, and on an existing one if
  Part 0 allows it.
- `toInput()` sends the draft's own template, never a hard-coded `'activity'` (the bug above).
- For a week flyer:
  - the title fields;
  - a rows editor: add, remove and reorder, at most five rows, each with its short-name override;
  - “add from a saved flyer”, if Part 0 wants it;
  - the photo, chip and extras controls hidden, and a photo dropped on the preview refused with a short reason.
- If it's cheap, add a template filter beside the library's hostel filter (the API already takes `?template=`).
- The unsaved-work guard and the canvas toggle keep working as they do now.

### Copy rules — `src/shared/copyRules.ts`
- Lint what prints. For a week flyer that's the title lines, every row field (the `shortName` when set, otherwise the
  `name`), the ask and the pill, but not the chips or extras. The exclamation budget counts the same way.

### Data and backends
- Probably no schema change: the fields exist. If Part 0 adds one (an art anchor, say), it's a data change:
  - `npm run gen`;
  - a new SQLite migration if a column changes (migrations are append-only);
  - a JSON-store migration id, so an older release refuses the store cleanly (docs/status.md, step 9's note).
- An older release draws a week flyer as an Activity one, because it ignores the template. Say in the report whether
  that's acceptable.
- PHP needs nothing beyond `npm run gen`: it has no renderer, and the browser does the export there.

### Samples and tests
- Add week samples to `src/shared/samples.ts`:
  - a typical week, with three or four rows;
  - a five-row stress case, with the longest names, a two-line price and some empty fields;
  - a sparse week, with two rows and no times.
- Make the five places that write `template: 'activity'` take the sample's own template, then run `npm run gen`.
- `tests/render/render.spec.ts` and `fidelity.spec.ts` cover every sample on every canvas. A week sample renders once
  per canvas, since photo modes don't apply to it. Check that:
  - groups sit where `layout.ts` says, inside the safe box, with no overlaps;
  - no text is clipped, and the fonts are the real ones;
  - the client export matches the server's.
- `tests/render/baseline.spec.ts`: the Activity story stays byte-identical. Capture on `main` before the first change,
  and check at the end.
- The contract suite: a week flyer round-trips on every backend (create, read, and list with `?template=week`). Most
  of this exists; add what's missing.
- `tests/render/editor.spec.ts`: make a week flyer; add, reorder and remove rows; switch template; download.

## Done means
- `npm run typecheck && npm test && npm run test:contract && npm run test:render` are green, plus `npm run test:php`
  and `npm run test:php-smoke`, and the baseline check passes.
- In Chrome: a week flyer made from scratch and one made from saved flyers, on both canvases, previewed and
  downloaded as PNG and JPG at the exact size. Do this on the dev server, and on the Laragon PHP deploy after
  `npm run build:php`.
- Artur has signed off the WhatsApp week numbers.
- `docs/status.md` says step 8 is done, and a line in `docs/design-decisions.md` says §3's 22 px is
  superseded.
- A short report, `docs/reports/week-template.md`: what changed, the WhatsApp numbers, Part 0's answers, what was
  verified and how, and anything left open.

## Out of scope
Steps 7 and 9; a second visual style (Artur's next prototype); more than five rows, or pagination; per-hostel logos;
the login.
