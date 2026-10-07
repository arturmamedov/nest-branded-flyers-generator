# Launch prompt: the editor's UX round, Part 2 (the panel folds, and so do its sections)

Written at the end of Part 1's session (2026-10-07) for a session with no memory of it. Paste the block below.

```
Read CLAUDE.md, then docs/prompts/editor-ux.md and docs/reports/editor-ux.md, and plan Part 2 of the brief:
the panel that folds, and its sections. Only Part 2.

- Start in plan mode. Build nothing before I approve the plan.
- Before anything else, check git against the brief's "Where it stands" and the report: the branch
  (feat/ai-feature-switches), the last commit (Part 1's record, "docs: Part 1 of the editor's UX round…", on top
  of 6f0f21d), and whether the tree holds work that is not yours. If anything contradicts them, stop and ask.
- My answers in the brief are decided: don't reopen them. The points marked "Mine" are suggestions: show each
  one in the plan so I can keep it or strike it.
- Show me the section's header in its states as pictures before you build the rest.
- Stay on feat/ai-feature-switches, a commit per piece as it goes green. Push nothing, build no release, and
  don't touch the live site or the Laragon copy.
- When the part is done, follow the brief's "End by handing over the next part".

What Part 1 left that the brief does not know:

- The notes above the flyer are gone. They are toasts now: src/editor/Toasts.tsx, mounted last inside
  .workspace by Editor.tsx and AiPage.tsx, hanging from .toasts-anchor (a sticky line with no height). A panel
  that folds changes the workspace's width: the toasts follow it by themselves, but look at them with the panel
  folded and open.
- Whether a warning starts folded is one media query, NARROW_QUERY in src/editor/toastFolds.ts (860 px, the
  width where the form goes on top). If Part 2 changes when the form goes on top, that constant moves with it.
- Tests read a toast through tests/editor.ts: toast(page, 'ok' | 'error' | 'warn'), closeToast(words),
  warningsChip(page). cutOff() reads through them. Add the helper that opens a section there too.
- A test about a toast's time stops the page's clock: stopClock() in tests/render/toasts.spec.ts. A success
  closes after 6 seconds, so check it straight after its action.
- "Write with AI" now writes the caption and saves the flyer, and is then a small "Write again" link in the
  Share text section (one <button> in both states, class "linkish ai-again"). ai.spec.ts has writeWithAi() and
  writeAgain(). Every test that presses it creates a flyer: ai.spec.ts keeps every flyer a page saves, in a
  beforeEach.
- Editor.tsx has new state near the top: captionOf, ownSave, here, aiButton. save() takes the draft to write.
  A new flyer's first save can now come from "Write with AI" as well as from Save and Download: the sections
  must not fold under the staff member then either.
- The brief's "closed section shows one line" suggests "Caption written" / "No caption yet": the editor already
  knows whether the caption stands for the flyer's details (captionWritten).
- The copy rules' warnings carry their field (Lint.field) in their id: warningId(`lint:${field}`, words) in
  Preview.tsx. The brief's dot on a closed section reads the same field.
- A pure rule of the editor lives in its own zod-free file with a unit test (toastFolds.ts, as route.ts does):
  which sections start open is a rule of that kind.
- File names: Windows does not tell Toasts.tsx from toasts.ts. Name a new module so that no two differ by case.

Still open from Part 1, mine to answer (the report's "For Artur to decide"): on a desktop an open toast lies over
the flyer's bottom-right corner (about 106 px at 1440 wide); whether warnings should start folded there too;
that the handle and the tag count as the flyer's details; the words that are yours.
```
