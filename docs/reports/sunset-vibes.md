# Report: the Sunset Vibes look

The master plan is `docs/prompts/sunset-vibes-look.md`, written on 2026-10-30 from Claude Design's handoff
(`design_handoff_new_look/design_handoff_sunset_vibes/`, outside git); Artur's answers of that day are in it. One
section per stage.

## Stage 1: the look as data inside the seam (2026-10-30)

Branch `feat/second-look`, cut from `main` at `d309edf`. Eleven commits, `7443305..9d34b03`, nothing pushed, no release
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
