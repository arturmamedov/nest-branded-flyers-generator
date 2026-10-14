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
