# Brief: the editor's UX round (four parts, one session each)

Designed with Artur on 2026-10-07, in a session that read the editor and built nothing. He asked for five
changes after using the editor on the live site. They are grouped here into four parts, each built in its own
session, one after another.

Artur starts Part 1 with its launch prompt, at the end of this file. Each session then ends by handing him the
next part's prompt, so he never has to come back here for one.

## Where it stands (2026-10-07)

- The branch is `feat/ai-feature-switches`. Asked on 2026-10-07, Artur chose "Stay on feat/ai-feature-switches"
  for all four parts. Don't ask again, and don't cut a branch.
- The last commit before this brief is `e3b29de`. This brief's own commits sit on top of it. Nothing is pushed,
  and `main` is at `684189e`.
- **Part 1 is built** (2026-10-07): its section of `docs/reports/editor-ux.md` says what it left, and
  `docs/prompts/editor-ux-part-2.md` is Part 2's prompt, which replaces the starting point at the end of this file.
- **Part 2 is built** (2026-10-07): its section of the report says what it left, and
  `docs/prompts/editor-ux-part-3.md` is Part 3's prompt, which replaces the starting point at the end of this file.
- **Part 3 is built** (2026-10-12): its section of the report says what it left, and
  `docs/prompts/editor-ux-part-4.md` is Part 4's prompt, which replaces the starting point at the end of this file.
  - **It is on another branch.** Artur started it with "Work in a new branch from main", which replaced the
    first line above for that part: `feat/editor-ux-part-3`, cut from `main` at `4e86083`.
  - Seen then: `main` is on origin at `4e86083`. It holds Parts 1 and 2, and two commits of 2026-10-09 and
    2026-10-10 on top (the WHEN chip's time and the Spanish line's 260 characters; two copy warnings dropped). So
    the second line above is no longer true either.
  - For Part 4, see where Part 3's work is and ask him where to branch from if `main` does not hold it.
- Commit each piece as it goes green, as in the flyer from a photo.
- Before anything else, check git against that: the branch, the last commit, and whether the tree holds work that
  is not yours. Another session may write in the same folder, so stage by path and never check out. If anything
  contradicts this brief or the report, stop and ask.

## Rules for every part

- **Start in plan mode.** Read what the part names, show one plan, and build nothing before Artur approves it.
- **His answers below are decided.** Don't reopen them.
- **Points marked *Mine* are not his word yet.** They are the designing session's suggestions. Show each one in
  the plan, so he can keep it or strike it.
- A change comes with a test that fails first.
- Before calling a part done: `npm run typecheck && npm test && npm run test:contract && npm run test:render`,
  all green, and `npm run test:php-smoke` where the part changes what the editor does on the PHP backend.
- Look at the result in a real browser: on a desktop, and at 390 and 360 px wide. The Chrome extension when it is
  connected, else Playwright's Chrome.
- End with a fresh-context review of the part's diff, and fix what it finds, each with its test first.
- Write the part's section in `docs/reports/editor-ux.md` (one section per part: what was built, what the review
  found, what is left for Artur to decide), and bring CLAUDE.md's status up to date.
- Push nothing. Build no release. Don't touch the live site or the Laragon copy.
- **End by handing over the next part** (Artur's ask, 2026-10-07: "ask each session to come back with next
  session standalone prompt at the end for follow up always untill the end the work").
  - When the part is done and committed, write the next part's standalone prompt, for a session with no memory
    of this one. Start from its launch prompt at the end of this brief.
  - Add what this part left: the last commit, what the next part will meet that this brief does not know (a new
    component, a renamed test helper, a selector that moved), what Artur decided along the way, and what is still
    open.
  - Save it as `docs/prompts/editor-ux-part-<n>.md`, commit it with the report, and give it to Artur in the chat,
    ready to paste.
  - The order is 1, 2, 3, 4 unless he says otherwise. Part 4 ends the round: instead of a prompt, tell him it is
    done and what is left that is his (the release, the live site).
- Artur often runs `npm run dev`: warn him before large edits to the server or `src/shared/`.
- The editor's own look is the editor's (`editor.css`). Nothing here changes the flyer except Part 4.

**Not in this round.** These are waiting items of their own, and none is designed:

- the wording of what is left today ("AI credits left", in Artur's words);
- "one mixed caption", the second shape for the share text;
- steps 7 and 9, and the second flyer style.

## What Artur asked for, in his words

> - When we already clicked to generate with AI for the share text, let's auto save it and also hide the button
>   of AI untill the flyer info aren´t change again.
> - The notifications let's make it all like toast appearing only on the right down corner and with always a
>   close button otherwise they disturb the users to see the flyer in full it possible size.
> - Let's make the left sidebar with all option collapsible to the left in descktop and it's internal section
>   also as pill dropdown section for group all the settings in many places and allow the user to open/close
>   only with what he is working, open everything by default for new or just generated flyer and mostly all close
>   for flyers that was already created and we edit them, so user will be guided better trough all the processes.
> - Is it possible instead of download the photo just copy it to clipboard? If yes le'ts start to create a
>   dropdown from Download PNG, JPG, adding copy to clipboard or something similar. And if it's possible copy
>   with share text too but I gues it's not possible.
> - Tag fiels should allow some more chars for be able to write things like "!Come with us!" and little more.

## His answers (2026-10-07)

| Asked | He chose |
|---|---|
| After the AI writes the caption, how does someone get a second try? | "Keep a small 'Write again' link" |
| A closed warning whose problem is still there | "Fold into a '⚠ 2' chip" |
| Which sections start open on an existing flyer | "WHEN, WHERE, Costs, open and remember As I left them lst time is nice too, what we can merge?" |
| The toolbar's export buttons | "Copy beside Download" |
| How long the tag may be | "24 characters" |
| A "Share…" entry for phones, with the picture and the caption | "Yes, with copy image" |
| The phone's silent "Copy text", with the clipboard work | "Yes, fix it there" |
| Where the sessions commit | "Stay on feat/ai-feature-switches" |

**The merge he asked for, for the sections.** An existing flyer opens as the sections were left last time.
Until anything was ever folded, "last time" means When · Where · Cost open (the rows on a This week flyer) and
the rest closed. A new flyer and an AI-made one always start fully open, and what is folded there is not
remembered.

---

## Part 1: toasts, and the AI caption that saves itself

Two things in one session, the toasts first. The caption's new messages are then written once, against them.

### The toasts

**Decided**

- **The rule that outranks the rest: a note never takes space from the flyer.** His words (2026-10-07): "the
  important thing is that they not stole space to the flyer so fold if it's will not or close". Whether a note
  folds or closes matters less than that.
- Every note the editor shows above the flyer becomes a toast in the bottom-right corner of the stage.
- It floats over the stage, out of the layout, so the flyer keeps the whole stage. The "Share text" pill
  (`.share-fab`) already works that way.
- Every toast has a close button.
- A warning whose problem is still there folds, when closed, into a small "⚠ n" chip in the same corner. A click
  on the chip opens them again.

***Mine***

- An action's outcome keeps its one slot, as today: a new action replaces the last one's message.
- A success closes by itself after a few seconds, and waits while the pointer or the focus is on it. An error
  stays until it is closed.
- A warning that goes away and comes back shows again. A closed warning whose words have not changed stays
  folded while the staff member types.
- On a desktop the corner is usually empty stage beside the flyer. On a phone the flyer fills the stage, so an
  open toast covers part of it. There, and in any window that narrow, standing warnings start folded into the
  chip, and only an action's outcome opens, for its few seconds.
- One component, used by the editor and by the AI page, which has the same block.
- Not toasts: failures with no flyer on screen (the editor's "This flyer does not exist", the library's banner,
  "Could not reach the server").
- A toast never takes the focus. An error is announced as an alert, the rest as a status.

**What the code says today**

- `src/editor/Editor.tsx`: the `.notes` block sits between the toolbar and `<Preview>`. Five kinds share it:
  `message` (one slot, `ok` or `error`, set by `run()`), the AI draft warning (`aiDraft`), "Add a photo"
  (`needsPhoto`, with its "switch to No photo" button), the cut-off note (`CutOffNote` in `Preview.tsx`) and the
  copy rules (`lints`, from `lintFlyer`).
- `src/editor/AiPage.tsx` has its own `.notes`: an error (with the "Try again" of `PictureKept` inside it), the
  cut-off note and the copy rules.
- `editor.css`: `.notes`, `.note`, `.note-warn`, `.note-error`, `.note-ok`. `.workspace` is `position: relative`,
  which is what `.share-fab` hangs from.
- At 860 px and below the form is on top and `.share-fab` moves to the bottom-right corner: the toasts must not
  cover it there.
- `<Preview>` measures the stage with a `ResizeObserver`, so the flyer grows by itself once the notes leave the
  layout.
- The toolbar's "Saved" / "Unsaved changes" (`.toolbar .status`) is not a note and stays.

**Tests that hold today's behaviour**

- `tests/render/editor.spec.ts` reads `.notes .note-ok` and `.notes .note-error` by text, and one test relies on
  a later action's message taking an earlier one's place.
- `tests/editor.ts`: `cutOff()` finds `.note-warn`. `tests/php-smoke/smoke.spec.ts` has `errorNote()`.
  `tests/render/ai.spec.ts` reads the AI page's notes.
- Give the toasts one home in `tests/editor.ts`, shared by all three suites.
- A success that closes by itself must not make a slow test miss it.

### The AI caption

**Decided**

- One press on "Write with AI" writes the caption and saves the flyer.
- After that the big button is gone, and a small "Write again" link stays for a second try.
- The big button comes back when the flyer's details change.

***Mine***

- "The flyer's details" are what the caption is written from: the hostel, the template and the printed copy. On
  the server that list is `ShareInput` in `server/ai/prompt.ts` (`text`, `chips`, `extras`, `week`). The editor
  should read the same list from one place, never a second copy. The photo, its crop, the library name, the
  canvas and the caption itself are not details.
- An existing flyer that opens with a caption shows the small link. One with no caption shows the button. So
  nothing new is stored with the flyer.
- A caption typed by hand in this visit does not hide the button: only a generation does, or opening a flyer
  that has one.
- If the save fails, the caption stays in the form, unsaved, and the toast says it was written but not saved.
  The generation is counted either way.
- The "AI draft: check every fact before you print" warning goes away at the first save today
  (`aiDraft = handoff !== null && flyerId == null`). The automatic save would remove it at the moment the caption
  is written. Suggested: it stays until the staff member's own Save.
- The question before a caption is replaced (`confirm()`) stays as it is, and so does the count beside the
  button: its wording is a waiting item.

**What the code says today**

- `writeShare()` in `Editor.tsx` asks `api.aiShare()`, sets the caption with `setData({ share })`, and answers
  "✨ The AI wrote the caption: read it before you post." The flyer is then unsaved.
- **The trap:** `save()` builds its input from the `draft` of the render it was made in. The caption arrives
  after that render. An automatic save has to write the draft as it is when the answer lands, with the answer's
  caption (`latestDraft` is there for this).
- A new flyer's first save makes its URL (`replaceHash('#/new', '#/flyers/:id')`) and fills an empty library
  name. The automatic save does the same.
- `run()` takes one action at a time (`busy`). The write and the save are one action.
- A refused generation (429) empties the feature's count: `onRemaining(ai.name, 0)`.

**Done when**

- No note takes height from the stage, in the editor or on the AI page, on a desktop and on a phone.
- A closed warning can always be found again, and Download is never greyed out with no reason within reach.
- One press writes and saves; a failed save says so; the big button is back after a detail changes.

---

## Part 2: the panel folds, and so do its sections

### Decided

- On a desktop the whole left panel folds away to the left, and opens again.
- Each section inside it opens and closes on its own. His words for the look: "pill dropdown section".
- A new flyer and an AI-made one start with every section open.
- An existing flyer starts as in the merge above: as left last time, and before any last time, When · Where ·
  Cost (or the week's rows) open and the rest closed.

### *Mine*

- **A closed section shows one line of what is inside:** the headline's two lines, the day and the place, "In a
  frame · photo set", "Caption written" or "No caption yet". The whole flyer then reads at a glance.
- **"Open all" and "Close all"** in the panel's head.
- **The panel starts open on every visit.** A form hidden on arrival would look broken. Only the sections are
  remembered.
- **On a phone** the same button folds the form up to its head bar, so the flyer gets the screen. He asked for
  the desktop only.
- **A closed section that holds a field with a copy-rule warning shows a dot.** The rules name their field
  (`Lint.field`: `headline1`, `chip.when`, `extras.0`, `week.0.time`, `tag`).
- **A photo dropped on the preview opens the Photo section,** so its zoom controls are there.
- Show Artur the header in its states (open, closed with its line, with a dot, the folded panel) as pictures
  before building the rest. Use the `frontend-design` skill for the look.

### What the code says today

- `Section` in `src/editor/panel.tsx` is `<section className="section"><h2>`, with an optional hint. The AI page
  uses it three times: those do not fold.
- The sections of an Activity flyer, in order: Flyer, Headline, When · Where · Cost, Nice to know, The ask,
  Photo, Top and tag pill, Share text. A This week flyer has Flyer, Title, This week's rows, The ask, Top and tag
  pill, Share text.
- `.panel` is 380 px wide with a sticky head (`.panel-head`, 48 px) that holds "← Library", the editor's one way
  back. **That way back must stay on screen with the panel folded.**
- At 860 px and below the form is on top, at most 45% of the screen's height.
- `App.tsx` remounts the editor on every move. A new flyer's first save keeps it mounted: the sections must not
  fold under the staff member at that moment.
- A closed section must keep its content mounted. `WeekRowsField` fetches the saved flyers when it mounts, and
  the Photo section holds the hidden file input.
- A viewer's choices live in the browser through `src/editor/prefs.ts` (the canvas is `editor.canvas`). Never in
  flyer data.
- No global CSS reset in the editor: it would leak into the flyer.

### Tests that hold today's behaviour

- The browser suites fill fields by their labels. A field in a closed section cannot be filled, so every spec
  that opens an existing flyer needs a way to open a section: one helper in `tests/editor.ts`, shared with the
  PHP smoke test.
- `EDITOR_VIEWPORT` is "a desktop window where the editor's form overflows its panel", and
  `tests/render/editor.spec.ts` scrolls that form. With the sections closed it may no longer overflow.
- `backToLibrary()` finds the link inside `.panel`.

### Done when

- The panel folds and opens with the keyboard as well as the mouse, and its content cannot be reached while it
  is folded.
- The three start states hold: new, AI-made, existing (first time, and as left).
- Folding anything never changes a flyer, never makes it unsaved, and never loses what was typed.

---

## Part 3: copy the picture, share it, and one clipboard

### Decided

- The toolbar becomes `[Copy image] [Download ▾]`. The menu holds PNG and JPG.
- A "Share…" entry on phones opens the system's share sheet with the picture and the caption.
- The phone's silent "Copy text" is fixed here. It was a waiting item since 2026-10-07.

### What is possible, and what is not

- **Copying the picture works,** as a PNG. Browsers put no JPG on the clipboard.
- **The picture and the caption in one paste does not work in practice.** One clipboard entry can hold both, but
  the app pasted into keeps one of them. Artur guessed as much.
- So after "Image copied" the toast offers "Copy the caption" as the next step: two pastes, one tap each.
- The share sheet is the one way to hand over both at once, and whether the app keeps the caption depends on
  the app. So the caption also goes on the clipboard before the sheet opens.

### Start with a spike

Report it to Artur before building. The export takes seconds on the PHP backend (`ClientExporter` mounts the
flyer, waits for fonts and images, then shoots it), and browsers only allow a clipboard write or a share sheet
close to the tap that asked for it.

- Does a clipboard write started inside the tap, with a promise for the PNG, work in Chrome, Edge, Firefox and
  Safari on a phone?
- Does the share sheet still open once the picture is ready? If not, the entry renders first and the toast then
  offers "Share now" as a second tap.
- What does the browser answer where there is no clipboard at all?

Label anything the spike builds as throwaway.

### *Mine*

- Copy image copies the canvas on screen, after saving, as a download does: what you see is what you copy.
- "Copy image" shows only where the browser can do it. "Share…" shows only where the device says it can share a
  file.
- **On a phone "Share…" is the first button.** Artur asked on 2026-10-07 whether the share sheet would be the
  primary option. Suggested: yes on a phone, no on a desktop.
  - A phone: `[Share…] [Download ▾]`, the menu holding PNG, JPG and Copy image. The sheet is how a phone hands a
    picture to WhatsApp or Instagram.
  - A desktop: `[Copy image] [Download ▾]`, as he chose. Windows has a share sheet too, and the spike says
    whether it is worth a menu entry there.
  - "A phone" is one of the signals `editor.css` already uses (860 px and below, or a coarse pointer). Pick one.
- What an app does with the caption is the app's: expect WhatsApp on Android to keep it, an iPhone to drop it
  more often, and Instagram to ignore it. The spike tries Artur's own phone, and the report says what it saw.
- One clipboard helper for text and picture, each answering "copied" or "couldn't" the same way.
- The menu is a small component of the editor's own, with the keyboard a menu needs (Escape, the arrows, a click
  outside). No new dependency.

### What the code says today

- `onDownload()` in `Editor.tsx` saves, asks `exporter.export({ id, format, canvas })` and clicks a link. The
  toolbar has "Download PNG" and "JPG", both off while a frame has no photo (`needsPhoto`).
- The export seam is `src/editor/export/`: `FlyerExporter.export()` answers `{ blob, filename }` on both
  exporters. A copy is the same call with `png`. No second renderer.
- `useCopy()` in `src/editor/share.tsx` calls `navigator.clipboard.writeText()` directly. Where the browser
  gives a page no clipboard, `navigator.clipboard` is undefined and the call throws before there is a promise,
  so the button never says "Couldn’t copy: select the text instead". That is the silence on the phone.
- A browser gives a page a clipboard only over https or on the device itself. The live site and the Laragon
  copy are https; a phone on a LAN address over http is not, and Artur's test was that.

### Tests that hold today's behaviour

- `tests/render/editor.spec.ts` grants the clipboard to Chromium and reads the caption back (on Windows the
  clipboard holds CRLF). A copied picture can be read back the same way, and its size checked against the
  canvas.
- "Download PNG" is clicked by its name in `editor.spec.ts`, `fidelity.spec.ts` and `tests/php-smoke/smoke.spec.ts`.
- Both exporters: the render suite runs the server's, the fidelity spec and the PHP smoke test the browser's.

### Done when

- A copied picture is the canvas on screen at its exact size, on both backends.
- "Copy text" and "Copy image" both say so when they could not copy, and why.
- Artur has tried it on the live https site from his phone, or the report says that is still his to do.
- CLAUDE.md's waiting item about "Copy text" on the phone is closed.

---

## Part 4: a tag of 24 characters

The only part that changes what a flyer prints. It can be built at any point between the others.

### Decided

- The tag may be 24 characters. Today it is 12, and "¡Come with us!" is 14.

### *Mine*

- The handle keeps its 18.
- **The pill becomes a fitted line.** When the handle and the tag are too wide together, the letters shrink,
  down to a floor. Past the floor the editor's cut-off warning names it, as for any other line.
- **The text limits get one home.** They are typed twice today: in `TextSchema`, and again as `maxLength` beside
  each input in `Editor.tsx`. Move them to a zod-free module in `src/shared/`, as `week.ts`, `names.ts` and
  `share.ts` do, read by `schema.ts` and by the inputs. The chip's 90 and the extras' 32 and 4 are typed twice
  in the editor too, though their constants exist (`chips.ts`, `extras.ts`).

### What the code says today

- `src/shared/schema.ts`: `tag: z.string().max(12)`, `handle: z.string().max(18)`. Its header says why they are
  short: "Max lengths keep the unfitted, nowrap lines (eyebrow, handle, tag) inside the safe box".
- `src/flyer/Flyer.tsx` draws the pill centred on the whole canvas: 34 px letters with 0.04em spacing, an 18 px
  gap, a 14 px dot, 38 px of padding each side, tilted 0.6°. It carries no `data-fit`.
- The pill's box in `layout.ts` (`sharedGroups`) is the safe column: 940 px on the story, 1000 on WhatsApp.
- A default pill ("@NESTSHOSTELS · ¡TAG US!") is about 583 px wide. That is an estimate from a screenshot, about
  22 px a capital: measure it in a browser. By the same estimate a handle of 18 and a tag of 24 come to about
  1040 px, so at full length the letters do shrink on the story.
- `src/flyer/fit.ts`: the width pass shrinks a `[data-fit]` line while it is wider than its box, down to
  `data-fit-min`. A line still too wide is reported, and the editor's cut-off note reads that.
- The art beside the pill (`DEFAULT_DOODLES` in `defaults.ts`): a spark "off the tag pill's end" at x 776, and
  the two blobs in the bottom corners. They follow the canvas (`FOLLOWS`), never the pill's width. A longer pill
  reaches them.
- `copyRules.ts` gives the pill one free exclamation mark (`PILL_OWN`, from the default tag). That stays.
- The AI never sets the tag (`ai/prompts/flyer.md`), but its answer's schema carries the limit: `BriefSchema`
  takes `TextSchema`. `tests/fixtures/ai-prompt.json` names the tag.

### Traps

- **A flyer whose pill fits today must print the same pixels.** The story is held byte-identical by
  `tests/render/baseline.spec.ts` (opt-in). Fitting must change nothing until a pill is too wide.
- **Safe zones are hard limits.** The pill is text: it stays inside the safe column on every canvas.
- **Rolling back.** Both Node storage drivers hold stored data to the schema on every read
  (`server/storage/json/flyers.ts`, `server/storage/sqlite/flyers.ts`), so an older release refuses a flyer saved
  with a longer tag. Find out what PHP's older release does (`php/src/Storage/Json/JsonFlyerRepository.php`
  shows no check on read), and write the answer under "Rolling back" in `docs/deploy.md`.
- **Generated files.** `npm run gen` carries the limit to `schema/*.json`, `schema/ai.json` among them. PHP reads
  them at runtime, so the rule is never copied into PHP by hand. An AI fixture changes first, then the code.
- **Anthropic's first call after the answer's schema changes is the slow one** (about 20 s of the 25 s limit,
  in CLAUDE.md's known limits). Say so in the report.
- A release has to go up whole for this part to reach the live site. Building and uploading it is Artur's.

### The proof sheet

Before the limit is committed, Artur signs off one sheet: the tag at 8, 14 and 24 characters, with the default
handle and one of 18, on both canvases and both templates. It shows what the spark and the blobs do beside a
long pill. If the spark has to move with the pill, that is a design question for him, not a quiet fix.

### Done when

- 24 characters save on both backends, and 25 are refused by both with the same error.
- The sheet is signed off.
- The baseline holds for every flyer whose pill fitted before.

---

## The launch prompts

One per session, in this order. Part 1's is the one Artur starts with. The other three are starting points: the
session before each one rewrites it with what it left, and hands it over.

### Part 1

```
Read CLAUDE.md, then docs/prompts/editor-ux.md, and plan Part 1 of it: the toasts, and the AI caption that
saves itself. Only Part 1.

- Start in plan mode. Build nothing before I approve the plan.
- Before anything else, check git against the brief's "Where it stands": the branch, the last commit, and
  whether the tree holds work that is not yours. If anything contradicts the brief, stop and ask.
- My answers in the brief are decided: don't reopen them. The points marked "Mine" are suggestions: show each
  one in the plan so I can keep it or strike it.
- Stay on feat/ai-feature-switches, a commit per piece as it goes green. Push nothing, build no release, and
  don't touch the live site or the Laragon copy.
- When the part is done, follow the brief's "End by handing over the next part".
```

### Part 2

```
Read CLAUDE.md, then docs/prompts/editor-ux.md and docs/reports/editor-ux.md, and plan Part 2 of the brief:
the panel that folds, and its sections. Only Part 2.

- Start in plan mode. Build nothing before I approve the plan.
- Before anything else, check git against the brief's "Where it stands" and the report: the branch, the last
  commit, and whether the tree holds work that is not yours. Part 1 changed the editor: read what its section of
  the report left. If anything contradicts them, stop and ask.
- My answers in the brief are decided: don't reopen them. The points marked "Mine" are suggestions: show each
  one in the plan so I can keep it or strike it.
- Show me the section's header in its states as pictures before you build the rest.
- Stay on feat/ai-feature-switches, a commit per piece as it goes green. Push nothing, build no release, and
  don't touch the live site or the Laragon copy.
- When the part is done, follow the brief's "End by handing over the next part".
```

### Part 3

```
Read CLAUDE.md, then docs/prompts/editor-ux.md and docs/reports/editor-ux.md, and plan Part 3 of the brief:
copy the picture, the share sheet, and one clipboard. Only Part 3.

- Start in plan mode. Build nothing before I approve the plan.
- Before anything else, check git against the brief's "Where it stands" and the report: the branch, the last
  commit, and whether the tree holds work that is not yours. Parts 1 and 2 changed the editor: read what their
  sections of the report left. If anything contradicts them, stop and ask.
- Start with the spike the brief asks for, and tell me what it found before you plan the build.
- My answers in the brief are decided: don't reopen them. The points marked "Mine" are suggestions: show each
  one in the plan so I can keep it or strike it.
- Stay on feat/ai-feature-switches, a commit per piece as it goes green. Push nothing, build no release, and
  don't touch the live site or the Laragon copy.
- When the part is done, follow the brief's "End by handing over the next part".
```

### Part 4

```
Read CLAUDE.md, then docs/prompts/editor-ux.md and docs/reports/editor-ux.md (if it exists yet), and plan
Part 4 of the brief: a tag of 24 characters, with a pill that fits. Only Part 4.

- Start in plan mode. Build nothing before I approve the plan.
- Before anything else, check git against the brief's "Where it stands" and the report: the branch, the last
  commit, and whether the tree holds work that is not yours. If anything contradicts them, stop and ask.
- Measure the pill in a browser before you plan: the brief's widths are estimates.
- My answers in the brief are decided: don't reopen them. The points marked "Mine" are suggestions: show each
  one in the plan so I can keep it or strike it.
- I sign off the proof sheet before the new limit is committed.
- Stay on feat/ai-feature-switches, a commit per piece as it goes green. Push nothing, build no release, and
  don't touch the live site or the Laragon copy.
- When the part is done, follow the brief's "End by handing over the next part".
```
