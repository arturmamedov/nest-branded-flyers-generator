# Design decisions already made

## The layout pass

- The team's layout pass (2026-09-18) departs from the prototype on purpose: headline at 345, sparks
  anchored to the photo's top corners, no clock. The numbers live in `layout.ts` / `looks/handDrawn.ts` with
  comments. `compare:design` is a reference report now, not a gate.

## Photo crop

- Photo crop is stored per flyer in `data.photoCrop` (focal x/y + zoom ¼–4×, free positioning, the photo's
  centre stays in the frame).

## Output canvases

- Output canvases (2026-09-23, `docs/reports/output-canvases.md`): the canvas is how a flyer is printed,
  never flyer data (a per-viewer toolbar choice; the export API takes `canvas`, default `story`). One crop
  serves every canvas because each photo frame keeps the story's aspect per mode. The template art follows
  each canvas through render-only anchors (`resolveDoodles`), so stored doodles never changed and an older
  release still reads every flyer. Every canvas is fitted in the editor, the others offscreen with the same
  `<Flyer>`. The story renders byte-identical to before (`tests/render/baseline.spec.ts`, opt-in).
  A viewer who never chose sees WhatsApp (`DEFAULT_CANVAS`, the owner's answer, 2026-10-05): the editor (a stored
  choice still wins), the AI page's preview and the library's pictures. It is the screen's default alone: the
  export API and the render page keep `story` for a request that names no canvas.

## The editor pass

- The owner's editor pass (2026-09-28) supersedes two handoff lines; the handoff itself stays as
  delivered:
  - a new flyer, and a photo dropped on "No photo", land "In a frame" (`DEFAULT_PHOTO_MODE` in
    `defaults.ts`; §1 item 4 said full bleed);
  - the copy may use `MAX_EXCLAMATIONS` exclamation marks (`copyRules.ts`), and the tag pill's own
    is free (§12 bullet 1 allowed one per flyer, which the pill always spent).

## This week

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

## The open items

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

## The tag pill and the art

- The tag pill, and the art that follows the copy (2026-10-12, the editor's UX round, Part 4; his answers are
  quoted in `docs/reports/editor-ux.md`). All of it is in the renderer: **never change a number or a slug in
  `DEFAULT_DOODLES`**, every stored flyer carries a copy and `sameDoodles()` is how an untouched set is known.
  - The pill is one fitted line: the handle, the dot and the tag shrink together to fit the safe column, down to
    0.7. Only the letters shrink. Past the floor the line is cut at the pill's edge and the editor says so. The
    pill stays 1 px inside its column (`PILL_TILT_ROOM`): its tilt lifts a corner.
  - The tag may be 24 characters (was 12); the handle keeps 18. Needs a release: an older one refuses a longer
    tag (`docs/deploy.md`, "Rolling back").
  - The spark off the pill's end hangs from the pill (`pillEnd` in `artAnchors`; it took the place of `floor`).
    `Flyer.tsx` draws it inside a box that is the pill's own before its tilt, so the browser places it and nothing
    is measured. `DEFAULT_PILL_WIDTH` is only how its stored place becomes an offset from the pill's end.
  - A flyer that prints no pill prints no such spark (Artur, 2026-10-13: "The toggle show pill should also remove
    the sparks under it"; it was kept where the default pill would end). No pill is the switch off, or no handle
    and no tag.
  - The corner blobs print in each other's ink, teal left and yellow right (`SWAPPED_INKS` in `looks/handDrawn.ts`).
    His answer to a teal spark lost on the teal blob: the blobs stay under a long pill, and "let's invert the
    blob colors".
  - The two sparks on the photo's corners trade inks too, yellow left and teal right (Artur, 2026-10-13: "Invert
    also the image sparks on the top"; on 2026-10-12 he had left them). So the two inks cross again from the
    flyer's top to its bottom. On a week flyer they are the sparks on the first row's corners. The spark off the
    pill keeps its teal: `SWAPPED_INKS` names where each swapped file hangs, since that spark is the left one's
    drawing.
  - The four swapped files are derived by `scripts/art-inks.ts`, never drawn by hand, and are not in the seed's
    doodles. Both inks are read off the blobs, whose scans are flat; the sparks' are speckled.
  - The pencil hangs from the end of the ask's block of copy, 14 px after it and 10 px above its top (his pick of
    two: "same size, higher"). From the block's end, not the English line's: under a short English line it would
    lie on a longer Spanish one.
  - Art someone arranged by hand is drawn as stored, places and inks.
  - The story's byte-identical baseline ended here: the pencil is on every flyer with an ask. He signed a sheet of
    every sample before and after instead, and another for the sparks' inks. Take a capture before the next change
    that must not move the drawing.
  - Browser specs: `tests/render/art.spec.ts` (the spark, the inks, the pencil) and `pill.spec.ts`.
    `tests/render/drawn.ts` draws a payload the API would refuse (`newPayload()`, `drawPayload()`, and the long
    pill's copy, `HANDLE_18` and `TAG_24`).

## The WHEN chip and the Spanish line

- The WHEN chip's time and the Spanish line (2026-10-09, Artur's flyer #13 on live):
  - The time under the day is one line that shrinks (`nowrap`), as a week row's is: his browser broke `09:15-14:00`
    after the hyphen and the chip clipped `14:00`. Chromium keeps that range whole, so `render.spec.ts` proves it by
    the day line, which a long time no longer shrinks.
  - The Spanish line may be 260 characters (was 140): a description of three or four lines. With a photo about 210
    fit at its floor; past that the editor says it is cut off. The asks keep 60 and 70: one line each in a 760 px
    column beside the pencil, already at their floor with a phone number. Needs a release: an older one refuses a
    longer line. The AI's prompt keeps its rules as they are (Artur, 2026-10-10): only staff get the room.
  - Two copy warnings are gone (Artur, 2026-10-10: "unusefull for me"): "Book now" and a slash as a separator
    (`copyRules.ts`). The AI's prompt still asks for neither. Left: bullets, the exclamation budget, sentence case.

## The AI copy rules

- The AI's copy follows the owner's own flyers (2026-10-06). He corrected flyers #4, #5 and #8 by hand on the live
  site, then asked for the same as rules. The rules are the prompt files in `ai/prompts/`; the two examples in
  `docs/ai-flyers/examples/` and the picture case carry them, and `tests/briefRules.ts` holds every example to them.
  One exception, his own: the first example prints `Free` for a text that names no price, because he answered
  "Free" for that flyer. The rule won over it in the real check, seen once.
  - **A price the text does not give is not printed:** no COST chip, no price line in the share text, and a note in
    "The AI assumed". It supersedes his rule of 2026-10-04 ("Ask at reception"). "Free" still needs the word.
  - **No full stop ends a title line:** `headline1`, `headline2` and the Spanish line. The ask keeps its own. The
    This week template's built-in title ("this week.") is left as designed, by his answer.
  - **The share text is English first,** then the line `-- 🇪🇸 --` (`SHARE_SPANISH_BREAK` in `share.ts`), then
    Spanish. The English is written for English-speaking guests, not turned word for word. A long caption gets
    "🇪🇸 Español abajo 👇" after its hook. The editor's placeholder shows the same order.
  - **A start and an end print as one range in WHEN,** with a hyphen and no spaces (`17:45-23:00`, as on his Teide
    flyer): with spaces around the dash it broke over two lines in the chip. The asks' own words on those live
    flyers were not asked for as rules and are not in the examples.
  - Checked with five real generations on `gpt-6-luna` (the report has each): every rule held, and a board of
    four activities came back as a This week flyer, seen once.
