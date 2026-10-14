# Launch prompt: a search box in the library

Written 2026-10-14, after a brainstorm with Artur at the end of the session that built the flyers' labels, for a
session with no memory of it. Launch it once the looks session (stages 5 to 7) has committed its work. Paste the
block below.

Suggested run: Claude Opus 5.5 (`claude-opus-5-5`), effort **high**, started in plan mode.

```
Read CLAUDE.md, then docs/reports/library-views.md and docs/reports/flyer-labels.md. One feature in this session: a
search box in the library. Its shape was settled with me in a brainstorm (DECIDED, below): plan it, then build it.

HOW TO WORK

- Start in plan mode. Build nothing before I approve the plan. Keep the plan SHORT: what changes, in a table, and
  the order. I can't read a long one. Points marked "Mine" are suggestions: show each so I can keep or strike it.
- Check git first. This is built after the looks stages 5 to 7 are committed. If git status shows uncommitted work
  on feat/looks, or another session is working in this folder, stop and tell me. Cut feat/library-search from main
  (or from the branch I name when I launch this). The untracked files in docs/prompts/ that are not this one are not
  part of this: leave them alone. If anything contradicts this, stop and ask.
- Ask with pictures where it is visual (where the box sits at 1440 and 360 px, the marks, the "why" line), drawn
  from the real library: backups/flyer-labels/mockups.mts shows how (a throwaway seeded server, draft CSS injected
  into the real page).
- Every change with its test first; a commit per piece as it goes green. Push nothing, build no release, don't touch
  the live site or the Laragon copy.
- It is the browser alone: nothing in server/, php/, schema/ or src/shared/ should change. If something there must,
  stop and tell me why first.
- Before calling it done: npm run typecheck && npm test && npm run test:contract && npm run test:render, and
  npm run test:php-smoke (the library on PHP). Look at it in a browser at 1440, 1280, 390 and 360 px. A flyer's
  drawing must not change: take a baseline capture before the first change (RENDER_BASELINE=capture, with a
  RENDER_BASELINE_DIR of your own) and check it byte-identical at the end.
- Record it: a section in docs/architecture.md and an entry in docs/status.md in the style of the others, and docs/reports/library-search.md.

WHAT I ASKED FOR

"another filter to the flyers, the search field that will search for: name, label, share text, other relevant
fields exactly with this priority order if possible, but let's make it simple nothing over engineered simple search
text input field that look with js to a data attribute or text and if it's not to many effort highlith the name,
label text etc... the esiest way possible for now, it's just for enhance the finidngs of Flyers fro duplicate or
edit them and not create always new ones."

So the purpose: finding a flyer that exists, to duplicate or edit it, instead of making a new one each time.

DECIDED IN THE BRAINSTORM (2026-10-14; not to be reopened)

- The list does not carry the share text or the flyer's words (docs/architecture.md, "Library views": "Never add the caption to the list"), so
  a search over the page alone could not see them. My choice, of three: at the first letter typed, the library reads
  every listed flyer once (GET api/flyers/:id, the answer each card already asks for) and searches it whole. The
  browser alone: no server change, no PHP, no contract change. The other two were the list's fields alone (no share
  text), and the server searching (?q= on both backends): not now.
- The order of the results is mine, from my ask: a match in the name first, then in a label, then in the share
  text, then in the rest. Within one rank, the library's own order (newest first).
- Marks: the matched letters marked in the name and the label pills. A flyer found only by its share text or another
  field gets one short line under its meta line saying why, e.g. "Share text: …a sunset hike to the…", with the word
  marked.
- Built after the looks stages 5 to 7 are committed: one session at a time in this folder.

WHAT EXISTS (read before planning)

- src/editor/Library.tsx: three filters the server applies (Hostel, Template, Label), each remembered in
  localStorage; load() applies only its latest answer; the items are FlyerListItem (id, title, template, hostel,
  hostelName, updatedAt, labels), newest first. The head is two rows, .library-top and .library-filters; on a phone
  the filters are two to a row and their words are not drawn (editor.css, the 480 px block).
- src/editor/FlyerThumb.tsx, useNearFlyer: each card asks for its own flyer once it nears the screen, keyed by its
  id and updatedAt (a flyer saved since is asked for again; an answer for a card that has gone is dropped). The one
  answer serves its picture, its lightbox and its ways out (docs/architecture.md, "Library views": "One fetch per card").
  - The search's reads must be these same answers: one store of answers by id and updatedAt that the cards and the
    search both read, so no flyer is asked for twice in a visit and the rules above still hold.
  - A card still DRAWS its picture only once it nears the screen: the store saves the request, never the drawing
    (each picture is a whole <Flyer>, fitted). A search must not make every card draw at once.
- src/editor/LibraryCard.tsx: the title, the meta line (hostel · template · date), the label pills
  (labelNames(item.labels): a label off the list is not shown, so it is not searched either).
- The words to search, in my order:
  1. the name: item.title (an untitled flyer's name is its headline, src/shared/names.ts);
  2. the labels' names (src/shared/labels.ts);
  3. data.share;
  4. the rest: data.text (eyebrow, headline1, headline2, headlineEs, askEn, askEs, handle, tag), the chips' values
     (not their WHEN / WHERE / COST), data.extras, data.week's rows (day, name, shortName, time, cost), and from the
     list the hostel's name and the template's name.
- The field's name in the "why" line comes from FIELD in src/editor/fields.ts (Share text, Nice to know, Spanish
  line…): never a word of your own where the editor has one.
- Pure modules tested by themselves: libraryView.ts, libraryLabel.ts. The search's rule goes in one such module
  (src/editor/librarySearch.ts): a flyer's searchable text by field, the match, the rank, the "why" snippet.
- tests/editor.ts: libraryFilter(page, …) and filterLibrary(); the library's specs are library.spec.ts,
  library-views.spec.ts and library-labels.spec.ts. The PHP smoke test drives the library too.
- Archived flyers are not in the list: they are not searched.

OPEN POINTS (Mine: show each in the plan to keep or strike)

1. Every word typed must be found somewhere in the flyer, in any field and any order: "teide sunset" finds a flyer
   named Teide whose share text says sunset. A flyer's rank is its best field holding one of the words.
2. Case and accents are ignored ("excursion" finds "Excursión", "cafe" finds "Café"). Nothing fuzzy: a typo finds
   nothing.
3. The search narrows the list the three filters gave and never asks the server for a list. With nothing found:
   "No flyer matches “…”" and a "Clear the search" button; with a filter set, the message says the filters are on
   too.
4. The search is not remembered: the box is empty at each visit to the library (the filters are remembered). If I
   strike this, it is kept for the browser tab (sessionStorage).
5. The reads start at the first letter typed, never on page load, at most 4 at a time. A flyer that cannot load is
   searched by its list fields alone. While reads are on their way a quiet line says "Reading the flyers… 6 of 16",
   and matches join as their flyers arrive. No debounce: the filtering is in memory.
6. The box: <input type="search"> named "Search", its placeholder "Name, label, share text…"; its × and Escape clear
   it; no keyboard shortcut. On a phone it is a row of its own above the filters. Drawn before it is built.
7. The "why" line shows only for a flyer whose name and labels hold none of the words: one line, cut with "…" on
   both sides, the field named in FIELD's words. A match in the hostel's or the template's name is marked in the
   meta line instead.
8. The marks are <mark>, styled quietly in the editor's colours. The card's link is still named by its title, and
   the zoom button's name does not change.
9. A polite status line says how many flyers match ("3 of 16 flyers"), so a screen reader hears the search work.
10. The branch is feat/library-search and the report docs/reports/library-search.md.

TESTS (at least)

- Unit, librarySearch.ts: the words, case and accents, every field, the rank, the snippet's cut, a flyer with no
  answer, a label off the list.
- Browser, tests/render/library-search.spec.ts: typing narrows and ranks; the marks and the "why" line; Escape and ×
  clear; the no-match message with and without a filter; each flyer asked for once in a visit, counted from the
  page's requests (the cards and the search together); a flyer saved since is asked for again; a flyer that cannot
  load; cards far down still draw only when scrolled to; 390 and 360 px. A step in the PHP smoke test.

NOT NOW

The server searching (?q=), anything fuzzy, archived flyers, a keyboard shortcut, remembering past searches, sorting
choices, a search on the AI page or in the editor's "Add from a saved flyer", anything in server/ or php/, anything
that changes how a flyer prints.

When done, tell me what is left that is mine: the release (the files alone: nothing new on the host or in
config.php), my look on a phone, and every word on screen that is yours and not mine.
```
