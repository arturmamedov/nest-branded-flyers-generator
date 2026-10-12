# Launch prompt: the editor's UX round, Part 4 closed (the art around the pill, the pencil, then the limit)

Written at the end of the session that built Part 4's first piece (2026-10-12), for a session with no memory of it.
Paste the block below. Part 4 ends the round, and this session ends it.

```
Read CLAUDE.md, then docs/prompts/editor-ux.md and docs/reports/editor-ux.md, and finish Part 4 of the brief.
Part 4 is half built: the pill fits (committed), the limit is still 12, and after seeing the proof sheet I asked
for the art around the pill and the pencil to move. This session closes that design for good, then lands the
limit. Only Part 4.

- Start in plan mode. Build nothing before I approve the plan. Keep the plan SHORT: what changes, in a table, and
  the order. I can't read a long one ("Shortly what will change, I can't read all the plan for just few edits").
- Before anything else, check git: the branch is feat/editor-ux-part-3 (main does not hold Part 3; I chose to
  commit Part 4 on it), Part 4's first piece is 7c42d35 ("The tag pill is a fitted line…"), the commit of this
  prompt is on top of it, nothing is pushed. Check the tree holds no work that is not yours. If anything
  contradicts this, stop and ask.
- My answers are decided: don't reopen them (list below). Points marked "Mine" are suggestions: show each one in
  the plan so I can keep it or strike it.
- Show me pictures, not words, for the four art questions below, before you build them. I sign off a proof sheet
  before the art is committed, and again before the limit is.
- A commit per piece as it goes green, every change with its test first. Push nothing, build no release, and
  don't touch the live site or the Laragon copy. `src/shared/` edits restart `npm run dev` if I am running it:
  warn me before them.
- Part 4 ends the round: instead of a next prompt, tell me it is done and what is left that is mine (the
  release, the live site, the phone trial of Part 3).

WHERE IT STANDS

- 7c42d35 made the pill a fitted line, with the limit still 12 (tests/render/pill.spec.ts, pillBox() in layout.ts,
  Flyer.tsx). The pill (data-group="pill") holds one flex row, data-fit="34" data-fit-min="0.7" (handle, dot,
  tag); its maxWidth is pillBox(canvas).width - 1 (940 / 1000 minus 1 px: the -0.6° tilt lifts a corner of a
  full-width pill 0.36 px past the safe edge); overflowX is clip. Only the letters shrink: padding, gaps and the
  14 px dot keep their size. A pill that fitted before prints the same pixels (story baseline, 32 cases,
  byte-identical, run by hand against the capture in the temp folder nest-ux1-baseline).
- The gates at 7c42d35: typecheck, 678 unit, 218 browser (render project; the baseline is opt-in), nothing else
  run (no contract, PHP or AI file changed). The limit is NOT committed: text.ts still says tag: 12.
- Measured, headless Chrome on the render page with injected payloads: the default pill is 585 px (handle 304,
  tag 155, 126 of padding, gaps and dot). A 24-capital tag with the default handle is 926 px and fits at 34 px on
  both canvases. A handle of 18 with that tag shrinks to 29.8 px (88%) on the story and 32.3 px (95%) on WhatsApp.
  18 + 24 of the letter W stops at the 0.7 floor (23.8 px), is cut at the pill's edge, and the editor warns.
- The proof sheet is in backups/editor-ux-part-4/ (outside git): proof-sheet-story.png, proof-sheet-whatsapp.png,
  proof-context.png, proof-sheet.html and proof-sheet.mts, the script. To remake it: npm run build, serve dist/
  (NODE_ENV=production HOST=127.0.0.1 PORT=8794 DATA_DIR=<a temp folder> AI_ENABLED=false node
  dist-server/server/index.js), then npx tsx backups/editor-ux-part-4/proof-sheet.mts 8794 <an output folder>.
  It draws through the render page with an injected window.__FLYER_PAYLOAD, which is never validated, so it can
  show copy past the limit. Stop the server when done.

WHAT I SAID AFTER THE SHEET, in my words

  "the spark and the blobs should move too and also the same sparks on the image too and the pencil in the
  signup should stay more upper and maybe follow more the 'Sign up at reception' text."

What it means as far as I can tell, and what is NOT clear. Show me before/after pictures of each, and ask:

1. The spark "off the pill's end". Today a stored doodle (spark-teal, flipX, rot -137, w 92, at x 776 / y 1601.7
   on the story, anchored 'floor'). It stays at those canvas pixels whatever the pill's width, so under a long
   pill it ends up under its bottom edge. It should follow the pill's end.
2. The blobs (blob-yellow w 250, blob-teal w 290, anchors bottomLeft / bottomRight, drawn at 0.8 on WhatsApp).
   On WhatsApp a 991 px pill lies over the teal blob. They should move too. How (away from the pill, smaller,
   lower, following it) I did not say: show two or three.
3. "The same sparks on the image too": the two sparks on the photo's top corners (spark-teal at photoLeft,
   spark-yellow at photoRight; on a week flyer the first row's corners; with no photo the ends of the brush rule).
   I did not say what they should do. Ask me, with pictures, before building anything for them.
4. The pencil by the ask (Flyer.tsx, in the ask group: right: 20, top: 6, width 104, rotate(-4deg)). It sits at
   the column's right edge, about 130 px past the end of "Sign up at reception." (the text ends near x 760 on
   the story, the pencil spans about 890 to 985). It should stay higher and follow the text: hang from the end
   of the English line, so it moves when that line shrinks or is shorter.

TRAPS

- Never change the numbers in DEFAULT_DOODLES. Every stored flyer carries a copy, and sameDoodles() is how the
  renderer knows an untouched template set (resolveDoodles -> TEMPLATE_ART, FOLLOWS, artAnchors, placeArt in
  defaults.ts and layout.ts). Art someone arranged keeps its canvas pixels. Move art in the renderer, never in
  stored data: no migration, and an older release must still read and draw every flyer.
- The pill's width is known only after the fit (fonts). A position relative to the pill in CSS needs no
  measuring: a positioned wrapper around the pill. The pill itself is overflowX: clip, so the spark cannot be
  its child. (Mine: that way.) If the spark becomes part of the pill's wrapper, the stored spark of the template
  set must not be drawn twice.
- Art may enter the margins but must stay on the canvas. On WhatsApp (40 px margins) the spark's tip would leave
  it at full size (see the comment above WHATSAPP in layout.ts).
- The pencil is not a stored doodle and sits inside the ask group (it is not a direct child of the flyer root).
- Tests that hold the art today and must change with it: render.spec.ts reads [data-flyer] > img[data-art] and
  compares each with resolveDoodles() + placeArt() ("art pieces", "art i left/top/width"); shared.test.ts pins
  the anchors' numbers and "TEMPLATE_ART is exact".
- This design changes what flyers print: the pencil is on every flyer with an ask. So the byte-identical story
  baseline cannot hold any more, and the brief's "baseline holds" no longer applies as written. Replace it, and
  say so in the plan: before/after sheets of every seeded sample (the six design records and the three This week
  flyers, both canvases) for me to sign off, then a new baseline capture for later (RENDER_BASELINE=capture,
  into a temp folder, never committed).

DECIDED, do not reopen

- The tag is 24 characters; the handle keeps 18.
- The pill's floor is 0.7, only the letters shrink, and the pill stays 1 px inside its column.
- No sample flyer is added (long pills are injected payloads in the specs).
- The leftover literals in Editor.tsx (chips 90, extras 32 and 4) become CHIP_VALUE_MAX, EXTRA_MAX, EXTRAS_MAX.
- The AI never sets the tag; its prompt text is unchanged and its generated "Limits" line moves with gen.
- The pill's one free "!" (PILL_OWN in copyRules.ts) stays.

THE ORDER (a commit per piece, test first)

1. The short plan, and the pictures for 1 to 4. I answer.
2. The art and the pencil in the renderer, with their tests. Both canvases, both templates, every photo mode.
3. The sheet of every sample before and after, with a long pill and a default one. I sign it off.
4. The limit: TEXT_LIMITS.tag 24 and its comment in text.ts, npm run gen (schema/*.json, ai.json), the contract
   test (24 saved and 25 refused with the same data.text.tag error on every backend), a unit pin, an editor spec
   (type 24 in Tag, save, reopen, a cut-off toast only past the floor), a fidelity case so the browser exporter
   matches the server's. Run the AI fixtures: none should move. Anthropic's first call after an answer-schema
   change is the slow one (about 20 s of the 25 s limit): say so in the report.
5. The tidy of the three literals.
6. Docs: docs/deploy.md "Rolling back" (a release from before this part refuses, on Node's two drivers, a flyer
   saved with a tag over 12, because the read parses the schema; the older PHP reads it with no length check, so
   it opens and prints unfitted and its Save is refused until the tag is shortened: prove the PHP half with a test
   or say it was read from the code); CLAUDE.md (the fitted pill and the art decisions with their dates, the
   status); the Part 4 section of docs/reports/editor-ux.md; the brief's "Where it stands".
7. Gates: npm run typecheck && npm test && npm run test:contract && npm run test:render, then npm run test:php
   (the schema changed) and npm run test:php-smoke. A fresh-context review of the diff, each finding fixed with
   its test first. A look in Chrome at 1440, 1280, 390 and 360 px: the editor with a 24-character tag (the Tag
   field, the closed "Top and tag pill" line, the cut-off toast) and a downloaded story and WhatsApp image.

WHAT EARLIER PARTS LEFT (still true; docs/prompts/editor-ux-part-4.md lists them in full)

- TEXT_LIMITS in src/shared/text.ts is the one home of the text lines' limits.
- On a saved flyer "Top and tag pill" starts closed: a spec that fills Handle or Tag calls
  openSection(page, 'Top and tag pill') first (tests/editor.ts).
- The handle and the tag count as "the flyer's details" for the AI caption (SHARE_DETAILS): changing the tag brings
  "Write with AI" back.
- The cut-off warning is read through cutOff(page) and cutOffOn() in tests/editor.ts.
- A picture is copied, shared or downloaded through picture() in Editor.tsx: one export, so all four ways out
  change together. Specs download through download(page, 'png' | 'jpg').
- The full browser suite takes 7 to 9 minutes. While it runs, dist/ must not be replaced and the specs must not
  be edited. No two file names may differ by case alone.
- Still open and mine, from Parts 1 to 3 ("For Artur to decide" in docs/reports/editor-ux.md): do not act on them.
```
