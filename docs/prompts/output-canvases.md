# Brief: output canvases — Instagram story 9:16 + WhatsApp 3:4 from the same flyer

You are working in the Nest Branded Flyers Generator repo. Read `CLAUDE.md`, `README.md` and
`design_handoff_flyer_generator/README.md` first. The plan you are given is
`docs/prompts/output-canvases-plan.md`. Your job has two parts: **review the plan critically, then build it.**

## Goal (from Artur, the owner)
- Every flyer can be previewed and downloaded as an **Instagram story (1080×1920, 9:16)** or a **WhatsApp image
  (1080×1440, exactly 3:4)**. It's the same flyer with the same info, never a duplicate.
- WhatsApp needs no big safe zones (no profile name or buttons over the edges), so its content uses the canvas
  with small margins (~40 px).
- Preview and download are in sync: a toolbar control **Story 9:16 | WhatsApp 3:4** switches the preview, and the
  Download buttons export exactly what is on screen. More canvases may come later, so adding one has to be cheap.
- It works on both backends (Node and the PHP release) with no PHP-side rule hand-copied.

## Part 1 — review the plan (before any code)
Read the plan, then check every claim against the code. Don't trust line numbers or assumptions.
Report to Artur, in Italian, briefly:
1. What is wrong, missing or risky. At minimum, challenge these:
   - the doodle rule (bottom-half canvas art pinned to the canvas bottom): is it correct for every saved doodle,
     including `PROTOTYPE_DOODLES` and flyers with custom doodles? Is there a cleaner option within the rules
     (e.g. an explicit anchor), and what would it cost (schema, `npm run gen`, migrations, PHP)?
   - whether one stored photo crop really looks right in both frames (`src/shared/photo.ts`);
   - whether the fit/shrink report and copy lints should cover both canvases, not only the one on screen;
   - the API change: naming (`canvas` vs the existing `format` = png/jpg), default, error code, cache key,
     and whether the PHP backend or the contract suite needs anything;
   - every place that still assumes 1080×1920 or 70 px margins (grep `CANVAS`, `SAFE`, `1920`, `70`,
     `left: 70`), including `scripts/compare-design.ts` and `playwright.config.ts`;
   - SOLID/DRY: one source of truth for canvas geometry, substitutable exporters, no second renderer.
2. What you would change in the plan, and why.
Then **stop and wait for Artur's go-ahead.** Save the review to `docs/reports/output-canvases-review.md`.

## Part 2 — build it (after the go-ahead)
- Branch `feat/output-canvases` off the current branch. Commit only when Artur asks. Never push.
- Artur often runs `npm run dev`. Tell him before the first server/shared edit so he can save open work.
- Follow the (reviewed) plan. Non-negotiables from CLAUDE.md still hold. In particular: one renderer
  (`src/flyer/Flyer.tsx`), inline styles, `#53CED1` never text on cream, optional fields collapse, fonts only via
  `src/shared/fonts.ts`, generated files regenerated with `npm run gen` and never hand-edited.
- The story canvas must render **pixel-identical to today**. Prove it with the existing render/fidelity tests
  (no golden updates for story).
- Tune the WhatsApp numbers by looking at them in Chrome with all six samples (`npm run seed:samples`),
  including the stress test, in all three photo modes. Record the chosen numbers with a *why* comment in
  `layout.ts`, as the story numbers are.

## Done means
- `npm run typecheck && npm test && npm run test:contract && npm run test:render` green, plus `npm run test:php-smoke`.
- In Chrome: both canvases previewed, photo cropped in both, PNG and JPG downloaded for both at the exact size,
  on the dev server and on the Laragon PHP deploy after `npm run build:php`.
- CLAUDE.md / README updated: safe zones are hard limits **per canvas**.
- A short report in `docs/reports/output-canvases.md`: what changed, the WhatsApp numbers, what was verified and
  how, anything left open.

## Out of scope
Handoff steps 7–9, and the pencil and headline-spacing tweaks (Artur will do those separately).
