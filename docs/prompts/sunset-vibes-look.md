# The Sunset Vibes look: the master plan, and the launch prompt of each stage

Written 2026-10-30 by the planning session (Claude Fable 5.1, plan mode; nothing built), from Claude Design's handoff
in `design_handoff_new_look/design_handoff_sunset_vibes/` (its README is the spec; its "Decisions (2026-10-30)" are
Artur's) and from the app as `main` stood at `0b51bff`. It replaces the first launch prompt, `second-look.md`.

The port is **seven sessions** (six when written; the streaks became a stage of their own on 2026-10-30, answer 8), one stage each, on the branch `feat/second-look` (cut from `main` by the planning
session, not checked out). Every session starts in plan mode, reads this file whole, builds its stage with its tests
first and a commit per piece, checks the Hand-drawn baseline after every commit that touches `src/`, records what it
found here (the later stages' blocks brought up to date), and **ends its report with the next stage's block to
paste, the model and the effort**. Nothing is pushed, no release is built, the live site and the Laragon copy are not
touched, until Artur says so after stage 6.

**Suggested run for every stage:** Claude Fable 5.1 (`claude-fable-5-1`), effort **high**, started in plan mode.

## The stages

| # | Stage | Builds | Stops when |
|---|---|---|---|
| 1 | The look as data | The seam tokens the entry needs to compile; fonts, art files, the entry, the registry line, `gen`, the contract row; a render spec for every shipped look | Every sample prints in Sunset Vibes **in the app's shared layout**, every gate green, PHP gates too (the schema gains the id) |
| 2 | The photo behind, the headline | `photoBehind`, the `photoBottom` anchor, the splash and the splash-edge botanicals, the staggered tilted headline kind | Activity prints the design's top half on both canvases, in each photo mode |
| 3 | The streaks | `sm-streaks.js` ported: the dry-brush knock-outs drawn at render over the headline words, deterministic, cached, awaited by both exports (answer 8) | Both stress tests print their words streaked on both canvases, the client export within 0.5 % |
| 4 | The blocks | The columns chip kind with its icons and rules (the order from its pictures, answer 10), the centred ask kind, the extras as notes, the pill as a plain line in the footer's slot (answer 4), the lower ferns and the band | Activity prints the design, eyebrow aside |
| 5 | The eyebrow | The lockup kind holding name, badge and wordmark (answer 2), the marks token's height, the `topLeft` anchor, the stretch art kind for the blob, "Activities" printed (answer 3) | Activity prints the design whole |
| 6 | This week B | The week's photo (a default per hostel, the flyer's own when it has one: answer 11) and splash, the week's own ask and pill boxes, the trio row kind, `weekPriceSub` | Both templates print the design on both canvases |
| 7 | Close | Proof sheets signed, the full gate and the PHP gates, a fresh-context review, Chrome on both backends, the docs | Artur has the release and the `'looks'` setting left to do |

The stage blocks below were written with six stages: stage 1 renumbers them as it brings the next one up to date.

Later, each a round of its own, after Day's sheets are signed: the fields of README §7.5–7.9 and the Spanish row names,
all of them (answers 12 and 13: "include everything", an empty one collapses); the `mask` art kind and the colour sets
(Dusk approved first, then the explorations he keeps); Nest's own icons (a file swap).

---

## Stage 1's block (paste)

```
Read CLAUDE.md, then docs/prompts/sunset-vibes-look.md whole (the master plan: the design against the seam, the
stages, the seam changes, the questions; its "Decided" points are not reopened), docs/adding-a-look.md whole, the
answers in docs/prompts/looks-seam.md (decided), src/shared/looks.ts, src/shared/looks/handDrawn.ts,
src/shared/layout.ts, src/flyer/Flyer.tsx, tests/proof/look.ts, tests/lookContract.ts, tests/geometry.ts,
tests/render/drawnChecks.ts and tests/render/looks.spec.ts. Then the handoff's README,
design_handoff_new_look/design_handoff_sunset_vibes/README.md (its "Decisions (2026-10-30)" are mine; its §10 and
§11 are replaced by the plan). For any number, read reference/source/SunsetInfoBoard v4.dc.html; never read the
other .html files in reference/ as text (bundles of several MB).

Build stage 1 of the plan: the Sunset Vibes look as data inside today's seam, plus the seam tokens its entry needs
to compile, so that every sample prints in the new look in the app's shared layout, on both canvases, with its
fonts, palette and art files, and every gate is green. Hand-drawn must not change by one pixel. The proof look stays
the tests' canary.

HOW TO WORK

- Start in plan mode. Check git first: the planning session (2026-10-30) created feat/second-look from main
  (0b51bff) without checking it out, and left docs/prompts/sunset-vibes-look.md untracked. Check the branch out
  (git switch feat/second-look). If the tree is not clean beyond that file and design_handoff_new_look/, or
  another session may be writing in this folder, stop and ask. Stage by path; never commit
  design_handoff_new_look/. Warn me before a src/shared/ edit if npm run dev may be running.
- First commit: the plan file, this session's line at the top of docs/status.md's log, its "Next" line pointing
  to the plan, and one line at the top of docs/prompts/second-look.md saying the plan replaces it.
- Capture the baseline before any change to src/ (tests/render/baseline.spec.ts, RENDER_BASELINE=capture, a temp
  folder named nest-sunset-baseline; npm run build first) and check it after every commit that touches src/.
- Ask me the plan's "Questions for Artur", one at a time, keep or strike, my recommendation first; the first is the
  look's id and name. Record every answer in the plan file, quoted. Build nothing before I say go.
- Then, in the plan's order for stage 1 ("What stage 1 builds"): every change with its test first, a commit per
  piece as it goes green. Push nothing, build no release (npm run build:php empties release/php/: don't run it),
  don't touch the live site or the Laragon copy.
- Before calling it done: npm run typecheck && npm test && npm run test:contract && npm run test:render, then
  npm run test:php and npm run test:php-smoke; the baseline; and one sheet of three samples in the new look beside
  Hand-drawn on both canvases, drawn by the real renderer (a picture for me, not for signing: it still prints in
  the shared layout).
- Then stop and record it: the first section of a new report, docs/reports/sunset-vibes.md; the status line; and
  the plan file: what stage 1 found that changes stages 2 to 6, and stage 2's block brought up to date. End your
  report with stage 2's block to paste, the model and the effort.

NOT NOW

Any layout kind (stages 2 to 5), the colour sets beyond Day, the fields of README §7.5–7.9, the mask kind, the
streaks, steps 7 and 9 of the first handoff, a look switch on Create with AI, a filter by look, a third look, the
release.
```

## Stage 2's block (paste; stage 1 brings it up to date)

```
Read CLAUDE.md, then docs/prompts/sunset-vibes-look.md whole (the master plan; its "Decided" points and Artur's
answers in it are not reopened), docs/reports/sunset-vibes.md (what stage 1 built and found), docs/adding-a-look.md,
src/shared/looks.ts, src/shared/looks/sunsetVibes.ts, src/shared/layout.ts, src/flyer/Flyer.tsx, src/shared/photo.ts,
src/editor/Preview.tsx, tests/geometry.ts, tests/render/drawnChecks.ts, tests/render/pixels.ts and the handoff's
README §1, §2, §5, §6 and §7.1–7.4, 7.12, 7.14 (design_handoff_new_look/design_handoff_sunset_vibes/README.md). For
any number, reference/source/SunsetInfoBoard v4.dc.html.

Build stage 2 of the plan: the photo behind everything (photoBehind, the photoBottom anchor, the splash and the
splash-edge botanicals, no-photo as decided) and the staggered, tilted headline kind, so that an Activity flyer in
Sunset Vibes prints the design's top half on both canvases in each photo mode. Hand-drawn must not change by one
pixel.

HOW TO WORK

- Start in plan mode. Check git first: feat/second-look, a clean tree (design_handoff_new_look/ untracked). If
  not, or if another session may be writing here, stop and ask. Stage by path. Warn me before a src/shared/ edit
  if npm run dev may be running.
- Check the baseline from stage 1 (nest-sunset-baseline) before anything, then after every commit that touches
  src/.
- Show me SHORT, in a table, what you will change and in what order, with the plan's seam changes for this stage.
  Build nothing before I say go. Then every change with its test first, a commit per piece as it goes green.
- Pictures, not words: when the photo is behind, and again when the headline is staggered, the Pool party sample
  and both stress tests in the new look beside Hand-drawn, both canvases, the three photo modes, drawn by the real
  renderer. I answer from them.
- Before calling it done: npm run typecheck && npm test && npm run test:contract && npm run test:render; the
  baseline; the editor in Chrome with the new look (the preview, the photo handle on a photo that starts above the
  canvas, the three modes).
- Then stop and record it: a section in docs/reports/sunset-vibes.md, the status line, the plan file (findings,
  stage 3's block brought up to date). End your report with stage 3's block, the model and the effort.

NOT NOW

The chips, ask, extras, pill and lower art (stage 3), the eyebrow and the blob (stage 4), This week B (stage 5),
the streaks, the colour sets, the fields, the release.
```

## Stage 3's block (paste; stage 2 brings it up to date)

```
Read CLAUDE.md, docs/prompts/sunset-vibes-look.md whole (decided points and Artur's answers not reopened),
docs/reports/sunset-vibes.md, docs/adding-a-look.md, src/shared/looks.ts, src/shared/looks/sunsetVibes.ts,
src/shared/layout.ts, src/flyer/Flyer.tsx, scripts/art-inks.ts, tests/geometry.ts, tests/render/drawnChecks.ts, and
the handoff's README §1.2, §1.3, §5 ("Inline slots"), §6.1 and §7.6–7.10, 7.12, 7.15–7.17. For any number,
reference/source/SunsetInfoBoard v4.dc.html.

Build stage 3 of the plan: the columns chip kind (icon above, the chip's lines centred, 1.2 px rules between
columns, no frame; the icons as PNG files in the line colour made by npm run gen:art), the centred ask kind (the
pen above, both lines centred and wrapping, no rule), the extras as the design's notes line, the pill as Artur
decided in stage 1, the lower ferns on the bodyBottom anchors and the band on the bottom corners at scale 1 on
both canvases. Hand-drawn must not change by one pixel.

HOW TO WORK

- Start in plan mode; check git (feat/second-look, clean; else stop and ask); stage by path; warn before a
  src/shared/ edit if npm run dev may be running. The baseline (nest-sunset-baseline) before anything and after
  every commit that touches src/.
- A SHORT table of the changes in order; build nothing before I say go; tests first, a commit per piece.
- Pictures from the real renderer at each kind: the six Activity samples in the new look beside Hand-drawn, both
  canvases; the chip's line order and the ask are answered from them.
- Before calling it done: typecheck, test, test:contract, test:render; the baseline; Chrome (the preview and one
  download per canvas).
- Record it (report section, status line, the plan file with stage 4's block brought up to date). End with stage
  4's block, the model and the effort.

NOT NOW

The eyebrow and the blob (stage 4), This week B (stage 5), the second ask and the footer (fields, later), the colour
sets, the release.
```

## Stage 4's block (paste; stage 3 brings it up to date)

```
Read CLAUDE.md, docs/prompts/sunset-vibes-look.md whole (decided points and Artur's answers not reopened),
docs/reports/sunset-vibes.md, docs/adding-a-look.md, src/shared/looks.ts, src/shared/looks/sunsetVibes.ts,
src/shared/layout.ts, src/shared/defaults.ts (marksFor), src/flyer/Flyer.tsx (Marks, the eyebrow),
src/editor/export/ClientExporter.tsx, tests/render/fidelity.spec.ts, and the handoff's README §1.1 (layers 4, 13–15),
§6.3 and §7.11–7.12. For any number, reference/source/SunsetInfoBoard v4.dc.html (lockup(), blobScale(), BLOB).

Build stage 4 of the plan: the lockup eyebrow kind (the eyebrow line, then the marks, left-aligned on the blob), the
marks token (which marks and their height), the topLeft anchor with its per-canvas scale, the stretch art kind for
the blob (a CSS border-image three-slice: the body row stretches until the piece's bottom meets the eyebrow box's
bottom plus an offset), and "Activities" as Artur decided in stage 1. The client export must still match the
server's (fidelity: border-image through modern-screenshot). Hand-drawn must not change by one pixel.

HOW TO WORK

- Start in plan mode; check git (feat/second-look, clean; else stop and ask); stage by path; warn before a
  src/shared/ edit if npm run dev may be running. The baseline before anything and after every commit that
  touches src/.
- A SHORT table of the changes in order; build nothing before I say go; tests first, a commit per piece.
- Pictures from the real renderer: the eyebrow on three hostels (a short name, "NEXT ACTIVITY" untouched, the
  longest eyebrow the API takes) on both canvases, beside Hand-drawn.
- Before calling it done: typecheck, test, test:contract, test:render (fidelity included); the baseline; Chrome
  (the preview, one download per canvas, the copy to clipboard).
- Record it (report section, status line, the plan file with stage 5's block brought up to date). End with stage
  5's block, the model and the effort.

NOT NOW

This week B (stage 5), the mask kind, the colour sets, the hostel's name as a field, the release.
```

## Stage 5's block (paste; stage 4 brings it up to date)

```
Read CLAUDE.md, docs/prompts/sunset-vibes-look.md whole (decided points and Artur's answers not reopened),
docs/reports/sunset-vibes.md, docs/adding-a-look.md, src/shared/looks.ts, src/shared/looks/sunsetVibes.ts,
src/shared/layout.ts (WeekBoxes, weekRowRect, commonGroups), src/shared/week.ts, src/flyer/Flyer.tsx (WeekRow,
WeekRows), src/editor/Preview.tsx, src/editor/exportActions.ts, tests/geometry.ts, tests/render/drawnChecks.ts (the
rows' checks), and the handoff's README §1.5, §6.2 and §7.18–7.21. For any number, reference/source/SunsetInfoBoard
v4.dc.html (weekPH(), buildWRow(), WR).

Build stage 5 of the plan: This week B. The week flyer prints its photo behind, with the splash, in the look's
weekPhoto box (one shape on both canvases); the week's own ask and pill boxes; the trio row kind (day 190 wide on
the left, the name in the middle, the time over the price right-aligned in 210, a 1.2 px rule between rows, no
frame, no highlighter); the weekPriceSub line for the price after the middle dot; the title through the staggered
kind. Hand-drawn must not change by one pixel.

HOW TO WORK

- Start in plan mode; check git (feat/second-look, clean; else stop and ask); stage by path; warn before a
  src/shared/ edit if npm run dev may be running. The baseline before anything and after every commit that
  touches src/.
- A SHORT table of the changes in order; build nothing before I say go; tests first, a commit per piece.
- Pictures from the real renderer: the three week samples (the stress test with five rows included) in the new
  look beside Hand-drawn, both canvases, with and without a photo.
- Before calling it done: typecheck, test, test:contract, test:render; the baseline; Chrome (a week flyer's
  preview, the photo handle on it, one download per canvas).
- Record it (report section, status line, the plan file with stage 6's block brought up to date). End with stage
  6's block, the model and the effort.

NOT NOW

Spanish row names (a field, later), the colour sets, the release.
```

## Stage 6's block (paste; stage 5 brings it up to date)

```
Read CLAUDE.md, docs/prompts/sunset-vibes-look.md whole, docs/reports/sunset-vibes.md whole, docs/adding-a-look.md,
docs/deploy.md ("The looks a flyer prints in", "Rolling back"), docs/architecture.md ("Looks"),
docs/design-decisions.md, README.md, and docs/prompts/looks-seam.md (the answers).

Close the port of the Sunset Vibes look: the proof sheets, every gate, a fresh-context review, the docs. Then tell me
what is left that is mine: the release, then 'looks' in config.php (the Laragon copy first, then live).

HOW TO WORK

- Start in plan mode; check git (feat/second-look, clean; else stop and ask); stage by path.
- Proof sheets drawn by the real renderer, into backups/second-look/ (outside git): every sample on both canvases,
  both templates, each photo mode, the highlighter-wrap and long-pill records, the new look beside Hand-drawn, and
  a flyer whose photo crop someone set (a photo of another shape re-cuts it: Pool party with the baseline's two
  crops). I sign them before the commit that ships the look; fix what I mark, sheets again, until I sign.
- A fresh-context review of the whole branch against main (a sub-agent, the branch's diff and this plan), its
  findings fixed each with a test first.
- Before calling it done: npm run typecheck && npm test && npm run test:contract && npm run test:render, then
  npm run test:php and npm run test:php-smoke; the baseline (nest-sunset-baseline: Hand-drawn byte-identical);
  the editor in Chrome with both looks on both backends (the switch, the preview, the library card, the lightbox,
  one download per look per canvas), the PHP one from the smoke test's build.
- Then record it: the report's last section; docs/architecture.md ("Looks": the new kinds, anchors, tokens),
  docs/design-decisions.md (the look's decisions, Artur's words), CLAUDE.md (the map line, the decisions line, the
  status, the non-negotiable "orange is never flyer ink" made Hand-drawn's), README.md, docs/deploy.md ('looks'
  with the new id), docs/adding-a-look.md where it was wrong or short (the kinds, the new anchors, nullable slots,
  the stretch kind, the proof look's canaries against every shipped look), docs/status.md. Push nothing, build no
  release.
- End your report with what is mine to do, in order, and the block for the next round (the fields of README
  §7.5–7.9 I said yes to in stage 1, or the colour sets), the model and the effort.
```

---

# The design against the seam

## In short

- Sunset Vibes is Duque Nest's sunset flyer (Sunset Merge v2), proved on the app's canvases as v4: a bleed photo
  behind everything, a badge blob hanging from the canvas top with the hostel's name, the wordmark and
  _Activities_, a wave splash in the ground colour over the photo's bottom, a tilted two-word headline on the
  splash, a Spanish sub-line, three info columns, a centred ask, botanicals round the edges.
- It becomes one entry in `src/shared/looks/` (`sunsetVibes.ts`), its art under `assets/art/`, read by the one
  renderer. Where the design departs from the shared layout, the renderer gains a **kind** of that block, chosen by
  a token; Hand-drawn keeps today's kind of each and its baseline stays byte-identical.
- Day is the only colour set now. The other five, the mask kind and the fields the design wants are later rounds.

## Decided (not to be reopened)

From the handoff's "Decisions (Artur, 2026-10-30)" and the looks seam's answers:

1. The photo is background art: text stays inside the safe zone; the photo and the art may leave it, the top
   included.
2. One photo shape per template on both canvases: Activity 1080 × 948, This week 1080 × 780; on WhatsApp the box
   starts above the canvas.
3. Three info columns, the app's three chips. The 4th column is later.
4. The badge blob hangs from the canvas top; everything else is v2.
5. Contrast per line: 3 : 1 at headline scale, 4.5 : 1 for the rest; this look prints #EA580C. The seam holds it
   (rules are per look, a minimum per line is one optional token): nothing to ask.
6. This week = B, with a short photo strip.
7. Colour sets: keep all six, ship Day first.
8. From the seam: a look may give a box its own top and height per canvas, the photo's too; widths, the order of
   the blocks, safe zones, which fields print, the text limits, `fit.ts` and the copy rules are shared; the
   hostels' badges are every look's unless Artur says otherwise (question 2); no `if (look === …)`; a look's id is
   forever; the proof look never ships.

## The design against the `Look` interface, token by token (Day)

| Group | The design asks | In the seam today |
|---|---|---|
| id, name | `sunset-vibes`, "Sunset Vibes" (proposed) | question 1 |
| palette | ground #FFFFFF · ink #0D6F82 · accent #0D6F82 (_Vibes_) · muted #35606E · surface = ground · highlight = ground · placeholder #CFE7F0 · pillText ink, pillDot line | ✓, plus three roles the interface lacks: **hot** #EA580C (SUNSET, _Activities_), **value** #C2410C (chip values, week days), **line** #0D6F82 (icons, rules) |
| type | README §4: Montserrat 400–700; Archivo Black 400 at 144.64 (headline1, −0.02em, upper); Caveat Brush 400 at 188.17 (headline2); floor 0.6 on the headline words, the chip values and the week time; no floor on labels, asks and row text (they wrap) | ✓ size, weight, line height, spacing, case, floor, ink, ground; new per line: `rotate` (−9.5°, −6.5°) and `minContrast` (3 on the headline words); new line `weekPriceSub` (18 muted) |
| faces | Archivo Black 400 · Caveat Brush 400 · Montserrat 400, 500, 600, 700 | ✓ two packages to pin (5.3.0 on npm today), two families in `fonts.ts`, four imports in `fonts.css` |
| frame | none | ✓ `stroke: 0`, `photoRadius: 0`; the new kinds draw no frame |
| pill | not printed | the look's `pill` becomes nullable (question 4) |
| inline | whenIcon the custom clock · whereIcon map-pin · new **costIcon** euro · new **askIcon** pen; eyebrowIcon, eyebrowRule, photoRule, askRule, clock, highlighter: none | slots become nullable; two new slots; PNG per ink made by `gen:art` from the Lucide paths |
| art | splash at the photo's bottom; blob at the canvas top, stretched, × 1.08 on the story; confetti and tr on the canvas; fern-w, monstera, fern-r at the photo's bottom; fern-ll, fern-lr at the chips' or rows' bottom + 12; band at the bottom corners at scale 1 on both canvases | new anchors **photoBottom**, **topLeft** (+ `topScale`), **bodyBottomLeft / Right** (+ `bodyScale`); a **stretch** art kind for the blob; `cornerScale: 1` on WhatsApp |
| wordmark | `sunset-wordmark-0d6f82.png`, 81.7 px high, alone | ✓ the file; new **marks** token: which marks and their height (56 today, in the renderer) |
| geometry | README §6 and the v4 readouts; the photo above the canvas top on WhatsApp; the week's ask lower than Activity's | ✓ tops and heights; new **photoBehind** (the photo exempt from the safe zone and the overlap checks, drawn first); the week's own **weekPhoto, weekAsk, weekPill** boxes |
| rules | 4.5 : 1, 3 : 1 at headline scale, orange printed | ✓ per look; CLAUDE.md's "orange is never flyer ink" becomes Hand-drawn's rule (stage 6) |

## What a look cannot hold (README §7), each with its mechanism and stage

| § | The design asks | Mechanism | Stage |
|---|---|---|---|
| 7.1–7.3 | The photo behind everything, one shape per template, starting above the canvas on WhatsApp | `Look.photoBehind`: the renderer draws the photo group first; `tests/geometry.ts`, `drawnChecks.ts` and `pixels.ts` exempt the photo from the safe-zone and overlap checks (the "one shape per mode" check stays) | 2 |
| 7.4 | Two words placed apart and tilted | `LineType.rotate`; headline kind `staggered`: each word centred at an offset from the canvas's centre, at its own top in the box, fitted to the room to the safe edge (cap 840 / 560, margin 50 / 20), the Spanish line centred under the ink; This week's title uses it | 2 |
| 7.5 | An EN sub-line above the Spanish one | A field: later. Now the Spanish line sits where the EN one would | later |
| 7.6 | Icon on top, value, labels, rules between columns; a 4th column | Chip kind `columns`: icon (88 box) · big · sub · label, centred, 1.2 px rules in `line`, no frame (question 10 for the order). The 4th column: a field, later | 3 |
| 7.7 | No frames | `stroke: 0`, `photoRadius: 0`; the new kinds draw none | 1 |
| 7.8 | Two asks side by side | A field: later. Now one ask, ask kind `centred`: the pen above, EN over ES centred, wrapping | 3 |
| 7.9 | A footer line | A field: later. Its slot (story 1572, WhatsApp 1253) holds the pill if printed | later |
| 7.10 | Pill and extras not printed | The pill: `pill: null` on the look, or printed as a plain line in the footer's slot (question 4). The extras: printed as the design's notes line in the chips → asks gap (question 5) | 3 |
| 7.11 | Hostel name + wordmark, no badge; _Activities_; the blob stretched from the canvas top | Eyebrow kind `lockup` (the eyebrow line, then the marks, left-aligned); `marks` token (question 2); _Activities_ baked into the Day blob or a fixed word of the kind (question 3); the stretch kind | 4 |
| 7.12 | Anchors at the photo's bottom and the chips' / rows' bottom; a mask kind; streaks | Anchors `photoBottom` (absent without a photo: the piece is not drawn), `bodyBottomLeft / Right`, `topLeft`; the mask kind later (pre-filled Day files now); streaks: none (question 8) | 2, 3, 4 |
| 7.13 | Six colour sets, three new roles | Roles `hot`, `value`, `line` now; the sets later (a list of palettes on the look, the chosen set a field) | 1 |
| 7.14 | 3 : 1 at headline scale | `LineType.minContrast` overrides the look's minimum for that line; `line` on `ground` held to 3 by the contract | 1 |
| 7.15 | New icon slots per ink | `costIcon`, `askIcon`; PNG files `sunset-icon-<name>-<hex>.png` made by `scripts/art-sunset-icons.ts` (run by `npm run gen:art`) from the Lucide paths in the v4 source; placeholders until Nest's own | 1 (files), 3 (drawn) |
| 7.16 | A 60 px tier for short digits | Dropped: `chipTime` at 44 | — |
| 7.17 | Labels, asks and row text never shrunk | No `floor` on those lines; `fitOf()` writes no `data-fit` for a line without a floor (today it writes the string "undefined"); the kinds let them wrap. `fit.ts` untouched | 1 |
| 7.18 | The week prints a photo | `weekPhoto` box in the geometry; with `photoBehind` the week draws its photo (bleed) unless its photo mode is "No photo"; `photoFrame` returns it, so the crop handle and the export's photo check follow | 5 |
| 7.19 | Day · name · time over price, rules between rows, no boxes | Row kind `trio` (190 · 24 gap · the rest · 210), its own sizes, a 1.2 px rule at each gap's middle | 5 |
| 7.20 | Spanish row names | A field: later (question 13) | later |
| 7.21 | The title's lift per canvas | The `weekTitle` box's top per canvas absorbs it | 5 |

## The seam's changes (each: the token, Hand-drawn's value, the proof look's)

Hand-drawn's value is today's, so its pixels do not move. The proof look gets a value of its own for every new token
with a value; the kinds and booleans are two-valued, so the proof look keeps Hand-drawn's kinds and the canary in
`proof-look.test.ts` lists them as exempt (a comment says why). The shipped-looks render spec (stage 1) covers Sunset's
kinds in the browser.

| Change | Where | Hand-drawn | Proof look |
|---|---|---|---|
| `Palette.hot`, `.value`, `.line` | `looks.ts` | hot `colors.accent`, value `colors.ink`, line `DEEP_TEAL` (read by nothing) | three colours of its own |
| `LineType.rotate?` (degrees), `LineType.minContrast?` | `looks.ts`, `typeStyle()` adds `transform` | absent | a rotate on one line, a minContrast on one |
| `LineName` + `weekPriceSub` (the price after `·`) | `looks.ts`, `WeekRow` reads it for the second cost line | = `weekPrice`'s values | its own |
| `inline` slots `string \| null`; + `costIcon`, `askIcon` | `looks.ts`, the renderer skips a null slot; `lookContract` filters nulls | today's files; `costIcon: null` (the € glyph), `askIcon: null` | files of its own |
| `Look.pill` nullable (+ `type.pill` unused then) | `looks.ts`, the renderer, `lookContract`, `drawnChecks` (`groupsOf` drops the pill) | today's | today's |
| `Look.marks?: { which: EyebrowMarks; height: number }` | `looks.ts`, `Marks` (reads `marksFor(hasBadge, look.marks?.which)`), `MARK.height` | absent → `EYEBROW_MARKS`, 56 | `{ which: 'nests', height: 48 }` |
| `Look.photoBehind?` | `looks.ts`, `Flyer.tsx` (the photo first), `tests/geometry.ts`, `drawnChecks.ts`, `pixels.ts` | absent | absent |
| `Look.blocks`: `eyebrow.kind 'spread' \| 'lockup'`, `headline.kind 'stacked' \| 'staggered'` (+ its numbers), `chips.kind 'framed' \| 'columns'`, `ask.kind 'underlined' \| 'centred'`, `rows.kind 'framed' \| 'trio'` | `looks.ts`, one component per block draws each kind | today's kinds | today's kinds |
| `ArtAnchor` + `photoBottom`, `topLeft`, `bodyBottomLeft`, `bodyBottomRight`; `CanvasGeometry.topScale?`, `.bodyScale?` | `layout.ts` (`artAnchors`: `photoBottom` absent for a body with no photo; `placeArt` returns null then and the renderer draws nothing) | unused | one piece on each new anchor |
| `ArtPlacement.stretch?: { row: number; toBox: BoxName; dy: number }` | `looks.ts`, the renderer draws a `div[data-art]` with a three-slice `border-image` | unused | one stretched piece |
| `BoxName` + `weekPhoto`, `weekAsk`, `weekPill`; `WeekBoxes` gains them (default the Activity's) | `layout.ts` (`boxesOf`, `commonGroups`, `photoFrame` for `'week'`), `tests/geometry.ts` | absent | its own |
| Fonts | `fonts.ts` (`ARCHIVO_BLACK_FAMILY`, `CAVEAT_BRUSH_FAMILY` and their stacks), `package.json` (pinned), `fonts.css` | — | — |
| Tests | `looks.test.ts` pins Sunset's tokens; `proof-look.test.ts` compares with every shipped look (its `photoRadius` 0 and `pill.radius` 0 become 12 and 6, since Sunset's are 0); `tests/render/shipped-looks.spec.ts`: every sample × canvas × shipped look through `checkDrawn`, the client export within 0.5 % for four samples, the library card fitted as the export; `drawnChecks`: the pill's art count is the look's, not 1 | | |

## Geometry, Sunset Day, starting values (the readouts of the v4 proof, 2026-10-30)

Every text box inside the safe zone; the photo boxes exempt (`photoBehind`). The build measures and adjusts; the
sheets decide.

| Box | Story (safe 70 · 250 · 300; floor 1620) | WhatsApp (safe 40; floor 1400; the band's ink from ≈ 1313 in its valley) |
|---|---|---|
| eyebrow | 250 / 173.2 (the row 250–332, _Activities_ to ≈ 421.7; the blob's bottom = box bottom + 52.5 × 1.08 = 479.9) | 40 / 163.4 (the blob's bottom 255.9) |
| headline, headlineNoPhoto | 755 / 320 (SUNSET ink top 755; a long Spanish line has room) | 436.2 / 320 |
| photoBleed | 0 / 948 | −318.8 / 948 |
| photoBand (the column's width) | 0 / 948 | −379.3 / 1008.5 (1000 : 1008.5 = 940 : 948) |
| noPhotoRule (nothing drawn) | 735 / 8 | 416 / 8 |
| chips, chipGap | 1103 / 206.3, 0 (the kind draws the rules) | 784.2 / 206.3, 0 |
| extras (the notes line) | 1313 / 36 | 994 / 36 |
| ask | 1353.3 / 188 | 1034.5 / 188 |
| pill (hidden, or the plain line in the footer's slot) | 1572 / 44 | 1253 / 44 |
| weekTitle | 593 / 300 | 378.3 / 300 |
| weekPhoto | 0 / 780 | −202.7 / 780 (the engine's; README §6.2 says −212.7) |
| rows: top, rowHeight, rowGap | 938, 64, 32 (five rows end 1386) | 717.3, 64, 15 (five rows end 1097.3) |
| weekAsk | 1400 / 188 | 1113.1 / 188 |
| weekPill | 1592 / 24 | 1305 / 40 (nominal: over the band if printed) |
| art | photoInset 0, cornerScale 1, topScale 1.08, bodyScale 1, artDrop 0 | photoInset 0, cornerScale 1, topScale 1, bodyScale 0.87 (question 9), artDrop 0 |

The headline kind's numbers (both canvases): word 1 centred 70.19 left of the canvas's centre, word 2 222.97 right of
it and 61.12 lower; the tops inside the box are measured in the build so the ink lands where the proof has it
(SUNSET's baseline centre at PB − 21.97 − 20, _Vibes_ at PB + 39.15 − 20, PB the photo's bottom); fitted to
`min(cap, 2 × (the word's centre to the nearer safe edge) − margin)`, cap 840 / 560, margin 50 / 20, floor 0.6; the
Spanish line 24 px under the headline's ink, centred, Montserrat 500 · 22 · 0.2em · upper · muted, floor 0.8.

## Art files (`assets/art/`, new names; never overwrite a file) and placements

Copied from the handoff's `art/` under the README's names; the Day pre-fills stand in for the mask kind. In draw order
(the photo is under all of them when `photoBehind`):

| File | Anchor | x, y | w | Note |
|---|---|---|---|---|
| sunset-splash-day | photoBottom | 0, −448.81 | 1080 | opaque, the ground |
| sunset-blob-day | topLeft | 0, 0 | 664.62 | `stretch: { row: 70, toBox: 'eyebrow', dy: 52.5 }`; _Activities_ per question 3 |
| sunset-confetti-day | canvas | 182.39, 3.82 | 804.03 | |
| sunset-bot-fern-w | photoBottom | 0, −484.14 | 150.88 | fixed: the design moves it to clear text, the app does not |
| sunset-bot-tr | canvas | 806.9, 0 | 269.28 | |
| sunset-bot-fern-r | photoBottom | 997.88, −394.38 | 82.12 | |
| sunset-bot-monstera | photoBottom | 94.54, −401.07 | 219.63 | |
| sunset-bot-fern-ll | bodyBottomLeft | 0, 12 | 212.94 | at `bodyScale` |
| sunset-bot-fern-lr | bodyBottomRight | −217.72, 12 | 217.72 | at `bodyScale` |
| sunset-bot-band | bottomLeft | 0, −274.06 | 1080 | `cornerScale: 1` on both canvases |
| sunset-wordmark-0d6f82 | `wordmark` | | | 81.7 high in the lockup |
| sunset-icon-clock-0d6f82, -pin-, -euro-, -pen- | `inline` | | | made by `gen:art` from the Lucide paths (the clock custom: circle r 32.6 of 69, hands M34.5 15 V34.5 L47.5 41, stroke 3.6), drawn ≈ 91 px tall in the 88 box |

Not copied now: the masks, the Dusk pre-fills, the streaks, the teal botanicals, the other wordmarks (the release
copies `assets/` whole).

## What stage 1 builds, in order

1. The branch, the first commit (plan, status, the note on `second-look.md`), the baseline capture.
2. The questions, one at a time; the answers into this file.
3. Seam tokens (a commit each, test first, baseline after): the three roles; `rotate` and `minContrast` on a line;
   `weekPriceSub`; nullable inline slots and the two new ones; nullable `pill`; `marks`. The renderer reads each
   (a null slot draws nothing, a null pill draws nothing, `marks` in `Marks`, `fitOf` without a floor writes
   nothing) and Hand-drawn is byte-identical.
4. Fonts: the two families, the packages pinned, the four imports; the fonts test holds them once the entry exists
   (one commit with 5).
5. The art files and `scripts/art-sunset-icons.ts` under `gen:art`; the entry `src/shared/looks/sunsetVibes.ts`
   (palette, type, faces, rules, inline, wordmark, frame, pill per the answer, art with today's anchors only:
   `canvas` for the confetti and tr, `bottomLeft / Right` for the band; the rest wait for their anchors) with the
   Activity geometry's tops and heights that need no new token (eyebrow, headline, chips, extras, ask, pill:
   the photo boxes wait for `photoBehind`); the registry line; `npm run gen`; the contract row
   (`tests/contract/validation.test.ts`); `looks.test.ts`'s pin; `proof-look.test.ts` against every shipped look.
6. `tests/render/shipped-looks.spec.ts` in the `render` project.
7. The gates, the baseline, the picture, the record.

## Questions for Artur (stage 1, one at a time, keep or strike, the recommendation first)

1. **Id and name.** `sunset-vibes` and "Sunset Vibes" (the handoff's proposal). The id is in every flyer saved in
   it, forever.
2. **The marks.** Sunset prints the Nests wordmark alone, 81.7 px high, after the eyebrow line on the blob (a
   `marks` token on the look; Hand-drawn keeps `EYEBROW_MARKS`). The badge too would not fit the blob's straight
   edge (the row has about 340 px on both canvases; name + wordmark take 322, the badge 100 more), so the blob would
   have to grow to × 1.3 or the marks shrink.
3. **"Activities".** Baked into the Day blob file (the handoff's "simplest fix"; 8 % bigger on the story, where the
   blob is × 1.08; each colour set gets its own baked file later), or printed by the lockup kind as a fixed word
   token (exact size in every set; copy inside a look, like the wordmark is a picture of a word).
4. **The pill.** Not printed in this look (`pill: null`; the stored handle and tag are kept, a switch back shows
   them), as the design; or printed as a plain line in the footer's slot (Montserrat 700 · 22 · upper · ink, the dot
   in `line`), where on a WhatsApp week flyer it would sit on the band's leaves.
5. **The extras.** Printed as the design's notes line (Montserrat 400 · 17 · muted) in the gap between the columns
   and the ask, so a flyer without extras prints exactly the design.
6. **"In a frame".** The photo in the safe column behind the splash, square, no stroke, the ground showing 70 / 40
   px at each side; or the mode prints exactly as Full bleed.
7. **No photo.** The headline where it always is, on the plain ground, no splash, the splash-edge botanicals left
   out (as the design does when a piece has no room); the blocks below never move with the mode.
8. **The streaks.** None: each is drawn for one word at one size, and a headline staff type is never "SUNSET".
   Revisit with `sm-streaks.js` when the colour sets come.
9. **The lower ferns on WhatsApp.** Both at 87 % (one scale per canvas for the pair; the design has the left one
   at 87 and the right at 100), so the left one clears the band's stem by 4 px.
10. **The columns' order.** Icon · big line · small line · the chip's label (the design's value, then its labels);
    or icon · label · big · small. Answered from the stage 3 pictures if he prefers.
11. **The week's photo** (README §11): the flyer's own, as the app stores it (chosen per flyer), never one per
    hostel.
12. **The fields of README §7.5–7.9**, yes or no each, for the round after Day: the EN sub-line, the 4th column
    (meeting point), the second ask, the footer line.
13. **Spanish row names** (README §7.20): a field in that round, written by staff and by the AI; or never.
14. Dusk's orange and which explorations ship: asked when the colour sets come, after Day's sheets.

## Artur's answers (2026-10-30, each asked by itself by the stage 1 session; not to be reopened)

| # | Answer, in his words | What it means for the port |
|---|---|---|
| 1 | Kept: `sunset-vibes`, "Sunset Vibes" | The id in every flyer saved in it, forever. |
| 2 | Struck: "badge beside the wordmark, as Hand-drawn" | The marks are Hand-drawn's setting (`which: 'both'`); the lockup row must hold the hostel's name, its badge and the wordmark, so the blob grows to about × 1.3 or the marks shrink: the eyebrow stage's pictures decide. |
| 3 | Kept: "printed by the lockup kind, a fixed word token" | "Activities" is drawn with the web font at render, exact on both canvases and in every colour set; no baked file. |
| 4 | Struck: "a plain line in the footer's slot" | The pill prints, as one upper-case line (Montserrat 700 · 22, ink on the ground, the dot in `line`) where the footer would go (story 1572 / 44, WhatsApp 1253 / 44): a pill kind, built with the blocks. The seam keeps the pill required: no look prints none. Until the kind exists it prints with today's kind in the look's tokens (no corners, no tilt). |
| 5 | Kept: "the notes line between the columns and the ask" | The extras print as the design's notes line (Montserrat 400 · 17 · muted), centred in the gap; a flyer without extras prints exactly the design. |
| 6 | Struck: "prints exactly as Full bleed" | In a frame and Full bleed are one picture in this look: with `photoBehind` the renderer draws the bleed box for both modes, and `photoFrame` answers the bleed's shape for the band too. The mode is kept for a switch back to Hand-drawn. |
| 7 | Struck: "a placeholder where the photo would be" | No photo prints the photo box in the placeholder colour (#CFE7F0), the splash and the botanicals as with a photo; the no-photo rule draws nothing. The blocks never move with the mode. |
| 8 | Struck: "port the generator now" | `sm-streaks.js` becomes a stage of its own, after the headline kind (stage 3 above): the knock-outs are drawn at render for any word at any size, in the ground colour, seeded by the word so a flyer prints the same twice, cached per word and size (the library cards mount the renderer), and awaited by `prepareFlyer()` so both exports carry them. |
| 9 | Kept: "both at 87 % on WhatsApp" | One scale per canvas for the pair of lower ferns (`bodyScale`): the story 1, WhatsApp 0.87. |
| 10 | "Answer from stage 3's pictures" | The blocks stage draws both column orders (icon · big · small · label, and icon · label · big · small) on the six Activity samples; he picks there. |
| 11 | "One photo per hostel by default and user can change it by upload or by future media library" | A week flyer prints its own photo when it has one; without one, a default picture of its hostel (one file per hostel, supplied by Artur, seeded with the hostel); a media library is a later round. Built with This week B. |
| 12 | All four fields; "I think is better to include everything and after with a condition remove what is missed better then develope new data" | The fields round builds the EN sub-line, the 4th column (meeting point), the second ask and the footer line; a field a flyer leaves empty collapses, as every optional field does. |
| 13 | Kept: "a field, written by staff and the AI" | Spanish row names join that round: a row's optional `nameEs`, typed in the form and written by the AI's brief; a row without one prints its EN name alone. |

## Traps found while planning

- The proof bundles in `reference/` are not self-contained for art: they load `art/sv4-*.png`, `photos/*` and
  `_ds/*` by relative path, which the handoff folder lacks. Opened over a local server they show type and layout
  (the fonts come from Google Fonts), with broken pictures. The art is `art/` under the README's names.
- README §6.2's WhatsApp week photo top is −212.7; the engine prints −202.7 (PB 577.3). The engine wins.
- `fitOf()` writes `data-fit-min="undefined"` for a line without a floor, which `fit.ts` reads as NaN (no shrink)
  and `drawnChecks` reads as a floor present. A line without a floor must get no `data-fit` at all.
- The fit wraps first and shrinks a too-tall box after; the design shrinks a value to 80 % first, then wraps.
  Accepted (`fit.ts` is shared).
- A transformed element counts in its box's scrollable overflow: a tilted word whose line box leaves the headline
  box triggers the height pass. Keep the words' line boxes inside the box, or measure on the stress samples.
- `pixels.ts` masks the photo box out of the client-export comparison. With the photo behind, that mask would cover
  the top half of the flyer, text included: limit it to the photo's box minus the splash's, or compare the groups'
  own boxes, which the per-feature regions already do. Decide in stage 2.
- `drawnChecks` expects exactly one piece hung from the pill ("the template's spark"): Hand-drawn's rule, to become
  the look's count.
- The lockup row's room on the blob is about 340 px on both canvases (404 × scale − 24 − the side margin).
- The Spanish line may be 260 characters; "never shrunk" cannot hold it: floor 0.8 kept, the box 320 tall.
- A week flyer with a photo frame: `Preview.tsx` shows the crop handle and `exportActions.ts` warns of a missing
  photo through `photoFrame()`; both follow `weekPhoto` by themselves, check them.
- The client export is `modern-screenshot`: check `border-image` (the stretch kind) in `fidelity.spec.ts`.
- Caveat Brush and Archivo Black must carry Ñ ñ Á É Í Ó Ú ¡ ¿ € · ’: the stress samples on the sheets, and
  `document.fonts.check` in the shipped-looks spec.
- A new flyer's eyebrow reads "NEXT ACTIVITY" / "THIS WEEK": in the lockup that is the name line. Staff type the
  hostel's name there; the hostel's own name as a print is a field question (not asked now).
- `tests/unit/looks.test.ts` scans `src/flyer` and `src/editor` for a look's id as a literal: the kinds are named
  by what they draw, never by the look.
- The baseline's "dirty" ignores untracked files: the handoff folder never counts.

## Later rounds

- **Fields** (Large: schema, both backends, the AI's answer schema, the editor's form): the EN sub-line, the 4th
  column, the second ask, the footer, Spanish row names, each as Artur answers questions 12 and 13. Each slots into
  its kind: the columns kind takes a 4th column, the centred ask kind a second column, the trio kind an ES name.
- **The mask kind** (`kind: 'mask'`, a white-alpha PNG filled with a palette role at render), then the colour sets:
  a list of palettes on the look, the chosen set a field, Teal's botanicals, the wordmark per ink; Dusk approved
  first, then what Artur keeps of Dusk, Sun, Teal and Night gold.
- **The streaks**, if wanted: `sm-streaks.js` ported to draw at render, or none.
- **Nest's own icons**: a file swap in `assets/art/` under new names.
