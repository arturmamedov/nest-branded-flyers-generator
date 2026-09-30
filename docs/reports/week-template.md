# The “This week” template (handoff step 8)

In one line: staff can make a **This week** flyer — up to five of the week's activities under one title — on
both output canvases and both backends, beside the one-event Activity flyer, switching between the two
without losing anything. Brief: `docs/prompts/week-template.md`. Branch `feat/week-template`, from `a24442b`.

## Part 0: Artur's decisions (2026-09-29, quoted as given)

| # | Question | Answer | What it became |
|---|---|---|---|
| 1 | The title lines: editable or fixed? | «Precompilate modificabili, siamo anche chiari con un emoji o altro sul dove e' l'inglese e dove lo spagnolo cosi nessuno si confonde» | Prefilled `What’s on` / `this week.` / `El plan de la semana en <hostel>.`, editable, in `text.headline1/2/headlineEs`. The Spanish line follows the hostel while it still reads as the default (`followHostel`). |
| 1b | How to mark English and Spanish (emoji flags are letters on Windows) | «Si ovunque possiamo usare flag css o qualcosa di semplice e veloce per mostrare anche su windows?» | A small drawn flag (inline SVG, `LangFlag.tsx`) beside every field whose language is fixed: Line 1 and Line 2 🇬🇧, the Spanish line 🇪🇸, the ask's English 🇬🇧 and Spanish 🇪🇸, on both templates. Editor only. |
| 2 | Filling rows | «A mano e da flyer salvati» | Typed, or "Add from a saved flyer": a copy of an Activity flyer's WHEN (day · time), whole name and first price (`rowFromActivity`), then edited like any row. Never a live link. |
| 3 | Fewer than five rows | «In alto, da 700» | Top-aligned in the five-row box. |
| 4 | Where the two sparks go | «Angoli della prima riga» | The photo-corner anchors become the first row's top corners on a week flyer (`artAnchors(canvas, 'week')`), in by the canvas's `photoInset` as on the band. |
| 5 | Switching template on a saved flyer | «Sì» | Allowed both ways. Every field is kept; only untouched defaults follow (`switchTemplate`): the eyebrow, and the week title (filled when the headline is empty, cleared going back while untouched). |
| + | A price with a `·` | «Su due righe» | Printed as the COST chip is: the first part, then the rest beneath (`splitBigSub`, shared with `deriveChip`). |
| + | Where to branch | «Parti dal branch attuale» | `feat/week-template` from `refactor/write-header-constant` (`a24442b`); `main` is Artur's to update. |
| 6 | The WhatsApp numbers | Signed off from proof sheets, 2026-09-29: «Approvati»; the right-hand cap «250 px»; the sparks «7 px più in basso» | Below. |

One consequence of answers 1 and 5, said in the editor's Title hint: the week title *is* the headline's lines, so an
Activity flyer with a headline switched to This week prints that headline as its title, and editing the title edits
the headline. Nothing is lost; there is one set of lines, not two.

## What changed

- **`src/shared/week.ts`** (new, zod-free): `WEEK_ROWS_MAX` (5) and the row limits, which `schema.ts` now imports
  (the generated JSON schema is unchanged); `eventName` (the headline's whole name, shared with the editor's library
  title); `rowFromActivity` (WHEN and COST by key, each field cut to its limit by code points, never into half of a
  surrogate pair, which PHP refuses); `printedName` / `printedRows` / `isPrintable` (the short name wins, no dangling `·`, the price on two lines,
  empty rows dropped).
- **`src/shared/layout.ts`**: every canvas has `week` boxes beside `activity` (title, the five-row box, row height and
  gap, `artDrop`); `Body` / `bodyOf` (a week flyer's body is its rows, whatever photo mode it keeps);
  `weekGroups`, `weekRowRect`; `artAnchors` and `photoFrame` take the body. The story-only `WEEK` is gone.
- **`src/shared/defaults.ts`**: `DEFAULT_EYEBROW`, `weekTitle`, `switchTemplate`, `followHostel`;
  `newFlyerData('week')` is prefilled. **`copyRules.ts`**: lints what prints — a week flyer's title and rows (the short
  name when set), never the chips and extras it keeps for switching back; rows spend the same exclamation budget;
  an all-caps event name is flagged; row warnings say which row.
- **`src/flyer/Flyer.tsx`**: the week body (title + rows) from the prototype's `isWeek` block, inline styles,
  `data-fit*`, `WonkyBox`. The Activity headline and the WHEN highlighter became `Headline` and `Highlight`, used by
  both templates, with the Activity DOM unchanged (the byte baseline below). A week flyer never draws a photo.
  Three departures from the prototype, each commented in `WeekRow`: the time and price are capped at 250 px (the
  day's width) and shrink when long — sized to their copy, a long one squeezed the name to nothing, out of reach of
  the width pass; the name can shrink below its longest word (`minWidth: 0`); every empty cell collapses.
  `fit.ts` and `ready.ts` needed no change.
- **Editor**: the Template toggle; the draft's own template sent on save (it was always `'activity'`: saving or
  downloading a week flyer turned it into an Activity one), the record's template winning on load; the Title and
  rows sections (move, remove, focus that follows a moved row, "+ Add row" up to five, "Add from a saved flyer");
  photo, chips and extras hidden on a week flyer; a photo dropped on one refused with a reason; the offscreen canvas
  refits on row and template changes; the flags. **Library**: a Template filter beside Hostel, remembered per viewer.
- **Samples**: three week samples after the six (a typical week, a five-row stress test, a sparse chain-wide week).
  Every place that wrote `template: 'activity'` for a sample now writes the sample's own
  (`scripts/gen-shared.ts`, `server/cli/seedSamples.ts`, the render, fidelity and baseline specs, and the
  cross-backend test the brief's list missed). `npm run gen` changed only `seed/samples.json`.
- **Backends**: no code change, no migration. A JSON migration id was deliberately not added: with no runner in
  either backend, it would make the new build refuse every existing store.

## The numbers (`src/shared/layout.ts`, with their why-comments)

| | Story | WhatsApp | Why |
|---|---|---|---|
| Title block | 398, 250 tall | 162, 250 tall | where the no-photo headline starts: 53 px under the eyebrow |
| Rows | 700 → 1370 | 464 → 1134 | 122 px rows, 15 apart (§2; §3's 22 px is stale); 52 px under the title |
| Clear of the ask | 12 px (ask at 1382) | 30 px (ask at 1164) | the shorter canvas's 18 spare px go above the shared ask |
| Photo-corner sparks | first row's corners (70/1010, 700), 7 px lower | (54/1026, 464), in by 14 as on the band, 7 px lower | tilted −8° / +9°, their ink reached 6.3 / 5.4 px into the title box at 0; 7 is the least that clears it |
| Right-hand time and price | ≤ 250 px | ≤ 250 px | the day's width: the name keeps ≥ 320 px (story), ≥ 380 px (WhatsApp) |

The fitted sizes on the proof sheets (no clipped box, no cut line, on any sample or canvas): the title at 0.875 of its
authored size; two-line names 40.7 of 44 px; the stress test's longest names 30.8 and 28.6 px on the story, 37.4 and
34.1 on WhatsApp; "10:00 – 13:00" 29.75 of 34; "18€ without breakfast" 22.1 of 26.

## An older release

It ignores the template, so it draws a week flyer as an Activity one; and an older editor's save turns it into an
Activity flyer (the column and `data.template`, `normalize.ts` / `Api.php`). It keeps `data.week`, the title and the
eyebrow, so switching back to This week in the new editor restores it. Acceptable: the app is not live, and a release
is uploaded whole.

## What was verified, and how

| Check | Result |
|---|---|
| **The Activity story is unchanged** | `tests/render/baseline.spec.ts`, captured on `a24442b` before any edit (29 cases; the first capture attempt hit the spec's own render flake, the second passed). Checked after the renderer change, and again on the final code after the review's fixes: both times every **export** (58 checks: the default canvas and `canvas: 'story'`) came back **byte-identical**. Some **safe-zone overlay** screenshots (editor chrome, taken by the test's browser) differ by a few anti-aliased pixels at a chip frame's edge (54 px, max channel delta 3) or around the highlighter, a different set on each run (4 on the final run, 54–127 px each). A control run of the untouched `a24442b` build against the same capture shows the same differences (10 overlays, including the identical 710-px one), so they are this machine's rendering of that path, not this change. |
| `npm run typecheck` | clean |
| `npm test` | 180 tests, green. New: the week's geometry on every canvas (inside the safe box, no overlaps, five rows ≥ 12 px above the ask, the story's §2 numbers and WhatsApp's signed-off ones pinned); the sparks' ink never in the title box; `switchTemplate` round trips (an untouched draft exactly, a saved Activity flyer with its photo, chips and extras byte for byte); `followHostel`; `rowFromActivity` (the six design records as the prototype reads them, lookup by key, the code-point cut through an emoji, a 40 + 40 join cut to 80); `printedRows` (dangling `·`, the two-line price, empty rows); the limits (five rows, each field to its limit and not one more); copy rules on rows (the short name linted in place of the name, the shared budget, all-caps names, "Row n:"); the samples (order, titles, the Spanish line from `seed/hostels.json`). Mutation-checked: a UTF-16 cut, a renderer ignoring the short name, an uncleared week title and a lint ignoring the template each fail a test. |
| `npm run test:contract` | 325 passed, 184 skipped (the rows for a remote deployment); `node`, `node-json`, `php`, `php-basic`, `php-access`, `cross`. New: a week flyer created, read, reordered and listed by `?template=week`, alone and with `?hostel=`; the template column winning both ways; the week rows' limits named by dotted path; the Node and PHP backends giving the same `?template=week` answer over one store. |
| `npm run test:render` | 86 passed, 1 skipped (the opt-in baseline). Every week sample on both canvases, given a photo on purpose: every block where `weekGroups` puts it and every row where `weekRowRect` does; the art where `artAnchors(canvas, 'week')` hangs it; the safe box, no overlaps, no clipped copy; each row printing what `printedRows` says (the stress test's short name and two-line price spot-checked by value); a clock only with a time, a highlighter only with a day; the right group holding its lines; no photo drawn. Rows with nothing to print left out, the rest closing up. The export waits for a clock image held back 800 ms. The editor: the toggle and its defaults, the Spanish line following the hostel, rows typed / taken / reordered (focus following) / removed, a photo drop refused without an upload, an Activity flyer switched and back reading "Saved", a reopened flyer saved again still `week`, PNG and JPG of both canvases at their sizes, the flags, the library's Template filter. Fidelity: every week sample on both canvases, the in-browser export within 0.5 % of the server's (and at DPR 2 for the story stress week). |
| `npm run test:php` | 606 tests, 37 skipped (environment). The per-sample validator round-trips all nine samples byte for byte, the three week ones included. No PHP code changed. |
| `npm run test:php-smoke` | 2 passed: the existing session, and a week flyer on the PHP backend (made, a photo drop refused, reopened and saved again still `week`, PNG and JPG of both canvases through the in-browser exporter). |
| Chrome 143, the dev server on a scratch folder | A week flyer made from scratch (a typed row with a two-line price, two rows taken from saved flyers, the hostel picked and the Spanish line following) and one made only from saved flyers (Pizza night, the stress test, Paragliding). Both canvases previewed; PNG and JPG downloaded at exactly 1080 × 1920 and 1080 × 1440. Switched to Activity and back: "Saved". The flags show on both templates. |
| The Laragon PHP deploy (`https://localhost/nest-flyers-php/`) | `npm run deploy:backup` (9 flyers, 6 photos); `npm run build:php` (release `6d6754f22be4`); the release copied over the deploy additively; in Chrome, a week flyer from scratch and one from three of the library's own flyers, PNG and JPG of both canvases through the in-browser exporter at their exact sizes; `npm run deploy:restore … --force` put the 9 flyers back. The deploy keeps the new release, which serves https only. After the review's fixes, the final release (`d1d8fcef7c1b`, 389 files, 3.12 MB) went over it the same way, the library untouched (9 flyers): `api/config` reports it with no file missing or changed, http answers 301 to https, and in Chrome the editor runs its bundle, draws a week row with the capped column clipped inside the frame, and says the copy is cut off on both canvases. Nothing was saved. |
| The proof sheets | Every week sample on both canvases, clean and with the safe zones, plus the tight spots (row 5 against the ask, two-line names and prices, the long time, the title on the 1000 column, the sparks at 0 and 7 px). All twelve renders: no clipped box, no cut line. Signed off by Artur, 2026-09-29. |

## The review of the diff

Before any code, four critics reviewed the plan itself (23 distinct problems, all taken in: among them the scratch
commands that would have written into `./data`, zod leaking into the client bundles, the clock line's width pass
that could not fire, the sparks' measured ink, and locators the week's own copy would have made ambiguous).

After the build, four reviewers read the whole diff (correctness, the non-negotiables and DRY, whether the tests prove
the brief, backends and documents); a skeptic re-checked each serious finding against the code. All came back minor.
Re-graded by what staff would meet, and by the owner's standing rules, these were fixed, each with a test:

- **A time or price past its floor spilled out of its capped column**, across the row's frame and up to ~20 px into
  the side margin, while the editor said "cut off". The column now clips sideways (`overflowX: 'clip'`, §5's "the
  box clips"); a render test with a 19-character time and a 28-character price found 333 / 337 px of ink between the
  column and the frame before, none after.
- **The `·` button could push a price past its 30 characters**, and Save and Download then failed with "Some fields
  are not valid". `DotInput` now refuses an insert that would not save (test: a 30-character price is left as it is).
- **The comment on the name's `minWidth: 0` sat on the box**, whose `overflow: hidden` already gives it that minimum,
  and invited deleting the one on the name that matters. It now sits on the name.
- Test gaps: the render suite now checks the exact set of blocks each template draws and the lines each title
  prints (an edited title, its Spanish line emptied), the row's signed-off departures (time and price at most
  250 px wide, the name keeping at least 320 / 380 px and staying inside its box, a word too long for the column
  shrinking whole), and that the cap is what shrinks the stress test's long time and price; the editor suite, the
  short name (shown, stored, its key gone when cleared) and the five-row cap on both ways of adding a row.
- DRY, the owner's standing rule: the template names in the editor's copy come from `TEMPLATE_LABEL`; the week
  placeholders from `weekTitle()`; the `·` rejoin lives once in `chips.ts` (`joinDot`, `tidyDot`); the eyebrow,
  ask and pill boxes once in `layout.ts` (`sharedGroups`); the browser specs share `templateButton`, `rowField` and
  `bodiesOf`.

Deferred, minor, for Artur to decide (on 2026-09-30 he asked for all of them: `docs/prompts/week-template-followup.md`).
**All done on 2026-09-30:** see "Follow-up" below.

- "Added … from …" is shown even in the rare race where the week filled up (or the template changed) while the
  saved flyer was on its way, so the row was not added.
- A failed load of the saved flyers reads as "No saved Activity flyers yet"; only switching template or reloading
  retries.
- The week samples' Spanish lines spell the hostels' names (a unit test holds them to `seed/hostels.json`), rather
  than reading the file.
- Polish of tests that already pass: the offscreen canvas refitting a week edit, a template switch with a hostel
  already picked, the fidelity cases asserting their own template, the library filters combined, day and time lint
  cases, `baseline.spec.ts` skipping (rather than filtering out) cases it has no capture for, a save's URL settling
  before a reload, a template change saved on an existing flyer across the backends.

## Left open

- The height pass of `fit.ts` (the prototype's `_fit()`, ported verbatim) scales a box's copy down to 0.55 without
  looking at `data-fit-min`, so a name can end below §3's "never below 26px". Pre-existing, on both templates; not
  changed here. **Done** on 2026-09-30: each line now stops at its own floor (`docs/reports/open-items.md`, item 1).
- The proof-sheet script is not committed (it was the last time too): `npm run sheets` is still only a proposal in
  `docs/prompts/output-canvases-followup.md`.
- An untitled week flyer is named "What’s on this week" in the library, from its title lines. **Done**: it is
  `This week · <hostel> · <day>` (`docs/reports/open-items.md`, item 2).
- `tests/storage/copy.test.ts` can time out at vitest's 5 s default when the machine is busy — on `a24442b` too.
  **Done**: the file has a 30 s timeout of its own (`docs/reports/open-items.md`, item 4).
- The safe-zone overlays of `baseline.spec.ts` (not the exports) come back slightly different on this machine than
  when they were captured — on the untouched `a24442b` build too. Still so on 2026-09-30, on every check run of the
  follow-up, before and after its renderer change. **Done**: the fixture's route made Chrome's raster vary from load
  to load; the overlays are now shot from a context with none (`docs/reports/open-items.md`, item 5).
- From the follow-up (2026-09-30):
  - **A slash between two times** (`15:00/17:00`, also in the WHEN chip) still passes the copy rules: Artur declined
    flagging it (Part 0, question 3).
  - **A shrunk day that wraps again** can end its highlighter a few pixels past its column (6 px for
    `Tuesday Friday Monday Sunday`), in the empty gap before the name. `fit.ts` then reports it as overflowing, and
    the editor calls the copy cut off, though nothing is. Artur accepted the note rather than changing `fit.ts` or
    where every day wraps. It needs a day of three lines or more. Asked again with the fit's floors (2026-09-30):
    kept as accepted (`docs/reports/open-items.md`, item 1 bis).
  - Seen once: a golden server render answered 500 in `fidelity.spec.ts`'s `beforeAll`, after four failures (a
    mutation run) had restarted its worker. The rerun, and every other run, rendered it.

## Follow-up (2026-09-30)

In one line: the review's eleven deferred items are done, and so are three of the four problems found while writing
their brief. Brief: `docs/prompts/week-template-followup.md`. Branch `feat/week-template-followup`, from
`feat/week-template` (`be57d0e`).

### Part 0: Artur's answers (2026-09-30, quoted as given)

| # | Question | Answer | What it became |
|---|---|---|---|
| 1 | Item 1: the note when a taken row arrives too late | «Nome + cosa fare (Consigliato)» | `“Saturday is a pool party” was not added: a week holds 5 rows. Remove one, then add it again.` and `… this is an Activity flyer now. Switch back to This week, then add it again.` |
| 2 | Item 2: the saved flyers can't be loaded | «Messaggio + Try again (Consigliato)» | `Could not load the saved flyers` in the picker, and a `Try again` button beside it. No automatic retry. |
| 3 | Item 12: flag a slash between two times? | «No, lascia così» | Not done: under "Left open". |
| 4 | Item 13: a long day spilling out of its row | «Sì, box di fit (Consigliato)» | The day's own fit box (below). |
| 5 | Item 14: two actions at once | «Sì, un'azione alla volta (Consigliato)» | One action at a time. A photo dropped meanwhile gets `Still working on the last action — drop the photo again in a moment.` |
| 6 | Item 15: the library's out-of-order answers | «Sì, invisibile (Consigliato)» | Only the latest answer is applied. |
| 7 | Item 8: a day or time in capitals, still unflagged? | «Sì, nessun avviso (Consigliato)» | Pinned by a test: capitals in a day or a time get no sentence-case warning. |
| + | His dev server, before the first edits | «No, vai pure» | No open draft to lose. |
| + | Item 13, found while building it: a shrunk day that wraps again reported as cut off | «Accetta la nota (Consigliato)» | Kept as is: under "Left open". |

### What changed, per item

1. **A taken row that can't join says so** (`Editor.tsx`). `takeRefusal(d)` is the one rule, asked in three places:
   - when the flyer is picked, where it throws the reason alone (a guard, since the picker is off then anyway);
   - when the flyer arrives, against `latestDraft` (a ref set in a layout effect), where it throws the named note;
   - inside the functional update that appends the row.
2. **A failed load of the saved flyers says so** (`WeekRowsField`). A `failed` flag keeps `saved` null, so the picker
   stays off. The first option reads the failure, and `Try again` bumps an `attempt` counter in the effect's deps.
3. **The week samples read the hostels' names from `seed/hostels.json`** (`samples.ts`: the codebase's first JSON
   import, with the `type: 'json'` attribute). A slug the seed lacks throws. `seed/samples.json` came out
   byte-identical (`npm run gen`: up to date). `tsc` now emits `dist-server/seed/hostels.json`, which the render
   suite's seeding reads under plain Node. The browser bundle doesn't contain the seed.
4. **Tests: the canvas offscreen refits after a week edit and after a template switch alone**, and the cut-off note
   names only the canvas that clips. The word `electroencephalography` is 344 px at the name's floor, so it clips on
   the story (about 320 px of room) and not on WhatsApp (about 380). `cutOff` and `cutOffOn` are shared helpers.
5. **Test: a template switch with a hostel picked**, in five steps with Duque Nest and Los Amigos Nest.
6. **The fidelity cases check that they draw their own template.** Each checks the golden's blocks against
   `groupsOf` (`pixels.ts`, now shared with `render.spec.ts`), and the photo's box, or the no-photo rule's, within
   0.5 px.
7. **Test: the library's two filters together**: the exact combined query, the cards' meta, and both kept after a
   reload. `filterLibrary` and `libraryCard` moved into `tests/editor.ts` from the smoke spec.
8. **Tests: a row's day and time are linted**: each warning names its row, both spend the exclamation budget, and
   capitals are not held to sentence case.
9. **`baseline.spec.ts` takes every sample**: 32 cases, the three week samples included, each by its own template
   and with no photo.
   - A capture requires `RENDER_BASELINE_DIR`. It deletes the folder's labels first and writes `manifest.json`
     (`{ capturedFrom, cases }`) after its last shot.
   - A check skips, by name, a case its list lacks, and reports a listed case whose PNG is missing, then goes on.
   - A folder from before the list (`captured-from.txt`) is checked where it has the PNGs. No capture fails at once,
     and so does a check that compared nothing. One test, with a `test.step` per case and one summary line.
   - Two captures in a row failed on a safe-zone overlay whose three renders all disagreed (the known overlay
     noise). A capture now renders until two renders agree, five at most, and says how they differ when none do.
10. **`saveNew` is the one first-save helper** (`tests/editor.ts`). It hands the id to `keep` first, then waits for
    `#/flyers/<id>` and `Saved`. Both suites use it: the render suite in four places, the smoke spec in two. A new
    test delays the page's own read of the POST's answer by a second, behind a `window.fetch` wrapper, and
    reloads.
11. **Tests: a template change saved by a PUT, on every backend.**
    - The HTTP contract (`node`, `node-json`, `php`): to week and back, the way back with `data.template` left at
      week, so the column must win on an update too.
    - The storage contract on both Node drivers, and its PHP twin: `get` and every list follow the template.
    - `docs/api-contract.md` now says an update replaces the template and the hostel.
12. *Declined* (Part 0, question 3).
13. **A long day shrinks inside its row** (`Flyer.tsx`, `WeekRow`). The day sits in its own fit box: 114 px, centred
    in the 122 px row, with 122 − 114 even, so one- and two-line days land on the same pixels as before. It doesn't
    clip, since the highlighter reaches 8 px left of the cell. The boxes are named (`data-fit-box="day"`, `"name"`),
    and `render.spec.ts` selects the name's box by name.
    - Measured: the highlighter's stroke reaches past its line boxes, and the height pass measures it. So a
      three-line day also shrinks, to 30.6 px, and keeps its stroke inside the row, where at 34 px it crossed the
      frame by 1–3 px. `Tuesday Friday Monday Sunday` goes from four lines at 34 px to three at 30.6.
    - A box tall enough for three lines at 34 px (about 126 px) would be taller than the row, and the four-line day
      would still cross the frame. The brief expected three lines to fit at full size; they don't.
14. **One action at a time** (`Editor.tsx`). A drop while anything is out is refused with the approved line. The
    photo button is off while any action is out (`disabled={!!busy}`), and so is the saved-flyer picker
    (`WeekRowsField`'s `taking` became `busy`).
15. **The library applies only its latest answer** (`Library.tsx`). Each load is numbered in a ref, which covers
    the reload after an archive too.

### The red and mutation runs (each one seen failing, then reverted with the editor)

| Item | Run | Seen |
|---|---|---|
| 9 | today's spec looping over every sample, against a copy of `nest-week-baseline` | `ENOENT … This_week_Duque_Nest_-_bleed.png`, the run ends there |
| 9 | capture / check / a case off the list / `Pool_party_-_bleed.png` deleted / a copy of `nest-week-baseline` / only `captured-from.txt` / an empty folder | 64 PNGs and 32 listed / 32 compared / 31 compared, the case skipped by name / fails naming the file, 31 compared, no `ENOENT` / 29 compared, the 3 week cases skipped as legacy / 0 compared, fails "nothing compared" / fails at once "no capture" |
| 9 | a listed case's missing file treated as a skip; the list lookup always true; the nothing-compared guard dropped | the missing file no longer reported (skipped instead); the off-list case fails as missing files instead of skipping; the label-only run passes |
| 10 | the new test, with `saveNew` not yet waiting | red: the hash reads `#/new` |
| 10 | `replaceHash` removed from the first save | all four `saveNew` callers fail at the URL wait |
| 1 | both new tests on `be57d0e`'s bundle | red at the red note |
| 1 | the check after the fetch reading `draft`; the rule's template branch deleted; the layout effect deleted | both new tests fail; the second fails; the existing take test fails (and the first new one) |
| 2 | the new test on `be57d0e`'s bundle | red: `No saved Activity flyers yet` |
| 2 | deps back to `[]`; the rejection mapped to `[]`; `Try again` shown for an empty list | the retry never fetches; the option's text; the characterization test fails |
| 4 | `fitKey` without `d.week`; without `d.template`; the note naming every canvas | both tests fail; test A fails at the switch; test B fails |
| 5 | `switchTemplate(…, null)`; the name passed only on the way to the week; `followHostel(d.data, null, …)` | step 1 fails; step 2; step 4 |
| 7 | `api.ts` dropping the template when a hostel is set; `Library.tsx` ignoring the stored hostel; not saving it | the combined query never comes; the reload's query differs, twice |
| 14 | the new test on `be57d0e`'s bundle | red at the refusal |
| 15 | the new test on `be57d0e`'s bundle | red: `Pool party` shown under Duque Nest · This week |
| 3 | the new test on `be57d0e` | `expected 'El plan de la semana en Duque Nest.' to be '… DUQUE NEST.'` |
| 3 | a `hostelName` that falls back instead of throwing | the missing-slug half fails (the import resolves) |
| 8 | the day's lint line deleted; the time's; `row: i` dropped from the day; day and time added to sentence case | the first two tests fail, twice; the first fails; the third fails |
| 6 | the renderer drawing every flyer as Activity (`Flyer.tsx`), rebuilt, then reverted and rebuilt | all 7 week runs fail at the blocks check |
| 6 | the spec posting the week samples as Activity with no photo; every body posted in the sample's own photo mode | all 7 week runs fail at the blocks check (a first run also met the one-off 500 in "Left open"); Pool party's band and none fail at the photo's box, on both canvases |
| 11 | the SQLite UPDATE without `template`; the Node JSON file keeping the old template; its index row keeping it | the storage case (SQLite) and the `node` HTTP case fail; the storage case fails on `get`; it fails on every list |
| 11 | the PHP JSON repository keeping the old template | the PHP twin and the `php` HTTP case fail |
| 11 | the Node PUT without normalisation; the PHP PUT with the validator alone | `node` and `node-json` fail at the switch back; `php` fails there, and `BootstrapTest::testAFlyerFromCreateToArchive` answers 500 |
| 13 | the new test on today's renderer | red on both canvases: the day's stroke starts 21 px above its row |
| 13 | a box that clips the day without shrinking it | red on both canvases |

### What was verified, and how

| Check | Result |
|---|---|
| **The story is unchanged** | `baseline.spec.ts` with its new cases, captured into a fresh folder after item 9 and before item 13, checked on the final build: 32 cases compared, every **export** byte-identical, the three week cases included. The only differences are safe-zone overlays: the known noise, in the same spots and on random cases, on runs before the renderer change too. |
| **The week on WhatsApp is unchanged** | The three week samples exported on both canvases from the scratch instance before item 13 and after it, each re-saved first so the export cache couldn't answer: 6 of 6 byte-identical. |
| `npm run typecheck` | clean |
| `npm test` | 186 tests, green (180 before; new: three copy-rule tests, the samples reading the seed, the template change on both Node drivers) |
| `npm run test:contract` | 328 passed, 184 skipped (the remote rows), 325 before: the template change by PUT on `node`, `node-json` and `php`. |
| `npm run test:render` | 99 passed, 1 skipped (the opt-in baseline), 86 before: eleven editor tests (items 1, 2, 4, 5, 7, 10, 14, 15) and the long day on both canvases; the fidelity cases now check their own blocks. |
| `npm run test:php` | 607 tests, 37 skipped (environment), 606 before: the storage contract's template case. The sample round trip passes on the regenerated, byte-identical `seed/samples.json`. |
| `npm run test:php-smoke` | 2 passed, both first saves through the shared `saveNew`. |
| Chrome (Playwright), the dev server on a scratch folder | Item 1 with the picked flyer's GET held while the week filled: the named red note. Item 2: the list aborted gave `Could not load the saved flyers`, the picker off and `Try again`; let through and retried, the six saved flyers, no button. Item 14: Download held at the server's render, a photo dropped, the refusal, `Replace photo` off and no upload; released, the download done and the button back. Item 13: a week with the long day on its fifth row, previewed and downloaded as PNG on both canvases, the day in three lines inside its row and the ask clear, with the cut-off note as accepted. The library: Duque Nest and This week together, one card, both kept after a reload. |
