# CLAUDE.md — Nest Branded Flyers Generator

Internal tool: Nests Hostels staff fill in a form, drop a photo, download the flyer as a 1080 × 1920
Instagram story or a 1080 × 1440 WhatsApp image (one flyer, two output canvases). Read `README.md` (how to run and deploy) and `design_handoff_flyer_generator/README.md` (the spec:
geometry, tokens, fit algorithm, data model, API, export) before changing anything visual or structural.

## Commands

```sh
npm run dev            # Express + Vite middleware on http://127.0.0.1:8787 (API, editor, render page)
npm run seed:dev       # hostels + built-in doodles into ./data/flyers.db (idempotent)
npm run seed:samples   # the six design records and three This week flyers, both stress tests included (dev only)
npm run typecheck      # client + server
npm test               # Vitest: shared logic, shared vectors, the editor's history guard, storage contract per driver,
                       # generated files current
npm run test:contract  # HTTP contract suite on every backend, php-basic (behind a login), php-access (the lock over
                       # HTTP), cross; CONTRACT_BASE_URL (+ _BASIC_USER/_PASSWORD) in .env targets a deployment
npm run gen            # regenerate schema/*.json, seed/samples.json, the error table in docs/api-contract.md
npm run gen:art        # remake the template's blobs and photo sparks in each other's ink (four derived files in assets/art/)
npm run test:render    # builds, then Playwright render/export checks + client-export fidelity
npm run test:php       # PHPUnit (PHP_BIN picks the interpreter; composer test in php/ does the same)
npm run test:php-smoke # the editor driven against the PHP backend in a browser
npm run build:php      # the shared-hosting release in release/php/ (with release.json), and the preflight page beside it
npm run deploy:backup  # a local deployment's library to ./backups/ (deploy:restore, deploy:reset); docs/deploy.md
npm run deploy:update  # a newer release over a local copy of a deployment: backup, build, additive copy, git tag
npm run deploy:tag     # the git tag release/<id> for a deployed release (a folder, or a site's address); never pushes
npm run copy           # move a library between storage drivers (SQLite <-> JSON files)
npm run ai:smoke       # one real AI generation by hand, with .env's AI_PROVIDER and AI_API_KEY (--share: a share text;
                       # --photo <picture | image example .json>: a picture read, --save <file> the picture as sent;
                       # --to <app root>: through a site, spending one of that feature's generations for the day; it
                       # stops before spending when the feature it would call is off there). Never part of a test
npm run compare:design # reference pixel-diff vs the prototype (dev server running)
npm run build          # vite build → dist/, tsc → dist-server/
```

Before calling work done: `npm run typecheck && npm test && npm run test:contract && npm run test:render` all green, and look at UI
changes in a real browser (Chrome) — the preview and a downloaded export.

## Architecture (where things live)

- `src/flyer/Flyer.tsx` — **the only renderer.** The editor preview and the export page both mount it.
  Never create a second renderer (canvas redraw, server template, etc.): if preview and export can drift,
  they will.
- `src/flyer/fit.ts` — the prototype's `_fit()` (two-pass shrink-to-fit), with one departure: the height pass stops
  each line at its own `data-fit-min` floor, where `_fit()` scaled the whole box down to 0.55 (the owner's call,
  2026-09-30). Keep the `data-fit*` attributes. `ready.ts` loads fonts/images and fits before any export.
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
- A flyer prints in a look (2026-10-14; the design is `docs/prompts/looks-seam.md`, the report
  `docs/reports/looks.md`). Stages 1 to 4 of 7 are built: the hand-drawn look is a registry entry the one renderer
  reads, a flyer stores its look, and a site names the looks its staff may pick. Staff see nothing of it: there is one
  look, and no switch until stage 6.
  - **`src/shared/looks.ts` is the registry**, zod-free and DOM-free: a look is one entry, in its own file
    (`looks/handDrawn.ts`). `lookOf(data)` is the look a flyer prints in, read loosely: none, or an id this release
    does not know, is hand-drawn. `registerLook()` adds one only before anything reads the registry (the tests' own
    build, stage 5). A look's id is forever once a release accepts it.
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
  - `tests/unit/looks.test.ts` holds every look: its boxes, its contrast, its art files, its faces (a family of
    `fonts.ts`, a pinned package, imported by `src/flyer/fonts.css`), its pill's tilt within `PILL_TILT_ROOM`.
  - The baseline (`tests/render/baseline.spec.ts`) shoots both canvases and flyers with their own colours.
  - **`data.look` is an enum of the registry's ids**, default `FIRST_LOOK`, the last key of the data (after the
    labels; PHP compares stored files key for key). `newFlyerData(template, look)` writes it, and hand-drawn's
    `colors` and `doodles` whatever the look. Unlike a label it is held to the list: a look's id is never taken back,
    so only going back meets one a release does not have. Then PHP opens it as stored (drawn hand-drawn) and refuses
    its save at `data.look`; Node lists it and does not open it (`docs/deploy.md`, "Rolling back"). A flyer with no
    look reads hand-drawn. No migration.
  - **`schema.ts` reads `lookIds()` when it loads**, and `loadConfig()` when it runs: either seals the registry, so the
    tests' proof look (stage 5) is registered before both.
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
  - `fitKey` in `Preview.tsx` does not hold the look yet: it comes with the switch (stage 6), with its spec.
- `src/editor/` — editor + library UI. `render.html` + `src/render/` — the bare page headless Chromium shoots.
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
- The library ends with the main reception flyer (2026-10-13, Artur's ask): the printed poster whose QR leads to the
  experience page, shown whole and centred under the cards, with "Download PNG" and "Download PDF".
  - The two files are `assets/main-flyers/V7-check.png` and `Simple QR flyer for Nest V7.pdf`, served like any asset
    on both backends and shipped by the release's `assets/` copy. `MAIN_FLYER` at the top of `Library.tsx` names
    them and the names they download under: a newer version is those two paths.
  - It is not a flyer of the list: no card, never filtered, shown with an empty library too. A dedicated page
    (instructions, versions, styles) is his later ask and is not designed. Specs: the last two of
    `tests/render/library.spec.ts`.
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
- `server/` — Express 5 API, append-only SQLite migrations (`server/db/migrations.ts`), photo processing
  (sharp), Playwright export with a content-hash cache. Storage lives behind `server/storage/` (the
  `sqlite` and `json` drivers, chosen by `STORAGE` in `server/composition.ts`) and the copy tool.
- `php/` — **the second backend**: the same API on PHP 8.1+ with the JSON store, for shared hosting with no
  Node. `php/web/` is the release root (api.php, router.php, the .htaccess hardening); `npm run build:php`
  assembles `release/php/`. It is a peer of `server/`, never a fork: both answer `docs/api-contract.md`.
- `schema/`, `seed/samples.json` — **generated** (`npm run gen`) from `src/shared/`. PHP reads `schema/` at
  runtime, so a rule is written once in TypeScript and never hand-copied into PHP; `seed/samples.json` is read
  only by PHP's tests.
- The export runs in the browser where a backend has no renderer (`src/editor/export/`): same `<Flyer>`,
  same `prepareFlyer()`, modern-screenshot. `tests/render/fidelity.spec.ts` holds it to the server export.
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
- Releases and git: a release's id names a build (two builds of one commit get two ids: composer's autoloader
  suffix), and `release.json`'s `commit` names its source.
  - `scripts/git.ts` says which commit a checkout is at. Always the commit, never a tag's name, and `-dirty` when
    anything outside `docs/` differs from it, a new file included.
  - `npm run deploy:tag` (`scripts/php/tag-release.ts`) makes the annotated tag `release/<id>` on that commit, for a
    folder or a site's address. It refuses a `-dirty` release, never moves a tag and never pushes.
  - `npm run deploy:update` (`scripts/php/update-deploy.ts`) puts a newer release over a local copy: backup, build,
    an additive copy, tag. A host is still updated by SFTP, then tagged with `deploy:tag`.
  - Git tests run on a throwaway repository (`tests/tempRepo.ts`): no test tags or builds from this one.

## Non-negotiables (from the handoff — don't "fix" them)

- Safe zones are hard limits **per canvas**: the story's 250 top, 300 bottom, 70 sides; WhatsApp's 40 all
  round. Text/blocks stay inside; only art (and the full-bleed photo, horizontally) may enter the margins.
- `#53CED1` is never text on cream (contrast). Text teal is `#0D6F82`. Orange `#EA580C` is never flyer ink.
- Fonts are self-hosted (@fontsource, pinned); family names only in `src/shared/fonts.ts`.
- Optional fields collapse — no placeholders, no empty boxes, no dangling `·`.
- The hand-drawn style deliberately departs from the Nests website design system. Keep it.
- No login by design, so: loopback bind by default, every write needs the `X-Nest-Flyers: 1` header
  (defined once in `src/shared/writeGuard.ts`; PHP reads it from `schema/shared.json`), and the app must never
  be publicly reachable without an access rule.
- Never invent hostel names — only Artur supplies them (`seed/hostels.json`).

## Design decisions already made

- The team's layout pass (2026-09-18) departs from the prototype on purpose: headline at 345, sparks
  anchored to the photo's top corners, no clock. The numbers live in `layout.ts` / `looks/handDrawn.ts` with
  comments. `compare:design` is a reference report now, not a gate.
- Photo crop is stored per flyer in `data.photoCrop` (focal x/y + zoom ¼–4×, free positioning, the photo's
  centre stays in the frame).
- Output canvases (2026-09-23, `docs/reports/output-canvases.md`): the canvas is how a flyer is printed,
  never flyer data (a per-viewer toolbar choice; the export API takes `canvas`, default `story`). One crop
  serves every canvas because each photo frame keeps the story's aspect per mode. The template art follows
  each canvas through render-only anchors (`resolveDoodles`), so stored doodles never changed and an older
  release still reads every flyer. Every canvas is fitted in the editor, the others offscreen with the same
  `<Flyer>`. The story renders byte-identical to before (`tests/render/baseline.spec.ts`, opt-in).
  A viewer who never chose sees WhatsApp (`DEFAULT_CANVAS`, the owner's answer, 2026-10-05): the editor (a stored
  choice still wins), the AI page's preview and the library's pictures. It is the screen's default alone: the
  export API and the render page keep `story` for a request that names no canvas.
- The owner's editor pass (2026-09-28) supersedes two handoff lines; the handoff itself stays as
  delivered:
  - a new flyer, and a photo dropped on "No photo", land "In a frame" (`DEFAULT_PHOTO_MODE` in
    `defaults.ts`; §1 item 4 said full bleed);
  - the copy may use `MAX_EXCLAMATIONS` exclamation marks (`copyRules.ts`), and the tag pill's own
    is free (§12 bullet 1 allowed one per flyer, which the pill always spent).
- The This week template (2026-09-29, `docs/reports/week-template.md`; the owner's answers are quoted there):
  - §3's "22px between week rows" is superseded: 15 px, as §2 explains (at 138/22 the fifth row crossed the ask).
  - The title lines are the headline's fields (`text.headline1/2/headlineEs`), prefilled and editable; the
    Spanish line follows the hostel while it still reads as the default. The handoff's §6 table marked those
    fields Activity-only and the prototype fixed the lines: both superseded.
  - Rows are typed, or taken from a saved Activity flyer as a copy. Fewer than five sit at the top of the
    five-row box. Switching template keeps every field; only untouched defaults follow (`switchTemplate`).
  - A price with a `·` prints on two lines, as the COST chip does.
  - The row departs from the prototype in four places (`Flyer.tsx`, `WeekRow`): the time and price are capped
    at 250 px so a long one shrinks instead of squeezing the name, the name can shrink below its longest word,
    every empty cell collapses, and the day wraps in its own fit box (114 px, 2026-09-30), so a day too tall for
    the row shrinks instead of spilling out. A shrunk day that wraps again can end its highlighter a few px past
    the column, and the editor then calls it cut off: accepted by the owner rather than changing `fit.ts`.
  - The photo-corner sparks hang from the first row's corners, 7 px lower (`artDrop`: their tilted ink
    otherwise reaches into the title box). WhatsApp's week: title 162/250, rows 464 → 1134. Both signed off
    from proof sheets on 2026-09-29.
  - English and Spanish fields carry a drawn flag in the editor (`LangFlag.tsx`; emoji flags are letters on
    Windows). Nothing of it reaches a flyer.
- The open items (2026-09-30, `docs/reports/open-items.md`; the owner's answers are quoted there):
  - The fit's height pass stops each line at its floor (`fit.ts`). At its floors the stress sample's address takes
    three lines, and on the story its WHERE chip runs 2 px into its own padding, so it counts as clipped and the
    editor says so: accepted by the owner, and the render tests expect exactly that chip.
  - An untitled week flyer whose English title lines are still the defaults is named `This week · <hostel> · <day>`
    (`libraryName`, `names.ts`); every automatic name is cut to the title's 80 code points.
  - Per-hostel badges: one round "ONE PASS · Nest" badge per hostel, in its colour, at `assets/logos/<slug>.png`
    (256 px PNG, transparent outside the disc; the handoff's `uploads/logos/` is superseded: the release ships
    `assets/`). A hostel prints its badge through `logo_path` in `seed/hostels.json` (all 14 on). Which marks print
    is `EYEBROW_MARKS` in `defaults.ts`: `'nests'`, `'hostel'` or `'both'` (the badge beside the wordmark, 20 px
    apart), one setting for every flyer and never per flyer; the owner chose `'both'` for a pilot and will settle on
    one after it. A badge that fails to load drops out, and `ready.ts` waits for what takes its place. The marks may
    shrink in their 56 px row, so the widest eyebrow never pushes them past the safe edge.

- The tag pill, and the art that follows the copy (2026-10-12, the editor's UX round, Part 4; his answers are
  quoted in `docs/reports/editor-ux.md`). All of it is in the renderer: **never change a number or a slug in
  `DEFAULT_DOODLES`**, every stored flyer carries a copy and `sameDoodles()` is how an untouched set is known.
  - The pill is one fitted line: the handle, the dot and the tag shrink together to fit the safe column, down to
    0.7. Only the letters shrink. Past the floor the line is cut at the pill's edge and the editor says so. The
    pill stays 1 px inside its column (`PILL_TILT_ROOM`): its tilt lifts a corner.
  - The tag may be 24 characters (was 12); the handle keeps 18. Needs a release: an older one refuses a longer
    tag (`docs/deploy.md`, "Rolling back").
  - The spark off the pill's end hangs from the pill (`pillEnd` in `artAnchors`; it took the place of `floor`).
    `Flyer.tsx` draws it inside a box that is the pill's own before its tilt, so the browser places it and nothing
    is measured. `DEFAULT_PILL_WIDTH` is only how its stored place becomes an offset from the pill's end.
  - A flyer that prints no pill prints no such spark (Artur, 2026-10-13: "The toggle show pill should also remove
    the sparks under it"; it was kept where the default pill would end). No pill is the switch off, or no handle
    and no tag.
  - The corner blobs print in each other's ink, teal left and yellow right (`SWAPPED_INKS` in `looks/handDrawn.ts`).
    His answer to a teal spark lost on the teal blob: the blobs stay under a long pill, and "let's invert the
    blob colors".
  - The two sparks on the photo's corners trade inks too, yellow left and teal right (Artur, 2026-10-13: "Invert
    also the image sparks on the top"; on 2026-10-12 he had left them). So the two inks cross again from the
    flyer's top to its bottom. On a week flyer they are the sparks on the first row's corners. The spark off the
    pill keeps its teal: `SWAPPED_INKS` names where each swapped file hangs, since that spark is the left one's
    drawing.
  - The four swapped files are derived by `scripts/art-inks.ts`, never drawn by hand, and are not in the seed's
    doodles. Both inks are read off the blobs, whose scans are flat; the sparks' are speckled.
  - The pencil hangs from the end of the ask's block of copy, 14 px after it and 10 px above its top (his pick of
    two: "same size, higher"). From the block's end, not the English line's: under a short English line it would
    lie on a longer Spanish one.
  - Art someone arranged by hand is drawn as stored, places and inks.
  - The story's byte-identical baseline ended here: the pencil is on every flyer with an ask. He signed a sheet of
    every sample before and after instead, and another for the sparks' inks. Take a capture before the next change
    that must not move the drawing.
  - Browser specs: `tests/render/art.spec.ts` (the spark, the inks, the pencil) and `pill.spec.ts`.
    `tests/render/drawn.ts` draws a payload the API would refuse (`newPayload()`, `drawPayload()`, and the long
    pill's copy, `HANDLE_18` and `TAG_24`).

- The WHEN chip's time and the Spanish line (2026-10-09, Artur's flyer #13 on live):
  - The time under the day is one line that shrinks (`nowrap`), as a week row's is: his browser broke `09:15-14:00`
    after the hyphen and the chip clipped `14:00`. Chromium keeps that range whole, so `render.spec.ts` proves it by
    the day line, which a long time no longer shrinks.
  - The Spanish line may be 260 characters (was 140): a description of three or four lines. With a photo about 210
    fit at its floor; past that the editor says it is cut off. The asks keep 60 and 70: one line each in a 760 px
    column beside the pencil, already at their floor with a phone number. Needs a release: an older one refuses a
    longer line. The AI's prompt keeps its rules as they are (Artur, 2026-10-10): only staff get the room.
  - Two copy warnings are gone (Artur, 2026-10-10: "unusefull for me"): "Book now" and a slash as a separator
    (`copyRules.ts`). The AI's prompt still asks for neither. Left: bullets, the exclamation budget, sentence case.

- The AI's copy follows the owner's own flyers (2026-10-06). He corrected flyers #4, #5 and #8 by hand on the live
  site, then asked for the same as rules. The rules are the prompt files in `ai/prompts/`; the two examples in
  `docs/ai-flyers/examples/` and the picture case carry them, and `tests/briefRules.ts` holds every example to them.
  One exception, his own: the first example prints `Free` for a text that names no price, because he answered
  "Free" for that flyer. The rule won over it in the real check, seen once.
  - **A price the text does not give is not printed:** no COST chip, no price line in the share text, and a note in
    "The AI assumed". It supersedes his rule of 2026-10-04 ("Ask at reception"). "Free" still needs the word.
  - **No full stop ends a title line:** `headline1`, `headline2` and the Spanish line. The ask keeps its own. The
    This week template's built-in title ("this week.") is left as designed, by his answer.
  - **The share text is English first,** then the line `-- 🇪🇸 --` (`SHARE_SPANISH_BREAK` in `share.ts`), then
    Spanish. The English is written for English-speaking guests, not turned word for word. A long caption gets
    "🇪🇸 Español abajo 👇" after its hook. The editor's placeholder shows the same order.
  - **A start and an end print as one range in WHEN,** with a hyphen and no spaces (`17:45-23:00`, as on his Teide
    flyer): with spaces around the dash it broke over two lines in the chip. The asks' own words on those live
    flyers were not asked for as rules and are not in the examples.
  - Checked with five real generations on `gpt-6-luna` (the report has each): every rule held, and a board of
    four activities came back as a This week flyer, seen once.

## How to work here

- **SOLID and DRY, always** (the owner's standing rule). Infrastructure sits behind interfaces with
  config-selected implementations that are substitutable (Liskov) — prove substitutability with shared
  contract tests run against every implementation. One source of truth per fact (schema, seed, layout,
  renderer); generate derived copies rather than hand-maintaining them. No speculative abstractions
  beyond real seams.
- Match the surrounding code: inline styles in the renderer, no global CSS resets in the editor (they
  leak into the flyer), functional state updates, comments that explain *why*.
- Data changes go through a new migration; never edit an applied one.
- The owner often runs `npm run dev` (tsx watch). Server/shared edits restart it and reload the editor —
  warn before large edits if they may have unsaved work.
- Git: work on a feature branch, commit only when asked, never push unasked.

## Status

- Done: handoff build steps 1–6 (branch `feat/flyer-generator-mvp`).
- Done: step 8, the This week template, on every canvas and both backends (branch `feat/week-template`,
  2026-09-29). The brief is `docs/prompts/week-template.md`, the report `docs/reports/week-template.md`.
- Done: the This week follow-up (branch `feat/week-template-followup`, 2026-09-30; brief
  `docs/prompts/week-template-followup.md`, report: the "Follow-up" section of `docs/reports/week-template.md`).
  - Staff see a named red note when a taken row can't join, a "Try again" when the saved flyers can't load, and
    one action at a time in the editor (a photo dropped meanwhile is refused with a reason).
  - The library applies only its latest answer, and a long day shrinks inside its row.
  - The samples read the hostels' names from `seed/hostels.json`, and eight gaps in the tests are closed.
  - `baseline.spec.ts` takes every sample, lists its cases in `manifest.json`, and names what it skips.
  - Declined by Artur: flagging a slash between two times (`15:00/17:00`).
- Done: the open items (branch `feat/open-items`, 2026-09-30; brief `docs/prompts/open-items.md`, report
  `docs/reports/open-items.md`): the fit's floors, an untitled week flyer's name, the per-hostel badges (a pilot
  at `'both'`), `copy.test.ts`'s timeout, and the baseline's overlays, which are now shot from a context with no
  route (a route made Chrome's raster vary from load to load). Both proof sheets signed off; committed, unpushed.
- Built: flyers from staff text, and the share text (branch `feat/flyer-briefs`, 2026-10-01; the plan's record is
  `docs/ai-flyers/README.md`).
  - `data.share` is a caption saved with the flyer, and never printed. It is defaulted, so no migration; an older
    release drops it (live has kept captions since release `d1f7ddb40170`, 2026-10-01).
  - Staff copy it with "Copy text" under the caption in the panel. A small "Share text" pill also floats over the
    stage's corner and copies it in one tap: bottom-left on desktop, bottom-right on a phone. It takes no layout
    space, so the flyer keeps the whole stage (Artur's markup, 2026-10-01: a card under the preview took too much).
  - `npm run flyers:post` saves briefs on a site through its API (`FLYERS_BASE_URL`, or `--to`). It is idempotent,
    and it records each save in the example file.
  - `docs/ai-flyers/` holds every staff text with its brief (`examples/`): the AI assistant's few-shot and eval
    set. Add a correction there every time Artur makes one. The rules themselves are the prompt files in
    `ai/prompts/`.
  - Seen 2026-10-01: the live host reported `Disk quota exceeded` on `data/` and `uploads/`. Artur freed the IONOS
    space the same day.
- Built: the AI assistant (branch `feat/ai-assistant`, 2026-10-02 to 2026-10-04; brief `docs/prompts/ai-assistant.md`,
  continued by `ai-assistant-continue.md` and `ai-assistant-continue-phase5.md`; report
  `docs/reports/ai-assistant.md`). Committed, unpushed.
  - A "Create with AI" page (`#/ai`) and a "Write with AI" button in the editor's Share text section, on both
    backends, with OpenAI and Anthropic behind one seam. Artur's Phase 0 choices (2026-10-02): `gpt-6-luna` and
    `claude-haiku-4-5` as the default models.
  - Both providers answered real calls on 2026-10-04 (`npm run ai:smoke`), and one went through PHP on the Laragon
    copy.
  - The real calls found one fault, since fixed: Anthropic left the optional share text out, so
    `AiFlyerAnswerSchema` requires it.
  - Not on the live site yet. IONOS needs the new release, then the `ai` block with a key (`docs/deploy.md`, "The
    AI assistant"). Artur allowed it on live while it is unlocked (2026-10-02): the cap keeps it at 3 a day.
  - Known limits: two concurrent requests can both see `remaining: 1` (and so a burst passes the picture read's
    tries together: found on 2026-10-06, for Artur to decide); `claude-haiku-4-5` retires no sooner than
    2026-10-15 (a default: one line of settings changes it); IONOS's FastCGI time limit is unmeasured until a live
    call; Anthropic's first call after the answer's schema changes takes about 20 s of the 25 s limit; a long staff
    text (a thousand characters) takes 14 to 20 s on `gpt-6-luna`, where a short one takes 6 to 9.
- Done: the AI assistant, closed (branch `feat/ai-assistant-followup`, 2026-10-05; brief
  `docs/prompts/ai-assistant-followup.md`; the report's *Follow-up* section). `main` is fast-forwarded to it,
  locally; nothing is pushed.
  - The review (2026-10-05, another model, changed nothing) found F1 to F4 and two suspicions. Artur: "Do
    everything". All fixed, each test first: the ledger never takes `api/config` down, the adapters and the
    ledger agree on field types, `__proto__` as an assumption's field, no bundle read when off, one home for the
    field names, a staff text cannot close its own fence, a key with a line break is refused by name.
  - The AI was used in a browser with a real provider on both backends, with Artur's own staff text. The Claude
    extension was not connected, so it was Playwright's Chrome, step by step. Two things looked wrong and were
    fixed: with none left the page said nothing about midnight, and "one of the 1 generations".
  - The five known items are done: PHP without curl, a brief's blanks (`flyerFromBrief`, `printedExtras`), "never
    Free" for a missing price (an invitation is not a price: seen to hold on both providers), the stretching
    example's notes, the `fetchJson` test's room.
  - Releases: `deploy:update`, `deploy:tag`, three tags (`release/d1f7ddb40170` live, `release/8b9c8556afa1` and
    `release/3f909ea91548` the Laragon copy). The copy runs `3f909ea91548` with the AI on (its key is set again).
  - Left then, Artur's: the release and the key on IONOS. The steps are in the next entry, which changed them
    (the block names its features, and the smoke takes `--share`).
  - For Artur to decide (the report has each): a text with both "daily" and "tomorrow" printed "Every day";
    `"autoloader-suffix"` in `php/composer.json` would make a release id repeatable.
- Done: the AI's feature switches, three editor changes and the library's pictures (branch
  `feat/ai-feature-switches`, 2026-10-06; the brief was pasted into the session, the report is
  `docs/reports/ai-feature-switches.md`). `main` is fast-forwarded to it, locally; nothing is pushed.
  - Artur's answers (2026-10-05, quoted in the report): none until named; the cap a setting, 3 by default and
    20 at most; WhatsApp the default on screen only; the library's pictures always WhatsApp, in today's row with
    a thumbnail; the placeholder in English; the Laragon copy left with the share text alone.
  - A fresh-context review found no way for a switched-off feature to run, be spent, be recorded or be shown.
    Seven of its points were fixed, each with a test that failed first: among them a blank page when the
    client met a backend older than itself (`aiFor` now reads any answer it does not know as "no AI").
  - The Laragon copy ran release `2ad58f28364e` then (tag `release/2ad58f28364e`, on `2c9e5f8`) with
    `'features' => ['share']`; since the photo checkpoint it runs `8c7a635bd009`, still the share text alone
    (below). This machine's `.env` has `AI_FEATURES=flyer,share`.
  - Three real generations, all captions on the Laragon copy: 5.4, 3.7 and 5.3 s.
  - Left, Artur's, in this order: `npm run build:php` and upload, then `npm run deploy:tag -- <the site>`; the
    `ai` block in live's `config.php` with `'features' => ['share']`, never before the new release is up;
    `npm run ai:smoke -- --share --to <the site>`, once, whose seconds measure the host's time limit.
  - For Artur to decide (the report has each): a small copy of each photo for the library's pictures (both
    backends and a backfill); where a refused `config.php` logs its reason (the host's own PHP log today, not
    `data/php-errors.log`); Node reads a few number spellings PHP refuses; the Node start-up line prints
    `AI_MODEL` as typed.
- Done, closed by Artur on 2026-10-07: a flyer from a photo (brief `docs/prompts/ai-flyer-from-photo.md`, four
  stages; report `docs/reports/ai-flyer-from-photo.md`, one section per stage built, and one for the follow-up to
  the page). Designed with Artur on 2026-10-06: his answers are quoted in the brief, and are not to be reopened.
  Nothing is pushed, `main` is at `684189e`, and the release to IONOS is his.
  - **Stage 1 is done: a daily limit per feature** (2026-10-06, on `feat/ai-feature-switches` by Artur's choice,
    on top of `684189e`). `main` stays at `684189e` until he says; nothing is pushed.
    - A review found no defect in the counting, the settings or the wording on either backend. What it and the
      look found is fixed, each test first: a `null` entry in `api/config`'s list that took the page down
      (`aiWithRemaining()`), the browser suite's unpinned limit, "Try again (uses one of 0 left)".
    - The look ran in Playwright's Chrome on both backends, with the fake: nothing was spent, and no provider
      was called in the stage. The Laragon copy, `.env` and the live site were not touched.
    - No release was built. A host needs the release first and `'dailyLimits'` second.
    - For Artur to decide (the report has each): the sentence at a limit of 1 ("Today’s 1 AI share texts are used
      up"); a feature with nothing for its number is refused (`['share' => null]`); the words "Try again (none
      left today)".
  - **Stage 2 is built: the read, on both backends, with no page** (2026-10-06, on `feat/ai-feature-switches` by
    Artur's choice again: "Stay on feat/ai-feature-switches"; 14 commits on top of `650d3a9`, committed as each
    piece went green, on his standing go-ahead for the stage). Nothing is pushed.
    - With `photo` not named the app looks and behaves as before: the baseline is byte-identical (32 cases).
    - A fresh-context review found no way for a switched-off read to run or spend. What it found is fixed, each
      test first: among them a 500 on Node for a file under another field's name, and a clean-up of kept pictures
      that one stuck folder stopped for good.
    - **Its checkpoint, taken up in a later session the same day** (the report's *The checkpoint*; five commits
      on top of `747e4c8`, each as it went green on Artur's word; the gates all green on `43aa907`):
      - Artur's answers: stay on this branch, for the checkpoint and stage 3; a number of tries for the read alone,
        three times its limit, with the used-up sentence (built, above); the reader's prompt's words are settled
        after the real reads; the first case goes in as it is; a PNG with transparency is left, a known limit.
      - The first case is in git as the read sends it: a JPEG of 154 KB from the server's own intake. The test
        holds a case to the read's format. Artur's 1.4 MB PNG is in `backups/image-examples-originals/`, which git
        ignores.
      - **The real reads are done** (2026-10-06, on his go: eleven pictures, 40 reads, about 19 cents, on
        `gpt-6-luna`, `claude-haiku-4-5` and the middle model of each provider, `gpt-6.1-sol` and
        `claude-sonnet-5-5`). His ten pictures are in `backups/photo-reads/`, which git ignores; some are no
        event, on purpose. The report has every row. What they say:
        - Printed posters and screenshots: every model reads them.
        - Handwriting: both fast models wrote a wrong time on a board, three reads of three each, with no `[?]`.
          Both middle models read it right. `gpt-6.1-sol` had no misread on any picture.
        - A picture that is no event still gives its words; no model made an activity out of erased chalk.
        - Seconds of the 25: `claude-haiku-4-5` to 4.0, `claude-sonnet-5-5` to 11.5, `gpt-6.1-sol` to 17.7,
          `gpt-6-luna` to 20.7.
      - **Artur's choices from that table, all built:** `gpt-6.1-sol` reads pictures on OpenAI, and the read runs
        on each provider's middle model by itself (`AI_FEATURE_DEFAULT_MODEL` in `src/shared/ai.ts`; on Anthropic
        `claude-sonnet-5-5`). That default wins over `AI_MODEL` / `'model'`, which is the flyer's and the share
        text's: only `AI_MODELS=photo:…` changes it (my ruling, in the report). 2048 px stays. The reader's
        prompt gained three rules: a brand printed on a board or its frame is left out (a poster keeps what it
        says of its own event), each activity of a board goes on one line, and a picture that announces no event
        answers empty.
      - **Eleven check reads on `gpt-6.1-sol` with those rules:** no fact misread on any picture. Known from them:
        the dense website screenshot took 12.7 to 21.9 s of the 25 s over three reads. Only `npm run ai:smoke`,
        by hand and on his go, called a provider: 52 reads and 5 generations in all, about 28 cents.
      - For stage 3's words: an empty answer can now mean "no event", not only "no words".
      - **The checkpoint is closed.** Stage 3 is for a new session, by his word: its standalone prompt is
        `docs/prompts/ai-flyer-from-photo-stage-3.md`.
      - One read went through the Laragon copy, on his word: `gpt-6-luna`, 7.4 s with the upload. The copy now
        runs release `8c7a635bd009` (tag `release/8c7a635bd009`, on `a10e92f`), and is left with the share text
        alone, as he said.
      - The case's `source` is as its picture prints it, line for line and capital for capital (his answer).
    - No release was built. A host needs the release first, then `'models'` and `'photo'`; both come out before
      going back (`docs/deploy.md`, "Rolling back").
  - **Stage 3 is built: the page, "From a photo" on Create with AI** (2026-10-06, on `feat/ai-feature-switches`,
    twelve commits on top of `ceea60f`, each as it went green on his word). Nothing is pushed.
    - It is the client alone, on both backends: the architecture section above says how it works. With `photo` not
      named the page is as it was, and the baseline is byte-identical (32 cases).
    - Artur's answers: the empty read's line ("The AI found no event in this picture. Write the event here
      yourself."); the line after a failed read; no polling and nothing more for a slow read ("Nothing more now");
      the phone test from this PC over the office Wi-Fi, with the fake.
    - The look ran on both backends, desktop and phone, in the installed Chrome driven by a script, on the fake:
      nothing was spent. 20 of 23 pairs of screenshots are the same file on both backends.
    - A fresh-context review of `747e4c8..61cd7ec` found no way for a switched-off feature to run or leak. What
      it found is fixed, each test first: among it, words that lost their leave guard after a second, empty
      read, a read on its way that leaving did not ask about, and "try again" over a button with none left.
    - **The real phone was tried the same evening** (his Galaxy S23, Chrome, the fake provider): Take a photo
      opened the camera, Choose a picture the gallery, and both reads worked. The browser shrank each camera-sized
      photo to 1153 × 2048, and the server kept it upright. Not tried there: Generate, a sideways photo, an iPhone.
      The two pictures are in `backups/phone-test-2026-10-06/`, outside git.
    - A phone reaches this PC over the PC's own hotspot (`192.168.137.1`), with the server bound to that address
      alone. A hostel's Wi-Fi keeps its devices apart and is no closed network: the app is never served on it.
    - **The checkpoint has all it asked for.**
  - **The follow-up to the page is built: numbered steps, and a link** (2026-10-06, in the session of
    `docs/prompts/ai-flyer-from-photo-stage-4.md`, on `feat/ai-feature-switches` by his word, a commit per piece).
    - It is his observation: after a read the page looked like a step back, to the tab it starts on. Of three
      shapes he chose **"Numbered steps"** (over my advice, "One way forward"). The architecture section above
      says how it works.
    - His answers in that session: the steps show **"From the first tap on From a photo"** (over my advice, "Once
      a picture is read"), and a read with no event names the second step **"Write the event"**.
    - In the failed-read line "type the event yourself" is a link to the idea box. His sentence is unchanged.
  - **Stage 4 is built: the picture as the flyer's photo** (the same session; seventeen commits on top of
    `bab60d0` for both parts and their record, each as it went green). Nothing is pushed.
    - It is the client alone, on both backends. With `photo` not named the app is as it was, and the baseline is
      byte-identical (32 cases, against a capture of `bab60d0`).
    - His answers: the tick box is offered for a picture with no event too (**"Yes, offer it"**), and while the
      picture uploads the button reads the editor's own **"Uploading…"**, with "Adding your picture to the
      flyer…" in the stage.
    - The look ran on both backends, desktop and phone (390 and 360 px), in the installed Chrome driven by a
      script, on the fake: nothing was spent. 44 of 57 pairs of screenshots are the same file on both backends. A
      phone-sized photo (3600 × 4800, 11 MB) went up as 1.96 MB, under PHP's 2 MB.
    - A fresh-context review of `61cd7ec..0d61f95` found no severe defect, and no way for a switched-off feature
      to run. What it found is fixed, each test first: among it, "Open in editor" on an older flyer leaving words
      read behind without a question (older than the session), an upload's answer landing after the page was left
      and come back to, and a check on the examples' ranges that a range of days passed.
    - The gates on `e447fbd`: 603 unit, 378 contract, 182 in the browser (66 of them the AI project's), 893 PHP,
      2 in the PHP smoke test. No provider was called in the session.
    - **The checkpoint has what the brief asks: the screenshots on both backends and the gates.**
    - **The whole path was tried on his phone, and he closed the work** (the first hour of 2026-10-07; his Galaxy
      S23, Chrome, the fake, over this PC's own hotspot): a picture, Read, Generate, the tick, Open in editor, Save.
      "We can close that, everything nice working."
      - The server kept two files of two sizes: the read's copy at 1153 × 2048, and the flyer's photo at
        1824 × 3240, made from the original. Both upright. They are in `backups/phone-test-2026-10-07/`, outside git.
      - Not tried there: Take a photo (the picture came from the gallery), a sideways photo, an iPhone.
    - **For Artur to decide** (the report has each; he answered none of these when he closed it):
      - the words of the question "Open in editor" now asks with words read and an older flyer on the stage (the
        leave question's own, as where there is no flyer yet);
      - whether a picture that failed to read is offered as the photo once the event is typed;
      - whether a Try again keeps the tick, and where the box sits;
      - the red notes a screen reader is not told of, which the editor shares (answered since by the toasts:
        an error is an alert, 2026-10-07);
      - and stage 3's list, unchanged: **reads sent at the same moment pass the tries together** (a limit of 1,
        20 reads at once, 20 provider calls and 20 pictures kept; holding the bound means recording a try before
        the provider is asked, on both backends); the words on the page that are mine; that Read the picture
        waits when no flyer is left today; whether a generation on its way should be guarded as a read now is;
        the first example's "Free".
    - No release was built. A host needs nothing new for this work: it comes with the files. A host that names
      `photo` names it with `flyer`.
- Built, all four parts (2026-10-07 to 2026-10-12, and three last changes on 2026-10-13): **the editor's UX
  round** (brief `docs/prompts/editor-ux.md`; the report is `docs/reports/editor-ux.md`, one section per part,
  and a last one for those three). Designed with Artur on 2026-10-07: his
  answers are quoted in the brief and the report, and are not to be reopened. Parts 1 and 2 are in `main`, on
  origin. Parts 3 and 4 are on `feat/editor-ux-part-3`, not pushed. Left, his: the release, the live site, and a
  phone trial of Part 3 over https.
  - **Part 1 is built: the toasts, and the AI caption that saves itself** (2026-10-07, five commits on top of
    `497186c` and their record). Artur approved the plan with every *Mine* point kept. Nothing is pushed.
    - The toasts: the architecture section above says how they work.
    - "Write with AI" writes the caption and saves the flyer as one action (`writeShare()` in `Editor.tsx`).
      `save(draft)` takes the draft to write: the answer lands after the render its action started from, so it
      saves `latestDraft` with the caption in it.
    - The button is a small "Write again" link while the caption stands for the flyer's details: `captionOf`
      holds the details it was written from (after a generation, or as a flyer opened with a caption), and
      `captionWritten` compares them with the fields now. A detail changed, or the caption emptied, brings the
      button back. Nothing new is stored with a flyer.
    - "The flyer's details" are the hostel, the template and `SHARE_DETAILS` in `src/shared/share.ts` (`text`,
      `chips`, `extras`, `week`). The server's `ShareInput` is typed from the same list.
    - A refused save keeps the caption in the form and says so (`captionUnsaved`). A caption that lands after
      the page was left writes nothing (the URL and the page's own `here` ref, as on the AI page).
    - The AI draft warning leaves at the staff member's own Save or download (`ownSave`), not at that save.
    - It is the client alone, on both backends, and the baseline is byte-identical to `497186c`.
    - A fresh-context review found no blocking defect. What it found is fixed, each test first: among it, a
      success that never closed while anyone typed, and a toast below the fold on a short phone.
    - The look ran in the installed Chrome driven by a script, on Node with the fake, at 1440, 1280, 390 and
      360 px. The screenshots are in `backups/editor-ux-part-1/`, outside git. Not looked at by eye on PHP.
    - **For Artur to decide** (the report has each): the handle and the tag count as details; the words that
      are mine; a generation on its way is still not guarded when leaving; six seconds for a success.
    - Answered since (Artur, 2026-10-12): the toast that lies over the flyer's bottom-right corner on a desktop
      stays as it is. "The toast like this is perfect, is opening closing correctly and now not disturbing
      users they can decide if see it or not."
    - Part 2's standalone prompt is `docs/prompts/editor-ux-part-2.md`.
  - **Part 2 is built: the panel folds, and so do its sections** (2026-10-07, five commits on top of `1139234`
    and their record). Nothing is pushed.
    - How it works is in the architecture section above ("The editor's form folds").
    - Artur's choices in the session: the plan with every *Mine* point kept (the brief's seven and the plan's own
      eight); folded, the panel is **"A slim rail"**, of three shapes; of two looks shown as pictures, **"Look A
      and please make it more marked that we are in that session"**, so an open section is a lightly tinted card;
      the head and the rail **"As drawn"**, with the fold button first.
    - It is the client alone, on both backends, and the baseline is byte-identical to Part 1's capture.
    - The form's head now stands above the form in the editor and on the AI page (the plan left `AiPage.tsx`
      alone): the sticky head with scroll padding scrolled the form to its top when one of its buttons took the
      focus.
    - A fresh-context review found no fault in the fold's own logic and two regressions from that move, both
      fixed with their tests first: the panel widened with a long line in it (473 px, where it is 421), and on a
      short phone the AI page scrolled as a whole and lost its way back. Also fixed: a refused file opened
      Photo, "Empty" over a Spanish line that prints, a test that could not fail.
    - The look ran in the installed Chrome driven by a script, on Node with the fake, at 1440, 1280, 390 and
      360 px. The pictures he chose from and the screenshots are in `backups/editor-ux-part-2/`, outside git.
      Not looked at by eye on PHP, and not tried on a real phone.
    - With the panel folded the warning toast is beside the flyer (0 px over it, where it is 106 px at 1440 wide
      and 132 px at 1280 with the panel open). On a desktop the flyer is as tall as the stage, so it does not
      grow; on a phone it does (342 px wide where it was 279, at 390 wide).
    - **For Artur to decide** (the report has each): the fold button's word ("Hide" / "Form" says its state by
      its name alone; one word in both states could say it to a screen reader); the words that are mine; on a
      saved flyer the template and the hostel are in "Flyer", which starts closed; a dropped photo leaves Photo
      open on every saved flyer until it is closed; "Open all" is the other template's sections too; the cut-off
      warning marks no section.
    - Part 3's standalone prompt is `docs/prompts/editor-ux-part-3.md`.
  - **Part 3 is built: copy the picture, share it, and one clipboard** (2026-10-12, on `feat/editor-ux-part-3`,
    cut from `main` at `4e86083` by Artur's word of that day: "Work in a new branch from main"). The branch is
    not pushed.
    - Seen at its start: `main` is on origin at `4e86083`, with Parts 1 and 2 in it and the two commits of
      2026-10-09 and 2026-10-10 on top (the WHEN chip's time, the two copy warnings dropped).
    - How it works is in the architecture section above ("The flyer leaves the editor as a picture four ways").
    - It started with a spike, in real Chrome and Edge: a clipboard write must start inside the tap, and the
      share sheet opens only within 5 s of it. The report has the table.
    - Artur approved the plan as written, the brief's six *Mine* points and the plan's own fourteen.
    - **The phone's silent "Copy text" is fixed** (he saw it on 2026-10-07): it reached the editor over plain
      http, where a browser gives a page no clipboard, and the call threw. "Copy text" now says so, and why.
    - It is the client alone, on both backends, and the baseline is byte-identical to the capture of before the
      round.
    - A fresh-context review found no fault in the main paths (the copy inside the tap, the menu, the bar's
      rule). What it found is fixed, each test first: among it, "Share now" pressed twice or after the flyer was
      changed to one with an empty frame, a caption said to be on the clipboard from minutes before, a picture's
      failure left unheard where the clipboard refused at once, and where the focus went after a toast's step.
    - The look ran in the installed Chrome driven by a script, on Node and once on the staged PHP backend, at
      1440, 1280, 390 and 360 px, against a build of `main`: the bar has the rows it had at every width. One real
      copy was read back from Windows at 1080 × 1440. The scripts and screenshots are in
      `backups/editor-ux-part-3/`, outside git.
    - **Not tried: a real phone, an iPhone, Safari, Firefox.** A phone reaches this PC over plain http, where
      neither the clipboard nor the share sheet exists. The trial over https is Artur's: the report has the steps.
    - **For Artur to decide** (the report has each): the iPhone (an open WebKit report says a sheet given a
      picture and a text hands WhatsApp the text alone); a download is two clicks now; every way out saves first,
      even when nothing changed, and a save empties the server's picture cache; a toast with a step stays until
      it is used or closed; the words that are mine.
    - Part 4's standalone prompt is `docs/prompts/editor-ux-part-4.md`.
  - **Part 4 is built: a tag of 24, a pill that fits, and the art that follows the copy** (2026-10-12, on
    `feat/editor-ux-part-3` by his word, in two sessions; the second was launched with
    `docs/prompts/editor-ux-part-4-close.md`). The branch is not pushed.
    - How it prints is in "Design decisions already made" above ("The tag pill, and the art that follows the
      copy"). It is the only part that changes a flyer's drawing.
    - The first session made the pill a fitted line (`7c42d35`). He saw its proof sheet and asked for the spark,
      the blobs and the pencil to move. The second settled that from mock-ups, one question a picture, then built
      it and landed the limit.
    - His answers there: the spark follows the pill; the blobs stay and trade inks ("Let's invert the blob
      colors", on both canvases); the photo's sparks are left; the pencil is "same size, higher". He signed a
      sheet of every sample before and after, then the sheet of the tag at 8, 14 and 24.
    - Stored flyers did not change, and there is no migration. A flyer whose art was arranged by hand is drawn
      as stored.
    - **It needs a release, uploaded whole.** It brings four art files (`assets/art/blob-left-teal.png`,
      `blob-right-yellow.png`, `spark-left-yellow.png`, `spark-right-teal.png`) and the new schemas. An older
      release refuses a flyer saved with a tag over 12:
      `docs/deploy.md`, "Rolling back", says what staff see on each backend, and a test holds each half.
    - The story's byte-identical baseline ended with this part. A capture of the new drawing is in the temp
      folder `nest-ux4-baseline`, outside git.
    - The mock-ups, both signed sheets, the look's screenshots and their scripts are in
      `backups/editor-ux-part-4/`, outside git.
    - A fresh-context review found no defect in the renderer, the fit or the schemas. What it found was in the
      tests, and each is fixed: among it, the export check could not see a spark drawn off its pill (it now
      compares the spark and the pencil in their own boxes, `follow` in `tests/render/pixels.ts`), and the
      pencil's test held a week flyer to an Activity flyer's bound.
    - **Three last changes, after he had looked at it** (2026-10-13, the same branch, a commit each; the report's
      last section). His words: "The toggle show pill should also remove the sparks under it", "Invert also the
      image sparks on the top", and the form's sections "in the order on how we editing the flyer", with "Top and
      tag pill" split.
      - The form is the client alone, and the drawing stayed byte-identical to Part 4's capture (32 cases). The
        two art changes are the renderer's: stored flyers did not change, and there is no migration.
      - He signed a sheet of every sample before and after, with its pill and with the pill switched off
        (`backups/editor-ux-part-4/sheet-c/`).
      - A fresh capture of the drawing is in the temp folder `nest-ux4c-baseline`, outside git.
    - **For Artur to decide** (the report has each): on WhatsApp a full-width pill's left end lies on the teal
      blob; on a story week flyer with five rows the pencil's top is 4 px under the fifth row's frame; a long
      pill's copy still ends in an ellipsis in the closed Tag pill's line; the four swapped files are not in the
      seed's doodles; and, older than the round, an ask too long for its 760 px column is not cut there: it prints
      on under the pencil and, at 60 characters, past the safe margin, with the editor's cut-off warning.
    - Answered since (2026-10-13): the two inks cross again, by the photo's sparks trading theirs.
  - The round is over: there is no next part and no next prompt.
- Built: **the library's views, a lightbox, and the ways out on every flyer** (2026-10-13, branch
  `feat/library-views`, cut from `feat/main-flyer-library` at `fcfaf06`; brief
  `docs/prompts/library-views-lightbox-actions.md`, report `docs/reports/library-views.md`). Three commits, not
  pushed; `main` has neither this nor the reception flyer.
  - How it works is in the architecture section above ("The library is a list or a grid…").
  - Artur approved the plan with every *Mine* point kept, then chose from mock-ups drawn by the real library: the
    **magnifier**; **"Ways out only, rest in a menu"** (Duplicate and Archive behind More, over my advice to keep
    them in a row); **"Two columns, small buttons"** for a phone's grid; the lightbox **as drawn**. Not to be
    reopened.
  - It is the client alone, on both backends, and the baseline is byte-identical (32 cases, against
    `nest-ux4c-baseline`).
  - Three assertions of `library.spec.ts` changed, by his second answer: the card is one link (Open is in More),
    Tab from it reaches the zoom button, and Archive is pressed through More. The PHP smoke test too.
  - A fresh-context review found the editor's refactor equivalent and the clipboard still asked inside the tap.
    What it found is fixed, each test first: among it, a toast's step that could copy another flyer's caption, a
    toast over the lightbox's close button on a phone, and a menu off a phone's left edge.
  - The gates on `75bea4c`: 704 unit, 381 contract, 352 in the browser, 3 in the PHP smoke test.
  - The look ran in Playwright's Chromium on Node, by a script, at 1440, 1280, 390 and 360 px
    (`backups/library-views/`, outside git, with the mock-ups he chose from). **Not done: the installed Chrome by
    hand, PHP by eye, a real phone, Safari, Firefox.**
  - **For Artur to decide** (the report has each): Open is in More and is the card's click; the library's toast
    lies over the lowest card's buttons at 1280 px and on a phone; a flyer that cannot load greys its buttons
    with no word of why; the library makes the editor's last canvas and has no switch of its own; Safari on a Mac
    may not hand the focus back to the zoom button.
  - Left, his: the release (nothing new on the host), and a phone trial over https, as for Part 3.
- Built: **labels on every flyer, a filter by label in the library, and the AI sets them** (2026-10-14, branch
  `feat/flyer-labels`, cut from `feat/library-views` at `16e1527`; brief `docs/prompts/flyer-types-filter.md`, report
  `docs/reports/flyer-labels.md`). Fourteen commits and their record, not pushed; `main` has neither this nor the
  library's views.
  - How it works is in the architecture section above ("A flyer carries labels").
  - Artur's answers are in the report's table, and are not to be reopened: several on a flyer, from a fixed list;
    the word "Labels"; up to 8; a new flyer has none; a label off the list stays stored and hidden; no setting from
    a card's More menu; "Classify the flyers I trust you"; "The AI may suggest one"; "An organiser only when named".
    From pictures drawn on the real library: the phone's top "B: compact, two a row", a card's labels "A: pills
    under the line".
  - **One answer replaced another.** From text previews he chose "Headings, under every label"; an hour later,
    seeing it drawn, "I dont want the Group by label functionality." There is no grouping.
  - Unlike the library's views it is on both backends: it **needs a release, uploaded whole** (new schema files,
    and `shared.json` is read on every request). Nothing new in `config.php`.
  - The drawing is byte-identical to `nest-ux4c-baseline` (32 cases), checked four times on the way.
  - Part A of the brief, his answer "as suggested": Safari's focus after the lightbox is fixed (the library hands
    it to the zoom button); the other four open decisions of the library's views wait for his phone trial.
  - **The live site was read, never written** (2026-10-14, on his word "You read the live site"): its 16 flyers,
    to choose their labels. The table he approved is `backups/flyer-labels/live-table.json`, outside git, with
    what was read beside it. The Laragon copy was not touched.
  - A fresh-context review found no blocking defect and nothing unsafe in the live write. What it found is fixed,
    each test first: among it, the script judging "has a label" by the checkout's list and not the site's, a tick
    printed for labels the site saved and does not show, "oldest first" passing with an order by id, and a picker
    greyed with no word of why. One break I found while it read: a blank editor on a backend older than itself.
  - The gates on `ec75579`: 765 unit, 387 contract, 374 in the browser, 938 PHP (38 skipped, as before), 3 in the
    PHP smoke test. No provider was called.
  - The look ran in the installed Chrome, driven by a script, on Node with the JSON store, at 1440, 1280, 390 and
    360 px (`backups/flyer-labels/`, outside git, with the pictures he chose from). **Not done: PHP by eye (the
    smoke test drove it), a real phone, Safari, Firefox.**
  - **For Artur to decide** (the report has each, M1 to M10 and after):
    - the list item still carries the labels with grouping gone (pills at once, and each list opens every listed
      flyer's file on the JSON store: about 12 ms more at 16 flyers on this PC, 30 ms at 160; the host unmeasured);
    - "All hostels" now reads in the hostel filter and in a chain-wide card's line;
    - the AI's part: the words of its rule, three hints in `labels.ts`, the examples' labels (the Teide example
      has no organiser's label, since its text names none), and the real check generations, on his go;
    - the order of the list, which is the order of the picker, the filter and the pills;
    - a save replaces the whole flyer, so the last of two saves wins: older than this work, and the script is the
      first thing that makes it likely.
  - Left, his, in this order: the release; then `npm run flyers:labels -- --to <the site> --apply
    backups/flyer-labels/live-table.json` (a dry run), and again with `--write`, when nobody is editing, and once
    more afterwards; his own pass over the labels; a phone trial.
- Waiting, don't start unasked: **the counts of what is left today confuse the interface a little** ("AI credits
  left", in Artur's words, on his phone, 2026-10-07; "Follow ups will fix in future"). Not designed, and not part
  of the editor's UX round.
- Waiting, don't start unasked: **a second shape for the share text, "one mixed caption"** (Artur, 2026-10-06):
  one caption in English with the key facts repeated in Spanish, where today's has two blocks. He wants a switch
  to turn it on and generate it as another option for the share text. Not designed: where the switch lives (a
  site's setting, or a choice beside "Write with AI"), and no flyer of his shows the shape yet.
- Waiting, don't start unasked: step 7 (drag/nudge everything on the canvas, sizes, colours, order, reset),
  step 9 (doodle picker + icon uploads). With two canvases and two templates: step 7's stored `overrides`
  (dx/dy) are shared by every canvas, so it must decide how they apply per canvas; step 9, when it stores
  the render-only anchors (`bottomLeft`, `bottomRight`, `pillEnd`), must add a JSON migration id so an older
  release refuses the store cleanly. A stored `pillEnd` piece would also need the renderer's rule for it (drawn
  with the pill, and not at all on a flyer that prints none), which today only the template set reaches, and
  step 9 decides whether staff may pick the four swapped inks (`SWAPPED_INKS`).
- Built, stages 1 to 4 of 7: **looks, the seam for more than one flyer design** (2026-10-14, branch `feat/looks`,
  cut from `feat/flyer-labels` at `a55589d`; the design `docs/prompts/looks-seam.md`, designed with Artur on
  2026-10-13; the report `docs/reports/looks.md`, one section per session). Stages 1 and 2: eleven commits,
  `c1d7e29..4139d14`. Stages 3 and 4: five, `9a665cc..11773dc`, and their record. Nothing is pushed.
  - How it works is in the architecture section above ("A flyer prints in a look").
  - Artur's answers are in the design and the report, and are not to be reopened: among those of 2026-10-14, a look
    may give a box its own top and height, the photo's too (he struck "move only"), and M2 to M6 kept.
  - Nothing a staff member sees changed: the drawing was byte-identical on both canvases after every commit (the
    temp folder `nest-looks-baseline`, 36 cases).
  - The gates at the end of stage 2: 782 unit, 299 in the `render` project, 75 in `ai`, 387 contract. PHP was not
    run: nothing it reads changed.
  - Also `0eadafa`: a flake in the labels work's own `library-labels.spec.ts`, fixed.
  - **Stages 3 and 4** (the same day, a session of their own): `data.look` on both backends with the two rollback
    rules, `LOOKS` / `'looks'`, `api/config`'s `looks`, and a new flyer in the site's first look. Artur approved
    the plan as written, with eight points where the code disagreed with the design (the report has them). Nothing
    a staff member sees changed: the baseline byte-identical (36 cases) after every commit that touched `src/`.
  - The gates at the end of stage 4: 809 unit, 387 contract, 374 in the browser (299 `render`, 75 `ai`), 958 PHP
    (38 skipped, as before), 3 in the PHP smoke test.
  - **For Artur to decide** (the report has each): `LOOKS=` with nothing is refused (`AI_FEATURES=` means none); a
    look's name spelt exactly; the sample's `'looks'` commented out; the words in `docs/deploy.md`.
  - **Next, on his go: stages 5 to 7 in a new session**, `docs/prompts/looks-seam-stages-5-7.md`: the proof look,
    the switch, the docs. The real second look is a later session still: data and art, once Claude Design's output
    is on the table.
- Done: output canvases, Instagram story 9:16 + WhatsApp 3:4 (branch `feat/output-canvases`, 2026-09-23).
  The review is `docs/reports/output-canvases-review.md`, the report `docs/reports/output-canvases.md`.
- Done: the PHP shared-hosting port, phases 2–5 (branch `feat/php-shared-hosting`): the seams, the PHP
  backend, the Node JSON driver and the copy tool, the release and the Laragon verification. The report is
  `docs/reports/php-port.md`; the briefs are `docs/prompts/php-shared-hosting*.md`.
- Done: deploy readiness (`docs/prompts/php-deploy-readiness.md`, same branch, 2026-09-23). It adds:
  - the access rule proven over HTTP (`tests/access`), and the checks can sign in (`.env`, `scripts/env.ts`);
  - `release.json` and the host facts in `api/config`;
  - the preflight page (`php/preflight/`);
  - `docs/deploy.md`, the owner's single copy of the deploy steps, with backup/restore/reset;
  - an Apache rehearsal, recorded in `docs/reports/php-port.md` and `docs/reports/host-facts.md`.
  `seed/hostels.json` now has all 14 hostels.
- Built: the shared top bar (branch `feat/shared-nav`, 2026-09-27; the plan's decisions are in
  `nestpass-tools/README.md`).
  - The same bar runs in Flyers, Newsletter, QR and Social vanity URLs (`nestpass.ai/vanity/`, in the
    website repo `H-Nests/www_cur/tools/vanity-links`), and the tools page `nestpass.ai/` lists them.
  - Live since 2026-09-28: SSL, the tools page and the kit, and Flyers and Newsletter with the bar.
    QR's part is on its branch `claude/shared-nav-7477311f`.
  - Still open: this app answers without a password (`allowPublic`; seen 2026-09-28, still so on
    2026-09-29), while the public tools page links to it. The lock is `docs/deploy.md` steps 3–4.
- Built: the editor as a focus page (branch `feat/editor-focus`, 2026-09-28, cut from `feat/shared-nav`).
  The bar shows on the library only; the editor has a back link, a guard on unsaved work, "In a frame" by
  default and an exclamation budget (the design decisions above).
- Done: the write guard is one constant (branch `refactor/write-header-constant`, 2026-09-29). The header,
  its value and the methods that need none live in `src/shared/writeGuard.ts`. `npm run gen` copies them to
  `schema/shared.json`, and `Shared::writeGuard()` feeds PHP's `WriteGuard`. Both backends, the editor and
  every test read them; only `WriteGuardTest` spells the header out, to pin the rule. PHP reads that block on
  every request, reads included, so upload a release whole: a stale `shared.json` answers 500.
- **Not live, by the owner's decision:** the host is IONOS (`https://nestpass.ai/activities/`), and the app
  goes public only once a real login exists. That login (Supabase, or the Laravel app as the issuer) is its
  own brief, and is not to be started unasked. It will have to exempt a sign-in route from the access check,
  and decide what guards the static files.
- IONOS answered the preflight page on 2026-09-28 (the IONOS column of `docs/reports/host-facts.md`):
  PHP 8.4 under FastCGI, gd, every account check green.
  - Its root `.htaccess` was a hand-edited older copy, so `release.json` was served.
  - `http://` was not redirected.
  - The then-shipped full `.htaccess` was refused: 403 on every URL, shown on IONOS's own page with
    a cookie banner. The likely line is `Options -Indexes -MultiViews`.
  - MultiViews is on and cannot be turned off from `.htaccess`.
  So the release's root `.htaccess` is now the one IONOS runs: rewrites, headers and `FilesMatch`
  only, with the https redirect first (taken from `THE_REQUEST`, because of MultiViews).
  `.htaccess-minimal`, step 1b and the separate https example are gone. The lock's `<If>` lines
  (http 403 → redirect) may be refused there too; the block says to delete them if so.
- Open: whether the login reaches PHP under FastCGI (the preflight page's *Login* line, once a lock is
  on); the final format of the eyebrow's marks, after the pilot (`EYEBROW_MARKS`). The local Laragon deploy
  (`nest-flyers-php`) still runs `allowPublic`, so the contract row that forbids it fails there by design.
  The branch is unpushed, by the owner's choice.
