# Plan: output canvases — Instagram story 9:16 + WhatsApp 3:4 from the same flyer

The brief that executes this plan (and reviews it first) is `docs/prompts/output-canvases.md`.

## Context
Today every flyer exports only as a 1080×1920 Instagram story with safe zones 250 top / 300 bottom / 70 sides.
Artur wants a WhatsApp 3:4 version (1080×1440) from the **same** flyer (same event info, no duplicate flyer),
with small margins (WhatsApp doesn't cover the edges with UI), and room for more formats later.
Preview and download must stay in sync: what you see is what you download.

## UX decision
The format is an **output canvas**, not flyer data:
- Toolbar: a new segmented control **Story 9:16 | WhatsApp 3:4**, before Clean/Safe zones. It switches the
  preview; Download PNG/JPG export **the canvas on screen**.
- The filename carries the canvas (`<slug>-story.png`, `<slug>-whatsapp.png`) so the two downloads never collide.
- The success message shows the real size (`src/editor/Editor.tsx:132` hardcodes 1080 × 1920 today).
- The choice is a per-viewer preference in `localStorage` (try/catch), never saved in the flyer.
- Fit warnings ("text cut off") reflect the canvas on screen; switching tabs checks the other one.
- Clean/Safe zones stays, and shows the active canvas's margins.

## Plan

### 1. Per-canvas layout — `src/shared/layout.ts` (single source of truth)
- A `CANVASES` registry `{ story, whatsapp }`, each with `size`, `safe` and its `activity` box table.
  A new format is one more entry (open/closed). `CanvasId = keyof typeof CANVASES`, mirrored as a zod enum in
  `schema.ts` for the API.
- story: today's numbers, unchanged. whatsapp: 1080×1440, safe ~40 on every side. The story content box
  (940×1370 from y 250) becomes ~1000×1360 from y 40, so it's roughly the same block stack shifted up ~210 px
  and slightly wider. Start from that, then tune by eye in Chrome.
- `activityGroups`, `photoAnchors`, `photoFrame` and a new `safeBox` take the canvas.
- Saved doodles use absolute canvas coordinates (blobs at y≈1704 would sit off a 1440 canvas). One rule in
  layout.ts: canvas-anchored art in the story's bottom half is pinned to the active canvas's bottom
  (`y + height − 1920`). No data migration. The sparks are already photo-anchored.

### 2. Renderer — `src/flyer/Flyer.tsx`
- New prop `canvas: CanvasId` (default `story`). Size, boxes, `doodleStyle` and `SafeZoneOverlay` read the
  canvas. Replace the hardcoded `left: 70, right: 70` with the canvas's side margin.

### 3. Editor
- `Editor.tsx`: `canvas` state + toolbar control; pass it to `Preview` and to the exporter.
- `Preview.tsx`: stage size and scale from `CANVASES[canvas].size`. Photo crop uses the canvas's frame (the
  stored crop is focal x/y + zoom, so one crop serves both frames).
- `src/editor/export/types.ts` (`export(id, format, canvas)`), `ClientExporter.tsx` (mount `<Flyer canvas>`,
  assert that canvas's size), `ServerExporter.ts` (send `canvas` in the body).
- `src/shared/filename.ts`: canvas suffix.

### 4. Node server export + contract
- `server/app.ts:158`: read `canvas` (default `story`, new `bad_canvas` error in the error table).
- `server/services/renderer.ts`: viewport/clip from the canvas; `canvas` in the cache key and the render-page URL.
- `src/render/main.tsx`: read `canvas` from the query and pass it to `<Flyer>`.
- `docs/api-contract.md`: document `canvas` on export → `npm run gen`.
- PHP: export is client-only (`exporters: ['client']`), so no PHP code is expected. Verify against the contract suite.

### 5. Tests (every canvas)
- `tests/unit/shared.test.ts:66`: every group inside `safeBox(canvas)`, no overlaps, doodles on canvas, per canvas × photo mode.
- `tests/render/render.spec.ts`: the hardcoded SAFE (line 12) comes from the registry; exact export size per canvas; separate cache per canvas.
- `tests/render/fidelity.spec.ts` + `pixels.ts`: client vs server per canvas.
- `tests/php-smoke/smoke.spec.ts` step 9: also download WhatsApp at 1080×1440.
- Contract: an unknown `canvas` → `bad_canvas` (Node).

### 6. Docs
CLAUDE.md, README.md, `package.json` description: no longer "1080×1920 only". Safe zones become hard limits
**per canvas** (story 250/300/70, WhatsApp ~40).

## Verification
`npm run typecheck && npm test && npm run test:contract && npm run test:render`, then `npm run test:php-smoke`.
Then in Chrome: switch canvas in the preview, crop the photo in both, download PNG+JPG of both and check size
and look. Repeat on the Laragon PHP deploy after `npm run build:php`.
