# The open items: the fit's floors, an untitled week flyer's name, per-hostel badges, the test noise

In one line: the five items left open after the This week follow-up are closed or decided. Brief:
`docs/prompts/open-items.md`. Branch `feat/open-items`, from `feat/week-template-followup` (`3e25add`).

## Part 0: Artur's answers (2026-09-30, quoted as given)

| # | Question | Answer | What it became |
|---|---|---|---|
| 1 | The fit's height pass takes lines below their floor: which floor? | «Soglia per riga, avviso resta» | Each fitted line stops at its own `data-fit-min` floor in the height pass too; a box still too tall clips and raises the note. |
| 1 bis | While `fit.ts` is open, fix the false "cut off" note for a shrunk day? | The same answer: «avviso resta» | Not done. The note stays as accepted on 2026-09-30 (Left open). |
| 2 | An untitled week flyer's library name | «This week · ostello · data» | `This week · Duque Nest · 30 Sept`, or `This week · 30 Sept` chain-wide, while the title's English lines are still the defaults; the day is the first save's. |
| 3 | Where a hostel's logo goes | «Possiamo fare qualche prova qui o renderlo configurabile per essere flessibile?», then, asked which: «Prove, poi scelta fissa» | Proof-sheet trials of three placements first; the choice came with them (below). |
| 3 bis | The logos' colours | «Eh anche qui possiamo fare delle proe o delle configurazioni flessibili, grazie!» | The trials show all 14 on cream. Each hostel is switched on or off by its `logo_path` in `seed/hostels.json` (null = the Nests wordmark). |

The later answers, given with item 1's proof sheets and the badge trials (2026-09-30, quoted as given):

| # | Question | Answer | What it became |
|---|---|---|---|
| 1 | Item 1's proof sheets | «Approvati» | Signed off. |
| 1 | At its floors the stress sample's WHERE chip runs 2 px into its padding on the story: accept it and update the tests, shorten the sample's address, or lower the small lines' floor? | «Accetta, aggiorno i test» | Accepted: the render tests expect exactly that chip, on the story, at most 2 px. |
| 3 | Which of the three placements (V1: the badge in place of the wordmark, 56 px; V2: the same, as tall as the eyebrow; V3: the badge beside the wordmark) | «V3, mi e' piaciuto si puo' rendere configurabile da me dal codice non da chi crea il flyer cosi decidiamo un formato unico, e quello sara' ma prima bisogna fare dei test pilota facendo girare i flyer per d'avvero, quindi fai in modo che io da codice possa decidere con conf se mostrare solo uno dei due o tutti e due, 3 opzioni praticamente, giusto, ok?» | A setting in the code with three options, `EYEBROW_MARKS` in `src/shared/defaults.ts`: `'nests'` (the wordmark alone, as before), `'hostel'` (the badge alone, V1), `'both'` (V3, the default for the pilot). One setting for every flyer, never per flyer. |
| 3 bis | Which hostels print their badge | «Tutti e 14» | Every `logo_path` set. |

And with item 3's proof sheets and the final summary:

| # | Question | Answer | What it became |
|---|---|---|---|
| 3 | Item 3's proof sheets (V3, `'both'`, all 14) | «Approvati» | Signed off. |
| 2 | An auto-named week flyer keeps its hostel and day after the hostel changes, and a duplicate keeps last week's date: leave it, or have the name follow while it is still the automatic one? | «Lascia così» | Left as it is (Left open). |
| — | Commit, one per item, after the sign-off, no push? | «Sì, dopo il sign-off» | Committed on `feat/open-items`, unpushed. |
| — | Check, on a copy of the real library, which real flyers now show the cut-off note? | «Sì, su una copia» | Below: none of the real ones. |

## The real library, checked on a copy

`./data` (the database with its journal, and the photos) was copied to a scratch folder, served from there with the
new seed on port 8791, and every flyer was rendered on both canvases through the render page, read-only; the copy
was then deleted, and `./data` was never opened. Of its 9 flyers, the three real ones ("Pool Party", "Sunday we go
surfing" and its copy) show no note on either canvas, and none of their lines sits at its floor: the floors don't
touch them. The six samples behave as above: the stress test shows the accepted note on the story, and Pool party's
time sits at its floor. Every flyer at a hostel prints its badge beside the wordmark, the chain-wide one the wordmark
alone.

What the "logos" turned out to be, found before asking: 14 files (`assets/logo/`, untracked), one per hostel, all the
same round badge ("ONE PASS · Nest · MORE HOSTELS", white on a disc in the hostel's colour), none naming its hostel.
So recolouring them to the wordmark's teal, the brief's second option for 3 bis, would have made all 14 identical.
Measured: Duque's disc is `#6EC3CA` (its file name says `#53CED1`), Arena's is orange `#E47C25`; against the cream
`#F8F4E8` the palest discs score 1.2 (Los Amigos), 1.5 (Medano), 1.7 (Las Eras, Puerto) and 1.9 (Duque), the teal
wordmark 5.3.

## What changed, per item

### 4. `tests/storage/copy.test.ts` under load

- `describe('copy', { timeout: 30_000 }, …)`, with a why-comment: the time is in the test bodies (the JSON store
  fsyncs every file), and hooks keep their own 10 s. `vitest.config.ts` is unchanged.
- Measured alone: the slowest test 0.54 s, the file 4.7 s. Beside the render suite, `npm test` took the first test to
  4.0, 4.3 and 5.4 s; the last timed out at 5000 ms.
- Not done, the optional once-per-file fixture: the "arguments" tests run the same `beforeEach` and take 20–36 ms, so
  the fixture costs under 40 ms; there is nothing to win.

### 5. The baseline's overlays

- **The cause.** The overlays were shot from the test fixture's page, whose context blocks the nav kit with a route
  (`tests/browser.ts`). A route makes Playwright intercept every request, the flyer's images included, and the timing
  it adds changed how Chrome rasterised a few spots from one page load to the next: a chip frame's edge (54 px in
  364..395 × 1172..1198), the WHEN calendar icon (up to 743 px), the corner sparks (9–21 px), the pill's spark (6 px).
  The server's exporter installs no route, which is why the exports held.
- **How it was found** (a scratch script shooting all 32 cases, three passes each):

  | Setup | Cases that differ between passes |
  |---|---|
  | one routed page reused, as the spec did | 20 of 32 |
  | a fresh routed context per shot | 14 |
  | the same, with the server exporter's own waits | 20 |
  | one browser for all passes | 21 |
  | shooting each load until two shots agree | the first shot always agreed (96 of 96): no wait can help |
  | **no route**, a fresh context per shot | **0** |
  | **no route**, one page reused | **0** |
  | the server's exporter (no route) | 1 (the chip frame spot, at most 3 levels per channel) |

- **The fix** (`tests/render/baseline.spec.ts`): the overlays are shot from a context of their own with no route
  (`browser.newContext`, 1080 × 1920, DPR 1), and the test asserts that `render.html` never asks for the kit, which
  that context would fetch. The flake rule and its retries stay for the exports' rare spot.

### 2. An untitled flyer's library name

- **`src/shared/names.ts`** (new, zod-free): what a flyer is called in the library.
  - `TITLE_MAX` (80): the title's one limit. `schema.ts` takes it from here, as it takes the week's limits from
    `week.ts`; the generated JSON schema is unchanged. The editor's field uses it too.
  - `libraryDate(date, time)`: the library's one date format, `en-GB`: a card's `30 Sept, 12:00`, and the `30 Sept`
    of an untitled week flyer's name.
  - `libraryName(data, hostelName, date)`: a week flyer whose English title lines still read the defaults
    (`eventName` equal to that of `weekTitle(null)`) is `This week · <hostel> · <day>`, or `This week · <day>`
    chain-wide. Any other flyer is named by its headline as before, or "Untitled flyer". Either way the name is cut to
    80 code points with `week.ts`'s `clamp` (now exported), so a first save never fails on it. The Spanish line
    doesn't name a flyer, so an edited Spanish line alone keeps the week rule.
  - `copyTitle(title)`: a duplicate's title, the original's cut to leave room for " (copy)". It was
    `` `${title} (copy)`.slice(0, 80) ``, which cut by UTF-16 units (half an emoji) and dropped the suffix from a long
    title.
- It can't live in `week.ts`: `week.ts` can't import `defaults.ts` (week → defaults → layout → week).
- **`Editor.tsx`**: `autoTitle(d, hostels, now = new Date())` and `toInput(d, hostels)` take the hostels whole, since
  the unsaved-changes check runs before the `hostel` memo and the load effect runs before `nameOf` exists. The first
  save writes the name into the field, as before; the placeholder shows it.
- **No false "unsaved"**: only an untitled week flyer's name reads the day, and such a draft already differs from the
  blank Activity draft a new flyer starts as; a loaded flyer always has a title. One real case: clearing the field of
  a flyer auto-named on an earlier day shows "Unsaved changes", since saving would date it today. That is correct.

### 1. The fit's height pass keeps each line's floor

- **`src/flyer/fit.ts`**: the height pass sizes each fitted line `max(base × floor, base × s × g)` (`s` from the
  width pass, `floor` from `data-fit-min` through a shared `floorOf`) and stops when the box fits, when `g` reaches
  0.55, or when every line sits at its floor; a box still too tall clips and counts in `clippedBoxes`. A box whose
  lines all stay above their floors takes the same steps to the same sizes as before (`base × s × g` is computed as
  it was). The header's "nothing drops below its floor" is now true; "ported verbatim" is not, and CLAUDE.md and
  `README.md` say so.
- **What changed on the flyers** (every case exported on both canvases, against the untouched build): 23 of 64
  exports, exactly the ones named in advance.
  - Story: Pool party in its three modes, with its art and crop variants (they share its chips), where only the
    WHEN time's glyphs change (27 → 28 px, 807 px of ink; the 36 px clock keeps the row's height). The stress test
    and the highlighter wrap, where the WHEN time and the WHERE chip's address change (20 → 22.4 px, now on three
    lines).
  - WhatsApp: the stress test and the highlighter wrap, the WHERE address only.
  - The other 41, every week sample included, are byte-identical. The story baseline flags the same 17 cases and no
    other, exports and overlays.
- **The one box that now clips** (asked, and accepted): at its floors the stress sample's address takes three lines,
  and on the story its WHERE chip runs 2 px into its own 20 px bottom padding. Nothing visible is cut, but the chip
  counts as clipped, so the editor says "cut off on Story" for that copy. The every-sample render test expects
  exactly that chip (on the story, at most 2 px), and the editor preview test expects the note on Story alone once
  the long Line 2 is restored.
- **A 30-character day** (the brief's watch-out) never reaches its floor: multi-word 30-character days stop at
  30.6 px on three lines, inside their row, and nothing clips.

### 3. Per-hostel badges

- **The files.** The 14 originals now live outside the repo, in `A:\serverpath\laragon\nest-flyers\hostel-logos-originals\`,
  since the release ships all of `assets/`. They became `assets/logos/<slug>.png` through a one-off script:
  1. measure the disc's solid radius along the four diagonals: the first pixel, walking in from a corner, within 12
     levels of the disc's colour. The 1772 px discs are solid to 0.7 px from the edge, the 640 px JPEGs to 3.4;
  2. cut the square of side 2r centred on the image (r = that radius − 0.5), so the cut lies inside solid colour;
  3. resize it to 256 × 256 (lanczos3), mask it with an anti-aliased circle inscribed in the square, and write an
     RGBA PNG at compression level 9 (32–77 kB each).

  Checked on each: transparent corners, the disc's colour kept, and no light ring at the edge (within 1 level of the
  disc; 7–15 on the three 640 px JPEG sources, which vary that much themselves).
- **`seed/hostels.json`**: `logo_path` for all 14 hostels («Tutti e 14»), and nothing else.
- **`src/shared/defaults.ts`**: `EYEBROW_MARKS` (`'nests' | 'hostel' | 'both'`, now `'both'`) and
  `marksFor(hasBadge, marks)`, the marks a flyer prints, left to right. Chain-wide, or at a hostel with no badge, only
  the wordmark prints.
- **`src/flyer/Flyer.tsx`**: a `Marks` component replaces the one logo `<img>`.
  - One mark sits where the wordmark always has; two share a row of their own, 20 px apart, as in the trial.
  - Each is 56 px tall. The badge is square, with the hostel's name as its `alt`. `data-logo="hostel" | "nests"` lets
    the tests find them.
  - A badge that fails to load drops out, through state rather than a `src` swap, which would squeeze the wide
    wordmark into the badge's square.
  - Every mark may shrink in its row (`object-fit: contain`). Eighteen of the widest letters in the eyebrow pushed
    "both" 106–123 px past the safe edge on the story, and the wordmark alone 47 px before this change. With room,
    nothing moves: every export was byte-identical with no badge set.
- **`src/flyer/ready.ts`**: decodes the flyer's images again, a frame apart, until every one is drawn (at most ten
  rounds), so the wordmark that takes a failed badge's place is in the export. When everything loads it is one
  round, as before.
- **`src/editor/Editor.tsx`**: the hostel's help starts "Its badge prints at the top." when the hostel has a badge and
  the setting prints badges.
- **Where flyers changed.** With every `logo_path` still null, all 64 exports were byte-identical to item 1's, and the
  story baseline flagged only item 1's cases. With the paths set, 56 of 64 changed, all in the eyebrow row; the 8
  unchanged are the chain-wide samples.
- **Deploy**: `docs/deploy.md` has a section on the badges. The PHP app re-seeds itself when `seed/hostels.json`
  changes; a Node deployment needs `npm run seed`. A changed badge takes a new file name, because the Node render
  cache is keyed by the hostel's record, not by the file.
- **The handoff's §10** put per-hostel logo variants in `uploads/logos/`. They are in `assets/logos/` instead: the
  release ships `assets/` and not `uploads/`, and `uploads/.htaccess` refuses anything but JPEG, PNG and WebP. The
  handoff stays as delivered; a logo upload in the editor remains out of scope (step 9's territory).

## The red and mutation runs

Each was seen failing, then reverted with the editor tools (never `git checkout`).

| Item | Run | Result |
|---|---|---|
| 4 | full `npm test` beside the render suite, no timeout of its own | the first copy test timed out at 5000 ms (it took 5406) |
| 4 | the same, with `{ timeout: 30_000 }` | 3 of 3 green, 186/186; the slowest copy test 5255 ms |
| 5 | ten baseline checks in a row after the fix | 10 of 10 green, 32 cases compared each |
| 2 | `names.test.ts` on today's rule | `title: Too big: expected string to have <=80 characters`; the week flyer named "What’s on this week"; the copy's suffix lost |
| 2 | no cut | "fits the title’s limit" fails (Too big) |
| 2 | a cut by UTF-16 units | the same test fails (the emoji split) |
| 2 | the week rule on edited lines | "names a week flyer by the title lines someone typed" fails |
| 2 | the template check dropped | "names an Activity flyer by its headline" fails |
| 2 | the copy cut by UTF-16 units | "a duplicate’s name" fails |
| 2 | the editor test on the untouched build | the name read "What’s on this week" |
| 2 | the library's one date format, before `libraryDate` existed (the final review found the locale spelled twice) | `libraryDate is not a function` |
| 1 | the floor test on the untouched build (made soft for that run only) | fails on the 15 cases of the brief's table: story Pool party ×3, stress ×3, highlighter wrap ×3; WhatsApp stress ×3, highlighter wrap ×3 |
| 1 | the WHEN-chip test on the untouched build | the day's line at 24.03 px (story) and 25.3 (WhatsApp), floor 27.6 |
| 1 | the floor dropped from the height pass | every-sample fails on both canvases, and so does the WHEN-chip test |
| 1 | an unfit box not counted | the WHEN-chip test fails on both canvases; the story's every-sample fails |
| 1 | the stop once every line is at its floor | not claimed: it only saves steps (the sizes are the same), so no test can see it |
| 3 | `marksFor` on today's behaviour | the setting `'nests'` still drew the badge |
| 3 | the seed pointing Duque at a missing file, then at `assets/nest-logo-teal.png` | "is missing", then "is not a PNG in assets/logos/" |
| 3 | the render tests on the old renderer | no marks tagged (every-sample ×2, marks ×2); the wordmark never asked for when the badge failed |
| 3 | the badge ignored | the marks test fails on both canvases |
| 3 | no fallback | the fallback test fails: the broken badge at READY |
| 3 | no wait in `ready.ts` | at `'both'` it can't fail (the wordmark is in the page from the first render), nor at `'hostel'` while the badge's 404 comes back before the images are awaited. So the test holds that 404 back 400 ms: at `'hostel'` without the loop it fails 3 of 3, with it passes 3 of 3 |
| 3 | the hostel help on the old editor | no mention of the badge |

All three settings were run: `'hostel'`, `'nests'` (with the 18-M eyebrow) and `'both'`.

## What was verified, and how

- **The gate**, on the final code (`'both'`, all 14 badges on):

  | Suite | Result | Before (`3e25add`) |
  |---|---|---|
  | `npm run typecheck` | clean | clean |
  | `npm test` | 195 passed | 186 |
  | `npm run test:contract` | 328 passed, 184 skipped | the same |
  | `npm run test:render` | 106 passed, 1 skipped | 99 passed, 1 skipped |
  | `npm run test:php` | 607, 37 skipped | the same |
  | `npm run test:php-smoke` | 2 passed | the same |

  `catalogue.test.ts` compares every backend's hostels with the seed, `logoPath` included, so the 14 paths reached
  Node's SQLite and JSON stores and PHP. Fidelity's one-off 500 of the follow-up did not come back.
- **The story baseline** was captured once, before the first renderer change, into `%TEMP%\nest-open-items-baseline`
  (32 cases, 1.6 min). Checked ten times in a row before any change (all clean), after item 1 (exactly the 17 named
  cases), and after item 3's renderer change with no badge set (the same 17, the same pixels).
- **Every case on both canvases** was exported through the server and compared file by file: before item 1, after
  it, after item 3's renderer change, and with the badges on (above).
- **Chrome**, through the Playwright MCP, on a scratch instance (`%TEMP%\nest-open-items-exp`, port 8789):
  - an untitled week flyer at Duque Nest shows `This week · Duque Nest · 30 Sept` as its placeholder, saves under that
    name, and then shows it in the field; the hostel's help says its badge prints at the top;
  - the same flyer at each of the 14 hostels and chain-wide, previewed and downloaded as PNG on both canvases, each
    Download saving first: 30 files, each the canvas's size, each hostel's badge box holding that hostel's disc
    colour, and the chain-wide one only cream there.
- **Proof sheets**: item 1's (before and after, both canvases), signed off: «Approvati». Item 3's trials (three
  variants, all 14 hostels, both canvases) led to the choice; its before-and-after sheets and the 14 hostels'
  eyebrows as the renderer now draws them, signed off: «Approvati».

## Left open

- **The eyebrow's final format**: `'both'` is the pilot's. Artur settles on one format after running the flyers for
  real, and changes `EYEBROW_MARKS` (one line, a new release).
- **The pale badges**: Los Amigos (1.2 against the cream), Medano (1.5), Las Eras and Puerto (1.7) and Duque (1.9)
  read as a disc, but their white lettering is faint. All 14 are on, by Artur's answer; the pilot will show whether
  any should print the wordmark alone (its `logo_path` back to `null`).
- **The long day's note** (item 1 bis): declined again. A shrunk day that wraps again can still end its highlighter
  a few pixels past its column, and the editor still calls that cut off.
- **A day of one unbreakable word** (30 letters, no spaces) widens its column instead of shrinking or raising the
  note, squeezing the event's name; nothing is cut. Found while checking the 30-character day; the row's layout (a
  flex item can't shrink below its longest word), not the fit. Pre-existing.
- **A badge replaced under the same name** doesn't bust the Node render cache (`docs/deploy.md` says to give it a
  new name).
- **The server export's rare raster flake**: a chip frame's edge (54 px) and the WHEN calendar icon (689 px) can
  come out a few levels different, about once in a hundred exports here. The baseline check's retry covers it; it
  has nothing to do with the route (the overlays' cause, now fixed).
- **The proof-sheet script** is still not committed: it belongs to `docs/prompts/output-canvases-followup.md`.
- **`fidelity.spec.ts`'s contexts** go through the kit route too. If that suite ever flakes, item 5's cause is the
  first thing to check.
- **From the final review, deferred** (no effect on a flyer; Artur decides):
  - `TITLE_MAX` lives in `names.ts`, so `schema.ts` loads `defaults.ts` and `layout.ts` at runtime for one integer.
    There is no cycle today; moving it to `limits.ts` would keep those modules out of `schema.ts`'s graph.
  - An auto-named week flyer's name can go stale: change its hostel after the first save and the name keeps the old
    one; duplicate last week's and the copy keeps last week's date, plus " (copy)". Nothing printed changes (Activity
    names freeze the same way). Asked: «Lascia così».
  - Small ones: the baseline's overlay context is closed only when the run passes (Playwright closes it anyway);
    the marks are tagged `hostel`/`nests` while `marksFor` says `badge`/`nests`, so two tests map one to the other;
    the editor's hostel lookup for the name repeats `nameOf`'s; `autoTitle`'s `now` is never passed;
    `logos.test.ts` takes the repo root from the gen script where `server/paths.ts` has `APP_ROOT`; a failed badge
    remounts the wordmark (harmless, `ready.ts` covers it).
