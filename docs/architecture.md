# Architecture (where things live)

## The renderer

- `src/flyer/Flyer.tsx` — **the only renderer.** The editor preview and the export page both mount it.
  Never create a second renderer (canvas redraw, server template, etc.): if preview and export can drift,
  they will.

## The fit

- `src/flyer/fit.ts` — the prototype's `_fit()` (two-pass shrink-to-fit), with one departure: the height pass stops
  each line at its own `data-fit-min` floor, where `_fit()` scaled the whole box down to 0.55 (the owner's call,
  2026-09-30). Keep the `data-fit*` attributes. `ready.ts` loads fonts/images and fits before any export.

## Shared logic

- `src/shared/` — DOM-free, used by client **and** server: `schema.ts` (zod, source of truth for the data
  shape), `layout.ts` (the `CANVASES` registry: every canvas's size and safe zones, and, private, both templates'
  shared box positions, read through a look's geometry with `boxesOf()`, and the art anchor points; a new canvas is
  one entry; and `DEFAULT_CANVAS`, the canvas a viewer who never chose sees), `looks.ts` and `looks/` (the looks a
  flyer prints in; "A flyer prints in a look", below), `defaults.ts` (each template's defaults and the switch
  between them, and `EYEBROW_MARKS`, which marks print at the eyebrow's right; it re-exports the three names
  `server/db/migrations.ts` reads, whose home is `looks/handDrawn.ts`),
  `chips.ts` (the `·` convention), `week.ts` (the This week rows: their limits, a row taken from a saved flyer,
  what a row prints — zod-free, so the client imports it and `schema.ts` takes its limits from it), `text.ts` (`TEXT_LIMITS`: each line of copy's limit, read by
  the schema and the editor's inputs — zod-free), `names.ts`
  (what a flyer is called in the library: an untitled flyer's name, the title's limit, the library's date — also
  zod-free), `share.ts` (the share text's limit and the line between its two languages: a caption saved with the flyer, copied from the panel or the
  button floating by the preview, never printed), `labels.ts` (a flyer's labels: the list, its limits and the rules
  both backends apply to it, never printed either — zod-free; "A flyer carries labels", below), `brief.ts` (`flyerFromBrief`: a flyer from its copy alone, the shape the staff-text
  workflow in `docs/ai-flyers/` writes — zod-free; `BriefSchema` is in `schema.ts`), `photo.ts` (crop maths),
  `copyRules.ts`, `writeGuard.ts` (the write header, and the methods that need none), `ai.ts` (the AI assistant's
  facts: its features and what each one's generations are called, a feature's daily limit by default and its bound,
  the idea's and the assumptions' limits, the day's zone, the provider defaults, the fake provider's markers, and
  `aiFor`, which reads one feature's own limit and what is left of it off `api/config`'s answer — zod-free),
  `samples.ts` (the seed and
  test flyers). Relative imports here use `.js` extensions
  (NodeNext). The client never imports a value from `schema.ts`: that would bundle zod into the editor and the
  export page. Nothing the browser loads imports `samples.ts` either: it imports `seed/hostels.json` for the
  hostels' names, and Vite would bundle the whole seed.

## Looks

- A flyer prints in a look (2026-10-14; the design is `docs/prompts/looks-seam.md`, the report
  `docs/reports/looks.md`, and adding one is `docs/adding-a-look.md`). All 7 stages are built: the hand-drawn look is a
  registry entry the one renderer reads, a flyer stores its look, a site names the looks its staff may pick, and the
  editor has a Look switch. The release has one look, so staff see nothing of it; the tests' proof look proves the rest.
  - **`src/shared/looks.ts` is the registry**, zod-free and DOM-free: a look is one entry, in its own file
    (`looks/handDrawn.ts`). `lookOf(data)` is the look a flyer prints in, read loosely: none, or an id this release
    does not know, is hand-drawn. `registerLook()` adds one only before anything reads the registry (the tests' own
    build alone). A look's id is forever once a release accepts it.
  - **A look holds** its palette (a function of the flyer: hand-drawn takes its ink, accent and ground from
    `data.colors`, which only it reads), its type (every line of copy by its place: one token for its size and its
    `data-fit`), its faces, its art (a function of the flyer: hand-drawn's is `data.doodles` resolved, which only it
    reads, and its pencil at `askEnd`), its inline art files, its wordmark, its frame, its pill, its geometry, and its
    rules (a contrast minimum and forbidden inks). Shared, never a look's: widths, the order of the boxes, safe zones,
    fields and how they collapse, `fit.ts`, text limits, copy rules, `EYEBROW_MARKS` and the badges.
  - **No `if (look === …)`.** Components read tokens. `tests/unit/looks.test.ts` fails on a look's id written in
    `src/flyer` or `src/editor`; a treatment the tokens cannot express becomes a kind of that decoration, chosen by a
    token.
  - **A look may give a box its own top and height** per canvas, the photo's too (Artur struck "move only",
    2026-10-14). `tests/geometry.ts` names every break of the rules fixed sizes used to keep; every look is held to it.
  - Everything the flyer draws that is no copy carries a hook (`data-deco`, `data-chip`, `data-anchor`, and
    `data-look` on the root): specs find things by them, never by a file one look draws.
  - `tests/lookContract.ts` is what every look must be: its boxes, its contrast, its art files, its faces (a family of
    `fonts.ts`, a pinned package, imported by `src/flyer/fonts.css`), its pill's tilt within `PILL_TILT_ROOM`.
    `tests/unit/looks.test.ts` runs it on every shipped look, `proof-look.test.ts` on the proof look.
  - The baseline (`tests/render/baseline.spec.ts`) shoots both canvases and flyers with their own colours.
  - **`data.look` is an enum of the registry's ids**, default `FIRST_LOOK`, the last key of the data (after the
    labels; PHP compares stored files key for key). `newFlyerData(template, look)` writes it, and hand-drawn's
    `colors` and `doodles` whatever the look. Unlike a label it is held to the list: a look's id is never taken back,
    so only going back meets one a release does not have. Then PHP opens it as stored (drawn hand-drawn) and refuses
    its save at `data.look`; Node lists it and does not open it (`docs/deploy.md`, "Rolling back"). A flyer with no
    look reads hand-drawn. No migration.
  - **`schema.ts` reads `lookIds()` when it loads**, and `loadConfig()` when it runs: either seals the registry, so the
    tests' proof look is registered before both.
  - **A site names its looks**: `LOOKS=hand-drawn,…` in `.env` (`namedLooks`, `server/config.ts`), `'looks'` in
    `config.php` (`php/src/SiteLooks.php`, the ids from `schema/shared.json`'s `looks` block). In the site's order,
    the first a new flyer's; not set, the first look alone. A name the release does not have, a name twice or none is
    refused by the setting's name, never its value (M3; PHP: 503). `tests/fixtures/looks-settings.json` holds both
    loaders to one table, against two looks of its own (`known`): this release has one.
  - **The list decides what the editor offers, never what a save accepts** (M2): a save is held to the registry.
  - `GET api/config` answers `looks` (Node: `AppDeps.looks`, optional). The client reads it through `siteLooks()` in
    `looks.ts`, loosely: none, or a look it does not have, is the first look alone. `App.tsx` hands the first to
    `Editor` (both copies of `blankDraft`, or a new flyer opens unsaved) and to `AiPage` (`flyerFromBrief`'s fourth
    argument). `flyers:post` asks the site through `siteFirstLook()` in `scripts/site.ts` (M6); `ai:smoke` stays
    hand-drawn.
  - **The Look switch** is in the editor's Flyer section, under Template (the owner's answers 5 and 6), a `.seg` like
    Template's. `looksToPick()` in `looks.ts` lists the site's looks, then the flyer's own when the site does not name
    it; the switch shows only with more than one. The pressed button is `lookOf(data)`, never `data.look`, and
    pressing it changes nothing (a flyer from an older backend has no look and must still read "Saved"). `Editor`
    gets the site's whole list from `App.tsx`; `AiPage` the first alone (no switch there, answer 12).
  - The closed Flyer section names the look **last**, and only where the switch shows (`sectionLine`'s `lookName`;
    Artur's pick from pictures, 2026-10-14: "Look last in the line"). With one look the line is as before looks.
  - `fitKey` in `Preview.tsx` holds the look (as drawn): a switch of look alone refits the canvas fitted offscreen.
  - **The proof look** (`tests/proof/`, id `proof-look`, the owner's answer 14) is the tests' throwaway second look,
    different from hand-drawn in every token, and never shipped. Its face is a devDependency (Space Mono), its family
    in `tests/proof/`, not `fonts.ts`.
    - `vite.proof.config.ts` builds `dist-proof/` with `tests/proof/client.ts` first in both entries
      (`npm run build:proof`; `test:render` builds both). `tests/proof/server.ts` registers it, seeds its own library
      and starts `server/start.ts` on `dist-proof/` (`AppDeps.distDir`); it refuses a data folder outside
      `test-results/`.
    - The Playwright project `looks` (port 8796, `LOOKS=hand-drawn,proof-look`) runs `looks*.spec.ts`; `render`
      ignores them. **A spec never registers the proof look**: Playwright lists every project's specs in one process,
      so the registry is read first. Specs hand `PROOF_LOOK` to the checks and read the server's answers raw
      (`tests/render/proofFlyers.ts`).
    - render.spec's checklist is `tests/render/drawnChecks.ts` (`checkDrawn()`), reading the flyer's look: render.spec
      runs it on hand-drawn, looks.spec on the proof look.
    - No trace of it, four ways: `dist/` (looks.spec), the generated files (`generated.test.ts`), `build:php` walks the
      release (`filesNaming`), `invalid` on every backend (`validation.test.ts`).

## The editor and the render page

- `src/editor/` — editor + library UI. `render.html` + `src/render/` — the bare page headless Chromium shoots.

## Library cards

- Each library card shows its flyer (`src/editor/FlyerThumb.tsx`, 2026-10-06): the same `<Flyer>`, on
  `DEFAULT_CANVAS` at its true size, scaled by a transform and prepared with `prepareFlyer()`. Never a stored
  thumbnail.
  - Each card asks `GET api/flyers/:id` for its own flyer when it nears the screen (`useNearFlyer`, called by
    `LibraryCard.tsx`), so the list's contract did not change and nothing was added to either backend. `FlyerThumb`
    draws the flyer it is given.
  - The box is the same size waiting, shown or failed. Its width on screen is `--thumb-w` in `editor.css`; the
    flyer's size comes from the registry.
  - It is decoration inside the card's link: `aria-hidden` and `inert`. `tests/render/library.spec.ts` holds
    all of it, and the fitted sizes to the export's.

## The reception flyer

- The library ends with the main reception flyer (2026-10-13, Artur's ask): the printed poster whose QR leads to the
  experience page, shown whole and centred under the cards, with "Download PNG" and "Download PDF".
  - The two files are `assets/main-flyers/V7-check.png` and `Simple QR flyer for Nest V7.pdf`, served like any asset
    on both backends and shipped by the release's `assets/` copy. `MAIN_FLYER` at the top of `Library.tsx` names
    them and the names they download under: a newer version is those two paths.
  - It is not a flyer of the list: no card, never filtered, shown with an empty library too. A dedicated page
    (instructions, versions, styles) is his later ask and is not designed. Specs: the last two of
    `tests/render/library.spec.ts`.

## Library views

- The library is a list or a grid, shows a flyer large, and has the editor's ways out on every flyer (2026-10-13,
  the library's views; Artur's asks, and his picks from mock-ups: the magnifier, "Ways out only, rest in a menu",
  "Two columns, small buttons", the lightbox as drawn). The client alone, on both backends. How a viewer looks at the
  library, never flyer data.
  - **One fetch per card.** The card's one answer serves its picture, its lightbox and its ways out, so the caption
    is in hand at the tap, which a clipboard write needs. Until it is here the card's buttons and its zoom wait
    greyed; a flyer that cannot load leaves them so, and the card still opens it. Never add the caption to the
    list: that is a contract change an older release refuses. (The flyer's labels are the one thing of its data
    the list carries, since 2026-10-14 and with a release: below.)
  - **The view** is `src/editor/libraryView.ts`, pure and tested by itself: list for someone who never chose,
    stored as `library.view`, and a stored value that is neither view is ignored. The switch is a `.seg` beside
    the filters, two buttons with `aria-pressed`.
  - The picture's width on screen is `--thumb-w`, set on `.card` (not on the picture: the zoom button is placed
    by it too): 120 in the list, 96 on a phone, 252 in the grid, 136 in a phone's grid. The grid's columns have the
    card's own width (278 px, three to a row in the 900 px column with a scrollbar beside it; 154 px, two to a row
    at 360 px), because the picture is scaled by a number, not by the room it is given.
  - **The ways out are the editor's own.** `src/editor/pictureActions.ts` holds copy, share, download, "Share
    now" and "Copy the caption", with their words, for a page that comes in as a parameter (`PictureHost`): the
    editor's picture is "save, then export", the library's is the export alone, since its flyers are saved (no
    save, so no cache emptied). `src/editor/oneAction.ts` is a page's one action at a time (`run`, `busy`, the
    message, `turn`, the focus back to a greyed button). `src/editor/WaysOut.tsx` draws the first button and
    "Download ▾" in the editor's bar, on a card and in the lightbox. Never copy any of it into a page.
  - `needsPhoto()` in `exportActions.ts` is the one rule for "a frame with no photo is not made into a picture":
    the editor's warning, and the library's greyed buttons with `NO_PHOTO` beside them. `savedCanvas()` in
    `prefs.ts` is the viewer's canvas.
  - **The canvas**: the ways out and the lightbox make the canvas the viewer last chose in the editor
    (`editor.canvas`), else `DEFAULT_CANVAS`: the picture the editor's Download gives. The lightbox names it. The
    cards' own pictures stay `DEFAULT_CANVAS`. The library has no canvas switch.
  - A card's buttons: the first way out (`exportActions()`: Copy image on a desktop, Share… on a phone), "Copy
    text" (greyed with no caption), "Download ▾", and "More ▾" with Open, Duplicate and Archive. One action at a
    time across the cards and the lightbox (`Busy`: whose, and which). Duplicate and Archive run through the same
    `run`, so a failure is a toast; the red banner is for a list that cannot load.
  - **The toasts** are the editor's `Toasts`, with no warnings: after the library, so in the window's bottom-right
    corner, and inside the lightbox while it is open (a modal dialog is over everything else), in its top-left
    corner. `owner` is the flyer the message is about: a toast's next step is that flyer's. It is noted when the
    message lands, never when its action starts, and opening a lightbox clears the toast (both found in review).
  - **The zoom button** (`.card-zoom`) is a real button, a sibling of the card's link inside `.card-head`, laid
    over the picture's top-right corner: 44 px to hit, drawn as a 30 px disc, always shown. It comes after the link
    in the page, and waits greyed while an action is in hand (a duplicate that lands leaves the page). The picture is still inert decoration inside the link, and its click still opens the editor.
  - **The lightbox** (`src/editor/Lightbox.tsx`) is the browser's modal `<dialog>`, opened with `showModal()`: the
    focus goes in and stays in, the page behind is inert, Escape closes it, and the focus goes back to the zoom
    button. The dialog fills the window and is its own backdrop; a press on it or on the room around the flyer
    closes it, and the flyer has a box of its own so a press on it (it is inert) closes nothing. It draws the same
    `FlyerThumb`, at the width a `ResizeObserver` fits to the room the bar leaves. Its menu opens upwards.
    Behind it `.library-held` stops the library's scroll. No previous / next.
  - Browser specs: `library-views.spec.ts` (the views, the zoom button, the lightbox) and
    `library-actions.spec.ts` (the ways out, on the fake share sheet and the real clipboard); the unit tests are
    `library-view.test.ts` and `picture-actions.test.ts`. `tests/editor.ts` has `zoomButton(card)`,
    `lightbox(page)`, `waysMenu(within)`, `pickWay(within, action)`, `moreMenu(card)` and
    `cardMore(card, entry)`. A spec never imports a constant from a component file: that pulls the flyer's CSS
    into the test runner (`NO_PHOTO` is in `exportActions.ts` for this).

## Labels

- A flyer carries labels: what kind it is, for finding it in the library (2026-10-14; Artur's ask and his answers
  are in `docs/reports/flyer-labels.md`: several on a flyer, from a fixed list, called "Labels" because the pill
  already owns "Tag"). Never printed: `<Flyer>` does not read them.
  - **The list is `FLYER_LABELS` in `src/shared/labels.ts`**: slug and name, in the order every screen shows it.
    Only Artur adds to it, as with the hostels: a new label is a line there and a release. `npm run gen` writes it
    to `schema/shared.json` (PHP: `Shared::labels()`, `Domain\FlyerLabels`) and into the AI's flyer prompt.
  - **One rule, two backends**: `tidyLabels` (what a save stores: listed ones in the list's order, then the others
    as stored, once each), `knownLabels` (what a screen shows), `matchesLabel` (the filter) and `storedLabels` (a
    loose read). `tests/fixtures/flyer-labels.json` holds the TypeScript and the PHP to one table, with a list of
    its own.
  - **A label is held to a slug's shape, never to the list** (`FlyerDataSchema`). Node checks a flyer against the
    schema on every read, so an enum would stop a flyer opening once a label left the list. A label off the list
    stays stored, is on no screen, and comes back if the list takes it back (his answer). Never make `data.labels`
    an enum. Only a brief's labels are one (`BriefSchema`): a brief is written now, by a hand or by the model.
  - `data.labels` is defaulted like `share`, so there is no migration. It is the last key of the data, in the
    schema and in `newFlyerData()`: PHP's stored files are compared key for key. Up to 8 (`LABELS_MAX`); raising
    that later is a change an older release refuses.
  - **The list carries them.** `GET api/flyers` answers each item's `labels`, and filters by `label=<slug>` or
    `label=none` (no label of the list).
    - Both JSON stores open each listed flyer's own file for it, under the lock they already hold, loosely: a file
      that is missing or damaged has no labels, and its flyer is still listed.
    - **The index was left alone on purpose.** A release from before labels rewrites every index row to its six
      keys at its next save, so labels kept there would be lost by one save.
    - SQLite reads the labels alone, from data that parses, and asks the match in JavaScript: one rule on every
      driver.
    - What it costs is in `docs/json-storage.md`, "What the list reads".
  - The client: `src/editor/libraryLabel.ts` (the filter's choice and its memory, `library.label`, pure and tested
    by itself), pills on a card from the list item (`.card-labels`), and the picker in the editor's Flyer section
    (`.label-picker`, buttons with `aria-pressed`). A loaded flyer's labels pass through `tidyLabels` before the
    saved copy is taken, so one press and its undo read "Saved".
  - The library's top is two rows since: `.library-top` (the name, List / Grid) and `.library-filters`. On a phone
    the filters are two to a row and their words are not drawn. `tests/editor.ts` finds a filter by that word with
    `libraryFilter(page, 'Label')`, never by a loose name: a zoom button is named by its flyer's title.
  - **No grouping by label.** He chose headings from text previews and, seeing them drawn on the real library,
    said "I dont want the Group by label functionality". Not to be reopened.
  - `npm run flyers:labels` (`scripts/flyers/labels.ts`, its rules in `labelTable.ts`): a site's flyers printed, and
    a table of ids and labels put on them through its API. A dry run unless `--write`; it fills flyers with no
    label, oldest first, and never changes one. There are no keyword rules: whoever chooses the labels reads the
    flyers (his answer: "Classify the flyers, I trust you").
  - The AI's flyer answer always carries `labels`, of the list alone. A label it misses is named in an assumption
    whose field is `labels` (his answer: "The AI may suggest one"). The rules in `ai/prompts/flyer.md` name the
    list and never a label of it; a label's `hint` in `labels.ts` is what the model reads beside its name.
  - Browser specs: `library-labels.spec.ts`, `flyer-labels.spec.ts`, and a step of the PHP smoke test.

## Library search

- The library has a search box (2026-10-14; Artur's ask and his answers are in `docs/reports/library-search.md`): to
  find a flyer that exists, to duplicate or edit it, before making another. The browser alone, on both backends: no
  route, schema or PHP class changed, and the list's contract did not either.
  - **The rule is `src/editor/librarySearch.ts`**, pure and tested by itself. It searches from 3 characters, spaces
    not counted (`SEARCH_MIN`). Every word must be found somewhere in the flyer, in any order. Case, accents and
    curly apostrophes fold (`fold()`); nothing is fuzzy.
    - The rank is the best field holding one of the words (`RANK`): the name, a label (`labelNames`, so a label off
      the list is not searched), the share text, the rest. Within a rank, the list's own order.
    - "The rest" is the copy, the chips' values (not their words), the extras, the week rows, and the meta line's
      hostel ("All hostels") and template names, not its date (`metaOf`). Only what the flyer's template prints.
  - **One store of answers, `src/editor/libraryFlyers.ts`**, one per visit to the library (`Library.tsx` makes it).
    - The list carries no share text and no copy, so the search reads each flyer's `GET api/flyers/:id`, the answer
      a card already asks for. Cards (`useNearFlyer`) and the search both read through the store.
    - Kept by id and `updatedAt`: no flyer is asked for twice in a visit, and a flyer saved since is asked for again.
    - The search reads `READS_AT_ONCE` (4) at a time, in the list's order. A card near the screen asks at once,
      ahead of that queue.
    - A failure is remembered: that flyer is searched by its list fields alone.
    - **The store saves the request, never the drawing**: a card draws its picture only once it nears the screen.
      Never make every card draw because the search has its answer.
  - The box (`<input type="search">`, "Search") is the first of `.library-filters`, and a row of its own on a phone.
    It is remembered as `library.search`, like the filters (his answer), so a remembered search reads every flyer
    when the library opens.
  - "Clear" shows while a search or a filter is set. It empties the box and sets the filters back to all. The box
    gives it its room, so the filters never move. The no-match message's button does the same.
  - What a card shows (`LibraryCard.tsx`):
    - `<mark>` in its name, its meta line and its pills: #53CED1 at 38 % behind ink letters, his pick.
    - The "why" line (`.card-why`) for a flyer found only by its share text or its copy: one line, his answer,
      that never widens the card (`contain`). It names the field as "The AI assumed…" does (`briefFieldLabel`), from
      16 characters before the word, and never starts on a separator.
  - The count is `role="status"` ("3 of 16 flyers"). "Reading the flyers… n of N" is shown and not announced.
  - Browser specs: `library-search.spec.ts`, and a step of the PHP smoke test. Unit tests: `library-search.test.ts`
    and `library-flyers.test.ts`. `tests/editor.ts` has `librarySearch(page)` and `searchLibrary(page, query)`.

## The top bar

- The library's top bar is `<nest-nav tool="flyers">` (`App.tsx`), the bar every Nests tool shares.
  - It is loaded `async` from `https://nestpass.ai/kit/nest-nav.js`. That file lives in the
    `nestpass-tools` repo (`A:\serverpath\laragon\nestpass-tools`), with the list of tools and the
    contract.
  - Its shadow root draws the bar. `editor.css` styles only the app's own links (the default
    slot) and the `slot="fallback"` brand, which shows at the same 54 px until the script runs or
    if it can't be reached.
  - The editor (`#/new`, `#/flyers/:id`) renders no bar: it is a focus page. Its way back is the
    panel's sticky "← Library"; the bar comes back only if the app can't load.
  - Browser specs import `test`/`expect` from `tests/browser.ts`, which blocks the script.
    `tests/render/chrome.spec.ts` holds both states; `tests/editor.ts` has the helpers that drive
    the editor (the render suite and the PHP smoke test share them).

## Toasts

- What a focus page says about the flyer on its stage is a toast (2026-10-07, the editor's UX round, Part 1;
  Artur's rule above the rest: "a note never takes space from the flyer").
  - `src/editor/Toasts.tsx`, mounted inside `.workspace` by the editor and the AI page: an action's outcome (one
    slot, `ok` or `error`) and the standing warnings, in the stage's bottom-right corner, out of the layout.
    `copyWarnings()` in `Preview.tsx` makes the cut-off and copy-rule warnings for both pages.
  - Every toast has a close button. A closed warning whose problem stands folds into a "⚠ n" chip; the chip opens
    them again. At 860 px and narrower the warnings start folded.
  - The folding rule is `src/editor/toastFolds.ts`, pure and tested by itself. A warning is its kind, its field
    and its words (`warningId`). The file is not called `toasts.ts`: on Windows that is `Toasts.tsx`.
  - A success closes after `OUTCOME_MS` (6 s) and waits under the pointer or the focus; an error stays, and so
    does a success that offers a next step (Part 3, below).
  - The corner hangs from `.toasts-anchor`, a sticky line with no height at the workspace's end: on a phone,
    where the stage ends below the screen, the toasts stay at the screen's bottom edge.
  - An error is `role="alert"`, a success sits in a `role="status"` region that is in the page before its words,
    and the warnings are a plain list: they change with every key.
  - Browser specs read them through `tests/editor.ts`: `toast(page, kind)`, `closeToast()`, `warningsChip()`.
    A test of a toast's time stops the page's clock (`stopClock` in `tests/render/toasts.spec.ts`).
  - Not toasts: failures with no flyer on screen (the editor's "This flyer does not exist", the library's banner).

## The form folds

- The editor's form folds (2026-10-07, the editor's UX round, Part 2; Artur's "pill dropdown section" and
  "collapsible to the left"). How a viewer looks at the form, never flyer data.
  - A focus page's form is `.panel`: its head (`.panel-head`), and under it the form (`.panel-body`), which
    scrolls by itself. The head is no part of what scrolls. It was a sticky bar inside the scrolling panel, with
    room kept for it by scroll padding: focusing one of its controls then scrolled the form to its top.
  - `Section` in `panel.tsx` folds when it is given a `fold`. Its header is a button with `aria-expanded`: closed,
    a pill with one line of what is inside, and a dot while a warning stands for one of its fields; open, a lightly
    marked card that holds its fields (his pick of two looks, and his ask for the mark). The AI page's sections are
    given none. A closed section's content is `hidden`, never unmounted.
  - The rule is `src/editor/sectionFolds.ts`, pure and tested by itself: the sections, which ones a template shows,
    which start open, each one's line, and the section a copy rule's field is in (`Lint.field`).
  - A new flyer and an AI-made one start with every section open. A saved one opens as the sections were left last
    time, and before any last time with When · Where · Cost open, or the week's rows.
  - One memory for every saved flyer in a browser: `editor.sections` (`prefs.ts`). Only an editor that opened a
    saved flyer writes it (`id != null`): a new flyer's first save keeps the editor mounted and its `id` null, so
    nothing folds or is written then.
  - The head holds the fold button first ("Hide" / "Form": one button, in the same corner in every state), then
    "← Library", then "Open all" / "Close all". Folded, the form is `hidden` whole: a 56 px rail on a desktop (his
    pick of three shapes), the head bar alone at 860 px and narrower. The panel starts open on every visit, and
    the form gets its scroll place back when it opens again.
  - A photo that lands opens the Photo section (one dropped on the preview finds it closed on a saved flyer); a
    file the photo checks refuse opens nothing.
  - The panel is held to its width by `min-width: 0`, and on a phone to the screen by `min-height: 0`: it does not
    scroll by itself, and a closed section's long line never wraps. `panel.spec.ts` holds the 421 px.
  - The section titles are in `FIELD` (`fields.ts`), and the form asks `sectionsOf()` which sections a template
    shows.
  - The sections are in the order a flyer is made, which is the flyer's own from top to bottom (Artur, 2026-10-13:
    "in the order on how we editing the flyer"): Flyer, Headline, Photo, When · Where · Cost, Nice to know, The ask
    (CTA), Tag pill, Share text. A This week flyer: Flyer, Title, its rows, The ask (CTA), Tag pill, Share text.
    - The eyebrow is the Headline's first field (a week flyer's Title). The pill has a section of its own: they
      shared "Top and tag pill", last but one. Closed, Tag pill reads its two words, or "Not shown".
    - `SECTIONS` in `sectionFolds.ts` is the order, and `Editor.tsx` draws the sections in it by hand: change both.
    - "The ask (CTA)" is the section's title alone. "The AI assumed…" names its lines "The ask (English)".
    - The memory of open sections is by section id: `top` is gone, and a list that names it drops it.
  - Browser specs: `tests/render/panel.spec.ts`. `tests/editor.ts` has `sectionHead(page, title)`,
    `openSection(page, ...titles)` and `panelFold(page)`: a spec that opens a saved flyer opens the section it
    uses first.

## The ways out

- The flyer leaves the editor as a picture four ways (2026-10-12, the editor's UX round, Part 3; Artur's "Copy
  beside Download" and "Yes, with copy image"): copied, shared, or downloaded as PNG or JPG.
  - `picture(format)` in `Editor.tsx` is the one "save, then `exporter.export()`" all four call: the canvas on
    screen, of the saved flyer. No second renderer, and nothing in `src/editor/export/` knows which way out it is.
  - The bar's right half is one group (`.toolbar-actions`): the status, Save, one first button and "Download ▾". It
    wraps as a whole and stays at the right.
  - `src/editor/exportActions.ts` says which button is first (pure, tested by itself). A desktop gets
    `[Copy image] [Download ▾]`, a phone `[Share…] [Download ▾]`, and the other one is behind Download with PNG and
    JPG. A way out shows only where the browser can do it. "A phone" is `(pointer: coarse)`, as for "Take a
    photo", never the 860 px.
  - `src/editor/Menu.tsx` is the editor's own menu button, with no dependency: `aria-expanded` over a list that is
    `hidden`, never unmounted; the arrows, Home, End, Escape, Tab and a press outside. It closes when its button is
    greyed. Its list has its own `[hidden]` rule and `z-index: 4`, over the flyer's canvas and the toasts.
  - `src/editor/clipboard.ts` is the one way the editor writes to the clipboard. `copyText()` and `copyImage()`
    answer "copied" or why not (`unavailable`: plain http, or too old a browser; `refused`), and never throw.
  - **`copyImage()` is called inside the tap, with a promise for the PNG.** A browser lets a page write to the
    clipboard only close to the tap that asked: Chrome refused a write started 6 s after it (measured,
    2026-10-12), and Safari refuses one started after anything was awaited. `run()` calls its `fn` before it
    awaits anything, for this. `clipboard.spec.ts` wraps `write` and fails if the call moves behind the save.
  - `src/editor/shareSheet.ts` has `canShareFiles()` and `sharePicture()`. The sheet takes no promise and opens
    only while its tap counts (5 s), so the picture is made first. When that took too long the toast says "The
    picture is ready." with "Share now". The caption goes on the clipboard at the tap, before the sheet.
  - The editor does not wait for the sheet. Its answer is a toast when it comes, and silent once another action
    has started (`turn`) or the page was left (`onScreen()`).
  - "Share now" can stay on screen for minutes, so it takes nothing for granted: it copies the caption again in
    its own tap, makes the picture again if the flyer or the canvas changed, is one sheet when pressed twice
    (`sheetAsked`), and is not offered once a frame has no photo.
  - A toast can offer one next step (`Outcome.action` in `Toasts.tsx`): "Copy the caption" after a picture is
    copied, and "Share now". Such a toast stays until the step is taken or it is closed (`leavesByItself()` in
    `toastFolds.ts`). A step taken from the keyboard keeps the focus with its toast (`keyboardIn`): on the close
    button of the answer, also when the answer is an error and so another node, and never on the warnings' chip.
  - `run()` notes what had the focus when an action started, and a control the action greyed gets the focus back
    when it is done. Only that: a photo dropped on the preview starts from no control.
  - Every way out saves first, and a save empties the server's picture cache. Two renders of one flyer can differ
    by a few pixels, so no test compares a copied picture with a later download.
  - Browser specs: `clipboard.spec.ts`, `toolbar.spec.ts` and `share.spec.ts`. The test browser has no share sheet
    (the spec stands one in) and refuses every clipboard write until its context is granted it.
  - `tests/editor.ts` has `download(page, format)`, `downloadMenu()`, `exportEntry()`, `pickExport()`,
    `copyImage()`, `barActions()`, `grantClipboard()`, `clipboardPng()`, `clipboardText()`, `noClipboard()`,
    `copyOfSample()`, `newFlyerNoPhoto()`, `stopClock()` and `clientOnlyEditor()`. No spec presses a download by a
    button's name.
  - The menu's Tab closes the list once the focus has left it (`onBlur`), never at the key: hidden at the key, the
    focus would set out from an element that is gone, which only some browsers follow.

## The leave guard

- Leaving the editor with unsaved work asks first, on every way out (`src/editor/leaveGuard.ts`).
  `src/editor/route.ts` cancels a refused move in the Navigation API's `navigate` event (every major
  browser since January 2026), so it never happens. A Back or Forward the browser won't let the page
  cancel (no fresh interaction) is let through, the page on screen stays, and the tab returns to its
  entry by key. Replace the current entry's URL through `replaceHash(from, to)` (the editor's first
  save), never with `history.replaceState` directly: it skips a page the user has left, and waits while
  such an undo is on its way. A late answer checks the page in the URL (`onPage`), not React's unmount,
  which comes a few tasks after the move. Browsers without the API route on `hashchange` and ask only
  on "← Library" and on leaving the page. `tests/unit/route.test.ts` drives `createMoveGuard` through
  every case, the uncancellable Back included; `tests/render/editor.spec.ts` drives Chromium.

## The Node server

- `server/` — Express 5 API, append-only SQLite migrations (`server/db/migrations.ts`), photo processing
  (sharp), Playwright export with a content-hash cache. Storage lives behind `server/storage/` (the
  `sqlite` and `json` drivers, chosen by `STORAGE` in `server/composition.ts`) and the copy tool.

## The PHP backend

- `php/` — **the second backend**: the same API on PHP 8.1+ with the JSON store, for shared hosting with no
  Node. `php/web/` is the release root (api.php, router.php, the .htaccess hardening); `npm run build:php`
  assembles `release/php/`. It is a peer of `server/`, never a fork: both answer `docs/api-contract.md`.

## Generated files

- `schema/`, `seed/samples.json` — **generated** (`npm run gen`) from `src/shared/`. PHP reads `schema/` at
  runtime, so a rule is written once in TypeScript and never hand-copied into PHP; `seed/samples.json` is read
  only by PHP's tests.

## The client export

- The export runs in the browser where a backend has no renderer (`src/editor/export/`): same `<Flyer>`,
  same `prepareFlyer()`, modern-screenshot. `tests/render/fidelity.spec.ts` holds it to the server export.

## The AI assistant

- The AI assistant: an idea → a flyer (`POST api/ai/flyer`), a flyer → its share text (`POST api/ai/share`), and a
  picture → its words (`POST api/ai/photo`, the `photo` feature, whose page is "From a photo" on `#/ai`), one
  contract on both backends (`docs/api-contract.md`, "The AI assistant").
  - `server/ai/` and `php/src/Ai/` are twins: the provider seam (`LlmProvider`: OpenAI, Anthropic, and a fake for
    the tests; which one runs is configuration, never code), the prompt builder, the service with its checks in
    the contract's order, and the actor and the policy, which are the seam a login will fill.
    `tests/fixtures/ai-*.json` pin both backends: a change to an adapter, the prompt or a schema dialect is a
    vector first. PHP's `HttpClientFactory` picks curl, or on a host without it a client whose every call is a
    typed failure (`ai_failed`, never a 500).
  - One source for everything shared: `src/shared/ai.ts`, the AI schemas in `schema.ts`, the rules in
    `ai/prompts/`, the examples in `docs/ai-flyers/examples/`. `npm run gen` writes `schema/ai.json` (the prompts
    with their limits, the few-shot, the schemas) and the `ai` block of `schema/shared.json`.
  - The model's answer only ever becomes data held to `AiFlyerAnswerSchema` / `AiShareAnswerSchema`. A flyer's
    answer always carries its share text (required there, not in `BriefSchema`): one generation is a whole flyer.
  - Settings: `AI_PROVIDER`, `AI_API_KEY`, `AI_FEATURES`, `AI_DAILY_LIMIT`, `AI_DAILY_LIMITS`, `AI_MODEL`,
    `AI_EFFORT`, `AI_TIMEOUT_MS`, `AI_ENABLED` in `.env` (Node); the `ai` block of `config.php` (PHP: `features`,
    `dailyLimit`, `dailyLimits` and the rest). Off without a key or with no feature named, and then nothing of it
    shows. The key never reaches `api/config`, a log line, the ledger, a release or git, and a refusal names a
    setting, never its value. `tests/fixtures/ai-settings.json` holds both loaders to one table.
  - Each feature has its own switch (2026-10-06): a site runs the features its settings name, and none until
    they are named (the owner's answer: a key alone runs nothing). The setting `AI_FEATURES` shares its name with
    the constant in `src/shared/ai.ts`, which lists every feature the app has.
    - The policy decides, in one place: `runs(feature)`, `mayUse(actor)`, `dailyLimit(actor, feature)`,
      `dailyTries(actor, feature)`. "The AI is on" is derived as "some feature runs". A feature that is off answers
      `ai_off` where the whole AI does.
    - `api/config` lists the features that run, and the client shows a feature only through `aiFor()`:
      `App.tsx` is the one place that asks. `flyer` off: no "Create with AI", and `#/ai` is the library.
      `share` off: no "Write with AI". `photo` off: `#/ai` has no switch, and is the page it was.
    - One feature off is proved in process on each backend, over the generated list of features
      (`tests/unit/ai-app.test.ts`, `php/tests/BootstrapTest.php`), with no server per case.
    - An older release refuses `features`, `dailyLimit` and `dailyLimits` (503): on a host the release goes up
      first, and the keys come out before going back (`docs/deploy.md`, "Rolling back").
  - Each feature has its own daily limit (2026-10-06, the owner's answer): a generation counts against its own
    feature alone.
    - The settings: `AI_DAILY_LIMIT` / `dailyLimit` is every feature's number (3 unless set, `AI_DAILY_LIMIT_MAX` =
      20 at most), and `AI_DAILY_LIMITS=share:10` / `'dailyLimits' => ['share' => 10]` a feature's own. Both
      loaders resolve a number for every feature.
    - `api/config` lists each running feature as `{ name, limit, remaining }`, and each route's `remaining` is its
      own feature's. `ai_quota` names what ran out, from `AI_FEATURE_NOUNS` (`aiQuotaVars()` fills the sentence).
    - The client keeps a count per feature: a limit reached empties that feature's alone. `aiFor()` shows a
      feature and `aiWithRemaining()` moves its count, both in `src/shared/ai.ts` and the only readers of the
      answer. They read it loosely: an entry they cannot read stays as it came and never costs the page, and an
      answer in an older shape shows no AI.
    - A picture read's failed tries are bounded too (2026-10-06, the owner's answers: "Yes, picture reads only",
      "Three times its limit", "The used-up sentence"). A failed read is free and keeps its picture, so nothing
      bounded them on a site with no lock.
      - One fact, `AI_TRIES_PER_LIMIT = { photo: 3 }` in `src/shared/ai.ts`, generated for PHP. It is no setting:
        a site's limit for the read moves its tries with it (3 reads, 9 tries).
      - `dailyTries(actor, feature)` answers a number, or null for the flyer and the share text, whose failed
        generations stay free however many.
      - What is left of a feature is the smaller of what is left of its limit and of its tries: one function in
        each service (`left()`), behind `api/config`'s `remaining` and each route's refusal. At none, the read
        answers the same `ai_quota` before its picture is kept.
      - `tests/fixtures/ai-tries.json` holds both services to it, in process: the contract suite's day never
        reaches the tries.
  - The ledger (`aiUsage` in each storage driver; `ai-usage/YYYY-MM.json` in the JSON store) keeps one append-only
    record per generation attempted. A feature's limit is counted from the Canary Islands day's `ok` records of
    that feature for the actor, and its tries from all of that day's records: today one anonymous actor, so
    site-wide. `countDay(actorId, day)` answers both for every feature from one read, because `api/config` asks
    on every page load. A ledger that cannot be read
    hides the AI (`status()` answers `enabled: false` and logs why) and never takes `api/config` down: the editor
    renders nothing without that answer. Node's drivers check a record before writing it (`checkedAiUsage`).
    A record of a feature a release does not know (a later release's, met after going back) counts under its own
    name on PHP and in SQLite, so it moves no count the release shows; Node's JSON driver refuses the month.
  - The client: `src/editor/AiPage.tsx` (`#/ai`, a focus page like the editor), `handoff.ts` (the unsaved flyer
    handed to the editor in memory), `panel.tsx` and `share.tsx` (what both focus pages share), and "Write with AI"
    in `Editor.tsx`. `fields.ts` holds what the panel calls each field: the editor's labels come from it, and
    `briefFieldLabel()` names a brief's key for "The AI assumed…" (an assumption's `field` is the model's to choose,
    so a key no field has is shown as written).
  - "From a photo" is the AI page's second way in (2026-10-06, stage 3 of `docs/prompts/ai-flyer-from-photo.md`): a
    switch, From your idea / From a photo, shown only where `photo` runs. Both ways end in the idea box.
    - `AiPhoto.tsx` is the photo way's form and makes no request: Choose a picture, drop and paste with a mouse,
      and Take a photo (a file input with `capture="environment"`) where the main pointer is a finger. That is CSS,
      `pointer: coarse` in `editor.css`: a laptop's browser ignores `capture`.
    - `AiPage.tsx` holds the chosen picture, so it survives the switch and the read. It shrinks it with the
      editor's `preparePhoto()` at `pictureLimits()` (the site's limits, the read's edge) and calls `api.aiPhoto()`.
    - The read stops at the words: the page shows the idea box with them, under the steps (below). Text already
      there is replaced only on a yes, asked before the read is spent. An empty read leaves the box as it was.
    - After a read the focus goes to the line under the box, which the box is described by. Not to the box: on a
      phone that raises the keyboard over the words.
    - With no flyer left today Read the picture waits, under the flyers' own used-up sentence: every way in ends
      in a flyer (my ruling, 2026-10-06, for Artur to confirm).
    - A failed read answers no count and is one of the day's tries. `App.tsx`'s `recount(feature)` then asks
      `api/config` again and moves that feature's count alone, through `aiFor()` and `onRemaining`.
    - A picture the route refuses (4xx, or the browser's own HEIC check) shows that message alone. Any other
      failure adds "Your picture is still here: try again, or type the event yourself." (Artur's line), while a
      read is left to try again with; a message that ends with no full stop gets one first.
      - "type the event yourself" is a link to the idea box (his ask, 2026-10-06): a button, `.linkish`. The
        sentence stays one constant (`PICTURE_KEPT`) and the link is cut out of it, so the pinned text cannot drift.
    - The leave guard is armed while words a read was spent on are in the box and in no flyer yet (`wordsRead`,
      which a later empty read leaves alone, and which ends when a flyer is made from them) and while a read is on
      its way. A generation on its way is not guarded, as before the stage.
      - "Open in editor" is a way out too: with such words in the box and an older flyer on the stage it asks the
        same question first (found in review, 2026-10-06). With their own flyer on the stage it asks nothing.
    - Artur's words on this page are pinned as literals in `tests/render/ai.spec.ts`: the two lines under the box
      ("Read from your picture. …", "The AI found no event in this picture. Write the event here yourself."), the
      added line, the step names, "Change the picture", "Use this picture as the flyer’s photo", "Uploading…" and
      "Adding your picture to the flyer…". He asked whether a slow read could be polled and chose "Nothing more
      now": the page already waits for the server, and the limit is the app's own `AI_TIMEOUT_MS` / `'timeoutMs'`,
      there for the shared host.
  - The photo way shows as three numbered steps (2026-10-06, a follow-up to stage 3: Artur's sketch and answers).
    He saw the page land on the From your idea tab after a read, where it starts, and it read as a step back.
    - `AiSteps.tsx`: "Picture", "Check the words", "Flyer". A read that found no event names the second "Write
      the event". A list, the current step marked `aria-current="step"`; the numbers are CSS, "✓" is text.
    - They show under the switch from the first tap on From a photo, at step 1 (his answer, over my advice). Once
      the picture on the page is read they stand in the switch's place, with that picture under them and "Change
      the picture". The hint under the title shows only where the switch does.
    - Nothing of it is stored: `read` holds the picture it was of, and `pictureRead` (`read.of === picture`) and
      the step follow from it. Another picture, or Remove, is a picture not read: From your idea is then the tab
      it was. Step 3 is for the flyer made from the picture on the page (`Result.picture`).
    - "Change the picture" goes back to choosing and keeps the words in the box.
    - Where the pressed button leaves with its screen, the focus is moved (one `focus` state): to the line under
      the box after a read and when the switch leads back to the steps, to From a photo after "Change the
      picture", into the box after the link.
    - A site without `photo`, and From your idea by itself, show no steps: the page as it was.
    - On a phone the three names are on one line at 390 px and at 360 px, his own phone's width (the `max-width:
      480px` block of `editor.css`).
  - The picture as the flyer's photo (2026-10-06, stage 4). The client alone: the upload is an ordinary `POST
    api/photos`, so no route, schema or PHP class changed.
    - A flyer remembers the picture it was made from, taken when Generate or Try again is pressed: the one on the
      page, once read (`Result.picture`). A picture with no event counts (his answer: "Yes, offer it").
    - On the result, in the bar above the flyer: "Use this picture as the flyer's photo", unticked. Offered while
      that picture is still the one on the page, and on an Activity flyer. A tick is kept by picture (`ticked`).
    - Ticked, `open()` is an action like the others (`busy: 'open'`): `preparePhoto(original, limits)` with a
      photo's own limits, never `pictureLimits()`, then `api.uploadPhoto()`. The button reads `PHOTO_UPLOADING`
      (`photoModes.ts`: the editor's own word, his answer) and the stage "Adding your picture to the flyer…".
    - A refusal keeps the page, with the photo route's message alone and the tick still set.
    - An answer that lands after the staff member left hands nothing over. It needs both checks: `onPage('ai')`
      for the first tasks after a move, and the page's own `here` ref for a page left and come back to.
    - `withPhoto()` in `src/shared/defaults.ts` is what a photo does to a flyer when it lands: the editor's
      `onFile` and the AI page both call it. `handoff.ts` carries the editor's own `Draft`, photo included.
    - Not built: the AI page's preview does not show the picture. The read's copy (`ai-pictures/`, 30 days) and
      the flyer's photo (`uploads/`) are two files, by the brief.
  - A picture is read into its words (`photo`, 2026-10-06; brief `docs/prompts/ai-flyer-from-photo.md`, stage 2).
    Artur's answers are in the brief and are not to be reopened: two calls (the read stops at the words, the flyer
    is the staff member's second call), the picture sent as a file, a read with no words counts, the picture kept
    30 days.
    - The seam carries a picture: a turn's content is a string, or parts (`LlmPart` in `server/ai/provider.ts`;
      the same arrays in PHP's `LlmCall`). A text turn goes out as the string it is. Each adapter fixture has a
      second call, `picture`.
    - A model per feature: `AI_MODELS=photo:<model>` / `'models' => ['photo' => '<model>']`. `AI_MODEL` / `'model'`
      is every other feature's. The call names its model (`LlmCall.model`); a provider is built from the key and
      the effort alone. One provider, one key and one effort per site.
    - One photo intake per backend, used by `api/photos` and `api/ai/photo`: `preparePhoto()` and `storePhoto()`
      in `server/services/photos.ts`; `Photos\PhotoIntake` (prepares) and `PhotoService` (stores) on PHP. The read
      prepares at `AI_PICTURE_MAX_EDGE` (2048) and never writes to `uploads/`.
    - The checks on `api/ai/photo`: the write guard, `ai_off`, `ai_forbidden`, the photo route's own checks, the
      reads' limit, the provider. On Node the switch is asked in front of multer (`admitPhoto` in `app.ts`).
    - The reader's rules are `ai/prompts/photo.md`; the answer is `AiPhotoAnswerSchema` (`{ text }`, at most
      `AI_INPUT_MAX`, trimmed by the service). No hostels, no day, no few-shot: the bundle never holds a picture.
    - The kept pictures (`server/ai/pictures.ts`, `Ai\AiPictures`): `<data folder>/ai-pictures/<Canary day>/`,
      written before the provider is asked, named by the ledger's one-line `input`, never held by it. `GET
      api/config` deletes what is past `AI_PICTURE_DAYS` (30), at most once a day (`.swept`), AI on or off: the
      one read that deletes. `deploy:backup` and `npm run copy` leave the folder out.
    - The fake answers a read with the first example's text, and is steered by the picture's width
      (`AI_FAKE.pictureWidths`: 11 invalid, 12 timeout, 13 refused, 14 no words).
    - `docs/ai-flyers/image-examples/` is the reads' eval set, never few-shot. A picture goes into git only after
      Artur has looked at it. `tests/unit/ai-image-examples.test.ts` holds each case.
  - No test touches a provider. The render suite has two projects: `render` (every spec but `ai.spec.ts`, the AI
    off whatever `.env` holds) and `ai` (`ai.spec.ts` on a second server with the fake, port 8798, every feature
    named and each feature's limit pinned in `playwright.config.ts`, since that server reads `.env` too; it spends
    all three of the flyer's, one of the share text's and two of the picture reads', with one failed read of the nine
    tries, and a test that needs another count, or a site that runs one feature, routes `api/config`). A picture is
    made in the spec with sharp, and must not be 11 to 14 px wide by accident: those widths steer the fake. The contract suite's `node-ai` and `php-ai` run the AI routes on the fake
    with every feature named, both on the JSON driver, so `ai.test.ts` can damage the ledger's file.
  - `npm run ai:smoke` (`scripts/ai/smoke.ts`) is the one thing that calls a real provider, by hand.
    `scripts/site.ts` is how a script calls a site's API (`flyers:post` too): it never follows a redirect.

## Releases and git

- Releases and git: a release's id names a build (two builds of one commit get two ids: composer's autoloader
  suffix), and `release.json`'s `commit` names its source.
  - `scripts/git.ts` says which commit a checkout is at. Always the commit, never a tag's name, and `-dirty` when
    anything outside `docs/` differs from it, a new file included.
  - `npm run deploy:tag` (`scripts/php/tag-release.ts`) makes the annotated tag `release/<id>` on that commit, for a
    folder or a site's address. It refuses a `-dirty` release, never moves a tag and never pushes.
  - `npm run deploy:update` (`scripts/php/update-deploy.ts`) puts a newer release over a local copy: backup, build,
    an additive copy, tag. A host is still updated by SFTP, then tagged with `deploy:tag`.
  - Git tests run on a throwaway repository (`tests/tempRepo.ts`): no test tags or builds from this one.
