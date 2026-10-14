# Report: a search box in the library

The brief is `docs/prompts/library-search.md`. Built on 2026-10-14, directly on `main` by Artur's word ("you can work
directly in main"), on top of `8e14547`. Nothing is pushed and no release was built. The live site and the Laragon copy
were not touched.

It is the browser alone, on both backends. No route, schema, generated file, storage driver or PHP class changed, and
nothing in `src/shared/` changed either. A flyer prints the same: the drawing is byte-identical to the capture taken
before the first change (36 cases, both canvases).

Why it exists: staff kept making a new flyer when one already existed. The box finds the one that exists, so they
duplicate or edit it instead.

## What Artur chose

The plan's points, with his answers (the points marked "mine" were suggestions he kept or changed):

| # | Point | His answer |
|---|-------|-----------|
| 1 | Every word must be somewhere in the flyer, any field, any order. A flyer's rank is its best field holding one of the words | Kept |
| 2 | Case and accents ignored. Nothing fuzzy | Kept |
| 3 | It narrows the filters' list and never asks the server. No match: "No flyer matches “…”", saying when a filter is on | Kept |
| 4 | Not remembered | **Changed: "remember is a good idea"**, and **"Always, like the filters"** |
| + | Clearing | **His own: "clear the search and filter too"**. Asked which, he chose **"Both"**: a Clear button beside the box, and the no-match button doing the same |
| 5 | Reads start at the first letter, at most 4 at a time… | **Changed: "Start searching from >= 3 chars"**. Asked what counts, he chose **"3 in the box"**: spaces not counted, then every word counts. The rest of the point stands |
| 6 | The box, its words, × and Escape, a row of its own on a phone | Kept |
| 7 | The "why" line only when the name and labels hold none of the words | Kept. Asked again with pictures, he chose **"One line, as you said"**, over two lines |
| 8 | Quiet `<mark>`; the names of the link and the zoom button unchanged | Kept |
| 9 | A polite count | Kept |
| 10 | A branch `feat/library-search` | **Changed: work on `main`** |
| 11 | The store lasts one visit; a card near the screen goes ahead of the search; a failed read is not asked again | Kept |
| 12 | Apostrophes fold: "what's" finds "What’s on" | Kept |
| 13 | The meta line is searched as it reads, not its date: "All hostels" finds the chain-wide flyers | Kept |
| 14 | The "why" line names fields as "The AI assumed…" does, and starts about 30 characters before the word | Kept (and changed by the pictures: below) |
| 15 | Only the count is read out | Kept |

From pictures drawn from the real library (`backups/library-search/mockups/`, outside git):

| Question | His answer |
|----------|-----------|
| Where the box sits on a desktop | **"Near the filter, at the beginning of them"**. This was a shape I had drawn and taken off the sheet because it wrapped the filters onto two rows. It is built to fit on one |
| How a mark looks | **"teal primary color like #53CED1 or derivant with transparency but for keep brand colors"**: #53CED1 at 38 %, behind ink letters (the bright teal is never the letters' colour on cream) |
| The "why" line's length | **"One line, as you said"** |
| The count, the reading line, no match | **"As drawn"** |
| The three together, drawn again (sheet 4) | **"Build it like this"** |

## What was built

**The box** (`Library.tsx`, `editor.css`)

- The first of the filters, with Clear beside it. On a phone it is a row of its own above the filters.
- `<input type="search">` named "Search", placeholder "Name, label, share text…", no spell-check. Its × (the browser's
  own) and Escape empty it.
- Remembered in the browser as `library.search`, next to the filters. A remembered search reads the flyers when the
  page loads.
- **Clear** shows while there is something to clear (a search, or a filter). It empties the box and sets the three
  filters back to all. The box gives Clear its room, so the filters beside it never move.

**The search** (`src/editor/librarySearch.ts`, pure and tested by itself)

- It starts once the box holds 3 characters, spaces not counted. Under 3 the library is as it was.
- Every word must be found somewhere in the flyer. Case, accents and curly apostrophes don't count; nothing is
  fuzzy.
- The order: a match in the name, then in a label, then in the share text, then in the rest. Within one rank, the
  library's own order (newest first).
- What is searched, in that order:
  - the name;
  - the labels' names (a label off the list is on no screen, so it is not searched either);
  - the share text;
  - the copy (eyebrow, the headline's lines, the Spanish line, the asks, the handle, the tag);
  - the chips' values (never their WHEN / WHERE / COST), the extras, the week rows;
  - the hostel's name ("All hostels" for a chain-wide flyer) and the template's name.
- Only what the flyer's template prints: switching template keeps every field, so an Activity flyer may still hold
  week rows nobody sees.

**One store of flyer answers** (`src/editor/libraryFlyers.ts`, tested by itself)

- The list carries no share text and no copy, so the search reads each flyer's own answer (`GET api/flyers/:id`).
  Those are the answers the cards already ask for, so both now ask through one store, kept by the flyer's id and
  its `updatedAt`.
- No flyer is asked for twice in a visit to the library. A flyer saved since is asked for again.
- The search reads at most 4 at a time, in the list's order. A card coming to the screen asks at once, ahead of the
  search's queue.
- A flyer that cannot load is remembered as such, and is searched by its list fields alone.
- The store saves the request, never the drawing: a card still draws its picture only once it nears the screen.

**What a card shows** (`LibraryCard.tsx`)

- The words found are marked in the name, the label pills and the meta line.
- A flyer found only by its share text or its copy says why in one line under its meta line:
  `Share text: …of Tenerife at sunset with a local pilot…`, cut at the card's edge. The field is named in the editor's
  words ("Share text", "Spanish line", "Headline line 1", "The ask (English)", "When", "Nice to know", "This week’s
  rows").
- The card's link and its zoom button keep their names.

**The lines under the filters**

- "3 of 16 flyers", said to a screen reader as it changes.
- "Reading the flyers… 6 of 16" while answers are on their way: shown, not said. Matches join as they come.
- No match, once every flyer is read: "No flyer matches “sunset”." with "Clear the search", or "No flyer matches
  “sunset” with these filters." with "Clear the search and filters".

## What differs from the plan

- **Work on `main`**, not a branch (his answer). Seven commits, `cbbb511..d33acb3`, and this record.
- **The box, the marks, the "why" line and the phone are one commit** (steps 5 to 7 of the plan): they share
  `Library.tsx`, `LibraryCard.tsx` and `editor.css`, and went green together in one spec. The PHP smoke step is its own.
- **The "why" line starts a word or two before the word (16 characters, cut at a space), not about 30.** The point
  was kept, but the pictures showed the word cut off at the line's end at 30, and he chose one line. Even at 16, on a
  360 px phone a long share text can still cut the word ("…of Tenerife a…"), as he accepted.
- **A cut never starts on a separator**: "…· Catamaran" read badly on a week row, so the cut steps past a dot or a
  comma.
- **Clear is not kept in its place while there is nothing to clear**, as I first built it: that left the empty box too
  narrow for its placeholder at 1280 px. The box gives Clear its room instead. The filters still never move.
- **The gap between the filters is 12 px** (it was 16), so the box fits beside the three filters on one row at 900 px.
- **One assertion of `library-labels.spec.ts` changed**: on a phone the first card starts under five rows now (the
  search's own row), at most 330 px where it was 290.
- **The card's text column takes the room beside it** (`flex: 1 1 auto` on `.card-text`), so the "why" line has the
  width up to the buttons. Nothing else on a card moves.

## The tests

New:

- `tests/unit/library-search.test.ts` (26): from 3 characters; the words folded; every word in any field; case,
  accents, apostrophes; nothing fuzzy; a label by its name and never one off the list; the meta line without its date;
  every field of the copy, the chips' values and not their words, the week rows; only what the template prints; no
  answer; the rank and the order; flyers on their way and ones that cannot load; the "why" line: when, the field's
  name, the cut on both sides, a short text, a week row, never on a separator; the marks: overlaps, none, apostrophes.
- `tests/unit/library-flyers.test.ts` (7): a card asks once; the search 4 at a time in order; a card ahead of the
  queue; a card joining a read on its way; a failure remembered; a flyer saved since; the readers told.
- `tests/render/library-search.spec.ts` (14):
  - typing narrows and orders, and no list is asked for;
  - fewer than 3 characters;
  - Escape, and Clear with a filter;
  - remembered across a reload;
  - no match, with and without a filter;
  - each flyer asked for once, the cards' and the search's together, counted from the page's requests;
  - the reading line while an answer is held;
  - a flyer saved since is read again;
  - a flyer that cannot load;
  - a card far down still draws only when scrolled to;
  - 390 and 360 px;
  - the marks and the names;
  - the "why" line.
- A step in the PHP smoke test: a flyer found by a chip's value on the PHP backend, with its "why" line.

The library's other specs (`library.spec.ts`, `library-views.spec.ts`, `library-actions.spec.ts`) are unchanged and
green: the cards ask through the store as they asked before.

## What the review found

A fresh-context review read `cbbb511..0350aba` and changed nothing. It found nothing severe. It found the fold's
mapping, the cut, the rank's order and the store's handling of late answers right, with no render loop, and the
cards still drawing only when near. What it found is fixed in `d33acb3`, each with a test that failed first:

- **The search's reads went on after it was cleared, or after the library was left**: about 96 more requests behind
  the editor on a library of 100. The store's queue now empties then.
- **After a filter changed, the new list waited behind the old one's queue**: "Reading the flyers… 1 of 6" while
  most of 100 were fetched. A new list now takes the queue's place, in its own order.
- **Clear and the no-match button left with the keyboard's focus.** Both leave once they are done, so the focus now
  goes to the box.
- **Every field of every flyer was folded again at each redraw**: about 60 ms a redraw at 100 flyers on this PC, more
  on a phone. Each flyer is folded once now.
- **A template this release does not know** (met after going back to an older release) would have broken the
  library. It now reads as no template.
- Pinned with a test: accents written as letters of their own. Removed: an unused function of the store. Reworded:
  the labels spec's assertion.

Left as they are, and said here:

- **A card can move while the flyers are read.** A flyer shown early, say by its hostel's name, moves up when its
  answer lands with the word in its share text. A button focused inside it can lose its focus then. It comes with
  "matches join as they come".
- **A screen reader hears the count several times while the flyers are read**, once for each match that lands.
- **Duplicate still asks for its flyer again**, as before the search, to copy the flyer as it is now.

## The look

`backups/library-search/look.mts` drove the installed Chrome on a throwaway seeded server, at 1440, 1280, 390 and
360 px: an empty box, a search in the list and in the grid, the reading line, a filter on, two letters. The
screenshots are in `backups/library-search/look/`, outside git. The mock-ups and their script are beside them.

**Not done: PHP by eye (the smoke test drove it), a real phone, Safari, Firefox.** Firefox draws no × in a search box;
Escape and Clear still empty it there.

## The gates

All green on `d33acb3`, the last commit with code (the record after it changes none):

| Gate | Result |
|------|--------|
| `npm run typecheck` | clean |
| `npm test` | 868 passed |
| `npm run test:contract` | 387 passed, 235 skipped (the backends this machine does not run) |
| `npm run test:render` | 405 passed, 1 skipped (the opt-in baseline) |
| The baseline, against the capture `nest-search-baseline` taken before the first change | 36 compared, byte-identical |
| `npm run test:php-smoke` | 3 passed |

`npm run test:php` was not run: no PHP file changed. One unit test timed out once in a full run (`tag-release.test.ts`,
a 10 s hook on a throwaway git repository, while the machine was busy) and passed alone and in every run after.

## For Artur to decide

- **The words that are mine**: "Clear", "No flyer matches “…”." and "… with these filters.", "Clear the search", "Clear
  the search and filters", "3 of 16 flyers", "Reading the flyers… 6 of 16".
- **On a phone the "why" line can cut the word** (his choice of one line, seen in the pictures).
- **The "why" line starts 16 characters before the word**, not about 30 (above).
- **A remembered search reads every listed flyer when the library opens.** With 16 flyers that is 16 small requests,
  4 at a time. Before it, a visit asked only for the cards near the screen.
- **A remembered search can hide most of the library on a later visit.** The box shows the words, the count says "2 of
  16 flyers", and Clear is beside it.
- **The default ask matches nearly every flyer.** Every new flyer's ask reads "Sign up at reception.", so a search for
  "reception" finds almost the whole library.
- **A mark that reaches the line's end shows a sliver of teal after the "…"** on a phone.

## Yours to do

- The release: the files alone, with nothing new on the host or in `config.php` (`npm run build:php`, upload whole,
  `npm run deploy:tag`).
- Your look on a phone.
