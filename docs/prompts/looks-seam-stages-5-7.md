# Launch prompt: looks, stages 5 to 7 (the proof look, the switch, the docs)

Written 2026-10-14, at the end of the session that built stages 3 and 4 (`9a665cc..` on `feat/looks`, the report's
section "Stages 3 and 4"), for a session with no memory of it. Artur gives the go for each stage. Paste the block below.

**Done** (2026-10-14, the same day: `bfcb54c..ced1571` on `feat/looks`; the report's section "Stages 5 to 7"). Kept as
it was launched.

Suggested run: Claude Opus 5.5 (`claude-opus-5-5`), effort **high**, started in plan mode.

```
Read CLAUDE.md (its "A flyer prints in a look" and the looks status entry), then docs/prompts/looks-seam.md whole
(the design: decided; its "Commits, in order" 8 to 10 are this session's, with their notes of 2026-10-14, and "The
throwaway look"), then docs/reports/looks.md (what stages 1 to 4 built, and what reading the code found), README.md,
and docs/prompts/design-style-switcher.md (the first brief: its word "style" is "look" now).

Build stages 5 to 7 of the looks seam: the proof look (a throwaway second look, in the tests' build only), the switch
("Look" under Template in the editor's Flyer section, shown only with more than one look to pick), and the docs
(docs/adding-a-look.md among them). Nothing in a release changes: with no setting a site offers Hand-drawn alone, and
the proof look never ships.

HOW TO WORK

- Start in plan mode, for this session's commits only: the design and my answers are decided (looks-seam.md's two
  tables, the points that were "Mine", the report's tables). Don't reopen them. Show me SHORT, in a table, what
  changes and the order, and any point where the code now disagrees with the design. Build nothing before I say go,
  and stop after each stage for my go on the next.
- Check git first. The branch is feat/looks; on 2026-10-14 it ended at the docs commit of stages 3 and 4, nothing
  pushed. If the tree is not clean, or another session may be writing in this folder, stop and ask. Stage by path.
  docs/prompts/design-style-switcher.md and claude-design-brief.md are mine: leave them.
- Every change with its test first; a commit per piece as it goes green. Push nothing, build no release, don't touch
  the live site or the Laragon copy. Warn me before a src/shared/ edit if npm run dev may be running.
- The hand-drawn look must not change by one pixel: check the baseline (RENDER_BASELINE=check, the temp folder
  nest-looks-baseline: 36 cases, both canvases) after every commit that touches src/. If the folder is gone, capture
  one from 4139d14 first (a build of that commit, outside this tree).
- Show me pictures, not words, for what is visual: the Look switch under Template (the Flyer section open and
  closed, at 1440 and 360 px), from the tests' build with the proof look in it, before you build its details.
- Before calling it done: npm run typecheck && npm test && npm run test:contract && npm run test:render, then
  npm run test:php and npm run test:php-smoke; the baseline; and look at it in a real browser (Chrome): the tests'
  build with two looks (the switch, the preview, the library card, one download per look) and the release build
  (no switch, the app as it was).
- Then stop, and record it: docs/reports/looks.md, CLAUDE.md (architecture, decisions, status) in the style of its
  other entries, README.md, docs/deploy.md, docs/adding-a-look.md (the checklist for the session that ports the real
  look). Then tell me what is left that is mine.

WHAT THE CODE ALREADY HAS (read it, don't rebuild it)

- src/shared/looks.ts: the registry, lookOf(data), lookIds(), FIRST_LOOK, registerLook() (only before the registry
  is first read), and siteLooks(listed, known?): api/config's looks read loosely (none, or a look this release does
  not have, is the first look alone).
- data.look: an enum of the registry's ids, default FIRST_LOOK, the last key of the data (schema.ts, and
  newFlyerData(template, look)). schema.ts calls lookIds() when it loads, and so does loadConfig() in
  server/config.ts: the proof look is registered before anything imports either.
- The site's looks: LOOKS in .env (namedLooks in server/config.ts), 'looks' in config.php (php/src/SiteLooks.php,
  ids from schema/shared.json's looks block), both held to tests/fixtures/looks-settings.json, which carries two
  looks of its own ('hand-drawn', 'second'). GET api/config answers `looks` on both backends (AppDeps.looks on Node).
- The client: App.tsx holds the site's looks (siteLooks(config.looks)) and hands the first to Editor (blankDraft,
  both copies) and AiPage (flyerFromBrief's fourth argument). scripts/site.ts's siteFirstLook() gives flyers:post
  the site's first look (M6); ai:smoke stays hand-drawn.
- The rollback rules are in docs/deploy.md and held by tests on both backends.

FOUND WHILE BUILDING STAGES 3 AND 4 (check each again)

- fitKey in Preview.tsx does not hold the look yet: no test could fail before an open editor can change its look, so
  it moved to the switch's commit, with a spec where switching the look of a flyer cut off on the other canvas
  refreshes the offscreen canvas's warning.
- The browser proof that a new flyer starts in the site's first look waits for this session: the looks project runs
  LOOKS=hand-drawn,proof, whose first is hand-drawn, so a spec routes api/config to answer ['proof', 'hand-drawn']
  and checks #/new draws in proof and opens with nothing unsaved (both copies of blankDraft).
- M2 in the browser: a flyer in proof still saves and prints on a site that names hand-drawn alone. A save is held
  to the registry, not to the site's list, so only the proof build can show it.
- The switch lists the site's looks plus the flyer's own when the site does not name it, and shows only when that
  list has more than one entry. The pressed button reads lookOf(data).id, never data.look: a flyer from a backend
  older than the client has no look (flyer-labels.spec.ts strips it, and the editor draws it hand-drawn). Editor
  needs the whole list, not only its first: App.tsx holds it.
- The closed Flyer section's line names the look only when the switch shows: sectionLine is pinned in
  section-folds.test.ts and in three places of panel.spec.ts.
- "No trace": the contract row for a look this release does not have is in validation.test.ts ('a-later-look', on
  node, node-json and php); the proof look's id answers the same there.
- A required looks in the strict ApiConfigSchema: CONTRACT_BASE_URL runs against a site on an older release fail at
  api/config until the release is up.

NOT NOW

The real second look and its art, steps 7 and 9 of the handoff, a look switch on Create with AI, a filter by look in
the library, new files under assets/, anything that changes how the hand-drawn look prints, the release.
```
