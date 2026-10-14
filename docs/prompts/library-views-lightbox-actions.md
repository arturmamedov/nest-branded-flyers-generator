# Launch prompt: the library's grid and list, a lightbox, and the quick actions on every flyer

Written 2026-10-13, at the end of the session that put the main reception flyer under the library's cards
(`fcfaf06`), for a session with no memory of it. Paste the block below.

Suggested run: Claude Opus 5.5 (`claude-opus-5-5`), effort **high**, started in plan mode.

```
Read CLAUDE.md, then build three things in the library: a grid or list view, a lightbox opened by a zoom icon on a flyer's preview, and
the editor's quick actions (Copy image, Copy text, Share, Download) on every flyer, so staff can post a flyer
without opening the editor. Client only: no API, schema, storage or PHP change, on both backends.

HOW TO WORK

- Start in plan mode. Build nothing before I approve the plan. Keep the plan SHORT: what changes, in a table, and
  the order. I can't read a long one. Points marked "Mine" are suggestions: show each one so I can keep or strike it.
- Check git first. The branch is feat/main-flyer-library; it holds fcfaf06 ("The library ends with the main
  reception flyer…", the poster under the cards) and is not pushed; main does not have it. Cut a new branch from it
  for this work (feat/library-views). docs/prompts/claude-design-brief.md and design-style-switcher.md are untracked
  and not part of this: leave them alone. If anything contradicts this, stop and ask.
- My answers below are decided: don't reopen them. The "Open points" are for the plan.
- Show me pictures, not words, for what is visual (the two views at 1440 and 360 px, the lightbox, where the
  actions sit) before you build the details. A mock-up drawn by the real <Flyer> beats a sketch.
- Every change with its test first; a commit per piece as it goes green. Push nothing, build no release, don't touch
  the live site or the Laragon copy. Warn me before a src/shared/ edit if npm run dev may be running.
- Before calling it done: npm run typecheck && npm test && npm run test:contract && npm run test:render, and
  npm run test:php-smoke; and look at it in a real browser (Chrome) at 1440, 1280, 390 and 360 px, with a real
  copy and a real download. A flyer's drawing must not change: the baseline stays byte-identical.
- Record it: a section in docs/architecture.md and an entry in docs/status.md in the style of the editor-UX entries, and docs/reports/library-views.md.

WHAT I ASKED FOR (decided)

1. See the flyers as a list (today) or as a grid. A switch with the filters at the top. The choice is remembered in
   the browser's local storage, always, through prefs.ts (localStorageGet / localStorageSet: a blocked storage just
   remembers nothing). A stored value that is neither view is ignored. Key next to library.hostel / library.template.
2. A zoom icon on a flyer's preview opens it large in a lightbox. A click on the picture itself still opens the
   flyer in the editor, exactly as today (my answer of 2026-10-13: "instead of full image box open the lightbox,
   let's add a zoom icon … and the image click still open the edit"). The icon opens the lightbox and nothing else:
   no navigation, no editor.
3. The most important buttons on the library view itself: Copy image, Copy text, Share, Download. The same ways out
   the editor has, with the same behaviour. The aim is speed: staff find what they need without opening a flyer.
Keep: Open, Duplicate and Archive, the filters, and the main reception flyer under the cards (the poster, its two
downloads), whole, in both views.

WHAT EXISTS (read before planning)

- Library.tsx and FlyerThumb.tsx. The card's picture is the real <Flyer> on DEFAULT_CANVAS (WhatsApp), scaled by a
  transform and prepared with prepareFlyer(). Never a second renderer, never a stored thumbnail. It asks
  GET api/flyers/:id when it nears the screen, and is decoration inside the card's link: aria-hidden and inert, so
  "a click on the picture is a click on the card". That contract STAYS: the picture is still inert decoration and
  its click still opens the editor.
  - The zoom icon is a new, separate control: a real <button> with an accessible name ("Zoom in on <title>" or
    similar), laid over a corner of the picture. It cannot sit inside the card's <a> (a button in a link) nor in the
    inert picture, so it is a sibling positioned over it. A click on it must not also follow the link.
  - Keep every existing library spec passing as it is. If the new button changes the tab order the specs hold
    ("Tab from the card's link goes straight to Open"; "the card and Open: two links"), place it where they still
    pass; if one must change, say which and why in the plan.
  - The list view's boxes keep their sizes (120 x 160, 96 x 128 on a phone): those specs are your regression guard.
  - Touch: the icon is no smaller than 44 px to hit (it may be drawn smaller), and it is visible on a phone, where
    there is no hover to reveal it. On a desktop it may be always shown or appear on hover and focus (open point).
- The ways out are built and tested; reuse them, never copy their logic. docs/architecture.md, "The flyer leaves the editor as
  a picture four ways", has every rule and its measured reason; read it whole.
  - exportActions.ts: which button is first (Copy image on a desktop, Share… on a phone), what is behind Download.
  - clipboard.ts: copyImage() must be called INSIDE the tap, with a promise for the PNG; a browser refuses a write
    that starts after an await (Chrome after about 6 s, Safari after any). copyText() likewise at the tap.
  - shareSheet.ts: the sheet takes no promise and opens only within 5 s of the tap, so the picture is made first;
    when that was too slow the editor's toast offers "Share now". The caption goes on the clipboard at the tap.
  - export/: createExporter(config).export({ id, format, canvas }) makes the picture of a SAVED flyer. A library
    flyer is saved, so there is no save step (the editor's picture() saves first only because its draft may be
    unsaved), and so no cache emptying.
  - Menu.tsx (the menu button), Toasts.tsx and toastFolds.ts (outcomes), tests/editor.ts (helpers: grantClipboard,
    clipboardPng, clipboardText, download, noClipboard, stopClock).
- The caption is data.share. The list's items (FlyerListItem) have six fields and no caption; the card's own
  fetch has the whole flyer. Do not add the caption to the list: that is a contract change on both backends and an
  older release would refuse it. Copy text needs the caption in hand at the tap.
- A frame with no photo does not export in the editor (needsPhoto in Editor.tsx: Download, Copy and Share are greyed).
  The library must say the same, from the same rule, not a second copy of it.
- The canvas: the editor's choice is per viewer, localStorage "editor.canvas" (Editor.tsx, CANVAS_PREF); the library's
  pictures are always DEFAULT_CANVAS by my answer of 2026-10-05.
- The library has no toasts: they live inside the editor's .workspace. Its only message surface is the error banner.

OPEN POINTS (settle them in the plan; one question a picture where it is visual)

- Which canvas do Copy image, Share and Download make? Mine: the viewer's stored editor.canvas, falling back to
  DEFAULT_CANVAS, the same picture the editor's Download gives; the lightbox shows that same canvas, with its name,
  so what is seen is what is copied. The cards' pictures stay WhatsApp.
- The view for someone who never chose: list (as today) or grid. Mine: list, so nothing moves for anyone until they
  choose.
- Where the actions sit in a list row and a grid card, and at 360 px, a finger's width apart (44 px targets). Mine:
  exportActions() decides the first button, Download opens PNG / JPG, and Copy text is its own button; the rest of
  the card's buttons (Open, Duplicate, Archive) do not get pushed off a phone's width. No sideways scroll.
- Where an action's answer shows: Mine: the editor's Toasts, mounted in the library, one outcome at a time, an
  error stays, a success with a next step ("Share now") stays until used, the same words as the editor's.
- The lightbox, opened by the zoom icon: the real <Flyer> at its canvas, fitted to the window (never the stored
  picture, never a second renderer); close button, Escape and a press on the backdrop close it; focus goes in,
  stays in, and comes back to the zoom icon that opened it; the page behind does not scroll; role="dialog" with a
  name. Mine: the same four actions and "Open" inside it; no previous / next in this first version.
- The zoom icon: which drawing (a magnifier with a plus, or "expand" corners), which corner, and always shown or
  on hover and focus on a desktop. Mine: a magnifier-plus in the picture's top-right corner, always shown, in the
  grid and in the list; draw it inline as SVG like the app's other icons (look at what the app already uses first).
- Only the cards near the screen load their flyer, and a grid shows more at once: say what that costs in a library
  of a hundred flyers, and keep the "asks once, only when near" rule that library.spec.ts holds.
- What else the card's one fetch can serve: Mine: one per-card fetch shared by the picture, the lightbox and the
  actions (the caption and needsPhoto are in it), so Copy text is synchronous at the tap.

NOT NOW

A dedicated page for the reception flyer, search, sorting, bulk actions, a second flyer style, a stored thumbnail,
anything that changes how a flyer is drawn. When this is done, tell me what is left that is mine (the release, a
phone trial over https as for Part 3 of the editor's UX round).
```
