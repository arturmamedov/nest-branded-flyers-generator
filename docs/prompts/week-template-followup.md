# Brief: the This week template, follow-up — the review's deferred items, and four problems found on the way

You are picking this up in a fresh session, in the Nest Branded Flyers Generator repo. Step 8, the This week
template, is built, verified and committed (`65f3ed3` on `feat/week-template`). Its final review deferred eleven small
items to Artur, and he has asked for all of them. Two change what staff see (items 1–2), one removes a second copy of
the hostel names (item 3), and eight are tests for behaviour that works but that no test proves (items 4–11).

Researching them turned up four problems the review didn't list: one in step 8's renderer (item 13) and three from
before it (items 12, 14 and 15). Artur decides whether they join. **Start with Part 0.**

## Read first

1. `CLAUDE.md`: the project rules. In particular:
   - one renderer (`src/flyer/Flyer.tsx`), styled inline;
   - no global CSS resets in the editor (they leak into the flyer). The editor's own styles are classes in
     `src/editor/editor.css`;
   - SOLID/DRY, one source of truth, no speculative abstractions;
   - functional state updates, comments that explain *why*;
   - generated files change only through `npm run gen`;
   - browser specs import `test`/`expect` from `tests/browser.ts`;
   - commit only when asked, never push.
2. `docs/reports/week-template.md`: what step 8 built and why, "The review of the diff" (its deferred list, lines
   122–133, is this brief's source), and "Left open".
3. `docs/prompts/week-template.md`: the brief step 8 was built from.
4. The code the items touch:
   - `src/editor/Editor.tsx`: `run`, `takeRow`, `WeekRowsField`;
   - `src/editor/Preview.tsx`: `fitKey`, `OffscreenFit`;
   - `src/editor/Library.tsx`;
   - `src/shared/week.ts`, `defaults.ts`, `copyRules.ts` and `samples.ts`;
   - `WeekRow` in `src/flyer/Flyer.tsx`, and `src/flyer/fit.ts`.
5. The tests:
   - `tests/editor.ts`: the helpers the render suite and the PHP smoke test share;
   - `tests/render/editor.spec.ts`, `render.spec.ts`, `fidelity.spec.ts`, `pixels.ts`, and `baseline.spec.ts` (read
     its header);
   - `tests/unit/week.test.ts` and `shared.test.ts`;
   - `tests/contract/flyers.test.ts`, `validation.test.ts` and `client.ts`;
   - `tests/storage/repositories.contract.ts` and its PHP twin, `php/tests/Storage/RepositoryContractTestCase.php`;
   - `tests/php-smoke/smoke.spec.ts`.

## Where things stand (checked at `65f3ed3`, 2026-09-30; verify, line numbers move)

- **Branches.** `main` (`e2c60be`) is `origin/main`. After it, all unpushed, come `a24442b`
  (`refactor/write-header-constant`), then `65f3ed3` (`feat/week-template`, step 8), then the commit that added this
  brief. Artur merges them himself.
- **The last green gate**, at `65f3ed3`:
  - typecheck;
  - `npm test` 180;
  - `test:contract` 325 passed, 184 skipped (the rows for a remote deployment);
  - `test:render` 86 passed, 1 skipped (the opt-in baseline);
  - `test:php` 606, 37 skipped;
  - `test:php-smoke` 2.
- **Known noise**, not regressions:
  - `tests/storage/copy.test.ts` can time out at vitest's 5 s default when the machine is busy.
  - The baseline's safe-zone overlays (`.safe`) come back a few anti-aliased pixels different from run to run on
    this machine, on untouched code too. Its exports must be byte-identical.

### Facts already established: reuse them, don't re-derive them

- **The render suite serves the production build.**
  - `playwright.config.ts` runs `node dist-server/…` on port 8799, with `DATA_DIR ./test-results/render-data` seeded
    with the hostels and the nine samples, one worker, and a fresh browser context per test.
  - `npm run test:render` builds first, and `npm run test:render -- tests/render/editor.spec.ts -g "<title>"` builds
    and runs one test.
  - After a production edit, a bare `npx playwright test …` tests the old bundle; after a test-only edit it is
    enough.
- **There is no component-test setup** (vitest runs in node, and there is no jsdom). The editor's wiring can be
  tested only in the browser suites: the render suite, and the PHP smoke test.
- **Versions.** React 19.3, mounted without StrictMode (`src/editor/main.tsx:8`), and Playwright 1.63.
- **PHP.** `php` on PATH is Laragon's 8.3.4, and `PHP_BIN` (environment, then `.env`) overrides it. `test:php`,
  `test:php-smoke` and the contract suite's PHP projects use it.
- **`page.route` string globs match the whole URL, query included.** `'**/api/flyers'` never matches
  `/api/flyers?template=activity`, so use a URL predicate or an anchored regex.
- **`getByLabel`.**
  - The editor's hostel select has `aria-label="Hostel"`, so the spec's `hostelSelect` finds it exactly.
  - The library's two selects have no aria-label, so `{ exact: true }` misses them: use `getByLabel('Hostel')` and
    `getByLabel('Template')`.
  - In the week editor, a non-exact `'Hostel'` also matches the Spanish line, whose default ends "…Nests Hostels.".
- **The copy uses typographic characters**, and expected strings must use the same ones:
  - `“ ”` in `Added “…” from …`;
  - `…` (U+2026) in `Loading saved flyers…`;
  - `—` (U+2014) in the cut-off note;
  - `–` (U+2013) in the sample times.
- **The seeded samples.**
  - Six Activity: Pool party, Pizza night, Surf lesson, Long copy · stress test, Paragliding and Pizza · weekly.
  - Three week: This week · Duque Nest, This week · stress test and This week · sparse. Tests look them up by title,
    so don't rename them.
  - The picker lists the saved Activity flyers only, as `<title> · <hostel name>`, or by title alone when chain-wide
    (`Surf lesson`). `Pool party · Duque Nest` gives the row `Saturday 19/9` / `Saturday is a pool party` / `15:00` /
    `Free`.
- **Test helpers.**
  - `tests/editor.ts`: `apiCall` (method, path and exact query), `status`, `backToLibrary`, `templateButton`,
    `rowField` and `dropFile`.
  - `editor.spec.ts`: its own `hostelSelect`, `button` and `saveNew`, and an `afterEach` that archives what the test
    saved.
  - `smoke.spec.ts`: its own `save` (a PUT), `filterLibrary` and `leftovers`.
  - `tests/render/pixels.ts`: `bodiesOf` and `highlighterWrapSample`.

## Working rules for this brief

- **Never tune or click around on `./data`.** It is the real library, and every Download saves the flyer first. Use
  a scratch instance.
  - From Git Bash every call is a new shell, so put `DATA_DIR` on every line: a seed without it writes into
    `./data`.

    ```sh
    DATA_DIR="$TEMP/nest-week-followup" npm run seed:samples              # hostels, doodles and the nine samples
    DATA_DIR="$TEMP/nest-week-followup" PORT=8788 npx tsx server/index.ts  # in the background; no watch
    ```

  - Check the server's `Data in …nest-week-followup` line before you click anything.
  - Keep off port 8787 (Artur's dev server), 8797 and 8799 (the test servers).
  - On Windows, stopping a background server can leave its node process listening. Check the port, read the
    process's command line, and kill its tree (`taskkill /PID <pid> /T /F`).
- **Local suites only.** `CONTRACT_BASE_URL` (environment, then `.env`) points `test:contract` and `test:php-smoke` at
  a deployment, writes included. Check it is unset before either: there is no `.env` at `65f3ed3`, and the gate's 184
  skipped remote rows show it unset.
- **Artur often runs `npm run dev` on 8787.** Tell him first, before:
  - your first `src/shared` or `server/` edit;
  - `test:php-smoke`, `build:php` or `deploy:backup`. They write `.html` files that Vite watches: the smoke test's
    trace files under `test-results-php/`, `release/php/`, and the deploy's `data/index.html` copied into
    `backups/`. Vite then reloads his open editor.

  A hook added to `Editor.tsx` also remounts the editor on Fast Refresh, which drops an unsaved draft without
  asking.
- **TDD, and prove every test.**
  - A behaviour change starts with a test you watch fail.
  - A test for behaviour that already works (items 4–11) must be shown to catch a regression: apply the mutation the
    item names, watch the test fail, revert.
  - Revert a mutation by undoing that one edit with the editor tools. Never `git checkout`, `git restore` or
    `git stash` a file: nothing is committed until Artur asks, so the mutated file also holds this brief's own work
    (item 5 mutates `Editor.tsx` after items 1 and 2 changed it).
  - Record each of these runs in one line in the report.
- **The story baseline** (item 9 changes its spec).
  - Capture before the first renderer change, into a fresh scratch folder, and check at the end. Only item 13
    changes the renderer.
  - Never let `RENDER_BASELINE_DIR` default: `%TEMP%\nest-story-baseline` holds an older capture.
  - Never capture into `%TEMP%\nest-week-baseline`, step 8's capture: check a copy of it.
  - Never put a capture under `test-results/`.
- **Line endings are LF** (`.gitattributes`). Edit with the editor tools or Node: PowerShell's `Set-Content` and
  `Out-File` write other encodings. Check with `grep -c $'\r'` before committing.
- **The Laragon deploy** (`A:\serverpath\laragon\nest-flyers-php`, `https://localhost/nest-flyers-php/`, https only)
  holds a copy of the real library.
  - This brief doesn't need it: `test:php-smoke` drives the editor against PHP.
  - If you use it anyway, first run `npm run deploy:backup -- A:\serverpath\laragon\nest-flyers-php`. It prints the
    backup folder it made under `./backups/`.
  - Afterwards, run `npm run deploy:restore -- <that folder> A:\serverpath\laragon\nest-flyers-php --force`.
  - Never run a suite against it.

## Part 0 — ask Artur (before any code)

Ask him briefly, in Italian. The recommendation is in brackets. Items 3–11 need no answer: he asked for them. Record
his answers in the report, quoted, then **stop and wait for his go-ahead.**

1. **Item 1: what the note says when a row taken from a saved flyer arrives too late.** [Name the row, in red, and
   say what to do:
   - `“Saturday is a pool party” was not added: a week holds 5 rows. Remove one, then add it again.`
   - `“Saturday is a pool party” was not added: this is an Activity flyer now. Switch back to This week, then add it again.`

   The picker empties itself as soon as a flyer is picked, so the note is the only trace of the pick.]
2. **Item 2: what the picker says when the saved flyers can't be loaded.** [`Could not load the saved flyers`, with
   a `Try again` button beside it. It sits where the picker's other states already show (`Loading saved flyers…` and
   `No saved Activity flyers yet`), in the tone of the app's `Could not reach the server: …`.]
3. **Found: a slash between two times passes the copy rules** (item 12). Flag it? [Yes, in every field, with dates
   like 19/9 still passing: §12 says never slashes.]
4. **Found: a long day spills out of its row** (item 13). Fix it? [Yes. The day gets its own fit box, as the event
   name has, so a fourth line shrinks, and the editor warns when copy is still cut off.]
5. **Found: two actions at once lose the upload's state and the leave guard** (item 14). Fix it? [Yes: one action at
   a time, as Save and Download already work. While anything is busy, a dropped photo is refused with a one-line
   reason, and the photo button and the saved-flyer picker are off. Propose the wording, e.g. `Still working on the
   last action — drop the photo again in a moment.`]
6. **Found: the library can show the list of an earlier filter** (item 15). Fix it? [Yes, invisibly: only the
   latest answer is applied.]
7. **A day or a time in capitals** (item 8). Leave it without a warning, as today? [Yes: §12 asks sentence case of
   headlines, and the Activity WHEN chip isn't checked either. If he says no, item 8's third test flips, and the
   sentence-case rule takes the day (and the time, if he says so).]

Anything he declines goes under "Left open" in the report.

## The items

### 1. A row taken from a saved flyer: the note says "Added" when it wasn't

- **Today.** Picking a flyer in "Add from a saved flyer" runs `takeRow` (`Editor.tsx:197-208`) through
  `run('row', …)` (155-166). A returned string becomes a green note, a thrown `Error` a red one.
  - `takeRow` checks the rendered draft (201), awaits `api.flyer(id)` (202), and appends with a functional update
    that refuses a full week or an Activity draft (204-206). Then it returns `Added “…” from ….` (207), whatever the
    append did.
  - While the GET is out, the picker (278, 659) and the toolbar's Save and Download (393-401) are off. "+ Add row"
    (651-655) and the Template toggle (224-228) stay live. So the week can fill up, or the flyer turn Activity, and
    the green note still says the row was added.
- **Change.** One rule, asked in three places.
  - A pure helper beside `EMPTY_ROW` and `withShortName` (41-48): `takeRefusal(d)` returns only the reason a taken
    row can't join the draft now, or null. With the recommended wording, the reasons are
    `a week holds ${WEEK_ROWS_MAX} rows. Remove one, then add it again.` and
    `this is an ${TEMPLATE_LABEL.activity} flyer now. Switch back to ${TEMPLATE_LABEL.week}, then add it again.`.
  - A `latestDraft` ref, set in a `useLayoutEffect` as `useLeaveGuard` does (`src/editor/leaveGuard.ts:28-40`), and
    declared above the early returns (105, 111).
  - `takeRow` asks the rule of `draft` before the fetch, and throws the reason alone, capitalised. No row is known
    yet, and no test reaches that throw: the picker is off on a full week and absent on Activity.
  - After the fetch, `takeRow` asks the rule of `latestDraft.current`, and throws `“${row.name}” was not added:
    ${reason}` (a red note, like the editor's other refusals). Then it appends with the same rule inside the
    functional update, and returns the success note.

  Don't set a flag inside the `setDraft` updater and read it afterwards. Updaters must be pure, and React runs one at
  the next render when another update is pending. `setFits` can be pending at any time (`Editor.tsx:96-99`,
  `Preview.tsx:31-35`). Don't write the ref during render or in a passive `useEffect` either.
- **Test** (red first), in `editor.spec.ts` after "This week: rows typed, taken from a saved flyer, reordered and
  removed are what the flyer saves" (263):
  - A helper that holds the GET of `/api/flyers/<id>` until `release()`, the pattern at 166-172. Use an anchored
    regex so it holds that GET only. A route that also matched the `?template=activity` list, installed before the
    switch to This week, would hold the list's first load and leave the picker off.
  - "The week filled while the flyer was on its way": pick Pool party, press "+ Add row" five times, then release.
    Expect the red note (its row count from `WEEK_ROWS_MAX`), no green note, and five empty rows.
  - "Switched to Activity while it was on its way": pick, switch, then release. Expect the red note (its template
    names from `TEMPLATE_LABEL`), and no row 1 back on This week.
  - In the existing take test, after line 280, pin the green note.
- **Prove it.** Both new tests fail on `65f3ed3`, at the red note. Then each mutation below must fail a test:
  - the check after the fetch reading `draft` instead of the ref: both new tests fail;
  - the rule's template branch deleted: the second fails;
  - the layout effect deleted: the existing take test fails, because the ref stays on the blank draft from mount.
- **Watch out.** Assert on `.notes .note-error` and `.notes .note-ok`, never on `.notes`: an Activity draft with no
  photo also shows a `.note-warn`.

### 2. A failed load of the saved flyers reads "No saved Activity flyers yet"

- **Today.** `WeekRowsField` (`Editor.tsx:544-675`) keeps `saved` null while it loads (545). Its effect (549-559,
  deps `[]`) turns a failure into an empty list (554) and drops the error.
  - So the picker reads `No saved Activity flyers yet` (665) and stays disabled (659).
  - It tries again only on a remount (a template switch, or leaving and reopening the flyer) or a reload. A reload
    with unsaved work asks first.
- **Change.**
  - Add a `failed` flag, and an `attempt` counter in the effect's deps.
  - A failure sets `failed`. `saved` stays null, so `disabled` (659) needs no change.
  - The picker's first option reads the failure text.
  - A "Try again" button (`btn btn-quiet`, like "+ Add row") in `.week-add` clears `failed` and bumps `attempt`,
    with a functional update.
  - No automatic retry.
  - Don't store `'failed'` in `saved`. `!saved?.length` would still compile, and `'failed'.length` is 6, so the
    picker would turn on with no options.
- **Test** (red first), beside item 1's.
  - Route `GET …/api/flyers?template=activity` to `abort()` while a `failing` flag is set (a flag, not a fail-once
    counter). Switch to This week. Expect the failure text, the picker disabled, and "Try again" shown.
  - Clear the flag and click "Try again". Expect the picker enabled, `Add from a saved flyer…`, no "Try again", and a
    pick that works.
  - Beside it, a characterization test: with the list fulfilled as `[]`, the picker reads `No saved Activity flyers
    yet`, with no "Try again".

  Optional DRY: an `apiRoute(path, search)` predicate in `tests/editor.ts` beside `apiCall`, which can then use it.
- **Prove it.** The first test fails on `65f3ed3`, at the option's text. Then each mutation below must fail a test:
  - the deps back to `[]`: the retry never fetches;
  - the rejection mapped back to `[]`;
  - "Try again" shown for an empty list: the characterization test fails.

### 3. The week samples take the hostels' names from `seed/hostels.json`

- **Today.** `src/shared/samples.ts` types the names out: `hostelName: 'Duque Nest'` (120) and `'Los Amigos Nest'`
  (133).
  - They sit in a `WeekSrc` field whose comment points at the wrong test (110-111): the check is
    `tests/unit/week.test.ts:209-216`.
  - The builder reads the field at 174 (`weekTitle(s.hostelName)`).
  - So renaming a hostel in the seed breaks that test instead of flowing through.
- **Change.**
  - `import seed from '../../seed/hostels.json' with { type: 'json' };`. Both the default import and the attribute
    are required: without the attribute, `tsc -p tsconfig.server.json` fails (TS1543) and plain Node throws; a named
    import fails (TS1544).
  - A private `hostelName(slug)`. It returns null for null (the sparse sample is chain-wide, and `weekTitle(null)`
    prints "Nests Hostels"), and throws on a slug the seed lacks: a fallback would print "Nests Hostels" on a
    hostel's flyer.
  - Delete the `hostelName` field and its three lines. Line 174 becomes `weekTitle(hostelName(s.hostel))`.
  - Keep the titles and the Pool party's WHERE, `The pool · Duque Nest` (40), as they are. The titles are keys:
    `seed:samples` adds a sample by title, and PHPUnit names its cases after them. The WHERE is the prototype's own
    record.

  This is the codebase's first JSON import. Keep `samples.ts` out of the browser: nothing the browser loads may
  import it (nothing does today), or Vite would bundle the whole seed file. Say so in CLAUDE.md's `src/shared`
  bullet.
- **Test** (red first), in `week.test.ts` after the pin (216).
  - Re-import `samples.ts` against a changed seed, with `vi.resetModules()` and
    `vi.doMock('../../seed/hostels.json', …)`, undone in `finally`.
  - Names respelled with `toUpperCase()` (never invented) must reach the Spanish lines.
  - A removed slug must make the import throw, naming the slug.
  - Keep the pin at 209-216.
- **Expect.**
  - `npm run gen` prints `Generated files are up to date.`: `seed/samples.json` is byte-identical, so PHPUnit's round
    trip is unaffected.
  - `tsc` now emits the seed as `dist-server/seed/hostels.json`. The compiled `samples.js` reads that copy when the
    render suite's server seeds the samples under plain Node, so `npm run test:render` is the end-to-end proof.
- **Prove it.** The new test fails on `65f3ed3`
  (`expected 'El plan de la semana en Duque Nest.' to be '… DUQUE NEST.'`). A helper that doesn't throw fails its
  missing-slug half.

### 4. The canvas offscreen refits after a week edit (tests)

- **Today.**
  - The canvas on screen refits on every change (`Preview.tsx:61-62`).
  - The others (`OffscreenFit`, 142-157) refit only when `fitKey` (159-162) changes; step 8 added `d.template` and
    `d.week` to it.
  - The cut-off note (`Editor.tsx:135-139`, 416-420) names every canvas that clips.
  - Only an Activity text edit is tested (`render.spec.ts:482-489`), so dropping `d.week` or `d.template` from the
    key passes every test.
- **Helpers**, in `tests/editor.ts`. `render.spec.ts:486-487` builds the same locator and text inline today: make it
  use them too.
  - `cutOff(page)`: the `.note-warn` that contains `is being cut off`.
  - `cutOffOn(...canvases)`: `cut off on <labels in CANVAS_IDS order, joined by " and "> — shorten it.`. The tail
    makes a one-canvas match exact.
- **Test A: a row edit, and a switch of template alone**, in the This week block of `editor.spec.ts`.
  1. On a new flyer, with the story on screen, switch to This week and add a row: day `Fridays`, event `Surf`, time
     `Mon–Fri 10:00–13:00`. That time is too wide at its floor on every canvas (`render.spec.ts:279-297`). Expect
     both canvases named.
  2. Set the time to `15:00`: no note.
  3. Set the long time again. Then make the eyebrow and Line 1 your own, so that the next switch changes only
     `template` in the key: `switchTemplate` changes an untouched eyebrow and title (`defaults.ts:111-113`).
  4. Switch to Activity: no cut-off note.
  5. Switch back: both canvases named.
- **Test B: only the canvas that clips**, beside it.
  1. Put WhatsApp on screen, so the story is offscreen, then switch to This week.
  2. Add a row with day `Fridays` and time `10:00 – 13:00`, which reaches the 250 px cap uncut. The name then has
     about 320 px on the story and 380 on WhatsApp.
  3. For the event, find a lowercase word 330–370 px wide at the name's floor (44 × 0.6 = 26.4 px); capitals would
     add a lint note. To measure it:
     - clone a row's `[data-cell=name]` inside the preview's flyer, so it has the name's font and weight 800;
     - set `font-size: 26.4px`, `white-space: nowrap`, `position: absolute` and `visibility: hidden`;
     - once `document.fonts.ready` resolves, read its `offsetWidth` (layout px). Never use
       `getBoundingClientRect`: the preview is scaled by a transform (`Preview.tsx:111`).

     Aim for about 345 px, and fail loudly outside 330–370.
  4. Expect the note to name the story only. The event `Surf` clears it.
- **Prove it.** Each mutation below must fail a test:
  - without `d.week` in the key: both tests fail;
  - without `d.template`: test A fails at the switch;
  - a note naming every canvas once any clips: test B fails.
- **Watch out.** The canvas offscreen lags a keystroke (`useDeferredValue`), so use only auto-retrying expects.

### 5. Switching template with a hostel already picked (test)

- **Today.** `chooseTemplate` passes the picked hostel's name to `switchTemplate` (`Editor.tsx:125`), and
  `chooseHostel` passes the old and new names to `followHostel` (126-127).
  - The unit tests cover both functions.
  - The browser flows switch with no hostel (`editor.spec.ts:229`, 253) or over a headline (345).
  - So a `null` in place of the name at 125, or of the old name at 127, passes every test. (A `null` new name fails
    `editor.spec.ts:257`.)
- **Test**, beside "This week: the Spanish line names the hostel picked, until someone edits it" (253). Use only
  names from `seed/hostels.json`.
  1. Pick Duque Nest, then switch to This week: the Spanish line names Duque Nest.
  2. Switch to Activity: the three title lines are empty.
  3. Pick Los Amigos Nest on Activity, then switch to This week: the line names Los Amigos Nest.
  4. Pick Duque Nest in the week: the line names Duque Nest.
  5. Switch to Activity: empty.
- **Prove it.** Each of these fails a named step:
  - `switchTemplate(d.data, to, null)`;
  - the name passed only on the way to the week;
  - `followHostel(d.data, null, …)`.
- **Watch out.** A new flyer with a hostel picked is never clean, so don't assert an empty status.

### 6. The fidelity cases check that they draw their own template (test)

- **Today.** `fidelity.spec.ts` saves each sample × body (75-86) and compares the client export with the server's,
  pixel by pixel. Nothing checks which blocks were drawn.
  - If the renderer ignored the template, both sides would draw Activity and agree.
  - A week case saved as Activity fails today only by accident. With no photo, the editor disables the downloads
    (`Editor.tsx:134`), and the test times out at `toBeEnabled` (128) without naming the cause.
- **Change**, on the test side only:
  - `tests/render/pixels.ts` gets `groupsOf(canvas, body)` beside `bodiesOf`. It is the table `render.spec.ts:127`
    writes inline (`weekGroups` or `activityGroups`), so that spec then uses it too.
  - `Regions` gains `groups`: every `[data-group]` the flyer drew, with its box. `readRegions` reads them; it runs
    in the page, so it takes no outside references.
  - Each case checks first, right after `const c = cases.get(label)!` (142) and before the editor opens:
    - the golden drew exactly `groupsOf`'s blocks;
    - any photo block sits where the mode puts it: left, top, width and height within 0.5 px. The story's bleed and
      band differ only in left and width.
  - The header comment says so.
- **Prove it.**
  - Production: `Flyer.tsx:175` → `bodyOf({ ...data, template: 'activity' })`, then rebuild. The seven week runs
    pass today and fail after, naming the blocks. Rebuild again after reverting it, before any other render run.
  - Spec only, each failing after: the week samples posted as Activity with photoMode `none`; every body posted
    with the sample's own photoMode (Pool party, labelled band, saved in bleed).
  - Don't prove it with `template: 'activity'` alone: that already fails, by the accident above.

### 7. The library's two filters together (test)

- **Today.** `Library.tsx` keeps both choices (17-18) and reloads the list on every change (32-37), and
  `api.ts:39-46` builds `?hostel=…&template=…`.
  - The browser tests each filter alone: the template at `editor.spec.ts:438`, the hostel at `smoke.spec.ts:276-288`.
  - The pair is tested only over the API (`contract/flyers.test.ts:83-85`).
  - So a client that dropped one param when both are set passes every test. And no test reloads the page after a
    hostel pick, so nothing reads the stored hostel back (17, 33).
- **Test**, beside "the library filters by template, labels each card, and remembers the choice" (438):
  1. Wait for the first list.
  2. Pick Duque Nest and wait for exactly `?hostel=duque-nest`.
  3. Pick This week and wait for exactly `?hostel=duque-nest&template=week`.
  4. Expect `This week · Duque Nest` shown, `Pool party` and `This week · stress test` not shown, and every card's
     meta starting `Duque Nest · This week · `.
  5. Reload: expect the same combined request, and both selects keeping their values.
- **Prove it.** Each mutation below must fail the test:
  - `api.ts` sending the template only when no hostel is set;
  - `Library.tsx` ignoring the stored hostel (17);
  - `Library.tsx` not saving it (33).
- **Watch out.** Change a filter only once the first list is in (see item 15). Optional DRY: generalise the smoke's
  `filterLibrary` (`smoke.spec.ts:112-117`) into `tests/editor.ts`.

### 8. Day and time lint cases (test)

- **Today.** `copyRules.ts` lints each row's day (39) and time (41). Three rules apply:
  - the exclamation budget (67-74): one lint for the whole flyer, field `text`, with no row number;
  - "book now", bullets and separator slashes (76-86), which `warn` prefixes with `Row n: ` (65);
  - sentence case, on the headline lines and the printed row names only (88-99), for values of more than three
    letters (96).

  No test puts anything a rule flags in a week flyer's day or time. `week()` has only clean ones, and the `Mon/Tue`
  at `shared.test.ts:578` is on an Activity flyer, which skips its rows. So deleting line 39 or 41 passes all ten
  copy-rule tests.
- **Tests**, in `shared.test.ts`'s `describe('copy rules')`, reusing `week()` (531-541), `marks` and `warnsOfMarks`
  (483-484):
  - A day `Mon/Tue` in row 1 and a time `15:00 • 17:00` in row 2 give exactly the fields
    `['week.0.day', 'week.1.time']`, with `/^Row 1: .*slashes/` and `/^Row 2: .*bullets/`. Row 2's day,
    `Saturday 19/9`, still passes: a slash in a date is allowed.
  - Marks in a day and a time spend the budget: three in the day are fine, one more in the time is over.
  - A day `FRIDAYS` and a time `15:00 TILL LATE` get no sentence-case warning (Part 0, question 7). Use values of
    more than three letters: `SAT 19/9` or `8PM` would pass even with the mutation below.
- **Prove it.** Each mutation below must fail a test:
  - delete line 39, then line 41: the first two tests fail;
  - drop `row: i` from line 39: the first fails;
  - add day and time to the sentence-case list: the third fails.
- **Watch out.** Don't use `15:00/17:00` as a slash example: it passes today (item 12).

### 9. The story baseline takes every case, and names what its capture lacks (test tooling)

- **Today.** The opt-in `baseline.spec.ts` checks 29 cases: 58 PNGs and 116 checks.
  - The cases are the Activity samples (step 8's filter, 50-51) and the highlighter wrap (55), each in the three
    photo modes (21), plus the Pool party's two art variants in each mode (6) and two crops (2).
  - `check()` reads the capture first (122). A missing file throws `ENOENT` and ends the run, so later cases are never
    compared, and earlier problems are never reported (185).
  - The label, `captured-from.txt`, is written before the first shot (144-145), so a capture that fails relabels the
    folder's older PNGs.
- **Change.**
  - **Every sample.** Loop over `[...SAMPLE_FLYERS, highlighterWrapSample()]` × `bodiesOf` (`pixels.ts`).
    - The Activity names stay byte for byte, since `bodiesOf` gives the modes in the same order, so old captures still
      match.
    - Each week sample adds a case `<title> - week`, saved with its own template and no photo.
    - 29 → 32 cases, on the story only, as now.
  - **A case list.** A capture removes `manifest.json` and `captured-from.txt` first, and writes `manifest.json`
    (`{ capturedFrom, cases }`) after the last shot.
  - **A check against a list**
    - skips a case the list lacks, and names it ("not in the capture from <commit>");
    - reports a listed case whose file is missing, naming the file, then goes on.
  - **A check against a legacy folder** (`captured-from.txt`, no list) skips a case with no file, and says to capture
    again for a strict check.
  - **It fails at once** when there is no capture at all, and fails when a check compared nothing.
  - **Keep one test.** Per-case tests would print 32 skips in every default `npm run test:render`.
    - Skip inside it with `test.step(name, async (step) => …)` and `step.skip(true, reason)` (Playwright 1.63).
    - Print one summary line with `console.log`: the list reporter shows stdout, never skip reasons.
  - **Docs.** Update the spec's header, and `README.md:76` ("the Activity story").
  - Optional: require `RENDER_BASELINE_DIR` when capturing. A capture now deletes the folder's label first, so a
    capture into the default folder would wipe the older capture's.
- **Prove it**, on scratch folders only (see the working rules). Run the rows that delete files on copies: the
  capture taken for this brief's final check stays untouched until the end.
  - First reproduce today's `ENOENT`: loop over `SAMPLE_FLYERS` at line 55 and check against a copy of
    `%TEMP%\nest-week-baseline`.
  - Then, on the new code:

    | Run | Expect |
    |---|---|
    | capture | 64 PNGs and a list of 32 cases |
    | check | 32 compared |
    | a case taken off the list, its files deleted | skipped, and named |
    | `Pool_party_-_bleed.png` deleted | fails naming it, the rest compared, no `ENOENT` |
    | a copy of `nest-week-baseline` | the 3 week cases skipped as legacy, 29 compared |
    | a folder with only `captured-from.txt` (legacy, no PNGs) | every case skipped; fails: nothing compared |
    | an empty folder | fails at once |

  - Each mutation below must change a run's outcome from the table's:
    - treat a listed case's missing file as a skip: the deleted-file run passes;
    - make the list lookup always true: the off-list run fails;
    - drop the nothing-compared guard: the `captured-from.txt`-only run passes.

### 10. A new flyer's first save waits until its URL can be reopened (test helper)

- **Today.** The first save replaces `#/new` with `#/flyers/<id>` (`Editor.tsx:150`) once the page has taken the
  POST's answer. `saveNew` (`editor.spec.ts:221-227`) returns as soon as Playwright has that answer, which can be
  earlier.
  - "This week: reopened and saved again…" (376) reloads right after it (384-386). A reload in that gap reopens
    `#/new`.
  - The smoke's week test saves inline and waits for nothing before its drop and reload (383-402).
  - Only the PHP smoke test asserts a first save's URL (`smoke.spec.ts:159`). Without `replaceHash`, it fails there,
    and in the Node suite only "This week: reopened and saved again…" fails, at 387: its reload opens a blank
    `#/new`.
- **Change.** Move `saveNew` into `tests/editor.ts` as the one first-save helper.
  - It takes a `keep(id)` callback and calls it first, so clean-up has the id even when a wait fails.
  - Then it waits for `#/flyers/<id>$` and the status `Saved`, which also means the leave guard is off.
  - It returns the parsed `FlyerSaved`, because the smoke's week test checks the POST answer's template (387).
    Callers that want only the id take `.id`.
  - Use it in `editor.spec.ts` (295, 384, and the inline save at 153-156) and in `smoke.spec.ts`: step 1 at
    152-160, keeping its payload checks, and the week test at 383-388.
- **Test** (red first), beside "a first save that answers after the user has left keeps their URL" (162).
  - An init script wraps `window.fetch`, so the page takes the `POST /api/flyers` answer a second after the network
    has it. `page.route` can't make this gap: it delays the network and the page alike.
  - With today's `saveNew`, a one-shot hash check right after it reads `#/new`; with the new one it reads the
    flyer's own.
  - Then reload, and find the flyer's title.
- **Prove it.** The red run above. Also, with `replaceHash` removed from `Editor.tsx:150`, every `saveNew` caller
  now fails at its URL wait, not only the one that reloads.
- **Watch out.** `tests/editor.ts` may import `expect` from `./browser`. `playwright.php.config.ts` imports the file,
  and that is safe: only `test()`, the hooks and `use` need a test file.

### 11. A template change saved on an existing flyer, on every backend (tests)

- **Today.** A PUT that changes the template persists on every driver:
  - the SQLite UPDATE writes the column (`server/storage/sqlite/flyers.ts:108`);
  - both JSON drivers rewrite the flyer's file and its index row (`server/storage/json/flyers.ts:87`, 157;
    `php/src/Storage/Json/JsonFlyerRepository.php:111`, 196);
  - both PUT handlers normalise as POST does (`server/app.ts:135`; `php/src/Http/Api.php:83`).

  But no test changes a template with a PUT:
  - every contract PUT keeps the template;
  - "the column wins" is tested on POST only (`validation.test.ts:52-61`);
  - both storage contracts update only the title and hostel;
  - the cross suite never PUTs.
- **Tests.**
  - **HTTP contract**, in `tests/contract/flyers.test.ts` after the week round trip (56-86). It runs on `node`,
    `node-json` and `php`.
    1. Create an Activity flyer at `duque-nest` (`flyerInput({ hostel: 'duque-nest' })`: its default is chain-wide).
    2. PUT it as week, the way the editor saves a switch: `hostel: 'duque-nest'` again (a PUT replaces the hostel),
       the column and `data.template` agreeing, and rows from a week sample.
    3. Check the answer and the GET; `?template=week` and `?hostel=duque-nest&template=week` list it, and
       `?template=activity` doesn't.
    4. PUT it back with the column `activity` and `data.template` left at `week`, on purpose. Say so in a comment: it
       is the only check that a PUT applies the template rule (the column wins on an update too), and on Node the only
       check that a PUT normalises at all.
  - **Storage contract**, in `tests/storage/repositories.contract.ts` after "update bumps updatedAt…" (158-169).
    Update to week and back, and check that `get` and every `list` follow: the JSON drivers keep the template twice,
    in the file and in the index. Write the week data inline, so `'week'` narrows to `Template`.
  - **PHP twin**: the same case in `php/tests/Storage/RepositoryContractTestCase.php`, after its update test
    (190-205), so the twins stay in step (`tests/storage/json.test.ts:27-31`).
- **Prove it.** Each mutation below must fail a test:
  - drop `template = @template` from the SQLite UPDATE;
  - keep the old template in the Node JSON driver's file, then in its index row;
  - keep it in the PHP JSON repository;
  - skip normalisation in a PUT handler: `FlyerInputSchema.parse` at `app.ts:135`, or the validator alone at
    `Api.php:83`. Of the new tests only the switch-back step catches it. The PHP variant also fails
    `BootstrapTest::testAFlyerFromCreateToArchive`, whose PUT sends an empty hostel.
- **Watch out.** Assert through `listed([id], query)`, never on a whole list: the store is shared, and may be a real
  deployment. Create through `mine.create`, so the flyer is archived afterwards. Optional: `docs/api-contract.md:143`
  can say that an update replaces the template too.

### 12. A slash between two times (if Artur says yes)

- **Today.** `SEPARATOR_SLASH` (`copyRules.ts:60`) lets any slash between two digits through as a date. Checked on
  2026-09-30:
  - a row time `15:00/17:00` gets no warning, while `15:00 / 17:00` and `3pm/5pm` do;
  - `Saturday 19/9 · 15:00/17:00` in the WHEN chip passes too.

  The comment above it (59) allows a slash only inside a date, and §12 says never slashes. Copy rules run only in the
  editor, so there is no PHP side.
- **Change.** Also flag a slash that touches a clock time, e.g.
  `/(?<!\d)\/|\/(?!\d)|(?<=\d:\d\d)\/|\/(?=\d{1,2}:\d\d)/`, and update the comment.
  - Check that `19/9`, `19/9/2026`, `10/10 · 15:00`, `19/9 15:00`, `1/2 price` and `24/7` still pass.
  - A dotted time (`15.00/17.00`) still passes with this regex: cover it, or say so in the comment.
- **Test** (red first). A row time `15:00/17:00` warns `/^Row 1: .*slashes/`, and a WHEN chip
  `Saturday 19/9 · 15:00/17:00` warns too. Row 2's `Saturday 19/9` and `base()`'s WHEN chip still pass.

### 13. A long day spills out of its row (if Artur says yes)

- **Today.** The day cell (`Flyer.tsx:104-108`) is 250 px wide, 34 px at line-height 1.1, and wraps. It has a width
  pass (`data-fit="34" data-fit-min="0.7"`), but it sits in no `data-fit-box`. So nothing measures its height, and
  the editor never warns.

  Measured on 2026-09-30, on both canvases:
  - `Tuesday Friday Monday Sunday` (28 of the day's 30 characters) takes four lines (150 px) and spills 14 px above
    and below its 122 px row.
  - On the story's fifth row, that reaches 2 px into the ask's box: the rows end at 1370, and the ask starts at 1382.
  - Three lines (112 px) fit, e.g. `Saturdays, Sundays and Mondays` and `Every day except Sundays`.
- **Change** [the recommendation]. Give the day its own fit box, about three lines tall, as the name has
  (`Flyer.tsx:110`).
  - A fourth line then shrinks through the height pass (`fit.ts:49-60`), which reads `scrollHeight` and needs no
    clipping.
  - A day still too tall counts in `clippedBoxes`, so it reaches the editor's note.
  - Keep the day cell 250 px wide inside the box, so the width pass still sees a word too long for the column.
  - Don't copy the name box's `overflow: 'hidden'`. The day's highlighter reaches 8 px left of its cell (`Highlight`,
    `marginLeft: -8`, `Flyer.tsx:84`), so a clipping box would cut it on every sample day. If the box must clip,
    clip vertically only (`overflowY: 'clip'`, as the right column clips sideways).
  - Every sample day is one or two lines, so every sample must render as before: item 9's week cases prove it on the
    story. The baseline is story-only, so look at WhatsApp's rows yourself.
  - The height pass ignores `data-fit-min` (the report's "Left open"), so a day can shrink to 0.55 × 34 px.
- **Test** (red first), in `render.spec.ts` beside "a time or price still too long at its floor…" (279). On every
  canvas, take a row whose day is `Tuesday Friday Monday Sunday`, and expect:
  - the day's text (its highlighter's client rects) stays inside its row;
  - the day's `__FLYER_FIT` entry has `finalPx` below 34;
  - nothing is reported clipped.

  At `65f3ed3` the first two fail. Together they also fail a box that clips the day without shrinking it. Then look
  at it in Chrome: the preview, and a downloaded PNG of both canvases.
- **Watch out.** `render.spec.ts` takes a row's first `[data-fit-box]` as the name's box (85, 266; checked at 209-210
  and 275-276). The day's box would come first in the row, so select the name's box explicitly (mark it, or take
  the row's last box). Otherwise "room for the name" and "name inside its box" fail on every row with a day.

### 14. Two actions at once (if Artur says yes)

- **Today.** `busy` is one slot (`Editor.tsx:72`), and `run()` empties it when its action ends (164). But a second
  action can start while one is out:
  - a drop on the preview checks the template, never `busy` (`Preview.tsx:103-108` → `onDrop`, 194-195 → `onFile`,
    184-191);
  - the photo button ("Choose photo", or "Replace photo" once there is a photo, 315-316) is disabled only while an
    upload is out;
  - the saved-flyer picker is disabled only while a row is being taken (278, 659).

  If a save, a download or a taken row ends while an upload is out, `busy` goes null under it:
  - "Uploading…" goes, Download turns back on, and so does Save when there is something to save (393-401);
  - the leave guard, `useLeaveGuard(dirty || busy === 'upload')` (91), lets go. On a saved flyer, "← Library" then
    leaves without asking, and the photo never reaches the flyer.

  Two quick drops do the same to each other: the first to finish empties `busy` under the second. The guard still
  holds, but only because the first photo is unsaved, and a Save (back on) then lets it go while the second is out.

  The bug is older than step 8: `run()` dates from the MVP.
- **Change** [the recommendation]. One action at a time, as Save and Download already work. While anything is busy:
  - a drop is refused, with the reason Artur approves, as a red note like the week's photo refusal (195);
  - the photo button is off (`disabled={!!busy}` at 315);
  - the saved-flyer picker is off (`taking={busy !== null}` at 278).

  If he prefers nothing visible: track each action on its own, so each clears only its own and the guard stays on
  while any upload is out.
- **Test** (red first), in `editor.spec.ts`.
  1. Make an Activity flyer with a photo through the API, from Pool party's data and photo, as the test at 345 does,
     and open it. Download needs a photo in a frame, and "No photo" shows no photo button at all.
  2. Hold its render with `page.route`: on the Node suite a download saves first (a PUT), then POSTs
     `…/api/render/<id>`.
  3. Click Download PNG, then drop a photo (`dropFile`).
  4. While the render is held, expect the refusal, no `POST …/photos`, and the photo button (here "Replace photo")
     disabled. Check the refusal now: when the download ends, its own note replaces it.
  5. Release the render. Once the download ends, the photo button is enabled again.

### 15. The library can show an earlier filter's list (if Artur says yes)

- **Today.** `Library.tsx` loads on every filter change (32-37), and applies whichever answer arrives (23-30).
  - Answers can come back out of order: on a slow host, after two quick changes, or while arrowing through a closed
    select. The earlier filter's flyers then show under the later choice, until the next change.
  - The editor's list fetch drops an answer that lands after the rows have gone (a `live` flag,
    `Editor.tsx:550-559`); the library applies every answer, in whatever order.
  - The bug is older than step 8.
- **Change.** Number each load in a ref, and apply only the latest answer, with a why-comment. This covers the reload
  after an archive (`Library.tsx:62`) too.
- **Test** (red first), beside item 7's.
  1. Hold the `?hostel=duque-nest` answer.
  2. Pick Duque Nest, then This week, and wait for `This week · Duque Nest`.
  3. Before releasing, start `const late = page.waitForResponse(apiCall('GET', 'flyers', '?hostel=duque-nest'))`.
     Release, `await (await late).finished()`, then await one `requestIdleCallback` in the page. An idle callback
     alone can run before the released answer is back, and the test would then pass on `65f3ed3` too.
  4. Expect no `Pool party` card. On `65f3ed3` it appears.

## Order of work

1. Part 0; then the branch, and a word to Artur about his dev server.
2. Item 9, then a baseline capture with its new spec (before any renderer change).
3. Item 10 (the other editor tests use its helper), then the editor items: 1, 2, 4, 5 and 7, and 14–15 if taken.
4. Items 3 and 8 (and 12 if taken), then 6 and 11; then 13 if taken, and the baseline check.
5. The full gate, Chrome, the report and CLAUDE.md.

## Done means

- `npm run typecheck && npm test && npm run test:contract && npm run test:render` are all green.
- So are `npm run test:php` (item 11's PHP twin, and PHPUnit's sample round trip after item 3) and
  `npm run test:php-smoke` (item 10 changes the smoke spec).
- Every item's red run or mutation was seen failing, and is listed in the report.
- The story baseline, captured with item 9's spec before the first renderer change and checked at the end, shows
  every export byte-identical, Activity and week alike.
- Checked in Chrome on a scratch instance, through the Playwright MCP (use `page.route` for what DevTools would do by
  hand):
  - item 1, with the saved flyer's GET held;
  - item 2, with the list request aborted, then let through, and "Try again";
  - item 13's long day (if taken), in the preview and in a downloaded PNG of both canvases;
  - item 14's refusal (if taken);
  - the library's filters.
- `docs/reports/week-template.md` gets a dated "Follow-up" section:
  - Part 0's answers, quoted;
  - what changed, per item;
  - the red and mutation runs;
  - the new counts.

  Mark the deferred bullets (122–133) done, and put anything declined under "Left open".
- `CLAUDE.md`:
  - the `src/shared` bullet names `samples.ts`, kept out of the browser because it imports `seed/hostels.json`;
  - lines 76-77 say PHP reads `seed/samples.json` at runtime, but only its tests do; its runtime reads `schema/`.
    Correct them;
  - the Status says the follow-up is done.
- Commits go on a branch `feat/week-template-followup`, cut from `feat/week-template`. If Artur has merged it by then
  (check `git branch --contains 65f3ed3`), cut it from `main`. Make logical commits in the style of `git log`, only
  when Artur asks. Never push.

## Out of scope

- The items of `docs/prompts/output-canvases-followup.md`: proof sheets as a tool, the owner's sign-off of the
  WhatsApp Activity numbers, the cut-off note's canvas buttons, the safe-zone label and the render cache. It is a
  separate brief, still pending.
- Handoff steps 7 and 9, the login, a second flyer style, per-hostel logos.
- The height pass ignoring `data-fit-min` (the report's "Left open"), unless item 13 needs a floor: then ask Artur.
- A timeout for a list that never answers: it reads `Loading saved flyers…` forever.
- Checking a stored library hostel against the hostels list.
- Any schema change or migration, and any PHP code beyond item 11's test.
