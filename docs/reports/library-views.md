# Report: the library's views, a lightbox, and the ways out on every flyer

The brief is `docs/prompts/library-views-lightbox-actions.md`. Built on 2026-10-13, on `feat/library-views`, cut from
`feat/main-flyer-library` at `fcfaf06`. Nothing is pushed, no release was built, and the live site and the Laragon
copy were not touched.

It is the client alone, on both backends: no route, schema, generated file, storage driver or PHP class changed. A
flyer prints the same: the baseline is byte-identical to the capture of before (32 cases).

## What Artur chose

The plan was approved as written, with every *Mine* point kept (M1 to M9, below). Then four questions, each with
mock-ups drawn from the real library and the real `<Flyer>` (`backups/library-views/mockups/`):

| Question | His answer |
|----------|-----------|
| The zoom icon | **"Magnifier with a plus"**, in the picture's top-right corner, always shown |
| Where a card's actions sit | **"Ways out only, rest in a menu"**: Duplicate and Archive go behind "More" |
| The grid on a phone | **"Two columns, small buttons"** |
| The lightbox | **"As drawn"**: the flyer on a dark backdrop, the bar under it |

## What was built

**List or grid** (`src/editor/libraryView.ts`, `Library.tsx`)

- A switch beside the filters, List or Grid. The choice is kept in the browser as `library.view`. Someone who never
  chose sees the list, as before. A stored value that is neither view is ignored.
- The list is as it was: the same boxes, 120 × 160 and 96 × 128 on a phone.
- The grid shows each flyer at 252 × 336, three to a row on a desktop. On a phone it is two to a row at 136 × 181,
  with smaller buttons, two rows of two.
- The main reception flyer stays whole under the cards in both views.

**The ways out on every flyer** (`LibraryCard.tsx`, `WaysOut.tsx`, `pictureActions.ts`)

- Each card has: the first way out (Copy image on a desktop, Share… on a phone), Copy text, Download ▾ (PNG, JPG,
  and the other one of copy and share), and More ▾ (Open, Duplicate, Archive).
- They are the editor's own code, moved to one place both pages use: the same words, the same toasts, "Copy the
  caption" after a picture is copied, "Share now" when the picture took longer than a tap counts for.
- A library flyer is already saved, so nothing is saved first and no picture cache is emptied.
- The picture is of the canvas you last chose in the editor, else WhatsApp. The cards' own pictures stay WhatsApp.
- One action at a time across the library. The card at work says what it is doing; the others wait greyed.
- A frame with no photo is not made into a picture, by the editor's own rule. The card says "No photo in its frame
  yet: open it to add one." Its caption can still be copied.
- Copy text is greyed where a flyer has no caption.
- Until a card's flyer has loaded, its buttons and its zoom wait greyed. A flyer that cannot load leaves them so,
  and the card still opens it.
- What an action answers is the editor's toast, in the window's bottom-right corner. A failed Duplicate or Archive
  is a toast too. The red banner is only for a list that cannot load.

**The zoom button and the lightbox** (`Lightbox.tsx`)

- A magnifier over the picture's top-right corner, on every card, in both views and on a phone. It is 44 px to hit
  and drawn as a 30 px disc. It is a real button with the flyer's name ("Zoom in on Pool party").
- It opens the lightbox and nothing else. A click on the picture itself still opens the editor.
- The lightbox shows the real `<Flyer>`, fitted as the export fits it, as large as the window allows. Under it: the
  title, the canvas and its size, the same ways out, and "Open in editor".
- Close button, Escape, and a press on the dark backdrop close it. The focus goes in, stays in, and comes back to
  the zoom button. The library behind does not scroll.
- Inside it the toast is in the top-left corner, clear of the close button and of the bar.

## What is mine, and he kept

| # | Point |
|---|-------|
| M1 | The ways out and the lightbox make the viewer's stored `editor.canvas`, else WhatsApp |
| M2 | The list for someone who never chose |
| M3 | The editor's toast, bottom-right, same words |
| M4 | The lightbox has the ways out and Open; no previous / next |
| M5 | The magnifier, top-right, always shown, 44 px (he confirmed it from the picture) |
| M6 | Buttons greyed until the card's flyer has loaded |
| M7 | Copy text greyed with no caption |
| M8 | No canvas switch in the library |
| M9 | Superseded by his second answer: see the next section |

## What differs from the plan

- **Three assertions of `library.spec.ts` changed**, because of "rest in a menu". M9 said none would.
  - "The card and Open: two links" is now one link: Open is an entry of More.
  - "Tab from the card's link goes straight to Open" is now "to the zoom button", the next control.
  - Archive, and the phone's check of every button, go through the More menu and the card's buttons.
  - The PHP smoke test presses Duplicate, Archive and Open through More as well.
- **Open is also an entry of More.** The option I showed said only that Open stays the card's click. It is both.
- **The zoom button comes after the card's link in the page**, not before it as the plan said: with Open gone from
  the row there was no reason left to put it first.
- **Commits: three, not one per piece.** The shared ways out are one commit. The view, the card, the actions and
  the lightbox share `Library.tsx` and went in as one. The record is the third.
- **The look was in Playwright's Chromium, driven by a script, on Node.** Not in the installed Chrome by hand, and
  not by eye on PHP. See *The look*.

## What a grid costs in a hundred flyers

Only the cards near the screen load, once each, as before. A grid asks for about nine cards on a first desktop screen
where the list asks for about six, so up to twice the first requests and photos. Scrolled to the end, both views have
loaded every flyer, as the list always did. The spec that holds "asks once, only when near" is unchanged. On the PHP
backend an action asks for its flyer once more: the browser makes the picture there, as in the editor.

## The tests

New:

- `tests/unit/library-view.test.ts` (4): the default, a stored view, a value that is neither, the key.
- `tests/unit/picture-actions.test.ts` (6): the clipboard is asked inside the tap, before the picture is made; the
  caption's step; the share sheet with the caption; "Share now" is one sheet however often it is pressed; a changed
  flyer is made again; a late answer says nothing.
- `tests/render/library-views.spec.ts` (11): the switch and its memory; the grid at 1440, 390 and 360 px; the zoom
  button's place and size in both views; the lightbox against the export's fitted sizes, on both canvases; the
  focus, Escape, the close button, the backdrop; no scroll behind; the phone.
- `tests/render/library-actions.spec.ts` (12): the card's buttons; a real copy read back from the clipboard at
  1080 × 1440; a real download of PNG and JPG on both canvases; the share sheet stood in, on a phone; no clipboard;
  an empty frame; the lightbox's ways out; Duplicate and Archive; and the backend with no renderer.

Changed: `tests/render/library.spec.ts` (above), `tests/php-smoke/smoke.spec.ts`, and the helpers in
`tests/editor.ts`.

## What the review found

A fresh-context review read `fcfaf06..` and changed nothing. It found the editor's refactor equivalent to before
(nothing lost), the clipboard still asked inside the tap on every path, and the card's fetch as before. What it
found is fixed, each with a test that failed first:

- **A toast's next step could act on another flyer.** The flyer a message is about was noted when its action
  started. Copy image on A, Copy text on B meanwhile, and A's "Copy the caption" copied B's caption. It is noted
  when the message lands now.
- **A toast followed into another flyer's lightbox.** Opening a lightbox now clears it.
- **On a phone the lightbox's toast lay over its close button.** It is narrower there.
- **In a phone's grid, Download's list ran off the screen's left edge** for a card in the first column. It opens
  from the button's left end there.
- **The zoom button did not wait for an action in hand**: a Duplicate that landed left the page from under an open
  lightbox. It waits greyed now.
- **A press that started on the bar and ended on the backdrop closed the lightbox.** It needs both ends on the
  backdrop now.
- **A picture redrawn on another canvas would have shown unfitted.** No caller does that today; the mark is by
  flyer and canvas now.
- **Thin tests**: Copy text's "at the tap" was not checked; "the menu opens upwards" passed for a downward one.

Not fixed, said here:

- The focus comes back to the zoom button because the click focused it. Safari on a Mac does not focus a clicked
  button, so there the focus may fall to the page.
- "Share now" in the library and a late sheet answer there have no browser test of their own. The unit tests hold
  the shared rule, and the editor's `share.spec.ts` holds it in a browser.

## The look

`backups/library-views/look.mts` drove Playwright's Chromium against a build on Node, at 1440, 1280, 390 and 360 px,
in both views, with each menu open and the lightbox. The screenshots are in `backups/library-views/look/`, outside
git. The phones had a share sheet stood in.

What I saw and left:

- On a phone's list, More drops to a second row of buttons by itself at 390 px.
- The library's toast, bottom-right, lies over the lowest visible card's buttons at 1280 px and on a phone, until it
  closes itself or is closed. It is the editor's rule: a note never takes space.
- The seeded samples have no caption, so Copy text is greyed on all of them.

**Not done: the installed Chrome by hand, and PHP by eye.** A real copy is read back from the clipboard, and a real
file is downloaded and measured, in the specs, on Node and with the in-browser exporter PHP uses. Nothing was
pasted into another app.

## The gates

All green on `75bea4c`, the commit that holds the code (the record after it changes no code):

| Gate | Result |
|------|--------|
| `npm run typecheck` | clean |
| `npm test` | 704 passed |
| `npm run test:contract` | 381 passed, 235 skipped (the backends this machine does not run) |
| `npm run test:render` | 352 passed, 1 skipped (the opt-in baseline) |
| The baseline, against the capture `nest-ux4c-baseline` | 32 compared, byte-identical |
| `npm run test:php-smoke` | 3 passed |

`npm run test:php` was not run: no PHP file changed.

## For Artur to decide

- **Open is in More and is the card's click.** Say if it should be a button of its own again.
- **The buttons' words on a phone's grid**: "Download" and "More" have no arrow there, for room.
- **The toast over the lowest card's buttons** (above).
- **A flyer that cannot load** keeps its buttons greyed with no word of why.
- **The lightbox has no previous / next**, by the plan.
- **The canvas the library makes is the editor's last one**, and the library has no switch. Someone who last worked
  on a story in the editor copies stories from the library until they change it there. The lightbox says which.
- **Safari's focus** after the lightbox closes (above).

## Yours to do

- The release (`npm run build:php`, upload whole, `npm run deploy:tag`). It needs nothing new on the host: it comes
  with the files.
- A phone trial over https, as for Part 3 of the editor's UX round: over plain http a phone has neither the
  clipboard nor the share sheet, so there a card shows Copy text (which says why it cannot) and Download.
- An iPhone, Safari and Firefox were not tried.
