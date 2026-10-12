# Report: the editor's UX round

The brief is `docs/prompts/editor-ux.md`: four parts, one session each. One section per part built.

## Part 1: toasts, and the AI caption that saves itself (2026-10-07)

Built on `feat/ai-feature-switches`, five commits on top of `497186c`, each as it went green. Nothing is pushed, no
release was built, and the live site and the Laragon copy were not touched. No provider was called.

It is the client alone, on both backends: no route, schema, generated file or PHP class changed. The flyer prints
the same: the story baseline is byte-identical to a capture of `497186c`.

### What was built

**The toasts** (`src/editor/Toasts.tsx`, the rule in `src/editor/toastFolds.ts`, the look in `editor.css`)

- Every note the editor and the AI page showed above the flyer is a toast in the stage's bottom-right corner. It
  floats over the stage and takes no height from it: the stage starts where the toolbar ends, with or without notes.
- Every toast has a close button.
- A closed warning whose problem is still there folds into a "⚠ n" chip in the same corner. A click on the chip
  opens them all again. With "Add a photo" folded, the chip is what says why Download is grey.
- An action's outcome keeps one slot. A success closes by itself after 6 seconds, and waits while the pointer or
  the focus is on it. An error stays until it is closed.
- A warning is known by its kind, its field and its words. A closed one stays folded while you type; one that
  went away and came back, or whose words changed, shows again.
- At 860 px and narrower the standing warnings start folded into the chip, and only an action's outcome opens.
  The toasts stand above the "Share text" pill there, which keeps its corner.
- An error is announced as an alert and a success as a status. The standing warnings are a plain list, not
  announced: they change with every key.
- A toast never takes the focus. A warning closed from the keyboard hands the focus to the chip.
- Not toasts, as before: "This flyer does not exist", the library's banner, "Could not reach the server".

**The caption** (`src/editor/Editor.tsx`, the list in `src/shared/share.ts`)

- One press on "Write with AI" writes the caption and saves the flyer, as one action. A new flyer gets its URL and
  its library name as on any first save.
- The save writes the draft as it is when the answer lands, with the caption in it: what was typed while the AI
  worked is saved too.
- After that the button is a small link, "Write again (2 left today)". It still asks before it replaces the
  caption.
- The link shows while the caption stands for the flyer's details: after a generation, on a flyer opened with a
  caption, and on a flyer handed over from Create with AI.
- The button is back when a detail changes, and when the caption is emptied. A detail typed back to what it was
  brings the link back.
- "The flyer's details" are the hostel, the template and the printed copy. The list is `SHARE_DETAILS` in
  `src/shared/share.ts` (`text`, `chips`, `extras`, `week`), and the server's `ShareInput` is typed from it.
- A caption typed by hand in the visit does not hide the button.
- If the save fails the caption stays in the form, unsaved, and the toast says: "✨ The AI wrote the caption, but
  the flyer was not saved. <the reason> Press Save to try again."
- "AI draft: check every fact before you print" now leaves at the staff member's own Save or download. The save
  that "Write with AI" makes does not remove it.
- A caption that lands after the page was left writes nothing.

### What differs from the plan Artur approved

- **The failed save's words.** The plan had "…was not saved: <the reason>. Press Save…". The server's reasons
  end with a full stop of their own, so it is two sentences: "…was not saved. <the reason> Press Save to try
  again."
- **The pure rule's file is `toastFolds.ts`,** not `toasts.ts`: on Windows that is the same file name as
  `Toasts.tsx`.
- **On a phone the corner follows the screen.** Found in review: on a short phone the stage ends below the
  screen, so a toast in its corner was out of sight. The corner now hangs from a line that stays at the screen's
  bottom edge until the stage's end is scrolled to.

### The tests

- Unit: `tests/unit/toast-folds.test.ts` (the folding rule), `tests/unit/share-details.test.ts` (the details, and
  that no field outside the list reaches the server's prompt).
- Browser: `tests/render/toasts.spec.ts` (18 tests, the editor), and in `tests/render/ai.spec.ts` two for the AI
  page's toasts and seven for the caption.
- The toasts have one home in `tests/editor.ts`: `toast(page, 'ok' | 'error' | 'warn')`, `closeToast(words)`,
  `warningsChip(page)`; `cutOff()` reads through them. All three browser suites use them.
- A test of a toast's time stops the page's clock (`stopClock` in `toasts.spec.ts`).
- **Not every test failed first.** The folding rule, the details list and each of the review's fixes had its test
  first. The move of the notes into the corner, and the caption's save, were written together with their tests;
  the older tests that read a note were moved to the new helpers in the same commit.

### The gates

On the final code: typecheck; 613 unit; 378 contract; 208 in the browser (74 of them the AI project's) and the
baseline skipped as always; 2 in the PHP smoke test. The baseline, run by hand: byte-identical to `497186c`.

### The look

In the installed Chrome driven by a script, on the Node backend with the fake provider, at 1440 × 900, 1280 × 800,
390 × 844 and 360 × 800. The 32 screenshots and the script are in `backups/editor-ux-part-1/`, outside git.

- **Not looked at by eye on the PHP backend.** The part is the client alone, and the PHP smoke test passed with
  the new helpers.
- **On a desktop an open toast lies over the flyer's bottom-right corner.** With the WhatsApp canvas, by about
  106 px at 1440 wide and 148 px at 1280. It takes no height from the flyer and closes with one click. This is the
  limit the plan named (T11); the measured overlap is larger than the plan's estimate.
- On a phone, warnings opened from the chip cover most of the flyer until closed. They start folded there.

### What the review found

A fresh-context review of `497186c..eea91a4`. No blocking defect. Fixed, each with its test first:

- A success kept its six seconds from the last render, so it stayed for as long as anyone typed.
- On a short phone a toast came and went below the fold (above).
- The pointer leaving let go of a success the keyboard was on (found while writing the review's timer test).
- The region a success is announced from was `display: none` while empty, so a screen reader might not read it.
- A caption emptied and then typed by hand read as the AI's: the link came back at the first character.
- The same rule broken in two fields was one warning to close.
- The chip's focus ring was clipped by the corner, which scrolls.
- Four tests claimed more than they checked: the drop test probed a point outside the corner; the details test
  listed its fields by hand; the timer test leaned on real time; the clean-up of saved flyers could run before an
  id was read.

Fixed without a failing test:

- **A caption that lands while the leave question is open.** The review's scenario: unsaved work, "Write with
  AI", "← Library", yes. The editor now checks the URL as well as the page itself, as the AI page does. The test
  for it passes without the check too, so the race did not reproduce here.

Left as they are:

- After the day's last generation the button is greyed, so the focus it dropped is not given back.
- Closing the last toast from the keyboard, with no chip to go to, leaves the focus on the page.
- The close button is inside the alert, so some screen readers read "Close this message" with it.
- A week row whose short name was typed and removed can read as a changed detail (the key moves). It errs
  towards showing the button.
- Every check of a success in the older tests follows its action directly. A later test that waits more than six
  seconds first would miss it.

### For Artur to decide

- **The overlap on a desktop** (the look, above). The fix offered in the plan: warnings start folded wherever the
  free strip beside the flyer is narrower than a toast. Look at `desktop-1440--03-warnings-and-saved.png` and
  `desktop-1280--…` first.
- **The handle and the tag count as details** (C7): changing either brings the button back, though the caption
  is not written from them.
- **The words** that are mine: the two toasts of the caption, "Write again", the chip's "Show 2 warnings" for a
  screen reader, "Close this warning".
- **A generation on its way is still not guarded** when leaving: with no unsaved work, "← Library" asks nothing
  while the AI writes. The generation is spent and the caption is dropped. It was open before this part.
- **Six seconds** for a success.

## Part 2: the panel folds, and so do its sections (2026-10-07)

Built on `feat/ai-feature-switches`, five commits on top of `1139234`, each as it went green. Nothing is pushed, no
release was built, and the live site and the Laragon copy were not touched. No provider was called.

It is the client alone: `src/editor/` and the tests. No route, schema, generated file, PHP class or `src/shared/`
file changed. The flyer prints the same: the story baseline is byte-identical to Part 1's capture.

### What Artur chose along the way

- The plan, with every *Mine* point of the brief (M1 to M7) and the plan's own eight (N1 to N8) kept.
- The folded panel, of three shapes: **"A slim rail (Recommended)"**.
- The look, of two shown as pictures: **"Look A and please make it more marked that we are in that session or by
  playing with paddings or with some slighty different bg very light or borders or this things mixed."** So an
  open section is a card: the pill grows into it, with a very light teal ground and a thin teal edge.
- The head and the rail: **"As drawn (Recommended)"**, with the fold button first.

The pictures he chose from are in `backups/editor-ux-part-2/pictures/` and `pictures-2/`, outside git.

### What was built

**The sections** (`Section` in `src/editor/panel.tsx`, the rule in `src/editor/sectionFolds.ts`, the look in
`editor.css`)

- Each section of the editor's form opens and closes by its header, which is a button.
- Closed, it is a pill: its name, then one line of what is inside, cut with "…" where the pill ends. The whole
  flyer reads at a glance.
- Open, the pill grows into a card that holds its fields.
- A closed section shows a dot while a copy rule's warning stands for one of its fields, and Photo while a frame
  has no photo. The rule about too many exclamation marks is about the whole flyer and marks no section.
- A closed section keeps its content: nothing typed is lost, the rows' list of saved flyers is asked for once, and
  the photo's file input stays.
- A photo dropped on the preview opens the Photo section when it lands.
- The AI page's three sections do not fold.

**Which sections are open**

- A new flyer and an AI-made one start with every section open.
- A saved flyer opens as the sections were left last time. Before any last time: When · Where · Cost, or the rows
  on a This week flyer, and the rest closed.
- One memory for every saved flyer in a browser (`editor.sections`), never in the flyer.
- A flyer that started new in the visit writes nothing, also after its first save by Save, Download or "Write with
  AI". Nothing folds under the staff member then.

**The panel**

- Its head holds the fold button ("Hide"), "← Library", and "Open all", which reads "Close all" once every
  section is open.
- Folded on a desktop it is a rail 56 px wide with the same two buttons, "Form" and "Library". At 860 px and
  narrower it is its head bar alone, 48 px, and the flyer gets the screen.
- Folded, the form is hidden whole: no field can be reached by Tab, by the pointer or by a screen reader.
- It starts open on every visit. The form gets its scroll place back when it opens again.
- Folding anything never changes a flyer, never makes it unsaved and never sends a request.

### What differs from the plan Artur approved

- **The form's head stands above the form, which scrolls by itself**, in the editor and on the AI page. The plan
  left `AiPage.tsx` untouched. The head was a sticky bar inside the scrolling panel, with room kept for it by
  scroll padding. That counts the bar's own controls as out of sight, so focusing one scrolled the form to its
  top: nothing to see while it held one link, and it broke "the form keeps its place" at the first test.
- **The fold button is first in the head**, before "← Library", so it is in the same corner in every state. The
  plan had it at the head's right end. He saw it in the pictures.
- **Its word is "Hide" while the form is open.** N8 named only "Hide the form" and the rail's "Form".
- **Photo opens when the photo lands**, not at the drop: a file the photo checks refuse opens nothing (found in
  review).
- **A closed Headline or ask shows its Spanish line when it has no English one** (found in review). The plan's
  table had the English lines alone.
- **This week's rows name each day once**: "4 rows · Fridays, Saturday 19/9, Most mornings".
- **A stored list keeps what it knows.** A section this release does not have is dropped from it; the plan read
  such a list as no last time.
- **`openSection(page)` with no title, meaning "Open all", was not built**: no spec needed it.

### The tests

- Unit: `tests/unit/section-folds.test.ts` (28): which sections start open, the stored list, the toggles, the
  section of every field a copy rule can name, each section's line.
- Browser: `tests/render/panel.spec.ts` (25), and in `tests/render/ai.spec.ts` the AI-made flyer, "Write with AI"
  as a first save, and the AI page on a short phone.
- `tests/editor.ts` has `sectionHead(page, title)`, `openSection(page, ...titles)` and `panelFold(page)`. Six
  older tests that open a saved flyer open the section they use first, and so does the PHP smoke test.
- **Not every test failed first.**
  - Failed first: the rule, the sections, the line, the dot, the opened Photo section, the fold, the scroll place,
    and each of the review's fixes but those named below.
  - Written after their code: the two checks of the AI-made flyer in `ai.spec.ts`. They hold the rule against a
    memory that says every section is closed.
  - Could not fail as first written: "a dropped photo that is refused opens nothing". The review found it, and
    four tests took its place.

### The gates

On the final code: typecheck; 641 unit; 378 contract; 234 in the browser (75 of them the AI
project's) and the baseline skipped as always; 2 in the PHP smoke test.

The baseline, run by hand, is byte-identical to the capture Part 1 made (`nest-ux1-baseline` in the temp folder).
Part 1's report says that capture is of `497186c`; its own list names `bb9cd5a`, which is no commit of this
repository. I checked against the folder as it is.

### The look

In the installed Chrome driven by a script (`backups/editor-ux-part-2/look.mjs`), on the Node backend with the fake
provider, at 1440 × 900, 1280 × 800, 390 × 844 and 360 × 800. The 54 screenshots and the measurements
(`notes.txt`) are in `backups/editor-ux-part-2/look/`, outside git.

| Window | Panel | Flyer | The warning toast over the flyer |
|---|---|---|---|
| 1440 × 900 | open (421 px) | 599 × 798 | 106 px |
| 1440 × 900 | folded (56 px) | 599 × 798 | 0 |
| 1280 × 800 | open | 491 × 654 | 132 px |
| 1280 × 800 | folded | 524 × 698 | 0 |
| 390 × 844 | open | 279 × 372 | the chip, in the corner |
| 390 × 844 | folded | 342 × 456 | the chip, in the corner |
| 360 × 800 | open | 279 × 372 | the chip |
| 360 × 800 | folded | 312 × 416 | the chip |

- On a desktop the flyer is as tall as the stage, so folding the panel does not make it bigger. It puts the
  warning toast beside the flyer, where with the panel open it lies over the flyer's corner (Part 1's open point).
- At 1280 wide the toolbar wraps to two rows once "Unsaved changes" shows, and the flyer is smaller for it. With
  the panel folded it is one row again.
- On a phone the flyer grows with the form folded: 342 px wide where it was 279 at 390 wide, 312 at 360.
- The look found one thing, fixed with its test first: under a finger the ring a pill wears under the mouse stayed
  on the pill tapped last.
- **Not looked at by eye on the PHP backend**: the part is the client alone, and the PHP smoke test passed with
  the changed helpers.
- **Not tried on a real phone.**

### What the review found

A fresh-context review of `1139234..c2482f0`. It found no fault in the fold's own logic (the state, the memory,
the focus, the hidden content). It found two regressions from moving the scroll to the form. It measured them on pages
built by hand from the stylesheet; my tests then showed both in the real editor. Fixed, each with its test first:

- **The panel widened with what was in it.** With nothing left to hold it to its width, a closed section's long
  line made it 473 px on "Long copy · stress test", and the stage narrower. It is 421 px again.
- **On a short phone the AI page scrolled as a whole**, and "← Library" left the screen (375 × 553).
- A file the photo checks refuse (a GIF) opened Photo, and on a saved flyer wrote that into the memory.
- "The ask" and "Headline" said "Empty" over a Spanish line that prints.
- A test that could not fail (above), and three that claimed more than they checked: the phone's "at most 45%"
  asserted only a lower bound; the rail's arithmetic passed at any panel width; no spec held the open panel's
  width.
- Not tested until then: a photo dropped with the panel folded, a line cut inside its pill, what the fold button
  names, and the fold across 860 px.

Fixed without a failing test:

- **A gap of less than a pixel between the rail and the head bar.** The rail's rules stood at 861 px and wider,
  the bar's at 860 and narrower: a zoomed window 860.8 px wide had neither. The rail is now every width the bar is
  not. The test browser has whole pixels only, so the test holds 861 and 860.
- Which sections a template shows was written twice, in the rule and in the form's own conditions. The form now
  asks the rule.
- Four section titles were literals where the other four came from `FIELD`. All are there now.
- Three comments that were wrong, and a CSS variable used once.

Left as they are:

- **The fold button says its state by its name alone** ("Hide the form" / "Show the form"). The review: a name
  that changes on the focused button is not announced by every screen reader, where `aria-expanded` is, and the
  section headers use that. It needs a visible word that stays the same in both states, and "Hide" / "Form" is
  what he approved.
- A browser where a clicked button does not take the focus (Safari) was not tried.
- The older specs still name the sections they open by their words.

### For Artur to decide

- **The fold button's word.** One word in both states ("Form"), with the state said to a screen reader, or
  "Hide" / "Form" as now.
- **The words** that are mine: "Hide", "Form", "Open all" / "Close all", "has a warning" for a screen reader, and
  the lines' fallbacks: "All hostels", "Empty", "Nothing added", "No rows yet", "photo set" / "no photo yet",
  "no tag pill", "Caption written" / "No caption yet".
- **On a saved flyer the template and the hostel are in "Flyer", which starts closed.** Switching template is one
  tap more than before.
- **A dropped photo opens Photo for good**: on a saved flyer that is how the sections were left, so Photo is open
  on every saved flyer until it is closed.
- **"Open all" and "Close all" are every section's**, the other template's too.
- **The cut-off warning marks no section**: it names no field.
- **The toast over the flyer's corner** (Part 1's point) is gone with the panel folded and unchanged with it open.
  The numbers are in the table above.

## Part 3: copy the picture, share it, and one clipboard (2026-10-12)

Built on `feat/editor-ux-part-3`, cut from `main` at `4e86083`. The brief said to stay on `feat/ai-feature-switches`;
Artur's message of the day replaced that: "Work in a new branch from main". Eight commits and their record, each as
it went green. Nothing is pushed, no release was built, and the live site and the Laragon copy were not touched. No
provider was called.

It is the client alone: `src/editor/` and the tests. No route, schema, generated file, PHP class or `src/shared/`
file changed. The flyer prints the same: the story baseline is byte-identical to the capture of before the round
(32 cases).

### What Artur chose along the way

- The plan as written: the brief's six *Mine* points (M1 to M6) and the session's own (N1 to N14), none struck.
- **The iPhone stays a risk, not a change** (N9): every phone's sheet gets the picture and the caption, as he
  decided in the brief.
- On Part 1's open point, in the message that started this part: "the toast like this is perfect, is opening
  closing correctly and now not disturbing users they can decide if see it or not". So the toast over the flyer's
  corner stays as it is, and warnings do not start folded on a desktop.

### The spike

A throwaway probe, run headless on this PC before the plan and kept nowhere: one page, real clicks, in Chrome 143,
Edge 155, the test browser (Chromium 153) and Playwright's WebKit build. Its clipboard writes carried a promise that
fails on purpose, so nothing was written.

| Asked | Chrome 143 and Edge 155 |
|---|---|
| A write started inside the tap, the picture 8 s later | Accepted, and the browser waited the 8 s |
| A write started 3 s after the tap | Allowed |
| A write started 6 s after the tap | Refused ("Write permission denied") |
| Does the tap still count after 4 s / after 6 s | Yes / no: the window is 5 s |
| Can the device share a file | Yes, on Windows too |
| A JPG on the clipboard | No: PNG only |
| A page on plain http at a LAN address | No clipboard, no share sheet: the call throws before there is a promise |

- So a copy works with one tap only if the clipboard is asked inside the tap, with a promise for the picture. Made
  the plain way (render, then copy) it would fail without a word on any render slower than 5 s.
- The share sheet has no such promise, and the same 5 s: a slow render needs a second tap.
- The phone's silence at "Copy text" was this: over plain http there is no clipboard, and the code threw.
- The test browser refuses every clipboard write until its context is granted it, and has no share sheet.
- **Not measured:** Firefox and Safari. Their documentation says the same: the write inside the tap, a promise for
  the picture (Firefox 127 and later, Safari 13.1 and later). Playwright's WebKit build on Windows says it cannot
  hold a PNG, so it proves nothing about Safari. No phone was tried.

### What was built

**The toolbar** (`Editor.tsx`, the rule in `src/editor/exportActions.ts`, the menu in `src/editor/Menu.tsx`)

- It reads `[Copy image] [Download ▾]`. Download opens a list: "PNG · sharpest", "JPG · smaller file". A download
  is two clicks where it was one.
- On a phone it reads `[Share…] [Download ▾]`, and Copy image is the list's third entry. "A phone" is a finger as
  the main pointer, the signal "Take a photo" goes by, not the window's width.
- On a desktop whose browser can share a file (Chrome and Edge on Windows can) "Share…" is the list's last entry.
- Each shows only where the browser can do it. With no clipboard and no share sheet the bar is `[Download ▾]`
  alone.
- The first button is the teal one. Alone, Download is.
- All of them are greyed while a frame has no photo, and all save first, as a download always did.
- The status, Save and these buttons are one group at the bar's right end. It wraps as a whole: no button drops
  alone to the left of a second row any more (JPG did, at 1280 px wide with "Unsaved changes").
- The menu is the editor's own, with no dependency. The arrows open it and move through it, Home and End jump,
  Escape hands the focus back to the button, Tab and a press anywhere else close it. It closes when its button is
  greyed: a photo dropped with the list open starts an action, and an entry must not start a second one.

**Copy image** (`src/editor/clipboard.ts`)

- One tap puts the canvas on screen on the clipboard, as a PNG. The clipboard is asked inside the tap and waits for
  the picture.
- "Image copied (1080 × 1440)." Where the flyer has a caption the toast offers "Copy the caption": two pastes, one
  tap each. Pressed, it says "Caption copied.".
- A refused copy says "Couldn’t copy the image: the browser refused. Keep this tab in front and try again, or
  download it." A save or a render that failed says its own reason.

**The toast's next step** (`Toasts.tsx`, the rule in `toastFolds.ts`)

- A toast can offer one next step, a small button under its words.
- Such a toast stays until the step is taken or it is closed. A plain success still leaves after six seconds.
- Taken from the keyboard, the step keeps the focus with its toast: it goes to the close button of the answer,
  also when the answer is an error, and never to the warnings' chip.

**Share…** (`src/editor/shareSheet.ts`)

- It opens the system's share sheet with the picture (the same PNG) and the caption as its text.
- The caption goes on the clipboard at the tap, before the sheet: what an app does with the sheet's text is the
  app's. After it: "Shared. The caption is on the clipboard too: paste it if the app left it out." With no caption,
  or a caption the clipboard refused: "Shared."
- A sheet closed without sharing says nothing.
- A picture that took longer than its tap allows waits in a toast: "The picture is ready." with "Share now".
  - "Share now" is a tap of its own, so it copies the caption again: minutes may have passed.
  - If the flyer or the canvas changed in between, the picture is made again.
  - Pressed twice, it is one sheet. It is not offered once a frame has no photo, where Share… is greyed too.
- The editor does not wait for the sheet. Its answer is a toast when it comes, and says nothing once another
  action has started or the page was left. No sheet opens over another page.
- A device that says a sheet is already open is told so, "The share sheet is already open.", and the picture is
  kept, with "Share now".

**One clipboard, and "Copy text"** (`clipboard.ts`, `share.tsx`)

- The share text and the picture go through one helper, which answers "copied" or why not, and never throws.
- "Copy text" now says so when it could not copy, under the caption, in the editor and on the AI page:
  - no clipboard: "Couldn’t copy: this browser gives the page no clipboard here. Select the text instead."
  - refused: "Couldn’t copy: the browser refused. Select the text instead."
- The pill on the stage keeps its one word, "Couldn’t copy", and its reason is a toast.
- **This closes the waiting item of 2026-10-07**, the phone's silent "Copy text".

**The focus after an action**

- A button an action greyed gets the focus back when the action is done, without scrolling to it. It was "Write
  with AI" alone; now it is one rule in `run()`, which the menu needed. A control the action never greyed is left
  alone: a photo dropped on the preview starts from none.

### What differs from the plan Artur approved

- **The copied picture is compared with the render it was made from, not with a later download.** The plan said
  "its pixels are the download's". Every way out saves first, a save empties the server's picture cache, and a
  second render is a second raster: the comparison failed once in three runs. The test now asks the server for
  the copy's own picture again (a cache hit, which it checks) and compares pixel for pixel.
- **The bar's buttons stand a little closer** (12 px of padding where the app's buttons have 14, 8 px between
  them). Found in the look: see below.
- **Three specs where the plan named one**: `clipboard.spec.ts` (what is copied), `toolbar.spec.ts` (the menu and
  the bar) and `share.spec.ts` (the sheet).
- **The real copy did not replace the clipboard for good.** The plan warned it would. Headless Chrome keeps a
  clipboard of its own, so the check ran in a Chrome window kept off the screen, and the text that was on the
  clipboard was put back afterwards.

### The look

In the installed Chrome 143 driven by a script, on the Node backend with the fake provider, at 1440 × 900,
1280 × 800, 390 × 844 and 360 × 800, the two phones with a finger as their pointer. The same script measured a
build of `main` first. Then once on the staged PHP backend, where the picture is made in the browser. The scripts,
33 screenshots and the numbers (`notes.txt`) are in `backups/editor-ux-part-3/`, outside git.

**The bar, against `main`**

| Window | State | `main` | Now |
|---|---|---|---|
| 1440 × 900 | saved, or unsaved | 1 row, flyer 599 × 798 | the same |
| 1280 × 800 | saved | 1 row, flyer 524 × 698 | the same |
| 1280 × 800 | unsaved changes | 2 rows, flyer 491 × 654, JPG alone at the left | 2 rows, flyer 491 × 655, the group at the right |
| 1280 × 800 | unsaved, form folded | 1 row, flyer 524 × 698 | the same |
| 390 and 360 wide | saved | 3 rows (140 px) | the same |
| 390 and 360 wide | unsaved changes | 4 rows (184 px), JPG alone at the left | 4 rows (182 px), Download at the right |

- **The look found one thing, fixed with its test first.** "Copy image" and "Download ▾" are some 40 px wider
  than "Download PNG" and "JPG" were. At 1280 wide a saved flyer's bar broke into two rows, and the flyer was 491
  wide where it had been 524. The group's buttons now stand a little closer, and the table above is the result.
- The last button is 16 px from the bar's right edge in every state. The menu's list opens inside the window at
  every width, over the flyer.

**A real copy.** In a Chrome window, with no clipboard permission granted: "Image copied (1080 × 1440)." and
Windows itself held a picture of 1080 × 1440. After "Copy the caption" Windows held the caption.

**How long a picture takes, against the sheet's 5 s**

| Where | From the tap to the picture |
|---|---|
| Node, the server's renderer | 0.9 to 1.9 s |
| PHP, the browser's own renderer, this PC | 0.7 to 0.9 s (1.6 s with a new flyer's first save) |
| The same, the processor slowed 4 times | 3.2 s: the sheet still opens |
| The same, slowed 6 times | 5.7 to 5.8 s: the tap no longer counts, so "Share now" |

- The slowing is Chrome's own, a rough stand-in for a phone: four times for a mid-range one, six for a slow one.
  No real phone was timed.

**Not looked at:** a real phone, Safari, Firefox, an iPhone. The share sheet was a stand-in everywhere, as in the
tests: a real one is a window of the device's own.

### The tests

- Unit: `tests/unit/clipboard.test.ts` (the helper, with a stand-in browser), `export-actions.test.ts` (the bar's
  rule), `share-sheet.test.ts` (the sheet's answers), and two more cases in `toast-folds.test.ts` (which toast
  leaves by itself).
- Browser, three new specs:
  - `tests/render/clipboard.spec.ts`: "Copy text" that could not copy; the copied picture at its exact size on
    both canvases, with the server's exporter and with the browser's; **the clipboard asked inside the tap**; the
    toast's step by mouse and by keyboard; a refused copy; a failed render; no clipboard at all.
  - `tests/render/toolbar.spec.ts`: the menu by mouse and by keyboard, the bar's shape and rows, the list inside
    the window at four widths.
  - `tests/render/share.spec.ts`: the sheet, against a stand-in, on a touch screen and on a desktop.
- The PHP smoke test downloads through the new helper, and has a third test: the picture copied on every canvas,
  read back at its exact size. On PHP the picture is made by the in-browser exporter. A run pointed at a
  plain-http deployment, where a page has no clipboard, reports that test as skipped, with the reason.
- `tests/editor.ts` has `download(page, 'png' | 'jpg')`, `downloadMenu()`, `exportEntry()`, `pickExport()`,
  `copyImage()`, `barActions()`, `grantClipboard()`, `clipboardPng()`, `clipboardText()`, `noClipboard()`,
  `copyOfSample()` and `newFlyerNoPhoto()`. `stopClock()` and `clientOnlyEditor()` moved there from two specs. The
  five suites that pressed "Download PNG" and "JPG" by name use `download()`.
- **Not every test failed first.**
  - Failed first, run against the build of the step before: the helper's unit tests and "Copy text"; the menu's
    ten; the bar's rule; the toast's rule; Copy image's ten; the share sheet's twelve; the one-row bar; and each
    of the review's fixes but those named below.
  - Could not fail first, because the build before already did the right thing: "with no clipboard there is no
    Copy image" and "a phone with no share sheet gets Copy image first". They hold the rule from here on. So do
    four of the review's: Tab out of the menu (Chromium already followed it), a closed list that no role finds,
    "Share now" after another canvas, and the caption as it is when the step is pressed.
  - Written with its code: the share sheet's unit test.
  - Checked by breaking the code on purpose: the write moved behind the save fails "inside the tap"; the list
    without its level fails "over the flyer" at 390 and 360 px.

### The gates

On the final code: typecheck; 676 unit; 378 contract; 283 in the browser (75 of them the AI project's, 47 in the
three new specs) and the baseline skipped as always; 3 in the PHP smoke test.

The baseline, run by hand before the review's fixes, is byte-identical to the capture of before the round
(`nest-ux1-baseline` in the temp folder, 32 cases). The fixes after it changed no file the flyer is drawn from.

### What the review found

A fresh-context review of `4e86083..ffd1e47`, from the code alone. It found no fault in the main paths: the copy
inside the tap, the menu's own logic, the bar's rule. It found gaps round "Share now", which can stay on screen for
minutes, and round the focus. Fixed, each with its test first:

- **"Share now" pressed twice asked for a second sheet.** The device's "already open" then took the place of the
  toast that held the picture.
- **"Share now" still worked after the flyer was changed to one with an empty frame**, where Share… itself is
  greyed: it would have saved and shared the blank band.
- **"Share now" told of a caption on the clipboard from the first tap**, however long ago. It copies the caption
  again now.
- **A clipboard that refuses at once never listened for the picture.** A render that then failed was an error on
  the page with no one to hear it.
- **A step taken from the keyboard lost its focus**: to the warnings' chip where one stood, and to the page when
  the answer was an error.
- **Whatever had the focus when an action started was taken for the control that started it.** A field the caret
  was in got the focus pulled back after a dropped photo.
- A test that could not fail (Tab "going past" entries that Tab never visits), and the smoke test's copy, which
  passed having checked nothing on a plain-http deployment.
- Not tested until then: a device that says a sheet is already open, and a caption the clipboard refuses at the
  step.

Fixed without a failing test:

- **Tab out of the menu.** The list was hidden at the key itself, before the browser moved the focus. Chromium
  follows a focus that sets out from a hidden element; other browsers may not. The list now closes once the focus
  has left it. The test holds where the focus lands, and passed before the fix too.
- A menu entry's focus ring was a shadow alone, which a system that paints its own colours over a page drops. It
  has an outline as well.
- Leftovers: "is this editor still the page on screen" was written twice, `image/png` three times, one helper
  only the tests used, and the three new specs each had their own copy of a new flyer.

Left as they are:

- "Share now" on a flyer changed since makes the picture again. From the keyboard, the focus then ends on the
  page: the toast that held the button is gone.
- A sheet whose answer never comes leaves "Share now" deaf. Share… in the bar still asks.
- The sentence for a picture with no clipboard at all is never shown: "Copy image" exists only where the browser
  can copy one.
- The specs' clean-up of saved flyers is copied in each, as in the older ones.

### For Artur to decide

- **The iPhone.** Every phone's sheet gets the picture and the caption, as decided. An open WebKit report (bug
  251500, filed 2023, never answered) says that on an iPhone a sheet given a picture and a text hands WhatsApp
  the text and drops the picture. Not tried: nobody here has an iPhone. If one shows it, the rule to build is
  "an iPhone's sheet gets the picture alone", and the caption is already on the clipboard.
- **A download is two clicks now**, Download and then the format.
- **Every way out saves first, even when nothing changed**, as a download always did. A save empties the
  server's picture cache, so a copy made right after a download renders again (about a second on Node). Skipping
  the save when nothing is unsaved would make the second one instant, and give a slow phone's share sheet more
  of its 5 s. It would also stop one editor writing its older copy over a newer one from another window.
- **A toast that offers a step stays until it is used or closed.** With a caption on the flyer, "Image copied"
  therefore stays in the corner, where a plain success leaves after six seconds.
- **"Share…" on a desktop** is the list's last entry wherever the browser can share a file. Windows' own sheet is
  thin: say so if it should go.
- **The words that are mine:** "Copy image", "Share…", "PNG · sharpest", "JPG · smaller file", "Copying…",
  "Preparing…", "Image copied (1080 × 1440).", "Copy the caption", "Caption copied.", "Shared.", "Shared. The
  caption is on the clipboard too: paste it if the app left it out.", "The picture is ready.", "Share now", "The
  share sheet is already open.", "Couldn’t open the share sheet. Download the picture instead.", and the four
  "Couldn’t copy" sentences.
- **Copying text the old way where a page has no clipboard** was left out (N13). It would make "Copy text" work
  over plain http too, which is the phone test's set-up and no staff member's.

### Yours to do

- **Try it on a phone.** A phone reaches this PC over plain http, where a browser gives a page neither a clipboard
  nor a share sheet: there the bar is `[Download ▾]` alone, and "Copy text" says why it could not copy. Two ways
  to try the rest:
  - After a release, on the live site, which is https: "Share…", then WhatsApp and Instagram, and see what each
    does with the caption.
  - Before one, with this PC's server over its own hotspot, as in the photo trials. On the phone, in Chrome, open
    `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add `http://192.168.137.1:8787`, set it to
    Enabled and relaunch. Chrome then treats that one address as https. Turn the flag off afterwards. Not tried
    here.
- **What to look at there:** whether the sheet opens at the first tap or asks for "Share now"; whether WhatsApp
  shows the caption under the picture; what Instagram does with it; and an iPhone, if staff have one.
- **The release** is yours, as before. Part 3 asks nothing new of the host: it comes with the files.
