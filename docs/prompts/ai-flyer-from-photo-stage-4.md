# Prompt: a follow-up to the page, then stage 4 of a flyer from a photo

A standalone prompt for a new session. Paste it as the first message. It starts the planning of two things, in
this order, and builds nothing before Artur approves the plan.

---

Read `CLAUDE.md`, then `docs/prompts/ai-flyer-from-photo.md` (the brief) and
`docs/reports/ai-flyer-from-photo.md` (the report), and plan two things, in this order:

1. **A follow-up to stage 3's page.** After a picture is read, the page shows numbered steps, so the next step
   looks like the next step. And the failed-read line gets a link.
2. **Stage 4:** the picture as the flyer's photo.

**Where it stands**

- Stages 1 to 3 are built, and stage 3's checkpoint has all it asked for. In stage 3's part of the report, *The
  phone*, *The review*, *What is left* and *After the checkpoint* hold what changed after the brief was written.
- The branch is `feat/ai-feature-switches`: asked on 2026-10-06, Artur chose "Stay on feat/ai-feature-switches"
  for this session. The last commit before this prompt is `ddd18c9`, 13 commits on top of `ceea60f`. Nothing is
  pushed, and `main` is at `684189e`.
- Asked how to commit, he chose "Each piece as it goes green": don't ask again.
- Before anything else, check git against that: the branch, the commit, and whether the tree holds work that is
  not yours. If anything contradicts the brief or the report, stop and ask.

**Start in plan mode**

- Read the page as it is: `src/editor/AiPage.tsx`, `AiPhoto.tsx`, `App.tsx`, `handoff.ts`, `photoPrep.ts`, the
  photo part of `Editor.tsx` (`onFile`), `editor.css` under "The AI assistant", and the `From a photo` block at
  the end of `tests/render/ai.spec.ts`.
- Read the report's "For the session that builds stage 4".
- Show one plan for both parts. Build nothing before Artur approves it.

## Part 1: the follow-up

**Artur's observation and answers (2026-10-06). Don't reopen them.**

- **What he saw.** After a read the page shows the From your idea tab with the words in the box. That tab is
  where the page starts, so it can look as if something went wrong and the page went back. His words: "maybe we
  can hide the buttons so user doesn't think that something is wrong and he is come back, but that he is going
  forward and this is the next step before finish."
- **The shape: "Numbered steps".** He chose it over "One way forward" (the switch and the buttons hidden, which I
  had recommended) and "Stay on From a photo". A line of three steps takes the switch's place while a picture is
  being made into a flyer. The sketch he chose:

  ```
   ✨ CREATE WITH AI

   ① Picture ✓ ─ ② Check the words ─ ③ Flyer

   ┌─────┐  karaoke-board.jpg
   └─────┘  Change the picture

   Your idea
   ┌────────────────────────────────┐
   │ Karaoke night 06/10 (today)    │
   └────────────────────────────────┘
   Check every word, and add what
   is missing (the price?). …

   Hostel  [ Let the AI decide  ▾ ]

   [ ✨ Generate (3 left today) ]
  ```

- **The link.** In the failed-read line, "Your picture is still here: try again, or type the event yourself.",
  the words "type the event yourself" become a link that opens the idea box. He asked for it "if it's easy", and
  it is. His sentence stays as he wrote it, letter for letter: the spec that pins it must still pass.
- **When:** in this session, before stage 4.

**What the sketch does not say. Settle each in the plan, and ask Artur where the answer is his.**

1. **From when the steps show.** The sketch is the moment after a read. Before one, the switch must still be
   there, or From your idea has no way in. Propose: the switch as today until a read lands, then the steps in its
   place.
2. **The way back.** "Change the picture" returns to choosing one. Say what it does with words already read: a
   read was spent on them, and the leave guard holds them today.
3. **Step 3.** When it lights: with the flyer on screen is the natural moment. "Open in editor" is the finish.
4. **A read that found no event.** Step 2 says "Check the words" and there are none: the line under the box says
   to write the event. Propose its step's words, and ask.
5. **A failed read** stays at step 1 with its note, as today, and now its link.
6. **A site without `photo`, and From your idea used by itself,** show no steps: the page as it was. The
   baseline and the no-switch spec hold that.
7. **A phone.** Three labels and two joins in 390 px, with no sideways scroll.
8. **A screen reader.** A list with the current step marked. After a read the focus goes to the line under the
   box, as today: keep it, or say why it moves.
9. **Every new word on the page is Artur's.** The three step names are the sketch's. Propose anything else and
   ask once, with the plan.

**Keep, from stage 3:** one action at a time; the question before words in the box are replaced; an empty read
never empties a box that held text; the leave guard for words read and for a read on its way; the recount after
a failed read; that with no flyer left Read the picture waits (my ruling, still his to confirm).

## Part 2: stage 4

The brief's "Stage 4: the picture as the flyer's photo" stands as written. Its tick box sits on the result, which
is step 3 of the steps above.

**What changed since the brief was written, and stage 4 must know**

1. **The chosen picture is the page's state** (`picture` in `AiPage.tsx`, a `File`). It survives the read, and it
   is the original: the read sent a copy shrunk to 2048 px. The flyer's photo is made from the original, with the
   photo's own limits: `preparePhoto(picture, limits)`, never `pictureLimits(limits)`.
2. **"When the idea came from a picture" is not stored with the flyer today.** `wordsRead` says the box holds
   words a read was spent on, and it goes false when the box is emptied. `Result` records the idea as sent, and
   nothing about a picture. Decide in the plan what a flyer remembers of its picture, at the moment Generate is
   pressed: the box and the chosen picture can both change afterwards.
3. **An AI flyer has no photo and `photoMode: 'none'`** (`flyerFromBrief`, `src/shared/brief.ts`). `handoff.ts`
   says its draft is "minus the photo an AI flyer never has", and `Editor.tsx` sets `photo: null` on taking it.
   A photo dropped on "No photo" lands "In a frame" in `Editor.tsx`'s `onFile`: reuse that, as the brief says,
   by one function both call.
4. **"Open in editor" is synchronous today.** With the box ticked it uploads first. It is then an action like the
   others: one at a time, a waiting state, the leave guard while it is out, and on failure the page stays with
   the photo route's own message and the tick still set.
5. **Two copies of the picture, by design.** The read kept its own for 30 days in `ai-pictures/`. The flyer's
   photo is an ordinary upload to `uploads/`. A photo uploaded for a flyer nobody saves stays there, as one
   dropped in the editor before a save does: deleting those is out of scope, by the brief.
6. **The fake's flyer is an Activity one,** so the box shows on it. A This week flyer for the "no box" case is a
   routed answer.
7. **The browser suite spends all three of the fake's flyers.** A new spec that makes a real flyer needs a
   routed answer, or a higher limit pinned in `playwright.config.ts`. A spec that sends the server a real read
   must run before the one that spends the last flyer, which is last in its `describe`. Pictures are made in the
   spec with sharp, and must not be 11 to 14 px wide by accident.
8. **PHP has no server renderer:** its downloads go through the in-browser exporter. The look's "a downloaded PNG
   shows it" is that path on PHP, and its upload limit there is 2 MB, so the browser's shrink is what gets a
   phone's photo through.

**Rules for the session**

- Each piece test first, and red for its stated reason. A spec that passes at once is a pin: break the code on
  purpose to see it fail, and say so. Never push. Nothing touches the live site.
- No test and no script calls a real provider. Browser specs run on the fake, in the `ai` project.
- `.env` names `flyer` and `share` alone. Don't change it: the looks name `photo` in their own environment, on
  the fake, with a throwaway data folder.
- With `photo` not named, the app looks and behaves exactly as before. Capture the baseline before any edit
  (`RENDER_BASELINE=capture`, after `npm run build`) and check it at the end.
- Another session may be writing in this folder: stage files by path, no checkouts of other branches, no stashes.
- A script that holds a backslash, or runs past about 9,000 characters, is written to the scratchpad with the
  Write tool and run as a file. A heredoc piped to `node` loses its backslashes.
- Sub-agents are costly on this account. Read the code yourself, and keep one fresh-context review for the end.
  Its range starts at `61cd7ec`: stage 3's review ended there, so its own fixes (`b629410`, `27adc76`, `9e5621a`)
  have had none. Give it the code and the brief, not your conclusions. Fix what it finds test first.
- **The looks:** both backends, desktop (1440 × 900) and phone (390 × 844, with touch), in the installed Chrome
  driven by a script. Node is the built app; PHP is a `php -S` stage with the built client
  (`scripts/php/serve.ts`). Real pictures are in `backups/photo-reads/`, `backups/phone-test-2026-10-06/` and
  `docs/ai-flyers/image-examples/`. Afterwards, stop every server by its port and check no `php` is left.
- **A phone reaches this PC over the PC's own hotspot** (`192.168.137.1`), with the server bound to that address
  alone. Never over the Wi-Fi the PC is on: on 2026-10-06 that was a hostel's, which keeps its devices apart and
  is no closed network. The phone must be kept from switching Wi-Fi by itself: it did, and it looked like the
  app failing.
- Stop at the checkpoint with what the brief asks for stage 4: the screenshots on both backends and the gates.
  Stage 3's phone never pressed Generate or "Open in editor": ask Artur whether he wants the whole path on his
  phone this time, the picture ending as the flyer's photo.
- The report gets a section for each part, and `CLAUDE.md` is brought up to date.

**Waiting, and not part of this session unless Artur says so**

Each is in the report under stage 3's "For Artur to decide":

- **Reads sent at the same moment pass the tries together.** Holding the bound means recording a try before the
  provider is asked, on both backends. Don't build it unasked.
- The page's words that are mine; that Read the picture waits with no flyer left; the leave question's words
  where there is no flyer yet; whether a generation on its way is guarded as a read is.
- The first example's "Free"; the time limit once IONOS is measured; the phone's two pictures as eval cases.
- A second shape for the share text, "one mixed caption" (`CLAUDE.md`, "Waiting").
- The release to IONOS, its `config.php` and its smoke: Artur's.
