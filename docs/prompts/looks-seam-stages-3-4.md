# Launch prompt: looks, stages 3 and 4 (the field, and the site's looks)

Written 2026-10-14, at the end of the session that built stages 1 and 2 (`c1d7e29..4139d14` on `feat/looks`), for a
session with no memory of it. Artur's go for these two stages was given that day. Paste the block below.

Suggested run: Claude Opus 5.5 (`claude-opus-5-5`), effort **high**, started in plan mode.

```
Read CLAUDE.md, docs/architecture.md ("Looks") and the looks entry of docs/status.md's history, then docs/prompts/looks-seam.md whole
(the design: decided; its "Commits, in order" 6 and 7 are this session's, with their notes of 2026-10-14), then
docs/reports/looks.md (what stages 1 and 2 built, and what reading the code found), README.md.

Build stages 3 and 4 of the looks seam: the field (data.look on both backends) and the site's looks (LOOKS in .env,
'looks' in config.php, api/config, a new flyer in the site's first look). Nothing a staff member sees changes: with
no setting a site offers Hand-drawn alone, and there is no switch yet (that is stage 6, after the proof look).

HOW TO WORK

- Start in plan mode, for this session's commits only: the design and my answers are decided (looks-seam.md's two
  tables, the points that were "Mine", the report's table). Don't reopen them. Show me SHORT, in a table, what
  changes and the order, and any point where the code now disagrees with the design. Build nothing before I say go.
- Check git first. The branch is feat/looks; on 2026-10-14 it ended at the docs commit after 4139d14, nothing pushed,
  on top of feat/flyer-labels (a55589d). If the tree is not clean, or another session may be writing in this folder,
  stop and ask. Stage by path. docs/prompts/design-style-switcher.md and claude-design-brief.md are mine: leave them.
- Every change with its test first; a commit per piece as it goes green. Push nothing, build no release, don't touch
  the live site or the Laragon copy. Warn me before a src/shared/ edit if npm run dev may be running.
- The drawing must not change by one pixel: check the baseline (RENDER_BASELINE=check, the temp folder
  nest-looks-baseline: 36 cases, both canvases) after every commit that touches src/. If the folder is gone, capture
  one from 4139d14 first (a build of that commit, outside this tree).
- Before calling it done: npm run typecheck && npm test && npm run test:contract && npm run test:render, then
  npm run test:php and npm run test:php-smoke, and the baseline.
- Then stop, and record it: a section in docs/reports/looks.md, docs/architecture.md ("Looks") and docs/status.md,
  docs/deploy.md (the 'looks' setting, and the two rules under "Rolling back"), docs/api-contract.md, README.md, and
  the launch prompt for stages 5 to 7 (docs/prompts/looks-seam-stages-5-7.md). Then tell me what is left that is mine.

WHAT THE CODE ALREADY HAS (read it, don't rebuild it)

- src/shared/looks.ts: the registry, lookOf(data) (loose: no look, or one this release does not know, is
  hand-drawn), lookIds(), FIRST_LOOK, registerLook() (only before the registry is first read: schema.ts will read the
  ids when it loads, so it seals the registry for the tests' own build of stage 5).
- Every reader of the flyer's look already calls lookOf(data): the renderer, the preview, the editor's photo frame,
  exportActions, prepareFlyer (by the root's data-look). Today data has no look, so every flyer is hand-drawn.

FOUND WHILE READING THE CODE (check each again)

- data.look goes last in FlyerDataSchema and in newFlyerData(), after data.labels: PHP writes keys in the schema's
  order, and FlyerValidatorTest compares every sample key for key. A new key changes four generated files
  (schema/flyer.schema.json, schema/storage.schema.json, schema/ai.json, seed/samples.json). PHP fills defaults from
  the generated schema, with no PHP code per key.
- data.look is an enum of the registry's ids (answer 15 and its rollback rules). The labels work chose a slug's shape
  over an enum for data.labels, because Node checks a flyer on every read: for a look that is exactly the second
  rollback rule ("listed, and does not open" on Node), which Artur kept. A look's id is forever, so only going back
  meets it.
- validation.test.ts has one defaults test with a hand list of the defaulted keys (so have FlyerValidatorTest and
  docs/api-contract.md), and no enum row inside data yet. It runs on node, node-json and php.
- The editor reads a loaded flyer loosely since the labels work (a backend older than the client sent no labels and
  the form was a blank page): the same for look. fitKey in Preview.tsx gains the look.
- ApiConfigSchema is a strict object, and the contract client wants exactly its keys: looks lands in the schema and
  in both backends in one commit. The client reads it through one loose function in looks.ts, as aiFor reads the AI.
- Node's settings never reach createApp (AppDeps is given built things). PHP: Config::KEYS, refused whole for an
  unknown key (503); a hand-written accessor in Shared.php for a new block of schema/shared.json. The AI settings'
  shared table (tests/fixtures/ai-settings.json, its Node and PHP tests) is the model for looks-settings.json.
- #/new makes its blank flyer twice (blankDraft(): the draft and the saved state): both take the site's first look,
  or a new flyer opens as "Unsaved changes". App.tsx alone holds api/config: it hands the first look to Editor and to
  AiPage (flyerFromBrief, newFlyerData). scripts/flyers/post.ts asks the site for it (M6); scripts/ai/smoke.ts stays
  hand-drawn. Tests hold every setting in .env.example (commented out) and config.sample.php's keys.

NOT NOW

The proof look and its build (stage 5), the Look switch (stage 6), the real second look and its art, steps 7 and 9 of
the handoff, a look switch on Create with AI, anything that changes how the hand-drawn look prints.
```
