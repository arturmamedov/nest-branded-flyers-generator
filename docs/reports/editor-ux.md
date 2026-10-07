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
