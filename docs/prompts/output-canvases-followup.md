# Brief: output canvases, follow-up — the owner's sign-off, proof sheets, and the loose ends

You are picking this up in a fresh session, in the Nest Branded Flyers Generator repo. The output-canvases work is
built, verified and committed. This brief is the small follow-up it left. The items are independent. **Start with
Part 0**: Artur picks which ones to do.

## Read first

1. `CLAUDE.md`: the project rules. In particular:
   - one renderer (`src/flyer/Flyer.tsx`);
   - SOLID/DRY, one source of truth;
   - inline styles, and no global CSS in the editor;
   - generated files are regenerated with `npm run gen`, never hand-edited;
   - commit only when asked, never push.
2. `docs/reports/output-canvases.md`: what was built, the WhatsApp numbers and why, what was verified, and
   "Left open" (this brief's source).
3. `docs/reports/output-canvases-review.md` (Italian): the review of the original plan, and the owner's margin
   decision.
4. `src/shared/layout.ts`: the `CANVASES` registry, `artAnchors` and `placeArt`. Also read
   `src/shared/defaults.ts` (`resolveDoodles`), `src/editor/Preview.tsx` (the offscreen fit) and
   `src/editor/Editor.tsx`.
5. The tests that guard it:
   - `tests/unit/shared.test.ts` (the canvas invariants);
   - `tests/render/render.spec.ts`, `tests/render/fidelity.spec.ts`;
   - `tests/render/baseline.spec.ts` (the opt-in story baseline; read its header).

## Where things stand

- **Branch** `feat/output-canvases`, off `feat/php-shared-hosting`, unpushed. Commits, oldest first:
  - `4b6a949` the brief, plan and review;
  - `71d04ec` the story baseline spec;
  - `c986cd3` prefs.ts;
  - `0bfed0e` the feature;
  - `c6f8324` a render is only ever served whole;
  - `a32043d` docs and the report.
- Every flyer previews and downloads as an Instagram story (1080 × 1920; safe zone 250 top, 300 bottom, 70 sides)
  or a WhatsApp image (1080 × 1440; safe zone 40 all round).
  - The toolbar's **Story 9:16 | WhatsApp 3:4** switches the preview, and Download exports the canvas on screen.
  - The choice is per viewer (localStorage), never flyer data.
  - `POST /api/render/:id` takes `canvas` (default `story`, else 400 `bad_canvas`).
  - The PHP backend exports in the browser and needs no code.
- **The story is byte-identical to before.** A change that could touch it gets proven the same way:
  1. `npm run build`;
  2. `RENDER_BASELINE=capture npx playwright test tests/render/baseline.spec.ts` on the commit *before* your
     change;
  3. make the change, rebuild;
  4. `RENDER_BASELINE=check …`.

  The PNGs live in `%TEMP%\nest-story-baseline` (or `RENDER_BASELINE_DIR`), with the commit they came from.
- The final gate was all green:
  - typecheck;
  - `npm test` 135;
  - `test:contract` 313 passed, 184 skipped;
  - `test:render` 53;
  - the baseline;
  - `test:php` 603, 37 skipped;
  - `test:php-smoke`.

## Working rules for this brief

- **Never tune or click around on `./data`.** It is the real library, and deploy step 5b copies it to the host.
  Every Download saves the flyer first. Use a scratch instance:

  ```sh
  DATA_DIR=<scratch> npm run seed:dev && DATA_DIR=<scratch> npm run seed:samples
  DATA_DIR=<scratch> PORT=8788 npx tsx server/index.ts
  ```

  Two samples (the stress test and Paragliding) have no photo. Attach one of `fixtures/photos/` there to see
  them in bleed or band.
- **The Laragon deploy** (`A:\serverpath\laragon\nest-flyers-php`) holds a copy of the real library:
  `npm run deploy:backup` before touching it, and `npm run deploy:restore -- <backup> <deploy> --force` after.
- Artur often runs `npm run dev`. Tell him before your first shared or server edit, so he can save open work.
- **Line endings are LF** (`.gitattributes`). On this Windows machine, Python in text mode writes CRLF. Edit with
  the editor tools or Node, and check with `grep -c $'\r'` before committing.

## Part 0 — confirm the scope (before any code)

Send Artur the list below, in Italian and briefly: one line per item with its cost and your recommendation.
Default recommendation: 1, 2, 3 and 5; 4 only if he wants the label moved. Then wait for his answer.

## The items

### 1. Proof sheets as a tool (`npm run sheets`)

- **Why.** The WhatsApp numbers were tuned by eye from contact sheets that a throwaway script made (not
  committed). The owner's sign-off (item 2) and the next canvas both need the same sheets, made the same way.
- **Build.** An opt-in Playwright spec (`tests/render/sheets.spec.ts`, skipped unless `SHEETS=1`), plus
  `"sheets"` in package.json. It follows `baseline.spec.ts`:
  - It uses `playwright.config.ts`'s throwaway server and seeded samples, so it never needs `./data`.
  - For every sample × photo mode × `CANVAS_IDS`, it renders through `render.html?canvas=…` with an injected
    payload, as `render.spec.ts` does. Photo-less samples borrow a photo in bleed and band.
  - It writes the full-size PNGs, plus one contact sheet per canvas (rows = samples, columns = modes), to
    `SHEETS_DIR`, by default `test-results/sheets/` (gitignored).
  - `SHEETS_SAFE=1` adds the safe-zone overlay. `SHEETS_ONLY=<title>` narrows to one sample.
- **Rules.**
  - A new canvas appears in the sheets with no edit to the tool.
  - Nothing here is a gate.
  - `npm run build` first, as for `test:render`.

### 2. The owner's sign-off of the WhatsApp numbers

- Make the sheets (item 1), story and WhatsApp side by side, and show them to Artur. If he has licensed event
  photos, use them in a scratch instance: the fixtures are placeholders.
- Any change he asks for goes into the WhatsApp entry of `CANVASES` only, with its *why* in the comment above it,
  as the current numbers have. The unit tests are the rails, and must stay green:
  - every photo frame keeps the story's aspect (one crop, same picture);
  - the stack fits above the 1400 floor, with the eyebrow row at least 62 px;
  - the fitted boxes are at least the story's;
  - the art's ink stays on canvas;
  - the corner blobs keep off the ask's lines and the pill's spark.
- The story must not move: the baseline check stays green.

### 3. The cut-off warning takes you to the canvas

- **Today.** "Some text is at its smallest size and is being cut off on WhatsApp 3:4 — shorten it." names the
  canvases that clip, including one that is not on screen (it is fitted offscreen).
- **Change.** Make each canvas name a button that switches the preview to it (and remembers the choice, as the
  toolbar does). Use the existing `.linkish` style of "switch to No photo" in `Editor.tsx`.
- **Test.** Extend the editor test in `render.spec.ts`, which already makes copy clip on both canvases: clicking
  the name switches `data-canvas` and `aria-pressed`.

### 4. The safe-zone label (only if Artur wants it moved)

- **Today.** The overlay's label ("Safe zone · 1000 × 1360") sits on the eyebrow row on both canvases, as it
  always did on the story. It is editor chrome, never exported.
- **If he wants it moved.** Put it in the top margin where it fits: the label is 22 px, and both margins (250
  and 40) fit it. That changes the story's overlay, so:
  - capture the baseline on the commit before;
  - after the change, the check must pass for every export and fail only on the `.safe` shots;
  - recapture on purpose, and say so in the report.

### 5. Render cache hygiene (Node only)

- **Today.** `DATA_DIR/renders/` is only emptied per flyer, on save or archive. Files from older builds pile up
  across deploys, because the key includes the build id. So do files from before canvases (`<id>-<key>.<fmt>`),
  which are never served again.
- **Change.** At server start, delete from the cache directory anything that is not a current-scheme name
  (`^\d+-(<CANVAS_IDS>)-[0-9a-f]{16}\.(png|jpg)$`, the id list from the registry), plus any `.tmp` leftover.
  Optionally, also delete current-scheme files older than N days by mtime (say which, and why).
- **Where.** Keep it in `server/services/renderer.ts` (`createRenderer`). Unit-test it on a temp dir.
- **Docs.** Say in README that `renders/` is only a cache and can be emptied any time.

## Done means

- `npm run typecheck && npm test && npm run test:contract && npm run test:render` all green.
- Also `npm run test:php` and `npm run test:php-smoke` if anything in `src/` changed.
- The story baseline check green. For item 4, only the `.safe` shots differ, recaptured and reported.
- Anything visible was looked at in Chrome, on a scratch instance: the preview and a downloaded export of both
  canvases.
- A dated "Follow-up" section appended to `docs/reports/output-canvases.md`: what was done, any new WhatsApp
  numbers with their why, and what was verified and how. Update CLAUDE.md's Status if something there changed.
- Commits on a branch `feat/output-canvases-followup`, off `feat/output-canvases`, only when Artur asks.
  Logical commits, in the style of the existing history. Never push.

## Out of scope

- Handoff steps 7–9: drag/nudge, This week, the doodle picker. CLAUDE.md says what each must decide about canvases
  when it starts.
- The real login (Supabase or the Laravel app), and going live on IONOS.
- The pencil and headline-spacing tweaks: Artur does those himself.
- Any change to stored flyer data, the schema or migrations.
- A new canvas, unless Artur asks for one. Then it is one `CANVASES` entry, the sheets (item 1), tuning with
  why-comments, and the same tests. They already loop over `CANVAS_IDS`.
