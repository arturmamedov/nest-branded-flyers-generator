# Launch prompt: looks, the seam for more than one flyer design

Written 2026-10-13, at the end of the session that designed it with Artur in plan mode (nothing was built), for a
session with no memory of it. Paste the block below. The rest of this file is the design the block points to.

Brought up to date on 2026-10-14, by the session that planned the build with him (again nothing was built): the
launch block's gate, his answers of that day (M1 is struck: a look may resize a box), and what reading the code
found wrong here. The order of the build was approved that day: it is "Commits, in order".

**Stages 1 and 2 are built** (2026-10-14, the same session, on `feat/looks`: `c1d7e29..4139d14`; the report is
`docs/reports/looks.md`). The block below launched them; it is kept as it was. **Stages 3 and 4 are built** (the same
day, launched by `docs/prompts/looks-seam-stages-3-4.md`; the report's second section). **Stages 5 to 7 are built** (the
same day, launched by `docs/prompts/looks-seam-stages-5-7.md`, `bfcb54c..ced1571`; the report's third section). Adding a
look is `docs/adding-a-look.md`. The design under the block stands for every stage.

Suggested run: Claude Opus 5.5 (`claude-opus-5-5`), effort **high**, started in plan mode.

```
Read CLAUDE.md, then docs/prompts/looks-seam.md whole (this block is its top; the design under it is decided), then
docs/prompts/design-style-switcher.md (the first brief: its rules stand, its open decisions are settled in
looks-seam.md, and its word "style" is "look" now), README.md, and §2, §3, §5 and §7 of
design_handoff_flyer_generator/README.md.

Build the seam that lets a flyer print in more than one look. Today's hand-drawn look becomes the first entry of a
registry that the one renderer reads; a flyer stores its look; a site names the looks it offers; a throwaway second
look proves it all, in the tests' build only. Nothing a staff member sees changes: with no setting a site offers
Hand-drawn alone and shows no switch. The real second look is NOT part of this: it is ported later, as data and art.

HOW TO WORK

- The design, the points that were "Mine" and the order of the commits are decided (2026-10-13 and 2026-10-14):
  don't reopen them and don't plan them again. Start in plan mode all the same, for the gate alone: show me, SHORT
  and in a table, what you found there and what it changes in the order. I can't read a long one. Build nothing
  before I say go.
- The gate. On 2026-10-14 I answered: build after the types work has landed, and cut feat/looks from its branch.
  That work (docs/prompts/flyer-types-filter.md; it became "labels": data.labels, src/shared/labels.ts, a filter
  in the library, the AI setting them) was on feat/flyer-labels, on top of feat/library-views (16e1527) and
  feat/main-flyer-library (fcfaf06). At 03:00 that night it stood at a55589d, 15 commits on 16e1527, the last one
  its docs, with a clean tree: it read as landed, and I had not said so yet. main was at 54296a3, 23 commits ahead
  of origin. Nothing was pushed. So check git first. If that work is not committed, if it ended on another branch,
  if the tree is not clean, or if another session may be writing in this folder: stop and ask. Then cut feat/looks
  from it, and read again what it changed where this work goes. Up to a55589d that was: schema.ts, defaults.ts,
  brief.ts, normalize.ts, storage.ts and the new labels.ts in src/shared/; the form's Flyer section in Editor.tsx,
  sectionFolds.ts and fields.ts; server/app.ts; the AI's answer schema; the validation tests; "Rolling back" in
  docs/deploy.md. It touched neither the renderer nor layout.ts. Stage by path. docs/prompts/looks-seam.md,
  design-style-switcher.md and claude-design-brief.md may still be untracked: leave the last two as they are.
- My answers in looks-seam.md are decided: don't reopen them.
- Show me pictures, not words, for what is visual: the Look switch under Template (the section open and closed, at
  1440 and 360 px), from the tests' build with the proof look in it, before you build its details.
- Every change with its test first; a commit per piece as it goes green, on my go-ahead for each stage. Push
  nothing, build no release, don't touch the live site or the Laragon copy. Warn me before a src/shared/ edit if
  npm run dev may be running.
- The hand-drawn look must not change by one pixel. Before anything else, check the capture there is (the temp
  folder nest-ux4c-baseline) on the branch you cut: the types work must not have moved the drawing. The first commit
  then extends the baseline to both canvases and captures it, outside git. Check it after every commit of the
  extraction.
- Before calling it done: npm run typecheck && npm test && npm run test:contract && npm run test:render, then
  npm run test:php and npm run test:php-smoke; the baseline check; and look at it in a real browser (Chrome): the
  tests' build with two looks (the switch, the preview, the library card, one download per look) and the release
  build (no switch, the app as it was).
- A natural stop is after the field (stage 3): up to there nothing changes and the work is whole by itself. If the
  session runs long, stop there, record it, and write the launch prompt for stages 4 to 7.
- Record it: docs/architecture.md, docs/design-decisions.md and docs/status.md in the style of their other entries, README.md,
  docs/deploy.md, docs/reports/looks.md, and docs/adding-a-look.md, the checklist for the session that ports the
  real look.

NOT NOW

The real second look and its art, steps 7 and 9 of the handoff (drag and nudge, the doodle picker), a look switch
on Create with AI, SVG art, a filter by look in the library, new files under assets/, anything that changes how the
hand-drawn look prints. When this is done, tell me what is left that is mine.
```

---

# The design

## In short

- Today the hand-drawn look is written into the one renderer as literals. This round moves it into a registry entry
  the renderer reads, so a second design later is data plus art, with no second renderer.
- A flyer remembers its look. Saved flyers and new ones can switch. Everything else stays one: boxes, text rules,
  canvases, exports, library, AI.
- A site names the looks its staff may pick. With no setting it offers Hand-drawn alone, so this round shows staff
  nothing new, and a new look can ship switched off.
- Steps 7 and 9 of the handoff (drag and nudge, the doodle picker) are not built, but they get a clean place.
  Artur's "step 7 and 8" was read as 7 and 9: step 8 was the This week template.

## Stages

| # | Stage | What is built | What Artur sees |
|---|---|---|---|
| 1 | Capture | A pixel baseline of every sample on both canvases (today it covers the story only) | Nothing |
| 2 | Extract | The hand-drawn look moves out of the renderer into a registry entry; boxes are read through the look | Nothing: byte-identical |
| 3 | Field | A flyer stores its look, on both backends, with the rollback rules in `docs/deploy.md` | Nothing |
| 4 | The site's looks | `LOOKS` in `.env`, `'looks'` in `config.php`, listed by `api/config`; a new flyer starts in the first one | Nothing: with no setting, Hand-drawn alone |
| 5 | Proof look | A throwaway second look, in the tests' build only, different in every token | Nothing in a release |
| 6 | The switch | "Look" under Template, the library card and every way out, in the proof look | Screenshots of the switch first; then the tests' build in Chrome |
| 7 | Docs | CLAUDE.md, README, `docs/deploy.md`, a report, and "how to add a look" | The checklist |

## Artur's answers (2026-10-13; not to be reopened)

| # | Question | His answer |
|---|---|---|
| 1 | Doodles someone moved or added, when the look is switched (once steps 7 and 9 exist) | **"Each design keeps its own"**. Blocks moved stay moved in every look. A switch drops nothing. |
| 2 | Is the look part of the flyer, or a way of printing it | **"Saved with the flyer"** |
| 3 | What a new flyer starts in | **"The first look the site names"**. It replaced his first answer of the same day, "One app-wide default". AI-made and script-posted flyers the same. |
| 4 | How much a look may change | **"Paint, plus small box nudges, built now"** (over my advice, "Paint only, boxes fixed"). On 2026-10-14 he took it further: a look may resize a box (answers 16 and 17). |
| 5 | Where the switch sits | **"In the form's Flyer section"**, under Template. Shown only when there is more than one look to pick. |
| 6 | The word staff see | **"Look"** (over my advice, "Style"). The first button reads "Hand-drawn". |
| 7 | Look and template | "A look is independent of the template": a look is offered only once it prints both templates on both canvases. |
| 8 | What belongs to a look | "Art and inks belong to the look; the marks are shared": blobs, sparks, pencil, icons, lines, highlighter, frames and the wordmark's file are the look's. `EYEBROW_MARKS` and the hostels' badges are shared. |
| 9 | The library | "A library card shows its flyer's own look". No filter by look. |
| 10 | Contrast and orange in a look other than hand-drawn | **"Decide when the new design arrives"**. Each look declares its inks and grounds and is tested; hand-drawn keeps its rules. |
| 11 | Which looks a site offers | "A per-site setting for which looks are offered", built now (over my "not built in this round") |
| 12 | A look switch on Create with AI | **"No for now the AI follow the default configured look and generate with that."** SVG art was not asked for either. |
| 13 | The name in data and code | `look`, as on screen. Kept by him. His first brief said `style`. |
| 14 | The throwaway look | It never ships, and stays in the tests as a canary. Kept by him. |
| 15 | Going back to an older release | The two rules under "Rolling back". Kept by him. |

## Artur's answers of 2026-10-14 (not to be reopened)

Each point that was mine was asked by itself, keep or strike.

| # | Question | His answer |
|---|---|---|
| 16 | M1: a look may move a box up or down, and cannot resize one | **Struck.** A look may resize a box. I came back with what it costs (below, "A look's boxes") and he kept it. |
| 17 | With M1 struck, may a look change the photo frame's shape too | **"Yes, its height too"**. A flyer switched to such a look shows another cut of its photo from the same stored crop. |
| 18 | M2, M3, M4, M5, M6 | **Kept**, each as written below. |
| 19 | The other session at work in the folder (the types work, on `feat/flyer-labels`) | **"Plan now, build after it lands"** |
| 20 | Which branch `feat/looks` is cut from (M7) | **"feat/flyer-labels, once it lands"**. No worktree. |

## The points that were mine (decided: see the table above)

- **M1, struck. A look may give a box its own top and height, per canvas.** It was "a nudge moves a box up or down
  by whole pixels; it cannot resize one". What a look may not change is a width, the order top to bottom, or a safe
  zone. The photo's height may change too (answer 17). What fixed sizes gave by construction is now held by checks
  on every look ("A look's boxes").
- **M2. The site's list decides what the editor offers, not what the server accepts.** A flyer already saved in a
  look the site no longer names still saves and prints, and its switch still shows its own look.
- **M3. A look name the app does not know, in the setting, is refused like any bad setting**, by the setting's name.
- **M4. The pencil becomes a piece of the look's art, hung from the end of the ask**, as the pill's spark hangs from
  the pill. It prints exactly as today, and step 7 can move it like any doodle.
- **M5. The proof look is built before the switch** (the first brief had them the other way): the switch shows only
  with two looks.
- **M6. `npm run flyers:post` asks the site for its first look**, so script flyers follow the site too. A site from
  before looks names none: the script then posts hand-drawn.
- **M7. This starts after the types work has landed, from its branch** (answers 19 and 20). It was "after the
  library-views work has landed, or in its own worktree".

For Artur, later: the contrast numbers and orange for the new look, when its design is on the table (his brief to
Claude Design asks for 4.5:1 and does not mention orange: on 2026-10-14 he left orange open there). That brief said
"do not move, resize"; on 2026-10-14, at his ask, it was brought up to date with this design (a box's own top and
height per canvas, the `Look` interface as its hand-back, the repo's paths). When the real look is in: name it in the Laragon copy's `config.php` first, then
in live's.

## The shape

```
data.look ──► lookOf(data) ──► Look: tokens · art · faces · geometry
                                  │
canvas ─────► boxes of (canvas, look.geometry) ──► boxes · art anchors
                                  │
                              <Flyer>  (still the only renderer)
                                  │
   preview · offscreen fits · library card and lightbox · render page (server export) · client export
```

- **One registry**, `src/shared/looks.ts`, DOM-free and zod-free, like `CANVASES`. A look is one entry, in its own file
  (`src/shared/looks/handDrawn.ts`).
- **One resolver**, `lookOf(data)`: the look a flyer prints in, with the flyer's own colours and art where it has
  them. It takes the flyer, not an id: hand-drawn's paint is partly per flyer. An id it does not know draws
  hand-drawn, never a blank page.
- **The look rides inside `data`**: no `<Flyer>` mount gets a new prop. On 2026-10-13 the mounts were `Preview.tsx`
  (the preview and the offscreen fits, which the AI page uses too), `FlyerThumb.tsx`, `render/main.tsx` and
  `export/ClientExporter.tsx`. Check them again.
- **No `if (look === ...)`.** Components read tokens. A unit test scans `src/flyer` and `src/editor` for a look id
  written as a literal.

## What a look holds

| Group | Hand-drawn's values, which move into its entry |
|---|---|
| Colours | ground, ink, accent, muted, surface (chips and rows), photo placeholder, the pill's letters, the pill's dot |
| Type | two font stacks, and per line of copy: stack, weight, size, line height, spacing, case, floor, its ink and the ground it sits on. One token writes both `data-fit` and `fontSize` (two literals on every element today) |
| Faces | the list `prepareFlyer` waits for (family names still only in `fonts.ts`) |
| Frames | the wonky path, its 5 px stroke, the photo frame's 40 px radius |
| Pill | radius 20, tilt -0.6°, padding, dot |
| Inline art | the eyebrow's icon, the three lines (eyebrow, no-photo, ask: two files, `rule-teal-wide` draws the first two), chip icons (calendar, pin, clock, the € glyph), the week row's clock, the highlighter |
| Art | the pieces by anchor: the photo's two corners, the two bottom corners, the pill's end, the ask's end (the pencil) |
| Wordmark | the Nests wordmark's file |
| Geometry | per canvas: a box's own top and height (the photo's too), the week's row height and gap, the chips' gap, and the art's inset, corner scale and week drop |
| Rules | its minimum contrast and the inks it may not use |

Shared, never in a look: the boxes' widths and their order top to bottom, safe zones, canvases, which fields print
and how they collapse, the `data-fit*` attributes and `fit.ts`, text limits, copy rules, chip order,
`EYEBROW_MARKS` and the badges. The safe-zone overlay is editor chrome and stays off the look.

Shared too, until a look needs one to differ: the sizes written inside the renderer, which are no box of
`layout.ts` (the day column's 250 and its 114 px fit box, the row name's 96 px box, the ask's 760 px column, the
chips' and rows' padding, the pencil's 104 px).

The lines of copy, as `Flyer.tsx` had them on 2026-10-13 (size / floor):

| Line | Size / floor | Line | Size / floor |
|---|---|---|---|
| Headline 1 | 92 / 0.5 | Chip, big line | 46 / 0.6 |
| Headline 2 | 124 / 0.5 | Chip, time | 40 / 0.7 |
| Spanish line | 36 / 0.8 | Chip, small line | 32 / 0.7 |
| Week day | 34 / 0.7 | Extras (gap 16) | 30 / 0.8 |
| Week name | 44 / 0.6 | Ask, English | 62 / 0.66 |
| Week time | 34 / 0.7 | Ask, Spanish | 34 / 0.8 |
| Week price | 26 / 0.7 | Pill | 34 / 0.7 |

Not fitted: the eyebrow (36), a chip's label (26), the € glyph (36). All of it was checked against `Flyer.tsx` on
2026-10-14 and holds. One line is two: the chip's big line has line height 1.3 on the highlighter (WHEN) and 1.1
elsewhere.

**How a look grows later.** A number moves into the look when a look needs it to differ: one line in the type, one in
hand-drawn's entry, one read in the renderer. A treatment the tokens cannot express (a frame that is a plain rounded
box, a highlighter that is a flat band) becomes a new *kind* of that one decoration, drawn in its one component and
chosen by the token, never by the look's name. Neither is built now: hand-drawn needs one kind of each.

## Data

- `data.look`: an enum of the registry's ids, default `hand-drawn` (`FIRST_LOOK`: what a flyer that names none is,
  forever). No migration, as `share`. PHP needs no code: the generated schema carries the enum and the default.
- `newFlyerData(template, look = FIRST_LOOK)` writes the key where the schema has it (PHP compares samples key for
  key). It always writes hand-drawn's `colors` and `doodles`, whatever the look. Samples, briefs and test payloads
  stay hand-drawn; only the editor and the AI page pass the site's first look.
- `data.doodles` and `data.colors` stay **hand-drawn's own**. Another look never reads them: it prints its own art
  and palette. So a switch is only `data.look = id`, and every release, however old, prints a valid hand-drawn flyer.
- On a hand-drawn flyer, `ink`, `accent` and `bg` are read from the flyer, as today; the other colours are the
  entry's. `colors.mark` is stored and read by nothing.
- `fitKey` in `Preview.tsx` gains the look, or the offscreen canvases' cut-off warning goes stale.
- The share text does not depend on the look: `SHARE_DETAILS` stays as it is, and so do the AI's prompt vectors
  (the share prompt reads the copy alone).

## The site's looks (answers 3 and 11)

- `LOOKS=hand-drawn,other` in `.env`; `'looks' => ['hand-drawn', 'other']` in `config.php`. In the site's order;
  the first is what a new flyer starts in. Absent: `hand-drawn` alone.
- Both loaders are held to one table (`tests/fixtures/looks-settings.json`, as `ai-settings.json` does for the AI):
  every name a registered look, none twice, at least one. PHP reads the ids from the generated `schema/shared.json`.
- `GET api/config` answers `looks`. The client reads it through one function in `looks.ts`, loosely, as `aiFor`
  reads the AI: an answer without it, or with a name it does not know, shows no switch and starts new flyers
  hand-drawn.
- The switch lists the site's looks, plus the flyer's own when the site does not name it, and shows only when that
  list has more than one entry.
- Saving is held to the registry, not to the site's list (M2).
- `config.php` is refused whole by a release that does not know a key: `'looks'` comes out before going back to a
  release from before looks, and goes in only after the new release is up.

## A look's boxes (answer 4; M1 struck on 2026-10-14, answers 16 and 17)

- Per canvas, a look may give a named box its own top and its own height: eyebrow, headline, headline with no
  photo, the photo's bleed and band, the no-photo line, chips (and the gap between them), extras, ask, pill, the
  week's title, and the rows' top, row height and gap. What it does not write is the shared table's: hand-drawn
  writes nothing, so its boxes are today's.
- A look writes no width (the safe column's; the canvas's for the bleed), no order and no safe zone. A design that
  needs one of those changed is a layout change, to settle with Artur.
- **The photo.** A look may give the photo another height, so another shape. The crop maths (`photo.ts`) take a
  frame of any shape and clamp a stored crop when it is drawn, and Full bleed and In a frame already differ in
  shape. So a flyer switched to such a look shows another cut of its photo from the same stored crop, staff adjust
  it if they want, and switching back shows the first cut again. Inside one look each photo mode keeps one shape on
  every canvas, so the story and WhatsApp show the same picture.
- **What it cost** (told to Artur before he kept it): the geometry is a top and a height per box where it was one
  number; what sizes gave by construction is checked; the proof look resizes on both canvases; about one commit
  more. `fit.ts` is untouched: a smaller box cuts copy off sooner, and the editor says so. Text limits stay shared.
- The two box tables become private to `layout.ts`, so reading `CANVASES[c].activity` stops compiling. The readers
  (`activityGroups`, `weekGroups`, `weekRowRect`, `pillBox`, `artAnchors`, and `photoFrame`, whose sizes a look may
  now change) take the look's geometry: a small type of `layout.ts`'s own, since hand-drawn's entry needs it while
  it is being defined. Size, safe zones, `safeBox` and `placeArt` stay as they are.
- Callers, as the code had them on 2026-10-14 (they are type-checked, tests included, so the compiler lists them):
  - `Flyer.tsx` (it reads the tables directly today, never the group readers) and `Preview.tsx` (the photo handle,
    and its 40 px radius from the look);
  - `photoFrame`: `Flyer.tsx`, `Preview.tsx`, `Editor.tsx`, `exportActions.ts`;
  - `defaults.ts`, which calls `artAnchors('story', 'band')` when it loads (`TEMPLATE_ART`);
  - tests that read the tables directly: `tests/unit/shared.test.ts` (seven places), `tests/render/art.spec.ts`
    (two), `render.spec.ts` (one), `pixels.ts` (`photoMask`, which is private there).
- Checks for every look, canvas and body, each reported by the box's name:
  - inside the safe box (the bleed's sides excepted), and no overlap;
  - the stack in order, with the pill at least 4 px off the floor;
  - five rows ending at least 12 px above the ask;
  - each photo mode's frame one shape on every canvas (to the 0.5 px today's test allows), the bleed as wide as its
    canvas;
  - art anchors following the boxes, the art's ink on the canvas.
  Hand-drawn equals today's tables. Today's invariants are all in `tests/unit/shared.test.ts` (`canvases` and
  `template art`): they become the checks.
- In the browser, for every look: the fit is sane on the samples, on both canvases.
- **Step 7's plumbing**: shared box, then the look's own place and size, then the flyer's own move. Held to the safe
  box when drawn, per canvas and look, never by changing what is stored.

## The throwaway look (answer 14)

- Its data and both ways in live under `tests/proof/`, never in `src/`. `looks.ts` has one function,
  `registerLook()`, which adds an entry before anything has read the registry and throws after.
- Client: `vite.proof.config.ts` builds `dist-proof/` with the registration first in both entries. Node:
  `tests/proof/server.ts` registers, then starts the server on that folder. A third Playwright project (`looks`,
  its own port and data folder) runs there with `LOOKS=hand-drawn,proof`; `render` stays on the real release build.
  On 2026-10-13 the ports in use were 8799, 8798 and, for the PHP smoke test, 8797: all three literals, so 8796.
- Found on 2026-10-14, for that plumbing:
  - The proof server runs from source with `tsx`: `tests/` is in no server build (`tsconfig.server.json`). There
    `isProd` rests on `NODE_ENV=production`, since its path has no `dist-server`.
  - `schema.ts` reads the registry's ids when it loads. So the registration is imported first, and nothing under it
    imports `schema.ts`.
  - The dist folder is a constant (`DIST_DIR`, three uses in `server/app.ts`), and `AppDeps` has none. Give `AppDeps`
    an optional one that defaults to it: `createApp` has five other callers, which then do not change.
  - A spec in `tests/render/` runs in the `render` project too: that project ignores `ai.spec.ts` alone, so it must
    ignore `looks.spec.ts` as well. Playwright starts every server whatever project is asked.
  - `tsconfig.app.json` names the config files it type-checks one by one: `vite.proof.config.ts` joins them.
- Why not a flag in the registry: a variable left set in a shell would ship it in a PHP build, its data would be
  compiled into every `dist-server/`, and its absence from the bundle would rest on dead-code removal.
- It differs from hand-drawn in every token: the white wordmark on a dark ground, existing art files in other
  places (no new assets, since the release copies `assets/` whole), one face hand-drawn does not load (imported by
  the proof build alone), and boxes resized on each canvas, the photo's shape among them (answers 16 and 17).
- No trace, proved four ways: no file of `dist/` holds its id while `dist-proof/` does; no generated file holds it;
  `build:php`'s completeness check walks the release for it; it answers `invalid` on every backend.
  - That check walks nothing today: it tests named paths. The walk is new (`filesUnder` in
    `scripts/php/manifest.ts` is the one there is).
  - No test reads `dist/` today. `looks.spec.ts` can: both folders exist when `test:render` runs.
- The canary check: in the proof look no element's colour, background, stroke, fill, font family or image is one of
  hand-drawn's.
- The proof server refuses a data folder outside `test-results/`: Node checks a flyer on every read, so a proof
  flyer in a real library could never be opened again. `.gitignore` gets `dist-proof/`, or every release reads
  `-dirty`.

## Rolling back (answer 15; into `docs/deploy.md`, a test per backend for each)

| Going back to a release | What staff see |
|---|---|
| from before looks | Every flyer shows hand-drawn. A Save or a Download there drops the look for good. As the week-flyer rule. Take `'looks'` out of `config.php` first. |
| that knows looks, but not this one | As the "longer line" rule: on the host it opens, drawn hand-drawn, and cannot be saved; on a Node machine it is listed and does not open. Nothing is lost. Take its name out of `'looks'` first. |

The tests to model them on: `php/tests/BootstrapTest.php` (a flyer stored with a line longer than its limit opens,
and its save is refused), `tests/storage/repositories.contract.ts` (the same flyer is refused on a read and still
listed), and for a key an older release drops, the stand-ins in `tests/storage/json.test.ts`,
`php/tests/Validation/FlyerValidatorTest.php` and `tests/contract/validation.test.ts`.

## What steps 7 and 9 will find (decided now, built then)

| Thing | Belongs to | Stored in |
|---|---|---|
| A block moved or resized, chip order | the flyer, in every look | `data.overrides` (exists) |
| Art moved or added | the flyer, in one look | hand-drawn: `data.doodles` (exists). Another look: a per-look store step 7 adds |
| Colours changed | the flyer, in one look | hand-drawn: `data.colors` (exists). Another look: the same per-look store |
| The look | the flyer | `data.look` (this round) |

- A look nobody touched on a flyer prints its own art. A doodle a look does not have is simply not there.
- A switch never deletes: an arrangement waits for the switch back, as rows and photo do on a template switch.
- "Reset to template" resets the look on screen and the block moves; other looks' arrangements stay.
- Step 7's per-look store is a new defaulted key with its own rollback rule, as docs/status.md already asks of step 9.
- Step 9's picker offers the art of the look on screen. The dormant `doodle` table has no look yet: the renderer
  draws `assets/art/<slug>.png` and never asks the table.
- Still step 7's, unchanged by looks: how one block move applies to two canvases.

## Commits, in order (the stage each belongs to in brackets)

Approved by Artur on 2026-10-14, a commit per piece, on his go-ahead for each stage. The notes dated 2026-10-14 are
what reading the code added that day. 1 to 7 are built (`docs/reports/looks.md` has each commit); 8 to 10 are the
next session's.

1. **Baseline** [1]: `tests/render/baseline.spec.ts` takes every canvas, plus a case with custom colours. Capture
   outside git, before anything else.
   - 2026-10-14: keep the story's file names as they are, so the capture there is still checks; WhatsApp gets names
     of its own. A check already shoots each case twice (the default and `canvas: 'story'`) against one PNG: that
     pair only fits the story. The viewport and the clip are the story's, written as numbers.
   - The colours case is one more `variant(…, { colors })`: all four keys, each `#RRGGBB`. No sample has its own.
2. **Inert hooks** [2]: `data-` attributes on what the specs find by file name today (`pixels.ts`, `render.spec.ts`,
   `fidelity.spec.ts`, `art.spec.ts`). No paint changes.
   - 2026-10-14, what they find that way: the highlighter (`mark-yellow` in a style), the rules (a background that
     is not it), the icons (`icon-pin`, `icon-calendar`, `icon-clock` in a `src`), the pencil (`doodle-pencil`), art
     by the file name in its `src`, the wonky frames (every `svg`), the pill's dot (a `span` with no text), the
     photo's two sparks by their order. `pill.spec.ts` is a fifth file. `ready.ts`'s own `[style*="url("]` stays.
3. **Layout** [2]: the private box tables, the geometry parameter, its callers, with hand-drawn's geometry a literal.
   The checks of "A look's boxes" come with it.
4. **Registry** [2]: `src/shared/looks.ts`, `src/shared/looks/handDrawn.ts`. No runtime cycle: `layout.ts` →
   `week.ts`; hand-drawn's entry → `layout.ts`, `fonts.ts` (it holds the tokens, `DEFAULT_DOODLES`,
   `PROTOTYPE_DOODLES`, `sameDoodles`, `SWAPPED_INKS`, the art); `looks.ts` → those; `schema.ts` → `looks.ts`;
   `defaults.ts` → `looks.ts`, re-exporting what `server/db/migrations.ts` imports, which is not touched. Every
   import of `schema.ts` from these is a type. `scripts/art-inks.ts` and the tests follow the move.
   - 2026-10-14: `schema.ts` already loads `defaults.ts` by value, through `names.ts`, and `defaults.ts` and
     `layout.ts` do work when they load. So a looks file imports no value from `schema`, `defaults`, `names`,
     `brief`, `samples` or `copyRules`, and `layout`, `week`, `chips` and `fonts` import none from a looks file.
   - `DEFAULT_PILL_WIDTH` is in `layout.ts` and `resolveDoodles` in `defaults.ts`. The colour constants (`CREAM`,
     `INK`, `DEEP_TEAL`, `YELLOW`, `DEFAULT_COLORS`) have no reader outside `defaults.ts`; the renderer imports
     `BRIGHT_TEAL`, `MUTED` and `PHOTO_PLACEHOLDER`.
   - The scan for a look id written as a literal: model it on `tests/unit/form-limits.test.ts`.
5. **Renderer** [2]: `Flyer.tsx`, one commit each for colours, type, art, frames and pill; then `ready.ts` (faces
   from the look, by a `data-look` on the flyer's root) and `Preview.tsx`. The baseline after each.
   - 2026-10-14: the preview never runs `prepareFlyer`. It calls `fitFlyer` on `document.fonts.ready` and on
     `loadingdone`, so a look's faces reach it through the CSS that is loaded, not through the look's list. The
     root carries `data-flyer` and `data-canvas`, and no `data-look` yet. `render.spec.ts` lists the four faces as
     strings: it takes them from the look.
   - The pencil stays the last child of the ask's block, and the pill's spark the first of the pill's box.
6. **Field** [3]: `schema.ts`, `defaults.ts`, `npm run gen`, the contract rows (`tests/contract/validation.test.ts`:
   filled when absent, unknown is `invalid` at `data.look`), the PHP twins, the rollback tests,
   `docs/api-contract.md` (the defaulted keys), `docs/deploy.md`. (`fitKey` moved to 9 on 2026-10-14, by the plan
   Artur approved: no test can fail before an open editor can change its look.)
   - 2026-10-14: a new key changes four generated files: `schema/flyer.schema.json`, `schema/storage.schema.json`,
     `schema/ai.json` (its share request holds `data`) and `seed/samples.json`.
   - PHP writes keys in the schema's order, and `FlyerValidatorTest` compares every sample key for key. So
     `newFlyerData` writes `look` where the schema has it: last, after whatever key the types work adds to `data`.
     PHP fills defaults from the generated schema, with no code per key.
   - `validation.test.ts` has one defaults test, with a hand list of the defaulted keys (so have
     `FlyerValidatorTest` and `docs/api-contract.md`), and no enum row inside `data` yet. It runs on node,
     node-json and php.
   - The editor has no undo history. "Unsaved" is a JSON compare, so a look change counts like any field.
7. **The site's looks** [4]: `server/config.ts`, PHP's config, `api/config` on both, `ApiConfigSchema`,
   `npm run gen` (the ids in `schema/shared.json`), the fixture table, `App.tsx`, the editor's and the AI page's
   new flyer, `scripts/flyers/post.ts`, `docs/api-contract.md`, `docs/deploy.md`.
   - 2026-10-14: `ApiConfigSchema` is a strict object and the contract client wants exactly its keys. `looks`
     lands in the schema and in both backends in one commit.
   - Node's settings do not pass through `server/composition.ts`, and `createApp` never sees `Config`: `AppDeps`
     is given the looks. PHP: `Config::KEYS`, and a hand-written accessor in `Shared.php` for the new block of
     `schema/shared.json`.
   - `#/new` makes its blank flyer twice (`blankDraft()`: the draft, and the saved state it is compared with). Both
     take the site's first look, or a new flyer opens as "Unsaved changes". `App.tsx` alone holds `api/config`: it
     hands the first look to `Editor` and to `AiPage`, which passes it on (`flyerFromBrief`, `newFlyerData`).
   - `scripts/flyers/post.ts` does not read `api/config` today; `tag-release.ts` and `ai/smoke.ts` do, loosely.
     `scripts/ai/smoke.ts` makes a flyer too, for a share request: it stays hand-drawn.
   - Tests hold every setting to be in `.env.example`, commented out, and pin `config.sample.php`'s keys.
8. **Proof look** [5]: `tests/proof/{look,register,server}.ts`, `vite.proof.config.ts`, `server/start.ts` (today's
   `server/index.ts` body, taking the dist folder), `server/app.ts`, `playwright.config.ts`, `package.json`
   (`test:render` builds both), `scripts/build-php.ts`, `tests/unit/generated.test.ts`, `.gitignore`,
   `tests/render/looks.spec.ts`.
9. **The switch** [6]: `Editor.tsx` (after the Template switch in the Flyer section), `fields.ts`, `sectionFolds.ts`
   (the closed line names the look when the switch shows), `tests/editor.ts` (`lookButton`), the specs, and `fitKey`
   in `Preview.tsx`, with a spec where a switch refreshes the offscreen canvas's cut-off warning.
   - 2026-10-14, before the types work, which changes this section (read it again): the closed line is pinned in
     `section-folds.test.ts` and in three places of `panel.spec.ts`. `sectionLine` is given the data, the hostel's
     name and whether there is a photo: it must also be told whether the switch shows. `templateButton` is the
     model for `lookButton`. Pictures to Artur first, from the tests' build.
10. **Docs** [7]: `CLAUDE.md`, `README.md`, `docs/reports/looks.md`, `docs/adding-a-look.md`.

Reused, not rebuilt: `resolveDoodles` and `sameDoodles`; `artAnchors`, `placeArt`, `inside`, `overlaps`;
`drawPayload` and `newPayload` (`tests/render/drawn.ts`); `render.spec.ts`'s sample × body × canvas loop; `bodiesOf`,
`follow` and the 0.5 % threshold (`tests/render/pixels.ts`); the `ai` project's shape in `playwright.config.ts`;
`aiFor`'s loose reading as the model for the site's looks; `templateButton` and the Template `.seg` for the switch.

## The registry's contract tests (every look, and the proof look)

- Every art file it names exists under `assets/`.
- Every face is a family of `fonts.ts` and its package is pinned exactly; `fonts.css` holds exactly the shipped
  looks' faces (the editor's own Montserrat 500 is chrome and is not one).
- Every line of copy's ink reaches the look's own minimum on the ground it declares; none is an ink it forbids.
  This holds the registry, not a stored flyer: the schema takes any hex in `data.colors`.
- The layout checks above, for each canvas and body.
- In the browser: the fit is sane, only art is outside the safe zone, the client export is within 0.5 % of the
  server's, and the library card's fit equals the render page's.

## Traps found while planning

Read from the code on 2026-10-13; nothing was run. Three read-only sweeps checked them on 2026-10-14, still
running nothing: what they corrected is marked, and the rest held. The code will have moved again by the build.

- React adds `px` to a bare number: tokens keep today's types (`'0.1em'`, a unitless line height).
- The pill's spark comes first in the pill's box, so the pill is drawn over it. The pencil does not: it is the last
  child of the ask's block, after both lines of copy. Keep each order. (Corrected on 2026-10-14: this said both
  came first.)
- "Family names only in `fonts.ts`" is not exact: `'Montserrat'` is a literal twice in `editor.css` (chrome), and
  `render.spec.ts` lists the four faces as strings. (Found on 2026-10-14.)
- The baseline's own "dirty" is `git status --porcelain --untracked-files=no`: an untracked file never counts
  there, and `docs/` is not left out. It is not `scripts/git.ts`'s rule. (Found on 2026-10-14.)
- `DEFAULT_PILL_WIDTH` (585) is hand-drawn's own: it only turns the stored place of its spark into an offset from
  the pill's end. Another look gives that offset itself.
- The baseline had no case with other colours. Without one, an extraction that reads the registry's colours passes
  and still changes such a flyer.
- A capture keeps a render only once two agree, and a check retries small local differences: Chrome's raster varies
  a little. Shoot the overlays from a context with no route (the spec says why).
- The render cache's key hashes `flyer.data`, so a look changes it, but not the bytes of art, logos or fonts: new
  art gets a new file name, never an old one's.
- `build:php` builds with the caller's environment and copies `dist/` and `assets/` whole.
- The contract suite's `php-basic` project runs four files only; `validation.test.ts` runs on node, node-json and php.
- The closed "Flyer" section's line is pinned (`section-folds.test.ts`, `panel.spec.ts`): it gains the look only
  when the switch shows.
- `render.html` and `.card-thumb` paint cream behind a flyer that is still loading. It is chrome: a dark look waits
  on cream. Left as it is.

## What "how to add a look" must cover (`docs/adding-a-look.md`)

- Fonts: the family in `fonts.ts`, the package pinned in `package.json`, the weights in `fonts.css` and in the
  look's faces.
- Art: new files with new names under `assets/art/`, each with its anchor; nothing overwritten.
- The entry: one file in `src/shared/looks/`, one line in the registry. The compiler lists every token it lacks.
- `npm run gen`, the contract row, the docs.
- A box's own top or height only where the design needs it: the checks hold it, and name the box when they fail.
  A width, the order, or a size written inside the renderer is a layout change, to settle with Artur.
- A photo frame of another shape cuts every photo differently when a flyer is switched to the look: show it on the
  proof sheets, with a flyer whose crop someone set.
- A treatment the tokens cannot express: a new kind of that decoration, never a check of the look's name.
- Its contrast numbers and forbidden inks, settled with Artur.
- Proof sheets of every sample, on both canvases and both templates, signed by Artur before a commit.
- The site's setting: the Laragon copy first, then live. The release goes up whole, and before the setting.
- A look's id is forever once a release accepts it.
