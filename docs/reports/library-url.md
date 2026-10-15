# Report: the library's filters, search and view in its URL

2026-10-15, on `feat/library-url` from `main` (`844444b`), merged into `main` by fast-forward. The brief is `docs/prompts/library-url.md`. Tier
**Medium**: the editor's client alone. Nothing changed in `server/`, `php/`, `schema/`, `src/shared/` or `src/flyer/`.
Nothing is pushed, no release was built, and the live site and the Laragon copy were not touched.

His ask: "save the state of the filters in the url for have sharable url with saved params for open always same page".
A staff member sends a colleague the library's address, and it opens on the same filters, search and view.

## What Artur chose

The DECIDED points of the brief stand as written: the link carries the three filters, the box and the view; opening
a link is choosing what it holds; there is no "Copy link" button; and a filter, the view or Clear is a step that Back
undoes and Forward redoes. He approved the plan with its open points as follows.

| # | Point | Outcome |
|---|---|---|
| 1 | `#/?hostel=&template=&label=&q=&view=grid`, a default left out | Kept |
| 2 | A bare `#/` is "as remembered", completed by a replace | **Changed by the plan**, below |
| 3 | A value it doesn't know is ignored and dropped; unknown keys dropped | Kept; a stored hostel off the list is now ignored too |
| 4 | Typing replaces, a choice pushes, the same state is not pushed | Kept; Escape in the box counts as typing |
| 5 | Back and Forward set, remember and reload | Kept |
| 6 | The editor and the AI page carry nothing; their way back is `#/` | Kept |
| 7 | `feat/library-url`, this report | Kept |

**Point 2, why it changed.** As written, Forward could not redo a Clear. Clear writes `#/`. Back from it restores the
earlier state, and that state becomes what is remembered. Forward then lands on `#/`, which would read as remembered
and bring back the state Back had just restored. So a bare `#/` is read by when it is reached:

- **When the library opens on it**, it is the library as remembered, completed by a replace with no step. That covers
  a new tab, "← Library", the bar's link from another page, the AI page's way out and Back from the editor.
- **Reached while the library is on screen**, it is every flyer: Back, Forward, and the bar's "Library" pressed on the
  library, which is one step that Back undoes.
- One edge remains: from the editor, a jump of several steps at once (the Back button's long-press list) onto a step
  where Clear left `#/` opens as remembered.

## What was built

- **`src/editor/libraryUrl.ts`**, pure, holds the rule: the state from a hash (`null` for a hash with none of the
  keys), a hash from a state, what is remembered and how it is written.
  - One reader serves the URL and the browser's memory. It ignores a value it doesn't know, a hostel off the list
    included.
  - Remembering writes only the parts that differ from what is remembered. Opening the library as remembered writes
    nothing, and a view nobody chose stays unstored (`library-views.spec.ts` holds that).
- **`src/editor/useLibraryUrl.ts`**, the hook. It opens from the URL or from memory, and completes the URL by a
  replace. It follows `hashchange` for library hashes alone.
  - `choose()` is a step (`go`); `type()` rewrites the step on screen (`replaceHash`).
- **`Library.tsx`**: the five `useState`s became the hook's one state. The select, the view switch, the box, Escape
  and Clear call `choose` or `type`. The list still reloads through `load()` when a filter changes, by hand or by a
  step, and the search still reads through the library's one store. Nothing new is on screen.
- **`route.ts`**: `replaceUrl` swallows a refused `replaceState`. Safari refuses about 100 in 10 seconds, and the box
  rewrites the URL at every key.

## Tests

- `tests/unit/library-url.test.ts`, 16 cases:
  - each key read and written, the defaults left out, the round trip;
  - values and keys it doesn't know;
  - damaged hashes: a bad %-escape, a key twice, `#/?`;
  - spaces and accents in `q`;
  - a bare hash against a library URL;
  - `parseHash` maps each of them to the library;
  - what is remembered, and what is written.
- `tests/render/library-url.spec.ts`, 8 cases:
  - a link in a fresh browser (its selects, box, view and list), then remembered;
  - choosing writes the URL;
  - Back and Forward through a filter, the view and a template;
  - typing is no step, and Clear is one that Forward redoes;
  - a bare `#/` completed with no step, and Back leaves the library;
  - the bar's Library on the library;
  - a value off the list dropped;
  - into the editor and Back, then "← Library";
  - all of it at 390 px.
- The PHP smoke test, step 8: a link with a label and a search, pasted into a new tab, opens filtered with the
  search's "why" line.
- The leave guard: `editor.spec.ts` is unchanged and green.

**Gate**, run on the finished code:

- `typecheck`: clean;
- `npm test`: 904 passed, 56 files, run again on the final tree with the docs;
- `test:contract`: 387 passed, 235 skipped (the deployment targets, unset);
- `test:render`: 413 passed, 1 skipped;
- `test:php-smoke`: 3 passed.

## Looked at

In installed Google Chrome, driven by Playwright (not Artur's own profile: the Chrome extension was not used), on the
dev server's library at 1440 and 390 px. At both widths:

- a link opened in a fresh tab: label and grid;
- a template chosen and "pool" typed: the URL followed, with no step for the letters;
- Back undid the template (with the search typed on its step) and Forward redid it;
- Clear was one step and kept the view, and Back restored the search and filters;
- into a flyer and Back: the same step;
- "← Library": the same state, completed with no step.

Nothing on screen changed.

Seen on the way, not changed: a filter that matches nothing shows "No flyers here yet. Make the first one", the
empty library's message. It was so before; a shared link to a filter with no flyers now lands on it more easily.

## Left for Artur

- The release: the files alone (no backend changed), when you choose.
- Your own look on a phone: a link sent to a colleague, Back and Forward.
- Merging `feat/library-url` into `main`.
