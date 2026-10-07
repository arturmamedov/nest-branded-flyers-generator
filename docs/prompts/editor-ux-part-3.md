# Launch prompt: the editor's UX round, Part 3 (copy the picture, share it, and one clipboard)

Written at the end of Part 2's session (2026-10-07) for a session with no memory of it. Paste the block below.

```
Read CLAUDE.md, then docs/prompts/editor-ux.md and docs/reports/editor-ux.md, and plan Part 3 of the brief:
copy the picture, the share sheet, and one clipboard. Only Part 3.

- Start in plan mode. Build nothing before I approve the plan.
- Before anything else, check git against the brief's "Where it stands" and the report: the branch
  (feat/ai-feature-switches), the last commit (Part 2's record, "docs: Part 2 of the editor's UX round…", on top
  of 02dc7eb), and whether the tree holds work that is not yours. If anything contradicts them, stop and ask.
- Start with the spike the brief asks for, and tell me what it found before you plan the build.
- My answers in the brief are decided: don't reopen them. The points marked "Mine" are suggestions: show each
  one in the plan so I can keep it or strike it.
- Stay on feat/ai-feature-switches, a commit per piece as it goes green. Push nothing, build no release, and
  don't touch the live site or the Laragon copy.
- When the part is done, follow the brief's "End by handing over the next part".

What Parts 1 and 2 left that the brief does not know:

- What an action came to is a toast: src/editor/Toasts.tsx, one slot, set by run() in Editor.tsx through
  setMessage({ kind, text }). The brief's "after 'Image copied' the toast offers 'Copy the caption'" needs a
  button inside a success. Toasts takes a ReactNode (the AI page's error has a link in it), but the editor's
  message is a string today.
- A success closes by itself after 6 seconds (OUTCOME_MS in src/editor/toastFolds.ts) and waits while the pointer
  or the focus is on it. A "Copy the caption" button in it has those six seconds.
- Tests read a toast through tests/editor.ts: toast(page, 'ok' | 'error' | 'warn'), closeToast(words),
  warningsChip(page). A test of a toast's time stops the page's clock: stopClock() in
  tests/render/toasts.spec.ts.
- The editor's form folds (Part 2). A saved flyer opens with most sections closed, Share text among them: "Copy
  text" and "Write with AI" are in it. A spec that opens a saved flyer calls openSection(page, 'Share text')
  before it presses either. tests/editor.ts also has sectionHead(page, title) and panelFold(page). The "Share
  text" pill on the stage is not in the form and needs none of this.
- A focus page's form is .panel: its head (.panel-head) and under it the form (.panel-body), which scrolls by
  itself. The editor's head holds the fold button, "← Library" and "Open all". Part 3 changes the toolbar, which
  Part 2 did not touch.
- The toolbar has little room. With the panel open at 1280 wide it wraps to two rows as soon as "Unsaved changes"
  shows (JPG drops to the second row), and the flyer is smaller for it. "[Copy image] [Download ▾]" is no wider
  than today's three buttons: look at 1280 with the panel open, and at 390 and 360, where the toolbar is three
  rows already.
- The menu behind "Download ▾" has no model in the code. The nearest is Section's header in src/editor/panel.tsx:
  a button with aria-expanded and aria-controls over content that is hidden, never unmounted.
- The brief asks to pick one signal for "a phone". Three are in use: NARROW_QUERY in src/editor/toastFolds.ts
  ((max-width: 860px), where the form goes on top), (pointer: coarse) in editor.css for the AI page's "Take a
  photo", and (hover: hover) for the ring a section's pill wears under the mouse.
- useCopy() in src/editor/share.tsx is as the brief describes it: Parts 1 and 2 did not touch it.
- A pure rule of the editor lives in its own zod-free file with a unit test (toastFolds.ts, sectionFolds.ts,
  route.ts). File names: Windows does not tell Toasts.tsx from toasts.ts, so no two may differ by case.
- A change of layout is worth a look at the panel's width: it is held to 421 px by min-width: 0, and
  tests/render/panel.spec.ts fails if anything widens it.
- The full browser suite takes 6 to 13 minutes. While it runs, the build in dist/ must not be replaced and the
  specs must not be edited.

Still open, mine to answer (the report's two "For Artur to decide" lists): from Part 1, the toast over the
flyer's corner on a desktop with the panel open (106 px at 1440 wide, 132 px at 1280; none with the panel
folded), whether warnings should start folded there too, that the handle and the tag count as the flyer's
details, and the words that are yours. From Part 2, the fold button's word ("Hide" / "Form", or one word in both
states), the words that are yours, that the template and the hostel are in a section that starts closed on a
saved flyer, and that a dropped photo leaves Photo open on every saved flyer until it is closed.
```
