# Output canvases: Instagram story 9:16 + WhatsApp 3:4 from the same flyer

Branch `feat/output-canvases` (off `feat/php-shared-hosting`), 2026-09-23. The brief is
`docs/prompts/output-canvases.md`, the plan it reviewed `docs/prompts/output-canvases-plan.md`, and the review
(Italian, with the owner's margin decision) `docs/reports/output-canvases-review.md`.

**In one line:** every flyer previews and downloads as an Instagram story (1080 × 1920) or a WhatsApp image
(1080 × 1440, exactly 3:4), switched by **Story 9:16 | WhatsApp 3:4** in the editor's toolbar. It is one flyer
with one set of data, on both backends. The story renders byte-identical to before.

## What changed

- **One registry.** `src/shared/layout.ts` now holds `CANVASES`. Each entry is what the canvas decides: a label,
  a size, the safe zones, a filename suffix, the Activity boxes (written against its own text column) and two
  art choices, how far in the photo-corner sparks sit and the scale of the corner blobs. Everything else (the
  column, the art's anchor points) is derived. `CanvasId`, `CANVAS_IDS` and `isCanvasId`
  (own keys only) derive from it. Nothing else holds canvas geometry: the renderer, the editor, both exporters,
  the server, the render page, the error message and the tests all read the registry. A new canvas is one
  entry (and its numbers' why-comments).
- **The renderer** (`src/flyer/Flyer.tsx`, still the only one) takes a required `canvas`.
  - Every block comes from `activityGroups(canvas, mode)`, written as the same `left/right` insets as before,
    so the story's CSS is unchanged.
  - The root says what it drew (`data-canvas`).
  - The safe-zone overlay and its label come from `safeBox(canvas)`.
- **Template art follows the canvas without touching stored data.**
  - `resolveDoodles()` (`src/shared/defaults.ts`) recognises the untouched `DEFAULT_DOODLES` (`sameDoodles`),
    which is every flyer the app has made, since no UI edits doodles yet.
  - It re-expresses them from render-only anchors: the blobs hang from the bottom corners, the last spark from
    the stack's floor (it belongs to the pill), the two sparks from the photo corners as before.
  - The offsets are derived from `DEFAULT_DOODLES` and the story's anchor points, and they come back
    bit-exact on the story (unit-tested with `toBe`).
  - Any other art (the prototype set, API-made sets) stays at its canvas pixels.
  - No schema change, no migration, and an older release still reads every flyer, so `docs/deploy.md`'s
    rollback holds.
- **The editor.**
  - The toolbar control is generated from the registry (`aria-pressed`) and remembered per viewer in
    localStorage (`src/editor/prefs.ts`, the helpers Library.tsx already had).
  - The preview's scale follows the canvas, and a canvas switch refits.
  - The photo handle and the crop controls use the canvas's frame, and drags start from the crop as that frame
    shows it.
  - Every canvas is fitted: the one on screen before paint, the others in an offscreen, deferred `<Flyer>` (the
    same component). The cut-off warning names the canvases that clip.
  - Download exports the canvas on screen, and the success message gives its real size.
- **Export.**
  - `FlyerExporter.export({ id, format, canvas })` on both exporters.
  - `POST api/render/:id` takes `canvas`:
    - absent or `null` is `story`;
    - anything else must be a registry id, else 400 `bad_canvas`, checked after `format` and before the flyer.
  - The render cache file is `<id>-<canvas>-<key>.<format>`, so saving still empties every canvas of a flyer.
  - The render page reads `?canvas=` (unknown ids are an error, never a silent story), and the server checks
    the page's `data-canvas` before its screenshot.
  - Downloads are named `<slug>.png` for the story, as always, and `<slug>-whatsapp.png` for WhatsApp.
- **PHP: no code.** The only generated change is the `bad_canvas` entry in `schema/shared.json` and the error
  table (`npm run gen`). The PHP backend has no export route, and its editor exports in the browser with the
  same `<Flyer>`.

## The WhatsApp numbers (`src/shared/layout.ts`, with their why-comments)

| | Story | WhatsApp | Why |
|---|---|---|---|
| Canvas | 1080 × 1920 | 1080 × 1440 | exactly 3:4 |
| Safe zone | 250 / 300 / 70 | 40 all round | nothing covers a WhatsApp image's edges (owner's call: option C of the review) |
| Eyebrow | 250, 95 tall | 40, 69 tall | its content is 62 px; it gives up the slack |
| Headline | 345, 300 | 109, 300 | same height, 60 px wider: cut-off copy is rarer here (the editor still fits every canvas) |
| Headline, no photo | 398, 460 | 162, 460 | the story's 53 px under the eyebrow |
| Photo, band | 70, 712, 940 × 380 | 40, 476, 1000 × 404 | the story band's 47:19 aspect, so one crop shows the same picture |
| Photo, bleed | 0, 712, 1080 × 380 | 0, 500, 1080 × 380 | unchanged size; ends with the band, so the blocks below are shared by every mode |
| Brush rule (no photo) | 240, 900 | 240, 664 | 42 px under the headline box, as on the story |
| Chips | 1110, 206 | 896, 206 | story height, wider |
| Extras | 1318, 40 | 1104, 40 | |
| Ask | 1382, 150 | 1164, 150 | |
| Pill | 1544, 72 | 1324, 72 | 4 px above the floor for its tilt |
| Gaps (photo·chips·extras·ask·pill) | 18 · 2 · 24 · 12 | 16 · 2 · 20 · 10 | the ~35 px the taller band costs come from gaps with no copy |
| Photo-corner sparks | on the band's corners | 14 px in from them | at 40 px the yellow spark's tip left the canvas (6 % of its ink) |
| Corner blobs | scale 1 | scale 0.8 | at full size they reached behind the Spanish ask line and the pencil, and the teal one ran into the pill's spark; the designer's 1080 × 1350 version drew them at 0.78 |

Tuned by eye in Chrome on all six samples, the stress test included, in all three photo modes, on a scratch
instance (not `./data`): contact sheets of both canvases, and full-size views of the tight spots.

## What was verified, and how

| Check | Result |
|---|---|
| **The story is byte-identical to before** | `tests/render/baseline.spec.ts` (opt-in; the PNGs are not committed). On the old commit (`01be032`) it captured 29 cases, each exported through the real Node renderer and shown with its safe-zone overlay: the 7 fidelity records × 3 modes, the prototype art set, a custom set anchored to canvas pixels, and two off-centre crops. After the change every one comes back byte-identical, both with `canvas` absent and with `canvas: 'story'`. Last run on the final code: green, twice. |
| `npm run typecheck` | clean |
| `npm test` | 135 tests, green. What the new ones cover: <ul><li>the story's numbers, pinned as literals;</li><li>per canvas and photo mode: safe box, no overlaps, the stack built up from the floor;</li><li>the registry: exactly 3:4, and `__proto__` and `toString` rejected as canvas ids;</li><li>photo frames keep the story's aspect, and `coverRect` equals the story's, scaled, over a grid of photos (one wider than the band) and crops (zoomed out, off-centre, 4×);</li><li>WhatsApp's fitted boxes are at least the story's;</li><li>the template art lands bit-exact on the story, and the pill's spark keeps its offset;</li><li>each art piece keeps at least the story's share of ink on the canvas;</li><li>the corner blobs keep off the ask's lines and the pill's spark;</li><li>filename vectors.</li></ul>The ink checks use the renderer's own `placeArt` and the PNGs' alpha ≥ 128. Mutation-checked: removing the sparks' inset fails the ink test (94 %), and drawing the blobs at full size fails the clearance test. |
| `npm run test:render` | 53 tests, green. Per canvas, for every sample × mode: <ul><li>every block's DOM rect equals the registry's (±0.5 px; the pill within its tilt), which catches any leftover story number;</li><li>every art piece where `placeArt` puts it, from data that went through the store;</li><li>the safe box, no overlaps, no clipped text, fonts, highlighter clone, no scrollbars.</li></ul>The export API: <ul><li>each canvas at its exact size as PNG and JPG, cached separately, and every canvas's cache emptied by a save;</li><li>the checks in order, with `bad_canvas` for `''`, `STORY`, `__proto__`, `toString`, numbers, booleans, arrays and objects, and `null` meaning the story.</li></ul>The render page refuses an unknown canvas. The editor: <ul><li>WhatsApp fitted offscreen while the story is on screen;</li><li>each canvas's preview fitted exactly as its export;</li><li>downloads through the server exporter with the right canvas, name and size;</li><li>the canvas choice remembered across a reload, and a bad stored value ignored;</li><li>cut-off copy naming both canvases, and the warning going away again.</li></ul>Fidelity: all 21 cases on both canvases plus 4 retina, the client export within 0.5 % of the server's. |
| `npm run test:contract` | 313 passed, 184 skipped (the rows for a remote deployment); `node`, `node-json`, `php`, `cross`. |
| `npm run test:php` | 603 tests, 9240 assertions, 37 skipped (environment). PHP code untouched; the only PHP-read change is `bad_canvas` in `schema/shared.json`. |
| `npm run test:php-smoke` | green. The real editor on the PHP backend, step 9 downloading PNG and JPG of both canvases at their exact sizes and names. |
| Chrome 143 (dev, scratch instance) | Both canvases previewed, with safe zones on each. The photo was cropped (zoom and drag) on WhatsApp and appears on the story at the same place in the frame (to 0.0015 of the frame). PNG and JPG of both downloaded: 1080 × 1920 and 1080 × 1440, named `long-copy-stress-test.png` and `long-copy-stress-test-whatsapp.png`. |
| Laragon PHP deploy (`http://localhost/nest-flyers-php/`) | Steps: <ol><li>`npm run build:php` (release `dde8d6381636`);</li><li>`npm run deploy:backup` (9 flyers, 6 photos);</li><li>the release copied over the deploy, additively;</li><li>in Chrome, "Pool party": switched to WhatsApp, dragged the photo there, then PNG and JPG of both canvases through the browser exporter: 1080 × 1440 and 1080 × 1920, the crop at the same place on both;</li><li>`npm run deploy:restore -- … --force` put the library back exactly: flyer 1's crop and date are the backup's again.</li></ol> |

## The review of the diff

Once the build was done, five read-only reviewers went over the diff, each with a skeptic. What they found, and
what was done:

- **Test gaps (fixed).** Nothing checked where the renderer draws the art on WhatsApp. Nothing covered the
  offscreen fit, the warning naming canvases, or the remembered canvas. All four now have tests. `placeArt` is
  now one function shared by the renderer and the tests.
- **Duplication (fixed).** The columns and the art's corner and floor points were typed per canvas though they
  follow from the size and margins. Now each canvas declares only what it decides (`defineCanvas`), and
  `artAnchors` derives the rest.
- **Wrong wording (fixed).** Claims that "copy that fits the story fits here", comments on what the anchors are,
  and the deploy runbook and preflight page still saying "exactly 1080 × 1920".
- **Wasted work (fixed).** The offscreen canvas no longer refits or re-renders on a photo drag, a zoom or a
  nudge. An identical fit report no longer re-renders the editor.
- **A pre-existing cache race (fixed).** The Node renderer checked the cache file before the in-flight map and
  wrote screenshots straight to the cache path. A second request could get a half-written file as a cache hit.
  Now the in-flight map is checked first, and the image is written aside and renamed into place.
- **Baseline hardening (done).** A capture where no two renders agree is refused. A check retries only a small,
  local difference (at most 1000 px inside a 64 × 64 px box), and says which commit the baseline came from.

## Left open

- **Step 7** (drag everything, out of scope): the stored `overrides` (dx/dy/scale) are one set per flyer, so
  they will apply on every canvas. Step 7 has to decide whether they stay shared (clamped per canvas) or become
  per canvas.
- **Step 9** (the doodle picker): once staff place art, the picker should store the render-only anchors
  (`bottomLeft`, `bottomRight`, `floor`) so art follows every canvas. That extends `DoodleAnchorSchema`, and it
  needs the first JSON migration id so an older release refuses the store instead of misreading it.
- **Art that is not the template's** renders at its canvas pixels on every canvas. That covers the prototype
  set, which migration 2 already replaced in SQLite, and sets posted through the API. On WhatsApp,
  prototype-style top sparks would sit on the eyebrow. No UI can make such art today.
- **Step 8** (This week): `WEEK` is story-only; it needs its WhatsApp boxes when it is built.
- **The safe-zone label** sits on the eyebrow row on both canvases, as it always did on the story. It is editor
  chrome, and it was left in place so the story's overlay stays identical.
- **Cut-off copy on WhatsApp only** is rare but possible: a wider line shrinks less, then needs more height. The
  editor warns about it, because it fits every canvas.
- **One stored crop** shows the same picture on both canvases to within 0.1 %. The band is 404 tall where the
  exact aspect needs 404.26, and the difference only shows on panoramas wider than 47:19.
- **Old render-cache files** (`<id>-<key>.<format>`, from before canvases) are never served again. They are
  deleted when their flyer is next saved or archived. As before, nothing else prunes `renders/`, which is only a
  cache and can be emptied at any time.
- **Pre-existing anti-aliasing flakes**, found by the baseline on unchanged code: now and then Chrome draws the
  WHEN chip's 32 px calendar icon (324 px in its box) or a chip frame's edge (54 px) slightly differently. The
  fidelity threshold absorbs them, and the baseline retries them.
