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

Deferred, minor, for Artur to decide:

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
  changed here.
- The proof-sheet script is not committed (it was the last time too): `npm run sheets` is still only a proposal in
  `docs/prompts/output-canvases-followup.md`.
- An untitled week flyer is named "What’s on this week" in the library, from its title lines.
- `tests/storage/copy.test.ts` can time out at vitest's 5 s default when the machine is busy — on `a24442b` too.
- The safe-zone overlays of `baseline.spec.ts` (not the exports) come back slightly different on this machine than
  when they were captured — on the untouched `a24442b` build too.
