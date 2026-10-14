# Brief: a new look for the Nests Hostels flyer generator

I'm giving you an existing flyer app. Design a NEW LOOK for it: a second way the same flyer prints, beside the one it
has today, "Hand-drawn". The app renders ONE flyer component for every look. A look is a set of tokens, art files and
a few box measurements that this component reads, so your design must be expressible that way: no second layout, no
second renderer.

Staff pick the look per flyer in the editor (a "Look" switch, beside the template). So every look prints:
- both templates: Activity (one event, with a photo) and This week (up to five activities);
- on both canvases: an Instagram story and a WhatsApp image;
- in all three photo modes: "In a frame" (the default), "Full bleed" and "No photo".

## The repo

`github.com/arturmamedov/nest-branded-flyers-generator`, branch `main`. Read these, in this order:

1. `src/shared/looks.ts`: the `Look` interface, which says exactly what a look decides. Your hand-back fills every
   field of it.
2. `src/shared/looks/handDrawn.ts`: the first look, every token with its value. Model yours on it.
3. `src/shared/layout.ts`: the canvases, their safe zones and the shared boxes. `CanvasGeometry` is what a look may
   change of the boxes, per canvas.
4. `design_handoff_flyer_generator/README.md`:
   - §2 is the geometry, §3 the tokens, §5 the shrink-to-fit, §12 the copy rules;
   - its `design/` folder holds the first look's prototypes.
5. `src/shared/samples.ts`: the sample flyers. Design against them, and prove your design on them.
6. `src/shared/text.ts`, `chips.ts`, `extras.ts`, `week.ts`: how long each line of copy may be.
7. `assets/art/`: today's art, for scale and placement.
8. `tests/geometry.ts`: the checks every look's boxes must pass.
9. `docs/prompts/looks-seam.md`, the sections "What a look holds" and "A look's boxes": the same rules, in words.

## Fixed: the same in every look

**The canvases and their safe zones:**
- Story: 1080 × 1920. Safe zone: 250 top, 300 bottom, 70 on each side.
- WhatsApp: 1080 × 1440. Safe zone: 40 all round.

Text and blocks stay inside the safe zone. Only decorative art, and a full-bleed photo (horizontally), may enter the
margins.

**The blocks, top to bottom:**
- Activity: eyebrow (the brand marks and a line) · headline (English 1, English 2, the Spanish line) · photo · chips
  WHEN / WHERE / COST · the "nice to know" extras · the ask (an English and a Spanish call to action) · the tag pill
  (@handle · tag).
- This week: eyebrow · title (the headline's three lines) · up to five rows (day, time, name, price) · the ask · the
  tag pill.

**What a look never changes:**
- **Widths.** Every box is the safe column's width, and a full-bleed photo the canvas's.
- **The order** of the blocks, and the **safe zones**.
- **The copy:**
  - which fields print, and how an empty one collapses;
  - each line's limit and the shrink-to-fit;
  - the copy rules, and the chip order WHEN · WHERE · COST.
- **The eyebrow's marks:** the Nests wordmark beside each hostel's round badge, in a 56 px row.
  - The badges are supplied by the app, one per hostel (round, 256 px): never redraw or restyle them.
  - Your look may supply its own wordmark file.
- **Sizes the renderer writes for every look:**
  - the week row's day column (250 px, its text box 114 px) and the row name's box (96 px);
  - the ask's widest column (760 px);
  - the padding inside chips and rows.
  If your design needs one of them changed, say so: that is a layout change to settle with the owner, not a look.

## Free per canvas: a box's top and height

Separately on the story and on WhatsApp, a look may give these boxes their own top and height:
- the eyebrow;
- the headline, with a photo and without one;
- the full-bleed photo, and the photo in a frame;
- the line that stands for a missing photo;
- the chips, and the gap between them;
- the extras, the ask and the pill;
- the week's title, its rows' top, the row height and the gap between rows.

The art's inset from the photo's corners, the scale of the corner art and the week's art drop are also the look's.

**The checks every look passes** (`tests/geometry.ts` names each):
- every box inside the safe box (the full-bleed photo runs edge to edge sideways), and none with no height;
- no two boxes overlapping, and the order kept;
- the pill at least 4 px above the safe zone's floor (its tilt needs the room);
- five week rows ending at least 12 px above the ask;
- the full-bleed photo and the photo in a frame ending on the same line: the blocks below them are every photo
  mode's;
- on WhatsApp, the headline (with and without a photo), the chips, the extras and the ask at least as tall as on the
  story, so copy that fits the story fits there;
- each photo mode's frame one shape on both canvases.

**The photo:**
- Another height is another shape: a flyer switched to your look shows another cut of its photo, from the same
  stored crop.
- Keep each photo mode one shape (one aspect ratio) on both canvases, so the story and WhatsApp show the same
  picture.

A smaller box shrinks its copy sooner: design for long copy.

## Fixed: how text behaves

- **Every line of copy SHRINKS to fit its box.** It never grows the box, never wraps out of it, and never overlaps
  another box.
  - It shrinks no further than its own floor, which your look sets per line, as a share of the line's size.
  - Design for long copy: the Spanish line may be 260 characters, the tag 24, the headline lines 40 each.
- **Optional fields collapse completely:** no placeholders, no empty boxes, no dangling separators.
  - Design every block to look right when its neighbours are missing: no time, no price, no extras, no photo, no
    pill.
- **Chips with a middle dot (`·`) print on two lines.** A price like `Free · Donation` must still look designed.
- **Two languages, always:** English first, Spanish beneath, with equal visual dignity.
- **Sentence case.** No bullets, and no exclamation marks in decoration text.
- **Contrast:** text on any background reaches 4.5:1. State each text ink and the background it sits on.

## Free: this is the design

Named as the `Look` interface names them:

| Group | What you decide |
|---|---|
| `palette` | `ground` (the background), `ink` (most copy and the frames' strokes), `accent`, `muted` (the Spanish lines), `surface` (inside chips and rows), `highlight` (the highlighter's colour, which the copy on it is checked against: the highlighter itself is an `inline` art file), `placeholder` (an empty photo frame), `pillText`, `pillDot`. Your look has its own colours: the staff's colour settings belong to Hand-drawn alone |
| `type` | every line of copy, by the names in `LineName` (`eyebrow`, `headline1`, `headline2`, `spanish`, the chips' lines, `extras`, `askEn`, `askEs`, `pill`, the week row's four). For each: font, weight, size (px), line height, letter spacing, upper case or not, floor (the share of its size the fit may shrink it to), and its ink and its ground, as palette names |
| `faces` | each family and weight you use. Fonts are self-hosted: each family must be on Google Fonts / @fontsource. Name the exact family and weights |
| `frame` | one SVG path, stretched to the chips, the week's rows and the photo in a frame; its stroke width (never scaled with the box); the photo's corner radius |
| `pill` | its corner radius, its tilt (a small angle, as Hand-drawn's -0.6°), its padding, the gap around the dot, the dot's size |
| `inline` | art drawn inside the blocks: the eyebrow's icon and line, the line that stands for a missing photo, the ask's line, the WHEN and WHERE icons, the clock (in the WHEN chip and in each week row), the highlighter |
| `art` | the decoration, each piece hung from an anchor: the photo's top-left and top-right corners, the canvas's bottom-left and bottom-right corners, the pill's end, the end of the ask's copy |
| `wordmark` | your look's Nests wordmark file, if it has its own |
| `geometry` | the box tops and heights above, per canvas |
| `rules` | the contrast your look holds itself to, and any ink it must never use |

**How the art is anchored:**
- **The photo's two top corners.** On a This week flyer they are the first row's corners. With no photo, they are the
  two ends of the line that stands for it.
- **The pill's end.** That art is drawn only when the pill prints.
- **The end of the ask's copy.** That art is drawn only when there is an ask.
- Every piece gives its offset from its anchor (x and y in px), its width, its rotation, and whether it is flipped.

## Art rules

- **Each art piece is a separate transparent PNG.** The renderer draws `assets/art/<name>.png`: no SVG art.
- **Give each piece a new file name.** Never use one that `assets/art/` already has.
- **Hand each piece over with its placement:** its anchor, offset, width and rotation.
- **Art may bleed into the margins.** It must never sit under text where it hurts the 4.5:1 rule.
- **No hostel badges** in your art: the app supplies them.

## What the tokens cannot say

A treatment the fields above cannot express is allowed, but name it; never assume it is free. Examples: chips as a
flat rounded rectangle instead of a drawn path, or a highlighter that is a flat band instead of a brush stroke. Each
becomes a new kind of that one decoration in the app's code, which the look then chooses by a token.

## What to hand back: a handoff folder

Shape it like `design_handoff_flyer_generator/`:

1. **A README with your look's tokens**, in the `Look` interface's groups:
   - palette, type per line, faces, frame, pill, inline art, art by anchor, wordmark, geometry per canvas, rules;
   - every colour with its hex and where it is used;
   - every line of copy with its ink, its ground and their contrast ratio.
2. **Reference renders of every sample in `src/shared/samples.ts`, on the story and on WhatsApp:**
   - the six Activity flyers, in each photo mode (in a frame, full bleed, no photo);
   - the three This week flyers;
   - and, added to them, a short Activity flyer with no extras and its pill switched off. Every sample has extras and
     a pill, and the long-copy stress tests are among them.
3. **The art files** (PNG), named by role and anchor, and the wordmark file if your look has its own.
4. **Every box you changed:** the box, the canvas, its top and height in px, and why.
5. **A list of what could not be done within these rules:** a width, the order, a safe zone, a size the renderer
   writes, or a new kind of decoration. Say which and why. Never change one silently: that becomes a layout change in
   the app, not a look.

## Not part of this

Staff moving or resizing blocks on one flyer, and staff picking or uploading doodles: later features. The hostels'
badges, the copy, the text limits, and the AI assistant are the same in every look.
