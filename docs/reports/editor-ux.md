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
