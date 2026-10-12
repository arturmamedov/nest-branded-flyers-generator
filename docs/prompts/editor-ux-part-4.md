# Launch prompt: the editor's UX round, Part 4 (a tag of 24 characters, with a pill that fits)

Written at the end of Part 3's session (2026-10-12) for a session with no memory of it. Paste the block below.
Part 4 ends the round.

```
Read CLAUDE.md, then docs/prompts/editor-ux.md and docs/reports/editor-ux.md, and plan Part 4 of the brief:
a tag of 24 characters, with a pill that fits. Only Part 4.

- Start in plan mode. Build nothing before I approve the plan.
- Before anything else, check git against the brief's "Where it stands" and the report: Part 3 was built on
  feat/editor-ux-part-3, cut from main at 4e86083, and its last commit is its record ("docs: Part 3 of the editor's
  UX round…", on top of da73f8d). See whether main holds it yet, and whether the tree holds work that is not
  yours. If main does not hold Part 3, ask me where to branch from. If anything else contradicts the brief or
  the report, stop and ask.
- Measure the pill in a browser before you plan: the brief's widths are estimates.
- My answers in the brief are decided: don't reopen them. The points marked "Mine" are suggestions: show each
  one in the plan so I can keep it or strike it.
- I sign off the proof sheet before the new limit is committed.
- A commit per piece as it goes green. Push nothing, build no release, and don't touch the live site or the
  Laragon copy.
- Part 4 ends the round: instead of a next prompt, tell me it is done and what is left that is mine (the
  release, the live site, the phone trial of Part 3).

What Parts 1 to 3 left that the brief does not know:

- The text limits already have one home: TEXT_LIMITS in src/shared/text.ts (zod-free, since 3e50661, 2026-10-09).
  The schema and the editor's inputs both read it, so the tag's 12 is one number there. The brief's "Mine" point
  about one home is done for the text lines. Still typed in Editor.tsx: the chips' 90 and the extras' 32 and 4.
- The same commit made the Spanish line 260 characters, and the WHEN chip's time one line that shrinks. Both are
  in CLAUDE.md's design decisions.
- The editor's form folds (Part 2). On a saved flyer "Top and tag pill" starts closed: a spec that fills Handle or
  Tag there calls openSection(page, 'Top and tag pill') first (tests/editor.ts). A closed section shows one line
  of what is inside, and that section's line names the handle and the tag: a longer tag is cut there with "…".
- The handle and the tag count as "the flyer's details" for the AI caption (SHARE_DETAILS in src/shared/share.ts
  holds `text` whole): changing the tag brings "Write with AI" back. That was left for me to decide in Part 1.
- What the editor says is a toast (Part 1): the cut-off warning is read through cutOff(page) and cutOffOn() in
  tests/editor.ts, and folds into a "⚠ n" chip at 860 px and narrower.
- The toolbar changed in Part 3: it reads [Copy image] [Download ▾], and on a touch screen [Share…]
  [Download ▾]. A spec downloads through download(page, 'png' | 'jpg') in tests/editor.ts, never by a button's
  name. A proof sheet can also take its pictures from POST api/render/:id, or from the render page.
- A copied or shared picture is the same export a download makes (picture() in Editor.tsx), so Part 4 changes
  all four ways out at once, and nothing in src/editor/export/ needs to know.
- The story baseline of before the round is still in the temp folder (nest-ux1-baseline, 32 cases) and was
  byte-identical at the end of Part 3. Part 4 is the first part that changes what a flyer prints: the baseline
  must hold for every flyer whose pill fitted before, and its capture has no long tag in it.
- tests/editor.ts also has copyOfSample(request, sample, title), which makes a saved copy of a seeded flyer
  through the API, and stopClock(page).
- The full browser suite takes 7 to 9 minutes (283 tests). While it runs, the build in dist/ must not be replaced
  and the specs must not be edited. The PHP smoke test has 3 tests now.
- A pure rule of the editor lives in its own zod-free file with a unit test (toastFolds.ts, sectionFolds.ts,
  exportActions.ts, clipboard.ts, shareSheet.ts, route.ts). No two file names may differ by case alone.

Still open, mine to answer (the report's three "For Artur to decide" lists):

- From Part 3: the iPhone (an open WebKit report says a sheet given a picture and a text hands WhatsApp the text
  alone; the build gives every phone both); that a download is two clicks; that every way out saves first, even
  when nothing changed, and a save empties the server's picture cache; that a toast with a step stays until it is
  used or closed; "Share…" as a menu entry on a desktop; the words that are yours. And the trial on a phone over
  https, which nobody has done yet: the report has the steps.
- From Part 1: that the handle and the tag count as the flyer's details; the words that are yours; that a
  generation on its way is not guarded when leaving; six seconds for a success.
- From Part 2: the fold button's word ("Hide" / "Form", or one word in both states); the words that are yours;
  that the template and the hostel are in a section that starts closed on a saved flyer; that a dropped photo
  leaves Photo open on every saved flyer until it is closed; that "Open all" is the other template's sections
  too; that the cut-off warning marks no section.
```
