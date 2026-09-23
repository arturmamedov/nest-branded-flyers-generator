# Spike: can the browser make the export? (brief Phase 1)

**Answer: yes, with `modern-screenshot`, and the renderer needs no change.** On every sample in every photo
mode, its in-browser capture of the unchanged `<Flyer>` matches the real server export within **0.024 %**
of the pixels outside the photo band. The agreed limit is 0.5 %. The photo band itself matches at 0.00 %.
All three features the handoff (§9) worried about pass on their own:

- stretched `background-size: 100% 100%` art;
- the highlighter's `box-decoration-break: clone`;
- the `non-scaling-stroke` wonky frames.

The real fonts are embedded. Both the PNG and the JPG are exactly 1080 × 1920, and the JPG is quality 90.

`html-to-image` still fails, on the highlighter, as the handoff found.

The spike script was retired once the permanent check replaced it. `tests/render/fidelity.spec.ts`
downloads every sample through the real editor and holds each to these same rules on every `npm run test:render`. To
rerun the three-library comparison, check out commit `7e8cd7a` and run `npm run spike:client-export`. It builds, runs
`scripts/spike-client-export.ts`, and writes the raw tables and golden/candidate/diff images to
`test-results/client-export-spike/`.

## Method

- **Golden reference:** the real Node export. `createRenderer()` from `server/services/renderer.ts` renders
  every sample × {bleed, band, none}, seeded as saved flyers, plus one spike-only record (below): 21 cases
  in all. Samples without a photo borrow one in bleed and band, as `tests/render` does.
- **Candidates:** the same built `render.html` loads each flyer, with the flyer mounted **offscreen**
  (`position: fixed; left: -20000px`, never `display: none`). That is how a client exporter would mount it.
  `prepareFlyer()` runs as usual. Each library then captures `[data-flyer]` at pixel ratio 1 onto a canvas,
  which is encoded with `canvas.toBlob('image/png')` and `toBlob('image/jpeg', 0.9)`. This runs in a
  1280 × 800 window at **DPR 1 and DPR 2**, like a normal laptop and a Retina one.
- **Diff:** pixelmatch with threshold 0.1, the same settings as `scripts/compare-design.ts`. Anti-aliasing
  pixels are not counted. The pass mark is ≤ 0.5 % of the pixels outside the photo band. The band is
  measured on its own.
- **Feature checks**, each ≤ 0.5 % inside its own boxes, taken from the live DOM, with the photo band
  excluded:
  - *art*: every `url(` background, which covers the eyebrow rule, the ask rule and the no-photo rule;
  - *highlighter*: every line box of the WHEN mark (`getClientRects()`);
  - *wonky*: a ring along each `<svg>` frame (6 px outside, 30 px inside), so the check measures the 5 px
    stroke rather than the chip text;
  - *fonts*: the headline, extras, ask and pill boxes.
- **Size and JPG:** the decoded PNG and JPG must be exactly 1080 × 1920. For the JPG, the luminance
  quantisation table has to equal the IJG quality-90 table.
- **Spike-only record, "Highlighter wrap":** the stress test with WHEN = `Sat 27/9 & Sun 28/9 · 05:30`. The
  stress test's own WHEN line doesn't wrap, and `clone` only shows on a wrapped line. Among the samples only
  Paragliding ("Most / mornings") wraps.
- **Negative controls:** each control breaks one feature in the rendered flyer, the way the renderer writes
  it (an inline style or attribute), and is then captured normally. Each check has to catch its own
  breakage, or it would be blind.

## Results (Chromium 153, Windows)

| Library | DPR | Cases passing | Worst % outside band | Art | Highlighter | Wonky | Fonts | 1080×1920 | JPG q90 | Median capture |
|---|---|---|---|---|---|---|---|---|---|---|
| **modern-screenshot 4.7.0** | 1 | **21/21** | **0.024** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 516 ms |
| **modern-screenshot 4.7.0** | 2 | **21/21** | **0.024** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 481 ms |
| @zumer/snapdom 3.0.0 | 1 | 21/21 | 0.040 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 339 ms |
| @zumer/snapdom 3.0.0 | 2 | 21/21 | 0.040 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 364 ms |
| html-to-image 1.11.13 | 1 | 9/21 | 0.473 | ✓ | ✗ up to 12.6 % | ✓ | ✗ up to 0.60 % | ✓ | ✓ | 517 ms |
| html-to-image 1.11.13 | 2 | 9/21 | 0.473 | ✓ | ✗ up to 12.6 % | ✓ | ✗ up to 0.60 % | ✓ | ✓ | 515 ms |

The server's golden JPGs are 1080 × 1920 at quality 90 too.

### Per case: % differing pixels outside the photo band (inside the band in brackets; bold = fails)

| Case | modern-screenshot @1x | @2x | snapdom @1x | @2x | html-to-image @1x | @2x |
|---|---|---|---|---|---|---|
| Pool party / bleed | 0.002 (0.00) | 0.002 (0.00) | 0.018 (0.00) | 0.018 (0.00) | **0.114 (0.00)** | **0.114 (0.00)** |
| Pool party / band | 0.002 (0.00) | 0.002 (0.00) | 0.018 (0.00) | 0.018 (0.00) | **0.111 (0.00)** | **0.111 (0.00)** |
| Pool party / none | 0.002 | 0.002 | 0.015 | 0.015 | **0.092** | **0.092** |
| Pizza night / bleed | 0.002 (0.00) | 0.002 (0.00) | 0.018 (0.00) | 0.018 (0.00) | 0.113 (0.00) | 0.113 (0.00) |
| Pizza night / band | 0.002 (0.00) | 0.002 (0.00) | 0.018 (0.00) | 0.018 (0.00) | 0.110 (0.00) | 0.110 (0.00) |
| Pizza night / none | 0.002 | 0.002 | 0.015 | 0.015 | 0.091 | 0.091 |
| Surf lesson / bleed | 0.002 (0.00) | 0.002 (0.00) | 0.019 (0.00) | 0.019 (0.00) | 0.050 (0.00) | 0.050 (0.00) |
| Surf lesson / band | 0.002 (0.00) | 0.002 (0.00) | 0.018 (0.00) | 0.018 (0.00) | 0.048 (0.00) | 0.048 (0.00) |
| Surf lesson / none | 0.002 | 0.002 | 0.016 | 0.016 | 0.040 | 0.040 |
| Long copy · stress test / bleed | 0.024 (0.00) | 0.024 (0.00) | 0.040 (0.00) | 0.040 (0.00) | **0.473 (0.00)** | **0.473 (0.00)** |
| Long copy · stress test / band | 0.023 (0.00) | 0.023 (0.00) | 0.039 (0.00) | 0.039 (0.00) | **0.458 (0.00)** | **0.458 (0.00)** |
| Long copy · stress test / none | 0.019 | 0.019 | 0.033 | 0.033 | **0.379** | **0.379** |
| Paragliding / bleed | 0.002 (0.00) | 0.002 (0.00) | 0.018 (0.00) | 0.018 (0.00) | **0.212 (0.00)** | **0.212 (0.00)** |
| Paragliding / band | 0.002 (0.00) | 0.002 (0.00) | 0.017 (0.00) | 0.017 (0.00) | **0.205 (0.00)** | **0.205 (0.00)** |
| Paragliding / none | 0.002 | 0.002 | 0.015 | 0.015 | **0.170** | **0.170** |
| Pizza · weekly / bleed | 0.002 (0.00) | 0.002 (0.00) | 0.019 (0.00) | 0.019 (0.00) | 0.119 (0.00) | 0.119 (0.00) |
| Pizza · weekly / band | 0.002 (0.00) | 0.002 (0.00) | 0.018 (0.00) | 0.018 (0.00) | 0.115 (0.00) | 0.115 (0.00) |
| Pizza · weekly / none | 0.002 | 0.002 | 0.016 | 0.016 | 0.096 | 0.096 |
| Highlighter wrap / bleed | 0.024 (0.00) | 0.024 (0.00) | 0.040 (0.00) | 0.040 (0.00) | **0.462 (0.00)** | **0.462 (0.00)** |
| Highlighter wrap / band | 0.023 (0.00) | 0.023 (0.00) | 0.039 (0.00) | 0.039 (0.00) | **0.448 (0.00)** | **0.448 (0.00)** |
| Highlighter wrap / none | 0.019 | 0.019 | 0.033 | 0.033 | **0.370** | **0.370** |

html-to-image fails on its highlighter box even where the total stays under 0.5 %. The failing cases are
Pool party, the stress test, Paragliding and Highlighter wrap.

### Negative controls (snapdom @1x, Highlighter wrap / band)

| Control | What it breaks | Its check | % differing in that region | Caught |
|---|---|---|---|---|
| fallback font | `font-family: serif` on every element | fonts | 15.27 | yes |
| scaling stroke | `vector-effect` attribute removed | wonky | 1.77 | yes |
| unstretched art | `background-size: auto` on the rules | art | 23.89 | yes |
| highlighter slice | `box-decoration-break: slice` | highlighter | 10.31 | yes |

## What still differs, and why it doesn't matter

- **modern-screenshot:** only anti-aliasing on a few glyph edges, mostly in the Montserrat 600 WHERE
  sub-line. That's a few dozen pixels, with no change in shape or position.
- **snapdom:** the same glyph edges, plus the Nests logo in the top-right comes out slightly softer. The
  logo is a downscaled `<img>`, and snapdom appears to resample it twice.
- **html-to-image:** it draws the stretched highlighter wrongly on the WHEN line. On a wrapped line
  (Paragliding, "Most / mornings") the per-line highlighter strokes lose their shape. Text in the stress
  test is off by up to 0.60 %. This is the §9 failure, still present.

## Recommendation

1. Use **modern-screenshot** (MIT, 14 KB gzipped, no dependencies) for `ClientExporter`, on the unchanged
   renderer:

   ```js
   domToCanvas(flyerEl, { scale: 1 })
   // then toBlob('image/png') or toBlob('image/jpeg', 0.9),
   // asserting the canvas is 1080 × 1920
   ```

   It was the closest in every case, at both DPRs.
2. **No renderer change is needed.** The brief's fallback (art as `<img>` instead of a CSS background)
   stays unused.
3. Keep snapdom in reserve. It also passed everything, but it is 83 KB gzipped, it resamples the logo, and
   v3.0.0 is a fresh major release. Drop html-to-image.
4. In Phase 2, turn this into a permanent check. On the Node backend both exporters exist, so
   `test:render` can download each sample through the real editor `ClientExporter` and diff it against
   `POST /api/render/:id` with the same 0.5 % rule. That catches library upgrades that drift.

## What this does not prove

- **Other machines.** The spike ran in Playwright's Chromium 153 on Windows. On each staff member's Chrome
  or Edge, the export matches *that* browser's preview by construction: the same DOM, the same fonts, the
  same fit. Glyph anti-aliasing can still differ slightly between machines (for example Windows vs macOS),
  and that is the brief's known trade-off. Chrome or Edge stay required.
- **The editor page.** The capture ran inside the bare `render.html`, not the editor page. The editor has
  no global CSS resets, and the library clones computed styles, but Phase 2 re-verifies inside the editor
  with the permanent check above.
- **Stylesheet styling.** The flyer's styling is inline styles and SVG attributes, and that is what was
  tested. A first attempt at the controls injected a stylesheet rule on the SVG `path`s instead, and that
  rule did not show up in the snapdom capture. This is one more reason to keep the renderer's styles inline,
  as `CLAUDE.md` already requires.
