# Brief: the AI assistant, the follow-up that closes it

A standalone brief for a new session. **Run it after the review** (`docs/prompts/ai-assistant-review.md`, in its own
session on another model): this session starts from the review's findings. Suggested: Opus 5.5 at high effort, the
model that wrote the branch. A finding that needs a design change, not a fix, gets a plan-mode pass before any code.

Read first: `CLAUDE.md`, then `docs/reports/ai-assistant.md` (what was built, the real calls, the known limits),
`docs/prompts/ai-assistant.md` (the spec) and `docs/api-contract.md` from "The AI assistant". The session ledger is
`.superpowers/sdd/pasted-content-id-efe9-we-re-building-clever-crayon/progress.md` (out of git): append your
rulings there, one line each.

Work on a new branch, `feat/ai-assistant-followup`, cut from the tip of `feat/ai-assistant` (unpushed). The rules as
always: SOLID and DRY, both backends answer the same contract, every piece test first (watch the test fail), one
commit per piece, never push.

## Where things stand (2026-10-05)

- **Built and proved:** both providers answered real calls on 2026-10-04, and one went through PHP. Every gate was
  green that day; the report has the numbers.
- **Never done:** the AI has not been looked at in a real browser against a real provider. Phase 4 looked at it with
  the fake, whose answers are instant, and the real calls went through `npm run ai:smoke` and the API.
- **The Laragon copy** (`A:\serverpath\laragon\nest-flyers-php`) answers at `https://nest-flyers-php.test/` and at
  `https://localhost/nest-flyers-php/`: one folder, two addresses. It runs release `8b9c8556afa1` (commit `1490956`)
  with the AI on: its `config.php` holds an OpenAI key. It has a copy of the real library.
- **Nothing copies a release to a deployment.** The copy above was made by hand (`robocopy /E`, after
  `npm run deploy:backup`).
- **The live site** (IONOS) runs a release from before the AI, as far as this repo records (`d1f7ddb40170`,
  2026-10-01). It is public and unlocked.
- **Releases have no version** beyond `release.json`: an id that is a hash of the build, the commit, and the time.
  Two builds of the same code get two ids, because four of composer's autoload files differ. So the id names a
  build, and the commit names the source. There are no git tags.
- **`main` is more than 50 commits behind** `feat/ai-assistant` and can fast-forward to it. Every branch since
  2026-09-28 is contained in it, and none of it is pushed.

## Decided (Artur, 2026-10-04): don't reopen

- **The review runs first,** and this session fixes what Artur picks from it.
- **The ask stays "Sign up at reception"** when a staff text has no sign-up, even when the text ends with its own
  call ("See you there"). The sunset-stretching example's hand-written ask was a one-off.
- **Releases:** a git tag for each deployed release; an `npm run deploy:update` command for local copies; `main`
  fast-forwards to the stack, locally, with no push.

## Part 0: ask Artur, before any code

1. **The review's findings.** He pastes them. For each: fix it here, or leave it, and why.
2. **Which commit the live site's release was built from,** if he wants it tagged (Part 3). Its `release.json` says.

## Part 1: the AI in Chrome, with a real provider

Look at it as a staff member would, at `https://nest-flyers-php.test/` (PHP, OpenAI, 3 generations a day) or on
`npm run dev` (Node, the key in `.env`, its own 3 a day). At most 3 generations on each.

- The library: the bar's "✨ Create with AI · N left".
- `#/ai`: paste a real staff text (an example's `source`, or a new one from Artur) and press Generate.
  - The waiting state, over a real 6 to 9 seconds: the button, the status line, nothing else clickable twice.
  - The result: the flyer, "The AI assumed…", the share text, "Try again" saying what it costs.
- "Open in editor": the AI draft note until the first save, a save, a download on both canvases.
- "✨ Write with AI" in the Share text section, and the count after each step.
- The day used up: the message, and the count at 0.
- Phone width.
- Screenshots go beside the report's, in `docs/reports/ai-assistant/`.

**The Chrome extension cannot answer a JavaScript `confirm`,** and it stops responding when one opens. Three places
ask with one: replacing a caption (`Editor.tsx`), leaving unsaved work (`leaveGuard.ts`), archiving a flyer
(`Library.tsx`). Drive those steps with the repo's own Playwright (`tests/editor.ts` has the helpers), or leave them
to Artur. Don't click into them from the extension.

What looks wrong goes to Artur as a list, with a screenshot each. Fix a defect; a matter of taste waits for his UI
session.

## Part 2: the known items, each test first

1. **PHP without curl answers `ai_failed`, not a 500.** `php/src/Ai/CurlHttpClient.php` calls `curl_init` without
   checking for the extension, so the missing function becomes an `Error`, a 500 and a logged trace. It should be a
   typed failure the service records and answers like any other, with one log line. The HTTP client is injected into
   `LlmProviderFactory`, so the choice has one home. Node needs no twin: `fetch` is built in.
2. **A blank extra from the model no longer shows as an empty field.** `claude-haiku-4-5` wrote `" "` as a fourth
   extra. The flyer already drops blank extras (`Flyer.tsx`), but the editor shows the empty field. Drop them where a
   brief becomes a flyer: `flyerFromBrief` in `src/shared/brief.ts`, tested in `tests/unit/brief.test.ts`. Check the
   brief's other optional strings while there, and say what you found.
3. **A missing price is "Ask at reception", never "Free".** `claude-haiku-4-5` wrote "Free" for a text that names no
   price, and said so in its assumptions. Make the rule firmer in `ai/prompts/flyer.md`, in one line; `npm run gen`;
   then `npm run ai:smoke` on both providers, to see it hold. That is 2 to 4 real generations.
4. **The sunset-stretching example's `notes`** say its ask was Artur's one-off, not a rule (2026-10-04). Its brief
   stays as it is: it is the flyer that was posted.
5. **`tests/unit/ai-providers.test.ts`'s local-server test gets room.** "hands back the status and the body text"
   failed once at its own 2000 ms, on a busy machine; alone it passed 3 times out of 3.
6. **What Artur picked from the review,** each reproduced by a failing test before its fix.

Left alone unless the review raised it: requiring a share text that is not empty. Today `""` passes. It would need a
real call to learn whether OpenAI's strict dialect takes a minimum length.

Left as they are, on purpose (the report's "Known limits"):
- two concurrent requests can both see `remaining: 1`: accepted for one anonymous actor and 3 a day;
- `claude-haiku-4-5` retires no sooner than 2026-10-15: a default, changed in one line of settings;
- Anthropic's slow first call, and IONOS's unmeasured time limit: `timeoutMs` is not touched until the first live
  call says what the host allows (Artur's step 3, at the end);
- the client does not parse the routes' answers with zod: it would bundle zod into the editor.

## Part 3: releases

1. **`npm run deploy:update -- <deploy folder>`,** for a local copy of a deployment. In this order:
   - it refuses a folder that is no deployment (`openDeployment`, `scripts/php/deployment.ts`);
   - it backs the folder up (`backupDeployment`, `scripts/php/backup-deploy.ts`);
   - it builds the release (`buildPhpRelease`, `scripts/build-php.ts`);
   - it copies the release over the folder additively. It never deletes: `config.php`, `data/` and `uploads/` are in
     no release;
   - it prints the release id and the backup's folder.
   Test it as `tests/cross/restore-drill.test.ts` tests the backup, on a temp stage, with `config.php`, the library
   and a photo proved untouched. IONOS stays SFTP, by hand: `docs/deploy.md`.
2. **A tag for each deployed release.** An annotated git tag on the commit `release.json` names, called
   `release/<id>`, with the site and the date in its message.
   - It is refused for a release built from a dirty tree: that commit is not what was shipped.
   - `deploy:update` makes it for a local copy. `docs/deploy.md` gets one line for after an IONOS upload.
   - Tags are never pushed unasked.
   - Tag what is deployed now: the Laragon copy's `8b9c8556afa1` on `1490956`, and the live site's, if Part 0 named
     its commit.
3. **`main` fast-forwards** to this branch's tip, at the very end and locally: `git merge --ff-only`. Say plainly in
   the hand-over that every commit since 2026-09-28 exists only on this machine. The push is Artur's.

## Part 4: the docs

- `docs/reports/ai-assistant.md`: a "Follow-up" section. What the review found and what was done about each finding,
  what the browser showed, the items above, the gates' numbers.
- `CLAUDE.md`: `deploy:update` in the commands, and the status.
- `README.md`: the checks table. `docs/deploy.md`: the tag line, and `deploy:update` for local copies.

## Done means

- `npm run typecheck && npm test && npm run test:contract && npm run test:render && npm run test:php` all green, and
  `npm run test:php-smoke`.
- No test touches a provider.
- The UI looked at in Chrome with a real provider: Part 1.
- `baseline.spec.ts` byte-identical, redone only if `src/flyer/`, `src/render/` or `src/shared/layout.ts` changed.
- `main` fast-forwarded. Nothing pushed.

## Out of scope: don't start these

- New UI and UX ideas: their own brief, once Artur has them.
- The login and real user roles; handoff steps 7 and 9; a second flyer style.
- The IONOS upload itself. End your hand-over with Artur's steps, in this order:
  1. `npm run build:php`, then upload the release (`docs/deploy.md`, "Updating to a new release");
  2. add the `ai` block to `config.php` ("The AI assistant"). Never before the new release is up: an older release
     answers 503 to it;
  3. `npm run ai:smoke -- --to https://nestpass.ai/activities/`, once. It spends one of the day's 3, and its seconds
     are the first measure of the host's time limit.

## Tooling notes

- **Keys.** `.env` holds `AI_PROVIDER=openai`, `AI_API_KEY` (OpenAI's) and `ANTHROPIC_API_KEY` (Anthropic's, parked:
  the app does not read that name). Never print `.env` or a key: check with a script that says only yes or no. For an
  Anthropic run, pass `AI_PROVIDER=anthropic` and the parked key through the environment, which wins over `.env`.
  With a key in `.env`, `npm run dev` runs the real provider; no test does.
- **The Laragon copy is https only,** and Node does not trust Laragon's certificate. Set
  `NODE_EXTRA_CA_CERTS=C:\laragon\etc\ssl\laragon.crt` before `npm run ai:smoke -- --to …` or a check there.
  Back the copy up before touching it.
- **Anthropic's first call after the answer's schema changes takes about 20 seconds;** the next ones 4 to 5. A
  first call that times out counts nothing: run it again.
- **Line endings:** check with `git ls-files --eol`. In the Bash tool `grep -c $'\r'` matches every line.
- **PowerShell 5.1:** `*>` wraps a script's stderr in error records, and `$env:NAME = ''` deletes the variable. Git
  Bash gives clean output for the smoke.
- **Ports:** 8787 `npm run dev`; 8790 a process not of the session; 8797 the PHP smoke; 8798 and 8799 the render
  suite.
