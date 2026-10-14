# Adding a look

The checklist for porting a new flyer design into the app as a **look** (the second one will come from Claude
Design's handoff folder; the brief Artur gave it is `docs/prompts/claude-design-brief.md`). Written 2026-10-14, when
the seam was finished (`docs/prompts/looks-seam.md` is the design, `docs/reports/looks.md` what was built).

A look is **data plus art read by the one renderer** (`src/flyer/Flyer.tsx`). It is never a second renderer, a branch
on its id, or a change to how Hand-drawn prints. Hand-drawn must stay byte-identical: capture the baseline before you
start, check it after every commit that touches `src/`.

## Before anything

- Read `docs/architecture.md` ("Looks"), `docs/prompts/looks-seam.md` (Artur's answers: not to be reopened),
  and the `Look` interface in `src/shared/looks.ts`. Every token there has a comment saying what it paints.
- Take the baseline: `RENDER_BASELINE=capture RENDER_BASELINE_DIR=<a temp folder>` on `tests/render/baseline.spec.ts`
  from the commit you start on (36 cases, both canvases). Check it with `RENDER_BASELINE=check` after each commit.
- What the design changes that a look **cannot** hold is a layout change, to settle with Artur before building: a
  box's width, the order of the boxes top to bottom, a safe zone, which fields print and how they collapse, the text
  limits, the copy rules, `fit.ts`, `EYEBROW_MARKS` and the hostels' badges. So are the sizes written inside the
  renderer that are no box of `layout.ts` (the day column's 250 and its 114 px fit box, the row name's 96 px box, the
  ask's 760 px column, the chips' and rows' padding): until a look needs one to differ, they are every look's. One that
  must differ moves into the look as a token (one line in the type, one in Hand-drawn's entry with today's value, one
  read in the renderer), with the baseline proving Hand-drawn did not move.

## The entry

- **One file** in `src/shared/looks/` (as `handDrawn.ts`), **one line** in the registry in `src/shared/looks.ts`, after
  Hand-drawn. Type it as `Look`: the compiler lists every token it lacks.
- **Its id** is a slug, stored in every flyer saved in it (`data.look`): **forever once a release accepts it**, never
  renamed or taken back. Its `name` is what staff read on the switch.
- **It imports no value** from `schema.ts`, `defaults.ts`, `names.ts`, `brief.ts`, `samples.ts` or `copyRules.ts`
  (`schema.ts` reads the registry when it loads), and never from `src/editor` or `src/flyer`.
- **Its palette** is a function of the flyer, but a new look ignores `data.colors` and `data.doodles`: those are
  Hand-drawn's own (step 7 will add a store per look).
- **A treatment the tokens cannot express** (a frame that is a plain rounded box, a highlighter that is a flat band)
  becomes a new *kind* of that decoration: a token chooses it, its one component draws each kind. Never
  `if (look === …)`: `tests/unit/looks.test.ts` fails on a look's id written in `src/flyer` or `src/editor`.

## Fonts

- The family in `src/shared/fonts.ts` (where every family name lives), the `@fontsource` package pinned exactly in
  `package.json`'s `dependencies`, each weight imported in `src/flyer/fonts.css`, and listed in the look's `faces`.
- The tests hold it: every face its type uses is in `faces`; each is a family of `fonts.ts` from a pinned package;
  `fonts.css` imports exactly the shipped looks' faces. `prepareFlyer()` waits for the look's faces before an export.

## Art

- New files with **new names** under `assets/art/` (PNG), each hung from an anchor (`ArtAnchor` in `layout.ts`: the
  canvas, the photo's corners, the bottom corners, `pillEnd`, `askEnd`). **Never overwrite a file**: the export cache
  is keyed by the flyer's data, not the files' bytes, and an older release may still draw the old file.
- The wordmark is the look's (`wordmark`); the hostels' badges beside it are every look's.
- The release copies `assets/` whole: new art ships with the release, before the site names the look.

## Boxes

- A box's own top and height, per canvas, only where the design needs it (`Geometry` in `layout.ts`). The photo's
  height too: a flyer switched to the look shows **another cut of its photo from the same stored crop**. Show that on
  the proof sheets, with a flyer whose crop someone set.
- `tests/geometry.ts` holds every look's boxes (safe zone, no overlap, the stack in order with 4 px under the pill,
  five rows 12 px above the ask, one photo shape per mode on every canvas, fitted boxes at least the story's). A
  failure names the box and the canvas.
- Inside one look each photo mode keeps one shape on every canvas: WhatsApp's band is 1000 wide where the story's is
  940, so its height is the story's × 1000 / 940 (to 0.5 px).

## Contrast and inks

- `rules`: the look's contrast minimum and the inks it may never print in. **Artur settles both** when the design is
  on the table (his answer 10; he left orange open in the brief). Every line of copy declares its ink and the ground
  it sits on, and the test holds each to the minimum.
- **Trap (found 2026-10-14): the highlighter is a picture.** The contrast test reads the palette's `highlight`, the
  colour the look *says* is under the WHEN chip's day and each week row's day; the renderer paints the `highlighter`
  file there. Nothing checks they agree: pick `highlight` from the file itself, and look at the day on the sheets.

## The fit

- The fit (`fit.ts`) is shared and never changes for a look: a smaller box cuts copy off sooner, and the editor says
  so.
- **Trap (found 2026-10-14):** the fit's width pass sizes each line to its width, then the height pass shrinks a whole
  box, which can re-wrap a line, and nothing checks its width again. With the proof look's monospace face the WHEN
  chip's day came out 7 px past its cell on the highlighter-wrap sample. Hand-drawn never meets it. The browser check
  (`tests/render/drawnChecks.ts`, "overflowing lines") names such a line: cure it with the look's own tokens (its
  size, floor or line height), not in `fit.ts`.

## Proving it

- The unit tests run every look in the registry through `tests/lookContract.ts` (boxes, contrast, art files, the
  pill's tilt, faces). Nothing to add for a shipped look.
- In the browser, do for the new look what `tests/render/looks.spec.ts` does for the proof look: the samples through
  `checkDrawn()` on both canvases (pass the look), the client export within 0.5 % of the server's, the library card
  fitted as the export, every way out in the look. Run in the `render` project: the release's build has the look.
- `npm run gen`: `schema/shared.json`'s `looks`, and the enum in the flyer schemas, gain the id. PHP reads them at
  runtime: no PHP code changes. Add the id's row to the contract where the proof look's is
  (`tests/contract/validation.test.ts`: a look the release has saves).
- **Proof sheets** of every sample, both canvases, both templates, each photo mode, in the new look and in
  Hand-drawn: **signed by Artur before the commit** that ships it.
- The gates: `npm run typecheck && npm test && npm run test:contract && npm run test:render`, then
  `npm run test:php` and `npm run test:php-smoke`; the baseline; the editor in Chrome on both canvases.

## Shipping it

- The release goes up **whole**, before any site names the look (`docs/deploy.md`, "The looks a flyer prints in").
  An older release refuses `'looks'`, and a release without the look refuses its name.
- Then the setting: `'looks' => ['hand-drawn', '<id>']` in `config.php`, **the Laragon copy first**, then live's;
  `LOOKS=` in `.env` on a Node machine. The first named is what a new flyer starts in. With two named, the editor shows
  the Look switch under Template.
- Going back: `docs/deploy.md`, "Rolling back" (take the id out of `'looks'` first).

## The proof look stays

The tests' own second look (`tests/proof/`, id `proof-look`) is a canary and never ships: it lives in `dist-proof/`
alone (`npm run build:proof`), served by `tests/proof/server.ts` to the Playwright project `looks`. `build:php`
refuses a release that names it. Keep it: it differs from every shipped look in every token, so it catches a
renderer that reads a look's value from the wrong place. If a new token is added to `Look`, give the proof look a
value of its own for it, unlike every shipped look's. Its canaries (`tests/unit/proof-look.test.ts`, "differs from
hand-drawn in every token", and the canary in `tests/render/looks.spec.ts`) compare it with Hand-drawn alone: when a
second shipped look arrives, make them compare it with every shipped look.
