# Design style switcher (stage: architecture only, no new design yet)

Read first: CLAUDE.md, README.md, design_handoff_flyer_generator/README.md (§2 geometry, §3 tokens, §5 fit, §7 data
model), src/shared/layout.ts, src/shared/defaults.ts, src/shared/fonts.ts, src/flyer/Flyer.tsx, src/flyer/fit.ts,
docs/deploy.md ("Rolling back"), docs/api-contract.md. Use the superpowers brainstorming skill first, then writing-plans.
Ask Artur one question at a time; show mock-ups drawn by the real renderer for anything about how a flyer looks.

## Goal

A flyer can be printed in more than one *style*. Today's hand-drawn look is style #1 and stays the default. A later
session adds the new style as DATA. This session builds the seam and proves it with a throwaway second style; it does
not design the real one.

## What a style is (and is not)

- IS: a named set of tokens: colours, font families (from src/shared/fonts.ts only), the template art set (blobs,
  sparks, pencil, doodles and their inks), frame/chip/pill decoration, and optional per-canvas numeric nudges.
- IS NOT: a second renderer, a second editor, a second fit algorithm, a second API, or a fork of any backend.
- Boxes (positions of eyebrow, headline, photo, chips, extras, ask, pill, week title/rows), safe zones, text limits,
  copy rules, the data-fit* attributes, fit.ts, export, thumbnails and the AI/brief paths are SHARED and unchanged.
  A style may nudge a box only through a typed, per-canvas override that still passes the safe-zone checks.

## Hard constraints (from CLAUDE.md, do not "fix")

- src/flyer/Flyer.tsx remains the ONLY renderer. The style arrives as a prop/context value; no `if (style === ...)`
  scattered through JSX: components read tokens from the resolved style object.
- One registry, one source of truth in src/shared/ (DOM-free, .js import extensions, zod-free where the client
  imports it; the client never imports a value from schema.ts). Adding a style = one entry, like a canvas in CANVASES.
- Never change a number or slug in DEFAULT_DOODLES; stored flyers must print byte-identical in the current style.
- Safe zones are hard limits per canvas. Optional fields still collapse. Text-on-background contrast: each style
  must declare its text ink and the test asserts >= 4.5:1 against its own background. `#53CED1` on cream and orange
  flyer ink stay forbidden in the current style.
- Fonts self-hosted via @fontsource (pinned); family names only in src/shared/fonts.ts. A style that needs a new
  family adds it there and to package.json pinned, and ready.ts must wait for it before any export.
- Data changes: a new defaulted field, so no migration (as `share`). An older release strips the unknown key and
  would print the old style: say so in docs/deploy.md "Rolling back", with a test per backend as the other
  rollbacks have. Never edit an applied migration.
- Both backends: the field goes in schema.ts, `npm run gen` writes schema/*.json, PHP reads schema/ at runtime
  (never hand-copy a rule into PHP). Add the field to docs/api-contract.md and to the contract vectors; run the
  contract suite on node, php-basic, php-access, cross.
- Match the surrounding code: inline styles in the renderer, no global CSS resets, functional state updates.

## Open decisions to settle with Artur in the brainstorm (recommend, don't assume)

1. Where the choice lives: `data.style` on the flyer (recommended: it is how the flyer looks, it must survive
   reload, export and the library thumbnail) vs a per-viewer toolbar choice like the canvas.
2. Where the picker sits in the editor (Flyer section is the candidate) and its words.
3. Does a style change when the template switches? (recommend: independent of template; both templates support
   every style).
4. EYEBROW_MARKS, per-hostel badges and the blob/spark ink swaps: are they style tokens or shared? (recommend:
   art and inks are style tokens; the marks setting stays shared.)
5. Library: does a card show its flyer's own style? (it must: FlyerThumb uses the same <Flyer>.)
6. AI path: flyerFromBrief leaves style at the default; the model never picks one. Confirm.

## Stages (a commit per piece, each green before the next, ask before committing)

1. Capture: a baseline of every sample on every canvas before touching anything (tests/render/baseline.spec.ts,
   opt-in capture; keep the folder outside git as earlier rounds did).
2. Extract: move the current look into a `hand-drawn` style entry and make Flyer.tsx read tokens from the resolved
   style. NO behaviour change: the baseline must be byte-identical. This is the risky stage; prove it first.
3. Field: `style` in the schema (default `hand-drawn`), gen, PHP, contract docs and vectors, unknown style ->
   `invalid` on both backends from one table.
4. Editor: the picker, `sectionFolds`/`fields.ts` wiring, history/leave-guard behaviour, a toast-free change like
   any other field; library thumbnails and every export path (server render, client export, copy, share).
5. Prove the seam: a TEST-ONLY second style (obviously different inks and fonts, same boxes). Specs: it renders in
   the editor, in the thumbnail, in server export and in client export (fidelity.spec), on both canvases and both
   templates, with the safe-zone and copy-rule checks passing. It is not shipped in the registry the app uses.
6. Docs: docs/architecture.md and docs/design-decisions.md, README, docs/deploy.md "Rolling back", a report in docs/reports/, and
   the "how to add a style" checklist, written so the next session only supplies the new design's tokens and art.

## Out of scope

The real new design; step 7 (drag/nudge) and step 9 (doodle picker); a login; any release or push.

## Done when

`npm run typecheck && npm test && npm run test:contract && npm run test:render` are green, `npm run test:php` and
`npm run test:php-smoke` are green, the baseline is byte-identical in the current style, and the "how to add a
style" checklist exists. Look at the editor in a real browser: the picker, the preview, one download per style.
