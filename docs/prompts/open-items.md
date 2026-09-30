# Brief: the older open items — the fit's floors, an untitled week flyer's name, per-hostel logos, and the test noise

You are picking this up in a fresh session, in the Nest Branded Flyers Generator repo. The This week template and its
follow-up are built, verified and committed (`3e25add` on `feat/week-template-followup`). Before the next feature (a
second flyer style), Artur wants the items still listed as open fixed:

1. the fit's height pass shrinks copy below its own floor (`data-fit-min`);
2. every untitled week flyer gets the same library name, "What’s on this week"; and an 81-character automatic name
   is refused on save (found while writing this brief);
3. per-hostel logos: Artur supplies one per hostel;
4. `tests/storage/copy.test.ts` can time out at vitest's 5 s default;
5. the story baseline's safe-zone overlays differ run to run on this machine.

Items 1–3 change what staff see, so Artur decides how. **Start with Part 0.**

## Read first

1. `CLAUDE.md`: the project rules. In particular:
   - one renderer (`src/flyer/Flyer.tsx`), styled inline;
   - `src/flyer/fit.ts` is the prototype's `_fit()`, ported verbatim: item 1 departs from it on purpose, and says so;
   - no global CSS resets in the editor. The editor's own styles are classes in `src/editor/editor.css`;
   - SOLID/DRY, one source of truth, no speculative abstractions;
   - functional state updates, comments that explain *why*;
   - generated files change only through `npm run gen`;
   - browser specs import `test`/`expect` from `tests/browser.ts`;
   - Artur's hostel names come only from him (`seed/hostels.json`);
   - commit only when asked, never push.
2. `design_handoff_flyer_generator/README.md`:
   - §3 (183: "Never below 26px on the flyer");
   - §5, the fit (217-236: the width pass to `data-fit-min`, then "a further 2.5% step, down to 55%", and "it stops at
     the floor and the box clips");
   - §2's eyebrow row (88: "Nests wordmark right, 56px tall");
   - §10 (440-441: per-hostel logo variants "upload into `uploads/logos/`") and §13 (492: none were supplied).
3. `docs/reports/week-template.md`: "Left open" (136-156), where these items come from, and the "Follow-up" section:
   the accepted note for a shrunk day (Part 0 there, and item 13).
4. `docs/prompts/week-template-followup.md`: the previous brief. This one follows its working rules.
5. The code the items touch:
   - `src/flyer/fit.ts`, `src/flyer/ready.ts`, `src/flyer/Flyer.tsx` (`logoUrl` 51-53, the eyebrow's logo 248, the
     fitted elements), `src/flyer/urls.ts`;
   - `src/editor/Editor.tsx` (`autoTitle` 31, the first save writing the name back 160, the "Library name" field
     268, the hostel select's help 252, the cut-off note), `src/editor/Preview.tsx`, `src/editor/Library.tsx` (`when`
     13-14);
   - `src/shared/week.ts` (`clamp` 18, `eventName` 20-24), `defaults.ts` (`weekTitle`), `schema.ts` (the headline
     lines `max(40)` 74-75, the title `trimmedString(1, 80)` 106), `layout.ts` (the eyebrow boxes);
   - `seed/hostels.json`, `server/storage/seed.ts`, `php/src/Seeder.php`, `server/app.ts` (the render cache key 168,
     `/assets` 180), `scripts/php/stage.ts` (118) and `scripts/build-php.ts` (41).
6. The tests: `tests/render/render.spec.ts`, `editor.spec.ts`, `baseline.spec.ts` (its header), `fidelity.spec.ts`,
   `tests/editor.ts`, `tests/unit/week.test.ts`, `tests/storage/copy.test.ts`, `vitest.config.ts`.

## Where things stand (checked at `3e25add`, 2026-09-30; verify, line numbers move)

- **Branches.** `main` (`e2c60be`) is `origin/main`. After it, all unpushed and in one line, come shared-nav,
  editor-focus, the write guard, the week template and its follow-up: 17 commits, ending at `3e25add`
  (`feat/week-template-followup`). Artur merges them himself.
- **The last green gate**, at `3e25add`:
  - typecheck;
  - `npm test` 186;
  - `test:contract` 328 passed, 184 skipped (the rows for a remote deployment);
  - `test:render` 99 passed, 1 skipped (the opt-in baseline);
  - `test:php` 607, 37 skipped;
  - `test:php-smoke` 2.
- **Known noise** (items 4 and 5 are about it):
  - `tests/storage/copy.test.ts` can time out at vitest's 5 s default when the machine is busy.
  - The baseline's safe-zone overlays (`.safe`) come back a few anti-aliased pixels different from run to run, on
    untouched code too. Exports are byte-identical.
  - Seen once, in a fidelity mutation run: a golden server render answered 500 in `fidelity.spec.ts`'s `beforeAll`,
    after failures had restarted its worker. Never again since.

### Facts already established: reuse them, don't re-derive them

- **The render suite serves the production build** (`playwright.config.ts`: `node dist-server/…` on 8799, a fresh
  `./test-results/render-data`, one worker). `npm run test:render` builds first. After a production edit, a bare
  `npx playwright test …` tests the old bundle.
- **The render page takes a payload**: `window.__FLYER_PAYLOAD` set by an init script, then
  `render.html?canvas=<id>` (as `render.spec.ts`'s `renderPayload` does). Nothing needs saving to measure a render.
- **The fit** (`fit.ts`):
  - the width pass shrinks each `[data-fit]` in 2.5 % steps to its floor (`data-fit-min`, default 0.6), and records
    the factor `s`;
  - the height pass (48-61) shrinks every fitted child of a `[data-fit-box]` by a further factor `g`, down to 0.55,
    as `base × s × g`. It never reads `data-fit-min`, so a line can end at about `base × floor × 0.55`;
  - the prototype's `_fit()` does the same (`design/Nest Flyer Story Templates.dc.html:257-296`), so the port is
    faithful. Both carry a comment claiming "Nothing drops below its data-fit-min floor" (`fit.ts:3-4`), which is
    false;
  - the report is read after both passes. The editor's cut-off note fires on `clippedBoxes` or any `overflowX`
    (`Editor.tsx`, `cutOff`), and says the text "is at its smallest size and is being cut off".
- **The floors, per element** (`Flyer.tsx`, base px × floor):

  | Element | Base | Floor | Floor px | In a fit box | Box clips |
  |---|---|---|---|---|---|
  | headline / week Line 1 (63) | 92 | 0.5 | 46 | the headline box (61) | yes |
  | headline / week Line 2 (66) | 124 | 0.5 | 62 | same | yes |
  | Spanish line (69) | 36 | 0.8 | 28.8 | same | yes |
  | a chip's big line (296, 300) | 46 | 0.6 | 27.6 | the chip (287, 206 px) | yes |
  | WHEN's time (305) | 40 | 0.7 | 28 | the chip | yes |
  | WHERE / COST small line (309) | 32 | 0.7 | 22.4 | the chip | yes |
  | extras (321-323) | 30 | 0.8 | 24 | none | its own `overflow: hidden` |
  | ask, English / Spanish (341, 345) | 62 / 34 | 0.66 / 0.8 | 40.9 / 27.2 | none | no |
  | week day (115) | 34 | 0.7 | 23.8 | `day` (114, 114 px) | **no**, on purpose |
  | week name (125) | 44 | 0.6 | 26.4 | `name` (121, 96 px) | yes |
  | week time / price (140, 147) | 34 / 26 | 0.7 | 23.8 / 18.2 | none | the column clips sideways |

  Several floors are below §3's 26 px by design (the small lines, extras, the day, time and price).
- **Measured on 2026-09-30** (every sample in every body, the highlighter wrap, and the follow-up's long day, on both
  canvases, through the render page): nothing reports clipped, and 24 lines end **below their floor**, all in the
  Activity chips:

  | Canvas | Flyer | Line | Now | Floor |
  |---|---|---|---|---|
  | story | Pool party (every mode) | WHEN's time `15:00` | 27 px | 28 |
  | story | Long copy · stress test (every mode) | WHEN's time `05:30` | 26 | 28 |
  | story | same | WHERE's small line `Playa de las Américas · Av. Rafael Puig 12` | 20 | 22.4 |
  | story | Highlighter wrap (every mode) | WHEN's time / WHERE's small line | 25 / 20 | 28 / 22.4 |
  | WhatsApp | Long copy · stress test (every mode) | WHERE's small line | 21.6 | 22.4 |
  | WhatsApp | Highlighter wrap (every mode) | WHEN's time / WHERE's small line | 25 / 21.6 | 28 / 22.4 |

  So a floor in the height pass changes signed-off pixels: Pool party's story, and both stress cases.
- **The long day** (`Tuesday Friday Monday Sunday`) shrinks to 30.6 px in three lines. After the re-wrap its
  highlighter ends 6 px past its 250 px column, so `fit.ts` reports `overflowX` and the editor says "cut off". Artur
  accepted that on 2026-09-30, rather than a change to `fit.ts` (report, "Left open").
- **Library names.**
  - `autoTitle(d)` is `d.title.trim() || eventName(d.data.text) || 'Untitled flyer'`, and the first save writes it
    into the field.
  - `eventName` joins the two headline lines and drops a final dot.
  - A new week flyer's lines are `What’s on` / `this week.`, so every untitled week flyer is "What’s on this week".
  - The seeded week samples are named `This week · Duque Nest`, `This week · stress test` and `This week · sparse`.
  - **Bug:** each headline line may hold 40 characters, so `eventName` can be 81 long, and the title may hold 80.
    Checked with `FlyerInputSchema`: `title: Too big: expected string to have <=80 characters`. An untitled Activity
    flyer with two full lines and no final dot can't be saved. `week.ts`'s `clamp` (18) cuts by code points, as the
    schema counts them.
  - No test pins `autoTitle`, "Untitled flyer" or "What’s on this week".
- **Logos: the plumbing already exists end to end.**
  - Every hostel in `seed/hostels.json` has `"logo_path": null`.
  - The schema, SQLite (migration v1, `logo_path TEXT`), both JSON stores and both seeders carry it. PHP re-seeds on
    the next request when the seed file's hash changes (`Seeder.php:51-58`); Node needs `npm run seed`.
  - `Flyer.tsx:51-53`: `logoUrl(hostel)` returns `hostel?.logoPath || 'assets/nest-logo-teal.png'`.
  - `Flyer.tsx:248` draws it at the eyebrow's right, 56 px tall, width auto, `alt="Nests Hostels"`.
    `render.spec.ts` finds it by that alt, and checks its right edge stays in the safe box.
  - The eyebrow box is 95 px tall on the story and 69 on WhatsApp ("69 px for its 62 px of content",
    `layout.ts:176-177`), so the logo can't grow taller.
  - `assets/nest-logo-teal.png` is 1080 × 403, transparent, all `#0D6F82` (the text teal). At 56 px tall it is about
    150 px wide.
  - `assets/` is served by Express (`app.ts:180`) and by Apache (the root `.htaccess` never restricts it), and
    `scripts/php/stage.ts:118` copies it into the release. `uploads/` is not in the release, and its `.htaccess`
    refuses anything but jpeg, png and webp. So the handoff's `uploads/logos/` doesn't fit: logos belong in
    `assets/logos/`.
  - `ready.ts:27` decodes every image before a fit or an export, but swallows a failure: a missing logo would export
    as a broken image, silently.
  - The Node render cache key (`app.ts:168`) includes the hostel, so a new `logoPath` busts it. A file replaced at the
    same path doesn't, in production (`buildId` hashes `render.html` only).
  - The editor's hostel select says it "tags the flyer in the library" and names it in the WHERE block or the Spanish
    line (`Editor.tsx:252`). It will print the logo too.
- **`copy.test.ts`**, measured alone: each test takes 0.02–0.39 s, and the file 4.5 s. It has no timeout of its own,
  and `vitest.config.ts` sets none. Each test creates and migrates a new SQLite library in `beforeEach`, and the JSON
  store fsyncs every file. The repo's pattern for a slow test is a third argument to `it()` with a why-comment
  (`tests/unit/shared-vectors.test.ts:31`, `60_000`).
- **The baseline's overlays** (`baseline.spec.ts`):
  - a check allows a "flake" (at most 1000 px, inside 64 × 64, 124-126) and renders again, three tries;
  - a capture needs two identical renders in five (`CAPTURE_TRIES`, 130);
  - the overlays come from `render.html?id=…&safe=1`, via `page.screenshot`, not from the exporter.
  - Differences seen on 2026-09-30, on unchanged code:
    - 54 px in 364..395 × 1172..1198 (a chip frame's edge), persisting over three renders;
    - 9 px in 72..118 × 645..716;
    - 21 px in 71..1007 × 650..722;
    - 146 px in 363..716 × 1136..1155.

## Working rules for this brief

- **Never tune or click around on `./data`.** It is the real library, and every Download saves the flyer first. Use
  a scratch instance.
  - From Git Bash every call is a new shell, so put `DATA_DIR` on every line:

    ```sh
    DATA_DIR="$TEMP/nest-open-items" npm run seed:samples              # hostels, doodles and the nine samples
    DATA_DIR="$TEMP/nest-open-items" PORT=8788 npx tsx server/index.ts  # in the background; no watch
    ```

  - Check the server's `Data in …nest-open-items` line before you click anything.
  - Keep off port 8787 (Artur's dev server), 8797 and 8799 (the test servers).
  - On Windows, stopping a background server can leave its node process listening. Check the port, read the
    process's command line, and kill its tree (`taskkill /PID <pid> /T /F`).
- **Local suites only.** `CONTRACT_BASE_URL` (environment, then `.env`) points `test:contract` and `test:php-smoke` at
  a deployment, writes included. Check it is unset before either.
- **Artur often runs `npm run dev` on 8787.** Tell him before your first `src/shared` or `server/` edit, and before
  `test:php-smoke`, `build:php` or `deploy:backup`: they write files Vite watches, and his open editor reloads.
- **TDD, and prove every test.**
  - A behaviour change starts with a test you watch fail.
  - A test for behaviour that already works must be shown to catch a regression: apply a mutation, watch the test
    fail, revert.
  - Revert a mutation by undoing that one edit with the editor tools. Never `git checkout`, `git restore` or
    `git stash` a file: nothing is committed until Artur asks.
  - Record each of these runs in one line in the report.
- **The story baseline.**
  - Capture with `baseline.spec.ts` into a fresh scratch folder before the first renderer change (items 1 and 3), and
    check at the end. `RENDER_BASELINE_DIR` is required for a capture. Never capture under `test-results/`, or into
    `%TEMP%\nest-story-baseline`, `nest-week-baseline` or `nest-followup-baseline`: those are older captures.
  - Items 1 and 3 change pixels on purpose. Name every case that is expected to differ, and why, before you check.
  - The baseline is story-only: export the week samples and the changed cases on WhatsApp before and after, and
    compare them yourself (the follow-up did this on the scratch instance; re-save each flyer first, so the export
    cache can't answer).
- **Sign-offs.** Where the result changes a signed-off flyer, make proof sheets on the scratch instance: before and
  after, both canvases, the changed flyers side by side. Artur signs them off before you commit. The proof-sheet
  script isn't committed (`docs/prompts/output-canvases-followup.md`), so build them ad hoc, in a scratch folder.
- **Line endings are LF** (`.gitattributes`). Edit with the editor tools or Node. Check with `grep -c $'\r'`.
- **The Laragon deploy** (`A:\serverpath\laragon\nest-flyers-php`) holds a copy of the real library. This brief doesn't
  need it. If you use it anyway, `npm run deploy:backup` first and `deploy:restore … --force` after, and never run a
  suite against it.

## Part 0 — ask Artur (before any code)

Ask him briefly, in Italian, with `AskUserQuestion`. The recommendation comes first in each question. Record his
answers in the report, quoted, then **stop and wait for his go-ahead.**

1. **Item 1: what is the floor?** Today the height pass can take a line below its own `data-fit-min`, and on three
   signed-off flyers it does (the table above: Pool party's story WHEN time, 27 px for a 28 px floor, and both stress
   cases).
   - [Recommended] Each line stops at its own floor. The rest of its box keeps shrinking, and a box still too tall
     clips and raises the cut-off note, as §5 says. Pool party and the stress cases change by a pixel or two, which
     he signs off on proof sheets.
   - §3's 26 px as a hard floor for every line. That raises the floors of the small lines (the price, the day, the
     time, the chips' small lines, the extras) and changes most flyers: a new layout pass.
   - Keep today's behaviour, and correct only the false comments.
2. **Item 1 bis: while `fit.ts` is open, fix the false "cut off" note for a shrunk day?** He accepted the note on
   2026-09-30 when the alternative was touching the verbatim port; item 1 touches it anyway.
   - [Recommended] Yes: after the height pass, a line that the shrink made overflow its width (it didn't before) goes
     through the width pass again, down to its floor. No sample does this today, so no sample changes.
   - No: leave the note as accepted.
3. **Item 2: an untitled week flyer's name in the library.**
   - [Recommended] While its title lines are still the defaults: `This week · <hostel> · <date>`, e.g.
     `This week · Duque Nest · 30 Sept`, or `This week · 30 Sept` chain-wide. The date is the first save's, since
     that save writes the name into the field. Title lines he typed himself still give the name, as today.
   - `This week · <hostel>`, like the samples: the same name every week.
   - Leave it: the field is there for a name.
4. **Item 3: where the hostel's logo goes.**
   - [Recommended] In place of the Nests wordmark, top right, 56 px tall, and never wider than the room the eyebrow
     leaves it. Chain-wide flyers, and hostels without a logo, keep the wordmark.
   - Both: the Nests wordmark stays, and the hostel's logo goes beside it.
5. **Item 3 bis: the logos' colours.**
   - [Recommended] As supplied, and the session reports each logo's inks: anything in `#53CED1` or orange
     (`#EA580C`), which are never flyer ink on cream, comes back to him first.
   - All recoloured to the wordmark's teal `#0D6F82`, as one-colour marks.

Items 4 and 5 need no answer. Anything he declines goes under "Left open" in the report.

## The items

### 1. The height pass respects the floors (if Artur says so)

- **Today.** See "The fit" and "The floors, per element" above. The header comments of `fit.ts` (3-4) and the
  prototype claim a floor that the height pass never reads.
- **Change** [the recommendation]:
  - In the height pass, each child's size is `max(base × floor, base × s × g)`. A child at its floor stops, and the
    others keep shrinking while `g > 0.55`.
  - Stop when the box fits, when `g` reaches 0.55, or when every child is at its floor. A box still too tall counts in
    `clippedBoxes`.
  - Correct the header comment, and add a why-comment where the port departs from `_fit()`. Say so in CLAUDE.md's
    `fit.ts` bullet and in `README.md:132` ("ported verbatim").
  - If Artur answers 26 px instead, stop and propose the new floors first: it is a layout pass, not a fit change.
- **Item 1 bis** [if yes]:
  - After a box's height pass, a child whose width overflows now, and didn't after the width pass, goes through the
    width pass again from its current size, down to its floor.
  - The long day then ends inside its column. `render.spec.ts`'s long-day test goes back to "nothing cut sideways"
    and loses its accepted-note comment and its 10.5 px allowance.
  - Update the report's "Left open" and CLAUDE.md's row departures, which describe the accepted note.
- **Tests** (red first). There is no DOM in vitest, so these are render tests, in `render.spec.ts`:
  - On every canvas, every sample in every body: no fitted line ends below its floor. Read each `[data-fit]`'s final
    size against `data-fit` × `data-fit-min`, as the measurement above did.
  - A box whose copy can't fit at its floors (e.g. a WHEN chip with a two-line day and a long time) reports
    `clippedBoxes` and stays clipped. Its lines stop at their floors.
  - Item 1 bis: a day that re-wraps into its padding after the shrink (`Tuesday Friday Monday Sunday`) reports no
    `overflowX`.
- **Prove it.**
  - The floor test fails on `3e25add` on the three flyers in the table, and passes after.
  - Mutations:
    - the floor dropped from the height pass: the floor test fails;
    - a box that can't fit not counted in `clippedBoxes`: the clipped-box test fails;
    - item 1 bis's re-check removed: its test fails.
  - The "every child at its floor" stop only saves steps (the sizes are the same at 0.55), so no test can see it:
    say so, rather than claim a mutation.
- **Expect.** The baseline differs on the story's Pool party (three modes, plus its art and crop variants, since they
  share its chips), the long-copy stress test and the highlighter wrap. Everything else is byte-identical, and so are
  the week samples on WhatsApp. Proof sheets of the changed flyers go to Artur.
- **Watch out.**
  - `render.spec.ts:177` expects `clippedBoxes` 0 on every sample. If a floor makes a sample's box clip, say which one,
    and ask Artur before changing the copy or the test.
  - The day's box doesn't clip. A day still too tall at its floor would spill over the row's frame, and must at least
    raise the note: check the 30-character day at 23.8 px.

### 2. An untitled flyer's library name

- **Today.** See "Library names" above.
- **Change.**
  - Always: cut the automatic name to 80 code points, with `week.ts`'s `clamp` or the same rule, so a first save
    never fails on it.
  - [If Artur says so] a week flyer whose title lines are still the defaults (`weekTitle(<its hostel's name>)`) is
    named `This week · <hostel name> · <d MMM>`, or `This week · <d MMM>` chain-wide. Use one date format with the
    library card's `when` (`Library.tsx:13-14`, `en-GB`); share the formatter, don't copy it.
  - Keep the rule in one place, a pure function beside `eventName` (e.g. `libraryName(data, hostelName, date)`). The
    field's placeholder and the first save both use it.
- **Tests** (red first).
  - Unit, in `week.test.ts`:
    - 40 + 40 characters with no final dot gives 80 code points, and passes `FlyerInputSchema`;
    - an emoji at the cut isn't split;
    - the week rule, with a hostel, chain-wide, and with edited lines.
  - Editor, in `editor.spec.ts`: an untitled week flyer at Duque Nest saves as `This week · Duque Nest · <today>`, and
    the field then shows it. Freeze the date with Playwright's clock (`page.clock.setFixedTime`) so the test doesn't
    depend on the day.
- **Prove it.** The 80-character test fails on `3e25add` (`Too big`). Then each mutation below must fail a test:
  - no cut;
  - a cut by UTF-16 units;
  - the week rule applied to edited lines.

### 3. Per-hostel logos

- **Artur supplies the files** in `assets/logos/`, one per hostel, named by its slug: `assets/logos/duque-nest.png`.
  The 14 slugs are in `seed/hostels.json`. Check what is there before anything else, and report:
  - which slugs have a file, which don't, and any file that matches no slug;
  - each file's format, size, transparency and inks (item 3 bis).
- **Change** [the recommendation]:
  - `seed/hostels.json`: `logo_path` `assets/logos/<slug>.png` for every hostel that has a file; the others stay null.
    Change nothing else in the seed.
  - The renderer keeps drawing the logo through `logoUrl`, 56 px tall, with a maximum width: the room the eyebrow
    leaves on the narrower canvas. Measure it with the longest eyebrow the field allows (18 characters) on both
    canvases, with Artur's widest logo. A wider logo scales down to fit (`object-fit: contain` in a fixed box, or a
    `maxWidth` with the height following). The Nests wordmark keeps its exact size and pixels.
  - The `alt` names the hostel's logo when it is one (e.g. `Duque Nest`). Update `render.spec.ts`'s lookup, which
    finds the logo by `alt="Nests Hostels"`: select it by a `data-` attribute or its place in the eyebrow instead.
  - A logo that fails to load must not export as a broken image: fall back to the Nests wordmark (`onError` on the
    `<img>`, or a check in `ready.ts`). The export then still shows a logo.
  - The handoff's §10 said `uploads/logos/`. Record the change, and why: the release ships `assets/`, and
    `uploads/.htaccess` refuses SVG. A logo upload in the editor is out of scope (step 9's territory).
  - The editor's hostel help (`Editor.tsx:252`) says the hostel's logo prints at the top.
  - Deploy: the PHP backend re-seeds itself from the uploaded `seed/hostels.json`. Node needs `npm run seed`. Say
    both in `docs/deploy.md` and the report.
- **Tests** (red first).
  - Unit: every non-null `logo_path` in `seed/hostels.json` names a file that exists under `assets/`. A path outside
    `assets/logos/` fails.
  - Render, every canvas: a flyer at a hostel with a logo draws that file, inside the safe box, 56 px tall, no wider
    than the maximum; a chain-wide flyer draws the Nests wordmark, as before. A missing logo file falls back to the
    wordmark.
  - Contract: `GET api/hostels` answers the new `logoPath` on every backend (`catalogue.test.ts` already compares
    the hostels with the seed: check it covers `logoPath`).
- **Prove it.**
  - The unit test fails with a path whose file is missing.
  - The render test fails with `logoUrl` ignoring `logoPath`, and with the fallback removed.
- **Expect.**
  - Every sample at a hostel with a logo changes its eyebrow: Duque Nest and Los Amigos Nest flyers, if their logos
    come. So check the baseline before the seed gets its paths (every `logo_path` still null): the renderer change
    alone must leave every export byte-identical.
  - Then add the paths, and make proof sheets of each logo on both canvases, Activity and This week, for Artur.

### 4. `copy.test.ts` times out under load

- **Change.** Give `describe('copy')` a timeout of its own (e.g. 30 s), with a why-comment in the repo's pattern:
  each test builds and migrates a SQLite library, and the JSON store fsyncs every write, so a busy machine takes it
  past vitest's 5 s. Don't raise the default for every file.
- **Optional**, if it's simple: build the SQLite fixture once per file and copy it per test, rather than migrating it
  in every `beforeEach`. Measure before and after, and keep it only if the file gets faster and the tests stay
  independent.
- **Prove it.** Run `npm test` while the render suite runs (the load that made it time out). The file passes with the
  timeout, and a run with the timeout taken out fails, or show that it can't be made to fail and say so.

### 5. The baseline's overlays differ run to run

- **Find the cause first.** The overlays are `page.screenshot`s of `render.html?id=…&safe=1`. Candidates:
  - a screenshot taken before the last paint (fonts, the safe-zone overlay's own images, a transition);
  - GPU raster differences on this machine.

  Compare three renders of one case that differs (e.g. `prototype art - none.safe`), pixel by pixel, and look at
  what differs: a chip frame's edge, an icon, or text.
- **Then:**
  - If a wait fixes it (another animation frame, `document.fonts.ready`, every image decoded), add it to the
    overlay's shot only. Show that ten checks in a row compare clean.
  - If it's the machine's rasterisation, compare overlays with a tolerance of their own (the exports stay
    byte-for-byte), sized from what you measured, and say so in the spec's header and the report.
- **Also:** if the fidelity `beforeAll`'s one-off 500 comes back, capture the render server's stderr (Playwright
  prints the `webServer`'s stderr) and record it. Don't chase it otherwise.

## Order of work

1. Part 0; then the branch, and a word to Artur about his dev server.
2. Items 4 and 5 (test tooling, no pixels), then a baseline capture with the fixed overlays.
3. Item 2 (no pixels).
4. Item 1 (and 1 bis): baseline check, proof sheets, Artur's sign-off.
5. Item 3: the renderer change with every `logo_path` still null and a baseline check; then the paths, the proof
   sheets and Artur's sign-off.
6. The full gate, Chrome, the report and CLAUDE.md.

## Done means

- `npm run typecheck && npm test && npm run test:contract && npm run test:render` are all green, and so are
  `npm run test:php` and `npm run test:php-smoke` (the seed and the renderer reach PHP).
- Every red run and mutation was seen failing, and is listed in the report.
- The story baseline, captured before the first renderer change, shows every export byte-identical except the cases
  named in advance, and the week samples on WhatsApp too.
- Artur signed off the proof sheets of every flyer that changed (items 1 and 3), quoted in the report.
- Checked in Chrome on a scratch instance, through the Playwright MCP:
  - a flyer at each hostel with a logo, and a chain-wide one, previewed and downloaded as PNG on both canvases;
  - an untitled week flyer saved from the editor;
  - the long day (if item 1 bis): no note.
- A new report, `docs/reports/open-items.md`:
  - Part 0's answers, quoted;
  - what changed, per item;
  - the red and mutation runs;
  - the new counts.

  Mark the items done in `docs/reports/week-template.md`'s "Left open", with a pointer to it.
- `CLAUDE.md`:
  - the `fit.ts` bullet (no longer verbatim, and why) and the row departures (if item 1 bis);
  - the logos (where they live, how they reach a deploy), and "Open: per-hostel logos" removed;
  - the Status.
- Commits go on a branch `feat/open-items`, cut from `feat/week-template-followup`. If Artur has merged it by then
  (check `git branch --contains 3e25add`), cut it from `main`. Make logical commits in the style of `git log`, only
  when Artur asks. Never push.

## Out of scope

- The items of `docs/prompts/output-canvases-followup.md` (proof sheets as a tool, the WhatsApp Activity numbers'
  sign-off, the cut-off note's canvas buttons, the safe-zone label, the render cache). It is a separate brief, still
  pending.
- A slash between two times (Artur declined it on 2026-09-30).
- A logo upload in the editor, logo variants per canvas or per ground, and any hostel data beyond `logo_path`.
- Handoff steps 7 and 9, the login, the access lock on the live app (`docs/deploy.md` steps 3–4: Artur's), a second
  flyer style.
- Any schema change or migration (`logo_path` already exists), and any PHP code beyond what the seed needs.
