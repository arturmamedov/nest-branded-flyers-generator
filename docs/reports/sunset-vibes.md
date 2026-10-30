# Report: the Sunset Vibes look

The master plan is `docs/prompts/sunset-vibes-look.md`, written on 2026-10-30 from Claude Design's handoff
(`design_handoff_new_look/design_handoff_sunset_vibes/`, outside git); Artur's answers of that day are in it. One
section per stage.

## Stage 1: the look as data inside the seam (2026-10-30)

Branch `feat/second-look`, cut from `main` at `d309edf`. Ten commits, `7443305..9d34b03`, and the record’s after them; nothing pushed, no release
built, the live site and the Laragon copy untouched. Nothing a staff member sees changes: no site names the look, so
no switch shows and every new flyer is still hand-drawn. A flyer saved in the look (`data.look: 'sunset-vibes'`) opens,
saves and prints in it on both backends.

### Artur's answers that day (not to be reopened)

Asked one at a time, keep or strike, the recommendation first. The full table, each answer with what it means for
the port, is in the plan file ("Artur's answers").

| # | Question | His answer |
|---|---|---|
| 1 | Id and name | Kept: `sunset-vibes`, "Sunset Vibes" |
| 2 | The marks on the blob | **Struck**: "badge beside the wordmark, as Hand-drawn" |
| 3 | "Activities" | Kept: printed by the lockup kind as a fixed word |
| 4 | The pill | **Struck**: "a plain line in the footer's slot" |
| 5 | The extras | Kept: the notes line between the columns and the ask |
| 6 | In a frame | **Struck**: "prints exactly as Full bleed" |
| 7 | No photo | **Struck**: "a placeholder where the photo would be" |
| 8 | The streaks | **Struck**: "port the generator now" (a stage of its own: stage 3; the stages are seven now) |
| 9 | The lower ferns on WhatsApp | Kept: both at 87 % |
| 10 | The columns' order | "Answer from stage 3's pictures" (the blocks stage, 4 now) |
| 11 | The week photo | "One photo per hostel by default and user can change it by upload or by future media library" |
| 12 | The fields of README §7.5–7.9 | All four: "I think is better to include everything and after with a condition remove what is missed better then develope new data" |
| 13 | Spanish row names | Kept: a field, written by staff and the AI |

### What was built

| Commit | What |
|---|---|
| `7443305` | The plan file with the answers, the status lines, the note on `second-look.md`. |
| `ad15520` | The palette's `hot`, `value` and `line` roles. Hand-drawn's are its accent, its ink and the text teal (read by nothing there); the proof look's its own. `tests/lookContract.ts` holds `line` to 3:1 on the ground. `proof-look.test.ts` compares the proof with every shipped look, not hand-drawn alone. |
| `5e1662b` | `LineType.rotate` (drawn by `typeStyle` as a transform) and `LineType.minContrast` (the contract holds the line to it). The proof look turns its eyebrow 2° and gives its Spanish line a minimum of its own; `looks.spec.ts` reads the turn back from the computed transform. |
| `863505c` | `weekPriceSub`: the part of a price after its middle dot is a line of its own. Hand-drawn's equals its price line; the proof's is smaller; `drawnChecks` holds each cost line to its look's size. |
| `38485c5` | The inline slots may be null (nothing drawn there), and two joined: `costIcon` (the € glyph when null) and `askIcon` (for the ask kind to come). `drawnChecks` counts each block's inline art as the look has it, reads the week stress test's floors from the look, and expects the look's own count of art off the pill. |
| `2d7e3ae` | The eleven Day art files from the handoff under the README's names (§5), nothing overwritten. |
| `4eff0d7` | `fitOf()` writes nothing for a line with no floor: it is not fitted (it wrote `data-fit-min="undefined"`, which `fit.ts` read as no shrink and the checks as a floor). The proof look's price sub-line has none; the browser check refuses a fitted line whose floor is not a number. |
| `cb0f801` | `Look.marks` (which marks print, how tall), read through `marksOf()` in `defaults.ts` (`EYEBROW_MARK`: 56 px, 6 above). Absent, the app's setting at the wordmark's height. The proof prints the badge alone at 48; the contract holds every look's marks to its eyebrow box; the editor's help on the hostel field follows the flyer's look. |
| `0b10183` | **The entry**, `src/shared/looks/sunsetVibes.ts`: Day's palette, the type table (README §4; no floor on labels, asks and row text), the faces (Archivo Black 400, Caveat Brush 400 from `@fontsource`, pinned `5.3.0`; Montserrat 400 and 500 join `fonts.css`), the art today's anchors can hang (the confetti, the top-right botanical, the band at full size on both canvases), the icons as PNG files per ink made by `npm run gen:art` from the paths the entry holds (`scripts/art-sunset-icons.ts`, `tests/unit/art-sunset-icons.test.ts`), the wordmark in the text teal, no frame, today's pill with no corners and no tilt, the marks as hand-drawn. The registry line; `npm run gen` (the enum and `schema/shared.json` carry the id; PHP reads them, no PHP code changes); the contract row (a look the release has saves and reads back); `looks.test.ts` pins it. `CLAUDE.md`'s `gen:art` line. |
| `9d34b03` | `tests/render/shipped-looks.spec.ts`, in the `render` project: every sample × body × canvas in every shipped look after the first through `checkDrawn`, its faces' letters (`Ñ ñ Á É Í Ó Ú ¡ ¿ € · ’` inside the loaded subsets' `unicode-range`), the client export within 0.5 % for four cases, the library card fitted as the export. The proof project's file match wants a name that starts with `looks`. The canary in `looks.spec.ts` compares the proof's paints with every shipped look's. `serverPng` and `pixel` move to `tests/render/exports.ts`. |

Where stage 1 departs from the plan's "What stage 1 builds" (each confirmed with Artur at the plan's approval, and
written into the plan file's "What stage 1 found"): the entry's geometry is the shared table (its tops rest on the
photo behind, stage 2's); `rotate` is in the seam but not on Sunset's words until the staggered kind; `marks.height`
is 56 until the lockup's box; the extras keep a floor of 0.8 in today's row kind; no nullable pill (answer 4).

### How it was held

- **The drawing did not move.** The baseline (`tests/render/baseline.spec.ts`, 36 cases on both canvases, the export
  and the overlay) captured from `7443305` into the temp folder `nest-sunset-baseline`, and checked byte-identical at
  `ad15520`, `863505c` (commits 4 and 5 together), `38485c5`, `4eff0d7`, `cb0f801` and `0b10183`; `9d34b03` touches no
  `src/`.
- **The gates at the end**, at `9d34b03`: `npm run typecheck && npm test && npm run test:contract && npm run test:render`,
  all green: 949 unit tests (58 files), 390 in the contract suite (235 skipped: the projects that need a deployment,
  as always here), 431 in the browser (the `render`, `ai` and `looks` projects; one skip, as before; 12.3 min).
- **PHP**: `npm run test:php`, 958 tests (38 skipped, as before), against the regenerated schema; `npm run test:php-smoke`,
  3 passed, on the same build.
- Each commit ran the unit suite, the typecheck, and the browser specs it touched (`render.spec`, `looks.spec`,
  `art.spec`, `editor.spec` as the change asked), on a fresh build.
- **The sheet**: `backups/second-look/stage-1-sheet.png` (outside git), drawn by the server's export of the built app
  through `backups/second-look/sheet.ts` (a throwaway the next stages can reuse: it seeds a library on a port of its
  own, saves each sample in each look, exports both canvases, composes one PNG). Pool party, the Long copy stress
  test and the This week stress test, Hand-drawn above Sunset Vibes. Sent to Artur; not for signing.

### Found on the way

- **The design's boxes cannot come before the photo is behind.** `tests/geometry.ts` refuses the Activity tops while
  the photo is in the stack (the headline at 755 overlaps the shared photo on the story; on WhatsApp the eyebrow at
  163 runs into the headline and the chips at 784 into the band), and "fitted boxes at least the story's" ties the
  canvases. Stage 2 sets every top and height with `photoBehind`.
- **Archivo Black is wide.** The stress test's 18-character headline at the floor of 144.64 px (86.8) is wider than the
  safe column on both canvases, in every photo mode: the editor says it is cut off, and the spec lists it as the
  one known cut. The design's face holds about 14 upper-case letters in 940 px at that size; the staggered kind fits
  each word to its own room (cap 840 / 560), so a long first word stays cut unless the floor goes below the design's
  0.6. Nothing else is cut or clipped on any sample in the look.
- **A browser run reads the specs live and the app from `dist/`.** Two false failures cost a cycle: the specs had the
  next commit's `drawnChecks` while `dist-proof/` was built before its source edits. Never edit `tests/render`,
  `tests/proof` or `src/` while a run is on; the stage blocks now say so.
- **The week stress test's cap check was Hand-drawn's fact**: its wide face overflows the 250 px column and shrinks;
  Montserrat's time fits at its size. The check now shrinks a line only when, at its size, it would not fit its cell.
- **`fitOf()` wrote a floor of `"undefined"`** for a line without one. No hand-drawn line reached it; the proof look's
  price sub-line proved it in the browser before the fix.
- **A new entry breaks the build before its fonts exist**: `tsc` refused the entry's import of the two families until
  `fonts.ts` had them, which is why the fonts and the entry are one commit (the plan said so for `fonts.css`'s test).
- **Seen once**: the first server export of a Sunset week flyer in the sheet's run answered 500 while the render suite
  ran beside it; the re-run and the spec's exports passed. An export under load; watch it.
- The icon PNGs are librsvg's raster: the unit test holds the committed files to the script's within 0.5 % of pixels,
  not byte for byte, and to a flat ink.

### For Artur to decide

- **The headline floor in this look.** The design says 0.6 and never lower. With Archivo Black that cuts a first word
  longer than about 14 letters (the stress test's 18) on both canvases, with the editor's cut-off warning. Keep 0.6
  as the design (my advice: staff see the warning and shorten the word, as they do in Hand-drawn for the WHERE chip),
  or give this look a lower floor for its headline words.
- **The extras' floor** (0.8, kept for today's one-row kind): the notes line of stage 4 wraps instead; whether it then
  keeps a floor is answered from that stage's pictures.

### Next: stage 2

Stage 2's block is in the plan file, brought up to date (the geometry, the photo modes as answered, the tilt on the
words). Suggested run: Claude Fable 5.1 (`claude-fable-5-1`), effort **high**, started in plan mode.

## Stage 2: the photo behind, the headline (2026-10-30, unattended)

Run overnight, unattended, on `feat/second-look` from `47e9712`: nobody answered, so where the block says "I answer
from them" or "for Artur to decide" the plan's recommendation was taken, and each is listed below with the picture
that shows it. Four commits of code, `13a3590..96b042e`, and the record's after them; nothing pushed, no release
built, the live site and the Laragon copy untouched. An Activity flyer in Sunset Vibes now prints the design's top
half on both canvases in each photo mode: the photo behind everything, the splash and its botanicals, the two words
staggered and turned, the Spanish line centred under them. Hand-drawn did not move by a pixel. Nothing a staff member
sees changes: no site names the look.

### The plan of the night, as built

| # | Piece | Seam change | Commit |
|---|---|---|---|
| 1 | The `photoBottom` anchor | `ArtAnchor` + `photoBottom`; `ArtPoints` (every anchor but that one always there); `placeArt()` answers null where the body lacks the anchor, and the renderer draws nothing; the proof look hangs a piece from it | `13a3590` |
| 2 | The photo behind everything | `Geometry.photoBehind` (on the geometry, not on `Look`: every reader of a geometry learns it); `boxesOf()` gives the band's and the no-photo rule's boxes the bleed's; the renderer draws the photo group first; `tests/geometry.ts`, `drawnChecks` and `pixels.ts` let the photo be | `09fefb7` |
| 3 | The look's Activity geometry and its art | The plan's table on both canvases; the splash and the three botanicals on `photoBottom`; a browser test for answers 6 and 7 | `5adaf0e` |
| 4 | The staggered headline kind | `Look.headline?: StaggeredHeadline` (`word1`, `word2`: `dx`, `y`, `rise`, `cap`, `margin`; `spanishTop`); `wordSlot()` in `layout.ts`; `StaggeredHeadlineBlock` in the renderer; `rotate` on the two words; the stacked kind leaves a line's turn | `96b042e` |
| 5 | The record | This section, the plan file, the status lines | after it |

### What was built, commit by commit

- **`13a3590`, the anchor.** `photoBottom` is the bottom-left corner of the photo box a body draws (the bleed's and
  the band's end alike). A body with no photo box (no photo, a week flyer) has no such point: `artAnchors()` returns
  `ArtPoints`, where that one anchor is optional, `placeArt()` answers null for a piece hung there, `Flyer.tsx` skips
  it and `drawnChecks` expects none. Hand-drawn's `FOLLOWS` names the anchors it uses. The proof look hangs a
  `spark-yellow` from it, and `proof-look.test.ts` holds it to a piece on every anchor a look's own art may use.
- **`09fefb7`, the photo behind.** `Geometry.photoBehind`: the photo as background art, drawn first (the flyer's
  first block, so the art and the copy paint over it), in the bleed box in every photo mode, free of the safe zone
  and the stack. With it, `boxesOf()` makes the band's and the no-photo rule's boxes the bleed's: `photoFrame()`
  answers the bleed's shape for the band (one crop serves both modes, answer 6), `activityGroups()` puts the photo
  group there in every mode, and `artAnchors()` has a `photoBottom` with no photo too (the placeholder's box, answer
  7). `tests/geometry.ts` keeps every rule for the text boxes (a photo above the canvas and under the headline passes;
  a headline out of the safe zone is still named) and keeps the photo edge to edge, one shape on both canvases, and
  above the chips. `drawnChecks` lets the photo leave the safe box and lie under the blocks. The fidelity mask
  (`pixels.ts`) takes the other blocks' boxes out of the photo's mask, so the words drawn over the photo stay in
  every metric (hand-drawn's photo meets no other box: nothing changes there).
- **`5adaf0e`, the look's geometry and art.** The plan's table: the photo 0 / 948 on the story and −318.8 / 948 on
  WhatsApp; the eyebrow 173.2 / 163.4 tall; the headline (and the no-photo headline) 755 / 320 and 436.2 / 320; the
  chips 1103 / 206.3 and 784.2 / 206.3 with no gap; the extras 1313 / 36 and 994 / 36; the ask 1353.3 / 188 and
  1034.5 / 188; the pill 1572 / 44 and 1253 / 44. The week's title and rows are **transitional** until This week B
  (the title at 593 / 378.3 in the shared 250 box, five rows of 64 at 938 / 20 and 640 / 15): the design's week ask
  box comes with stage 6, and five rows must end above the Activity ask. The art in the handoff's draw order: the
  splash (`sunset-splash-day`, 0 / −448.81), the confetti, fern-w (0 / −484.14), the top-right botanical, fern-r
  (997.88 / −394.38), the monstera (94.54 / −401.07), the band. `shipped-looks.spec.ts` holds the photo first under
  everything on both canvases in every mode, a copy In a frame byte-identical to a copy in Full bleed (fresh copies up
  to three times, for Chrome's rasterising flakes), and No photo as the placeholder in the photo's box with the
  splash (a pixel of each). The client-export test's ground pixel moved from the corner to the splash for a look with
  the photo behind.
- **`96b042e`, the staggered headline.** `Look.headline` is the kind: each word centred `dx` from the canvas's
  middle, its baseline `y` into the box, fitted to its slot (`wordSlot()`: `min(cap, 2 × the room to the nearer safe
  edge − margin)`, 749.62 / 474.06 on the story, 809.62 / 534.06 on WhatsApp), turned by its line's `rotate` about
  its baseline centre, which lands on the slot's top-middle: the line box is turned about the point `rise` into it
  and moved up by `rise` em, so the fit's size carries it (`rise` is where the face's baseline falls in a line at
  line-height 1, measured in Chrome: Archivo Black 0.86, Caveat Brush 0.83). The Spanish line is centred at
  `spanishTop` (248.93) across the box, wrapping balanced, floor 0.8 as before. The words are out of the flow, so a
  long Spanish line never moves them. Sunset's numbers are the plan's: word 1 at −70.19 / 151.03, word 2 at
  222.97 / 212.15 (PB − 41.97 and PB + 19.15 on both canvases), caps 840 / 560, margins 50 / 20, turns −9.5° and
  −6.5°. The week's title keeps the stacked kind until stage 6, and the stacked kind now leaves a line's turn
  (`upright()`): with `rotate` on the words, the week's title drew them turned in its box and the sparse week's title
  clipped on both canvases, stage 1's trap met. `shipped-looks.spec.ts` reads each word's slot, row, size, turn,
  origin and move back from the page, and the Spanish line's top and alignment; its CUT table lists what the kind
  cuts (below).

### How it was held

- **The drawing did not move.** The baseline (`nest-sunset-baseline`, captured from `7443305`, 36 cases on both
  canvases) checked byte-identical before anything at `47e9712`, then at `13a3590`, `09fefb7`, `5adaf0e` and
  `96b042e`: 36 compared, 0 skipped, every time.
- **Each piece's gate** on a fresh build: the unit suite, the browser specs it touched in the `render` project
  (`render.spec`, `shipped-looks.spec`, `art.spec`, `fidelity.spec`, `editor.spec` as the piece asked), the proof
  look's `looks.spec` on `dist-proof/`, then the baseline.
- **The gates at the end**, at `96b042e`: `npm run typecheck && npm test && npm run test:contract && npm run
  test:render`, all green: 960 unit tests (58 files), 390 in the contract suite
  (235 skipped: the projects that need a deployment, as always here), 433 in the browser
  (one skipped, as before; 11.4 min).
- **Chrome** (the installed one, driven by Playwright from `backups/second-look/tmp/chrome.mts`): the editor with a
  Pool party copy in the look, the preview in the three modes on both canvases, the photo handle dragged on WhatsApp
  where the photo starts above the canvas (its box begins 99 px above the stage on screen, cut by the canvas; at 2×
  the drag moved the crop, y 0.5 → 0.39, and the save took it; at 1× the photo just covers its frame and cannot pan,
  as in Hand-drawn). `backups/second-look/stage-2-chrome-*.png`.
- **The pictures** (outside git, drawn by the server's export of the built app through `backups/second-look/sheet.ts`,
  which now takes a sheet's name and draws Pool party and the Long copy stress test in the three photo modes and the
  This week stress test, Hand-drawn above Sunset Vibes, both canvases):
  - `backups/second-look/stage-2-photo-behind.png`: at `5adaf0e`, the photo behind, the headline still stacked.
  - `backups/second-look/stage-2-headline.png`: at `96b042e`, the headline staggered.
  - `backups/second-look/stage-2-headline-cuts.png`: at `96b042e`, Pizza night, Surf lesson, Pizza · weekly and
    Paragliding in Full bleed: the samples whose headline the kind cuts on the story, and one it does not.

### For Artur to strike (each a recommendation taken in his place; the picture shows it)

| Decision | Taken | Picture |
|---|---|---|
| The headline floor stays 0.6 (settled for the night). With the words staggered, a second word's slot on the story holds about 9 Caveat Brush letters at the floor and the first word's about 14: four of the six Activity samples cut a line on the story (Pizza night and Pizza · weekly "Family dinner,", Pizza · weekly "every Friday.", Surf lesson "of fun waves."), the stress test both words on both canvases; WhatsApp cuts the stress test alone. | The samples' copy kept, each cut listed in `shipped-looks.spec.ts`'s CUT table with its why; the editor says it is cut off. His to strike: a lower floor for this look's words, a wider second slot, or the samples' copy. | `stage-2-headline-cuts.png`, `stage-2-headline.png` |
| The Spanish line's place: the design measures the headline's ink and sets the line 24 px under it. | A fixed top in the box (248.93, the design's with "Vibes" at full size): a short or shrunk second word leaves a little more room above the Spanish line than the design would. | `stage-2-headline.png` (Pool party: "pool party." fitted smaller) |
| The week flyer in the look until stage 6 (the title and rows had to move: the taller eyebrow and the Activity ask's new top break the shared week table's rules). | A transitional week geometry: the title stacked and upright at 593 / 378.3 in the shared 250 box, five rows of 64 px in today's framed kind (their day and name boxes reach below a 64 px row). Not a print anyone sees: no site names the look. | `stage-2-photo-behind.png`, `stage-2-headline.png` (the last two columns) |
| No photo in the look: the preview's photo handle. | `photoFrame()` answers null for No photo (nothing to crop, and the ways out stay open, answer 7), so the preview shows no handle and no "Drop the event photo here" over the placeholder box; a drop on the stage still lands. | `stage-2-chrome-story-no-photo.png` |
| Where `photoBehind` lives: the plan's table said `Look.photoBehind`. | On the look's `geometry` (`Geometry.photoBehind`): it says where the photo box sits against the stack and the safe zone, which is geometry, and every reader of a geometry (`boxesOf`, `photoFrame`, `activityGroups`, `artAnchors`, `geometryProblems`) learns it without a second argument. | — |
| The eyebrow on the raw photo (no blob until stage 5): "NEXT ACTIVITY" and the marks sit on the photo's top on both canvases, small and dark on a bright picture. | Left as the plan stages it; stage 5's lockup and blob cover it. | `stage-2-photo-behind.png` |
| The splash-edge botanicals: the design moves each to clear text, the app does not (the plan's "fixed"). | Fixed where the plan puts them; nothing of the samples' copy meets them. | `stage-2-photo-behind.png` |

### Found on the way

- **Chrome snaps a baseline to a whole pixel** (the probe read 124 of 144.64 px for Archivo Black, 162 of 188.17), so
  `rise` is the face's share at 100 px (0.86, 0.83) and a word's baseline may sit up to half a pixel off the design's.
  Measured with `backups/second-look/tmp/measure-rise.mts` (a zero-size inline-block aligned to the baseline).
- **A box's edges read back at 1/64 px** (the WhatsApp photo's top is −318.796875): the spec compares them to a tenth.
- **`playwright test --project render <file>` reads the file as a project name** (`--project` is variadic): write
  `--project=render`.
- **A throwaway outside the repository cannot resolve `node_modules`**: the night's scripts live in
  `backups/second-look/tmp/` (git-ignored).
- **The stacked kind and a turned line** (stage 1's trap, met): `typeStyle()` draws any line's `rotate`, so the
  week's title drew Sunset's words turned in its stacked box and the sparse week's title clipped. The stacked kind now
  draws its lines upright; the proof look's turned eyebrow is not a headline line, and hand-drawn turns nothing.
- **The turned words never trigger the height pass** on any sample: word 1's turned line box ends about 233 into the
  320 px box, word 2's about 271, the stress test's two-line Spanish line at 302.
- **In a frame and Full bleed export byte-identical** in the look, on both canvases, first try (the test allows three).
- **The client export matches the server's within 0.5 %** with the photo behind and the words turned (Pool party in
  the band and the bleed, Paragliding with no photo, the week stress test, both canvases): modern-screenshot carries
  `transform-origin` in percent, `translateY` in em and `text-wrap: balance`.
- **The export under load, seen again**: the first sheet of the night died while a gate's browser run competed with
  it (stage 1 saw a 500 the same way); run by itself it drew every export. The sheets were drawn between runs.
- `backups/second-look/tmp/cuts.mts` lists every cut line and clipped box in the look at once; the per-canvas sample
  test stops at its first.

### Next: stage 3

Stage 3's block is in the plan file, brought up to date (the staggered kind's markup and hooks, the words' slots and
fit, the cuts). Suggested run: Claude Fable 5.1 (`claude-fable-5-1`), effort **high**, started in plan mode.
