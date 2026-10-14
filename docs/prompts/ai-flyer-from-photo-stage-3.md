# Prompt: stage 3 of a flyer from a photo, the page

A standalone prompt for a new session. Paste it as the first message. It starts the planning of stage 3 and
builds nothing before Artur approves the plan.

---

Read `CLAUDE.md`, then `docs/prompts/ai-flyer-from-photo.md` (the brief) and
`docs/reports/ai-flyer-from-photo.md` (the report), and plan stage 3: the page, "From a photo" on Create with AI.

**Where it stands**

- Stages 1 and 2 are built, and stage 2's checkpoint is closed. The report's *The checkpoint*, at the end of
  stage 2's section, has everything that changed after the brief was written. Stage 3 is the first stage with no
  section in the report.
- The branch is `feat/ai-feature-switches`: asked on 2026-10-06, Artur chose "Stay on this branch" for stage 3.
  The checkpoint's last commit before this prompt is `0e3fe8d`, 17 commits on top of `747e4c8`. Nothing is pushed.
- Before anything else, check git against that: the branch, the commit, and whether the tree holds work that is
  not yours. If anything contradicts the brief or the report, stop and ask.

**Start in plan mode**

- Read the files the brief names for stage 3, and the report's list "For the session that builds stage 3".
- Show the plan for that one stage. Build nothing before Artur approves it.

**What changed since the brief was written, and the page must know**

1. **The count on "Read the picture" is the smaller of reads left and tries left.** A picture read gets three
   tries a day for each read of its limit, failed ones included. A failed read answers no count, so after one the
   page's number can be too high until `api/config` is asked again. Decide in the plan how the page keeps it right.
2. **An empty answer can mean "no event", not only "no words".** The reader now answers empty for a sign, a menu or
   an empty board. The brief's line is "The AI found no words in this picture. Write the event here yourself.": ask
   Artur for the words.
3. **The read is slow by design.** It runs on the provider's middle model by itself (`gpt-6.1-sol` on OpenAI): 5 to
   22 seconds in real reads, of the 25 the app waits. The waiting state and the message after a read that ran out
   of time matter. A read that fails is free and is one of the day's tries.
4. **A board of several activities comes back one activity per line.** The brief's line for it stands ("keep the
   one this flyer is for"). Generate made a This week flyer from such words once, in a real check. That path is
   still out of scope: don't design it.
5. **The copy rules changed the same day.** The share text is English first, then the line `-- 🇪🇸 --`, then
   Spanish; no full stop ends a title line; a price the text does not give is not printed. The fake provider
   answers with the first example, which now has that shape: a spec that quotes it must follow.
6. **On a Windows PC the flag in that line shows as the letters "ES".** It is not a fault.

**Rules for the session**

- Each piece test first, and red for its stated reason. Never push. Nothing touches the live site.
- No test and no script calls a real provider. Browser specs run on the fake, in the `ai` project.
- `.env` names `flyer` and `share` alone. Don't change it without asking: the looks run on the fake, with a
  throwaway data folder, and name `photo` in their own environment.
- Real pictures for the looks are in `backups/photo-reads/` (ten of Artur's, outside git) and in
  `docs/ai-flyers/image-examples/`. The fake is steered by a picture's width: 11 to 14 px.
- Ask Artur once how to commit: each piece as it goes green, or only when he asks.
- Another session may be writing in this folder: stage files by path, no checkouts of other branches, no stashes.
  A Bash command over about 9,000 characters is cut off: write long scripts to the scratchpad and run them.
- Sub-agents are costly on this account. Read the code yourself, and keep one fresh-context review for the end of
  the stage, as the brief's "Done means" asks. Its range starts at `747e4c8`, so it covers the checkpoint's
  commits too, which had no review of their own. Fix what it finds test first.
- Stop at stage 3's checkpoint with what the brief asks for there: the screenshots on both backends, desktop and
  phone, and what a real phone did. Ask Artur how he wants to do the phone part. Do not start stage 4.

**Waiting, and not part of this stage**

- A second shape for the share text, "one mixed caption", behind a switch Artur wants to add (`docs/status.md`,
  "Waiting"). Don't build it.
