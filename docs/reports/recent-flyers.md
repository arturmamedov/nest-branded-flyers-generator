# Report: the flyers opened last, first in the library

2026-10-15, on `feat/recent-flyers` from `main` (`0b51bff`), unmerged. Tier **Medium**: the editor's client alone, with
the browser's own storage. Nothing changed in `server/`, `php/`, `schema/`, `src/shared/` or `src/flyer/`. Nothing is
pushed, no release was built, and the live site and the Laragon copy were not touched.

His ask, in chat: "let's remember in our local storage another thing, the last opened flyer, the most recent open
flyer and order for any user it own most recent flyers for make it easier to find them, and maybe as we are there
remember also the filters they used if they did and also apply them".

- **The filters were already there.** The three filters, the search box and List / Grid have been remembered and
  applied each time the library opens since before this session, and in its URL since `docs/reports/library-url.md`
  (the same day). Nothing more was built for them.
- **"Any user"** is each browser, since the app has no login. A shared PC at reception shares one list.

## What Artur chose

| Question | His answer |
|---|---|
| Where the recent flyers show (a row on top, an order switch, or always first) | **"Always first"**, over the row on top I recommended |
| How many | **The last 5** (recommended) |
| Whether the cards say why they are first | **"A quiet line"** (recommended) |
| With a search on | **First in their rank** (recommended): the search's order stands, the recent ones first within a rank |
| What counts as opened | **"The editor and the card's ways out"**, over the editor alone, which I recommended |
| The line, drawn on the real library (`backups/library-search/`'s way, sheet in `backups/recent-flyers/`, outside git) | **"B: its own line"**, which I recommended once drawn |

"Go!" approved the design: `recentFlyers.ts` pure, the record in `Editor.tsx` and `Library.tsx`, the order in front
of the search, not in the URL, the branch and a commit per piece.

I had first recommended the end of the meta line (A). The drawing showed it grew a desktop card (the buttons dropped
under the text) and wrapped mid-phrase in a phone's grid ("opened 2 h / ago"), so I recommended B and said so.

**Mine, kept unasked, for you to keep or strike:**

- **Nothing moves under your hand.** The order is taken when the list loads (opening the library, a filter changed,
  Back and Forward). A picture copied from the 7th card is remembered at once, but the card stays there until the
  next load.
- A share counts once the sheet says it was shared. Closing the sheet without sharing doesn't count; "the picture is
  ready, tap Share now" does.
- Archiving a flyer from the library takes it off the 5, so it holds no place there.
- The words: "Opened just now", "Opened 5 min ago", "Opened 2 h ago" (today), "Opened yesterday", "Opened 3 days
  ago", by this browser's calendar.

## What was built

- **`src/editor/recentFlyers.ts`**, pure:
  - `library.recent` holds `[{id, at}]`, at most 5, read loosely (a damaged value is none, and a flyer counts once);
  - `rememberOpened` writes over what the browser holds now, so another tab's opens are kept;
  - `forgetFlyer`; `byRecent` is the order; `openedAgo` the words.
- **`Editor.tsx`**: a flyer loaded counts, and a new flyer at its first save (from New flyer, the AI page's draft, or
  Duplicate's copy as it opens).
- **`Library.tsx`**:
  - the list is put in this order before the search sees it, so its stable sort keeps the recent ones first within
    each rank, and `librarySearch.ts` did not change;
  - a way out counts when it worked: an answer from `run` (copy, download), an `ok` from `say` (shared, caption copied);
  - Archive forgets the flyer.
- **`LibraryCard.tsx`, `editor.css`**: the line, `.card-opened`, a block inside `.card-meta` in its grey, never
  searched or marked.
- **`prefs.ts`**: `browserMemory`, the get and set as one store, which `useLibraryUrl.ts` now uses too.

## Tests

- `tests/unit/recent-flyers.test.ts`, 11 cases:
  - the key and the 5;
  - damaged values read as none, and a list partly damaged kept as far as it can be;
  - on top, opened again moves up, the 6th falls off;
  - written and read back, forgotten on archive, a damaged store written over;
  - the order with none, with some, with one the list lacks;
  - the words through the day and across midnight, and a time ahead of the clock.
- `tests/render/library-recent.spec.ts`, 8 cases:
  - opened in the editor, then first with its line while the rest stay newest first;
  - the last 5, opened again moves up, the 6th back in its place;
  - a new flyer at its first save;
  - a download from a card counts, and the card does not move until the list loads again;
  - archiving forgets it;
  - with a filter;
  - with a search, the rank standing;
  - the line on its own line in a phone's grid.
- The PHP smoke test, step 8: the flyer just reopened is first in the library, with its line.
- `library-*.spec.ts`, `library.spec.ts`, `editor.spec.ts` and `chrome.spec.ts` stayed green with it. The new spec
  passed 3 runs in a row. `panel.spec.ts` changed: below.

**Gate:**

- **The first run had one failure.** `panel.spec.ts`, "the panel starts open on every visit, and a fold writes
  nothing", asserted that a visit to a flyer leaves the browser's storage empty. Opening a flyer now rightly writes
  `library.recent`. The test now expects that one key and nothing else, so it still holds what it was for: nothing
  of the fold or of the sections.
- **The rerun is green:**
  - `typecheck` clean;
  - `npm test`: 915 passed (904 plus the 11 new);
  - `test:render`: 421 passed, 1 skipped.
- **From the first run** (nothing they read changed since):
  - `test:contract`: 387 passed, 235 skipped (the deployment targets, unset);
  - `test:php-smoke`: 3 passed.

## Looked at

In installed Google Chrome, driven by Playwright (not your own profile), on the dev server's library: the list at 1440
px, the grid at 390 px. At both widths:

- the 4th flyer opened and "← Library": it was first, "Opened just now", and the rest stayed in their order;
- a PNG downloaded from the 6th card: it stayed 6th;
- after a reload it was first, with the one opened before second.

The screenshots are in `backups/recent-flyers/`.

## Left for Artur

- Merging `feat/recent-flyers`, then the release: the files alone (no backend changed).
- Your own look on a phone: open a flyer, come back, copy one from a card, come back later.
- The points above marked mine.
