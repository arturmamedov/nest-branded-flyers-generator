# Launch prompt: the library's filters, search and view in its URL

Written 2026-10-15, after a short round of questions with Artur, for a session with no memory of it. Launch it with
"Read and follow docs/prompts/library-url.md", in plan mode.

Suggested run: Claude Opus 5.5 (`claude-opus-5-5`), effort **high**. Tier: **Medium** (CLAUDE.md, "Ceremony tiers"):
the editor's client alone, with no data, API, storage or PHP change.

Read CLAUDE.md, then the sections "Library views", "Labels", "Library search" and "The leave guard" of
`docs/architecture.md`, and `docs/reports/library-search.md`. One feature in this session: the library's filters, its
search and its view in the URL, so a library link opens the same page for anyone. Its shape was settled with me
(DECIDED, below): plan it, then build it.

## How to work

- Start in plan mode and build nothing before I approve. Keep the plan SHORT: a table of what changes, then the
  order. Points marked "Mine" are suggestions: show each so I can keep or strike it.
- Check git first. Stop and tell me if:
  - git status shows uncommitted work outside `docs/prompts/`;
  - another session is working in this folder (the second look may be);
  - anything here contradicts the code.
  Otherwise cut `feat/library-url` from `main`.
- Tier Medium:
  - every change with its test first, and a commit per piece as it goes green;
  - the full gate once at the end (`npm run typecheck && npm test && npm run test:contract && npm run test:render`);
  - and `npm run test:php-smoke`: a hash is the browser's own, but prove it on the PHP library.
- Push nothing, build no release, and don't touch the live site or the Laragon copy.
- It is the browser alone: nothing in `server/`, `php/`, `schema/`, `src/shared/` or `src/flyer/` should change. If
  something there must, stop and tell me why first.
- Nothing new is drawn on screen, so no pictures are needed. If the plan comes to need something visible, draw it
  from the real library first (`backups/library-search/mockups.mts` shows how) and ask.
- Look at it in Chrome at 1440 and 390 px:
  - a library link pasted into a new tab;
  - Back and Forward;
  - into the editor and back.
- Record it:
  - a short report, `docs/reports/library-url.md`;
  - its rules in `docs/architecture.md`, under "Library views" or a new section;
  - CLAUDE.md's map line only if the map changes;
  - one line in the log of `docs/status.md`.

## What I asked for

"save the state of the filters in the url for have sharable url with saved params for open always same page"

So: a staff member sends a colleague the library's address, and it opens on the same filters, search and view.

## Decided (2026-10-15, my answers; not to be reopened)

- **The link carries** the three filters (Hostel, Template, Label), the search box, and the view (List / Grid).
- **Opening a link is the same as choosing what it holds.** They become what this browser remembers
  (`library.hostel`, `library.template`, `library.label`, `library.search`, `library.view`), as if picked by hand.
- **No "Copy link" button**: the address bar is enough, and nothing new is on screen.
- **Back undoes the last filter.** A change of a filter or of the view, or Clear, is a step in the browser's history:
  Back walks back through them, and Forward redoes them.

## What exists (read before planning)

- Routing is by hash (`src/editor/route.ts`). `parseHash()` maps `#/flyers/:id`, `#/new` and `#/ai`, and anything
  else to the library, so `#/?label=dinners` already opens the library. The hash never reaches the server: neither
  backend needs anything.
- **`App.tsx` does not key `Library` on `nav`, so the Library stays mounted while its hash changes.** Today it reads
  its filters once, in `useState` initializers (`Library.tsx`): Back between two library URLs would change nothing
  on screen. It must follow the URL.
- The leave guard (`createMoveGuard` in `route.ts`, driven by `tests/unit/route.test.ts`):
  - a move within one page (the same `pageOf`) is never refused;
  - replace the current entry only through `replaceHash(from, to)`, never `history.replaceState`;
  - a push is `go(hash)`;
  - browsers without the Navigation API route on `hashchange`.
- What the library remembers: `localStorageGet` / `localStorageSet` (`prefs.ts`). The readers below ignore a stored
  value they don't know:
  - `labelFilterFrom` (`libraryLabel.ts`), `viewFrom` (`libraryView.ts`) and `isTemplate` (`templates.ts`);
  - the hostel filter is read as stored, with no check, today. A link's hostel must be one of the hostels `App.tsx`
    hands `Library`, or `none`.
- The search: `SEARCH_PREF` and `searchWords` (`librarySearch.ts`). The list changes at every key (no debounce).
- Clear is `clearAll` in `Library.tsx`: it empties the box, sets the filters back to all, and gives the focus to the
  box.
- The ways back to the library:
  - "← Library" (`panel.tsx`) and the bar's "Library" (`App.tsx`), both `#/`;
  - Back from the editor;
  - the AI page's way out, `replaceHash('#/ai', '#/')`.
- Pure modules tested by themselves: `libraryView.ts`, `libraryLabel.ts`, `librarySearch.ts`. This rule goes in one
  too, `src/editor/libraryUrl.ts`: the library's state from a hash, and a hash from a state, with the readers above.
- Helpers in `tests/editor.ts`: `libraryFilter()`, `filterLibrary()`, `librarySearch()` and `searchLibrary()`. The
  library's specs: `library.spec.ts`, `library-views.spec.ts`, `library-labels.spec.ts`, `library-search.spec.ts`.

## Open points (Mine: show each in the plan to keep or strike)

1. The URL: `#/?hostel=<slug|none>&template=<activity|week>&label=<slug|none>&q=<words>&view=grid`. A value at its
   default (all, the list, an empty box) is left out, so the library with nothing chosen is `#/`.
2. A library URL with any of these keys is the whole state: a key it lacks is at its default. A bare `#/` means "as
   this browser remembers" (the bar's link, "← Library", the AI page's way out): it is completed by a replace, with
   no new step in the history.
3. A value this release doesn't know is ignored, as a stored one is: a hostel or a label off the list, a template or
   a view that is neither. The URL is rewritten without it, by a replace. Unknown keys are dropped too.
4. Typing in the search box replaces the current step's `q`, so Back undoes the last filter, never each letter. A
   change of a filter or of the view, or Clear, pushes a step. A step that is the same state as the one on screen is
   not pushed.
5. Back and Forward between two library steps:
   - they set the filters, the box and the view to that step's, and remember them;
   - the list reloads as for a filter changed by hand (`load()`, which applies only its latest answer);
   - the search reads through the library's one store, as it does now.
6. The editor and the AI page don't carry the library's state. Their way back is `#/` (point 2), so the library
   opens as it was left. Back from the editor lands on the library step it came from, with that step's state.
7. The branch is `feat/library-url` and the report `docs/reports/library-url.md`.

## Tests (at least)

- **Unit, `libraryUrl.ts`:**
  - each key read and written, the defaults left out, the round trip;
  - a value it doesn't know, an unknown key;
  - a damaged hash: %-escapes, a key twice, `#/?`, spaces and accents in `q`;
  - a bare `#/` against a library URL;
  - `parseHash` still maps each of them to the library.
- **Browser, `tests/render/library-url.spec.ts`:**
  - a URL opened in a fresh browser shows its filters, its box, its view and the list for them, and they are
    remembered after;
  - choosing a filter writes the URL;
  - Back undoes it and Forward redoes it: the list, the selects, the box and the view follow;
  - typing makes no step per letter, and Clear is one step;
  - a bare `#/` is completed from memory without a step: Back leaves the library;
  - a value off the list is ignored and dropped;
  - into the editor and Back, and "← Library";
  - the leave guard still asks on unsaved work: `editor.spec.ts`'s cases stay green;
  - 390 px.
- **A step in the PHP smoke test:** a library URL with a label and a search opens filtered.

## Not now

A "Copy link" button, the lightbox or the scroll position in the URL, the editor's or the AI page's state in the URL,
the canvas, short links, and anything in `server/` or `php/`.

When done, tell me what is left that is mine: the release (the files alone), my look on a phone, and every behaviour
that is yours and not mine.
