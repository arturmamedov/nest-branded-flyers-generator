# Brief: the AI assistant, continued from Phase 5 (a real call) to the end

A standalone brief for a new session. The feature's own brief is `docs/prompts/ai-assistant.md`: read it first, then
`CLAUDE.md`, this file, and the approved plan at
`C:\Users\artur\.claude\plans\pasted-content-id-efe9-we-re-building-clever-crayon.md` (the Phase 0 research, the
decisions taken, Phases 5 and 6 in detail). The execution ledger is
`.superpowers/sdd/pasted-content-id-efe9-we-re-building-clever-crayon/progress.md` (kept out of git through
`.git/info/exclude`): every ruling made so far is there, Phases 3 and 4 included; append yours, one line each, as you go.

Work on branch `feat/ai-assistant`. Phases 0–4 are committed there and unpushed: f5b76f2..7ccbeca (Phases 1–2),
79c0c62..8bbc759 (Phase 3, PHP), c704651 and ee0fdd9 (Phase 4, the client). Start with `git status`: the tree should be
clean. Work phase by phase and stop at every checkpoint for Artur's go-ahead. The rules as always: SOLID and DRY, both
backends answer the same contract, every piece test first (watch the test fail), commit only when asked, never push.

When Phase 6 is done, Artur runs `docs/prompts/ai-assistant-review.md` in a fresh session on another model: a review
of the whole branch. Don't start it yourself.

## Decided: don't reopen

- Phase 0 (Artur, 2026-10-02): the default models are `gpt-6-luna` (OpenAI) and `claude-haiku-4-5` (Anthropic); AI
  may run on the live site now, while it is still unlocked. Keys come in Phase 5 (`.env`, `config.php`).
- The plan's ten "Decisions taken" and the ledger's rulings. In short, beyond the ones `ai-assistant-continue.md`
  lists:
  - `shared.json`'s `ai` block also carries `schemaNames` and `fake` (model, made-up slug, markers);
  - a provider's 200 that is no JSON object is `LlmFailure('provider')` on both backends;
  - PHP: `Config::load/fromArray` take `Shared`, `AiConfig` is the twin of `loadAiSettings` (`''` means unset), a bad
    `ai` block is 503 `not_configured`, a missing one is off; the AI service is built only when on; the preflight
    prints no `ai` block, and a missing curl is a warning;
  - the client:
    - `#/ai` is a focus page; the bar entry reads "✨ Create with AI · N left" ("✨ AI" at 480 px and below);
    - "Open in editor" hands the flyer over in memory (`handoff.ts`), and the editor shows the "AI draft" note until the
      first save;
    - "✨ Write with AI" sits in the Share text section, and asks before it replaces a caption;
    - the AI page asks before leaving a flyer nobody has opened yet;
    - with the AI off nothing of it shows, and `#/ai` is the library;
  - the render suite has two projects:
    - `render`, every existing spec, runs with `AI_ENABLED=false`, so a key in `.env` never reaches a test;
    - `ai`, `tests/render/ai.spec.ts` alone, runs on a second server (fake provider, port 8798) with its own ledger,
      and spends exactly the day's 3 generations.

## Where things are (Phases 1–4, done)

- **Shared:** `src/shared/ai.ts`, the AI schemas in `schema.ts`, the errors, `StoredAiUsageSchema`; `schema/ai.json` and
  the `ai` block of `schema/shared.json` from `npm run gen`; the prompts in `ai/prompts/`.
- **Node:** `server/ai/` (the provider seam, the adapters in `providers/`, `prompt.ts`, `service.ts`, `actor.ts`,
  `policy.ts`, `bundle.ts`, `composition.ts` with `createProvider`, `http.ts`); the ledger in
  `server/storage/{sqlite,json}/aiUsage.ts`; the routes in `server/app.ts`; `loadAiSettings` in `server/config.ts`.
- **PHP:**
  - `php/src/Ai/`: the same seams, plus `CurlHttpClient`, `ProviderAnswer`, `AiDay`, `AiConfig`, `ConfigAiPolicy` and
    `LlmProviderFactory`;
  - `Domain/AiUsageRepository`, `Storage/Json/JsonAiUsageRepository`;
  - `Bootstrap::AI_FILE` and `fromAppRoot(..., ?Clock)`;
  - the commented `ai` block in `php/web/config.sample.php`.
- **Client:** `src/editor/AiPage.tsx`, `handoff.ts`, `panel.tsx` (the form pieces both focus pages use), `share.tsx`;
  `App.tsx` keeps the `ai` state and the bar entry; `Editor.tsx` takes the handoff and has "Write with AI";
  `Preview.tsx` has `useFitReports` and `CutOffNote`; the `.ai-*` rules in `editor.css`.
- **Tests:**
  - PHPUnit: `php/tests/Ai/*`, which replays all five `tests/fixtures/ai-*.json`; the ledger in the repository
    contract;
  - the `php-ai` contract project;
  - `tests/render/ai.spec.ts`;
  - step 0 of the PHP smoke (no AI UI while the stage has no `ai` block).
- **Screenshots of Phase 4,** desktop and phone, AI on and off: `.superpowers/screens/phase-4/` (`shoot.ts` beside them
  retakes them against a server on port 8795).

## First: one contract slip found at Phase 3 (both backends, test first)

A model answer with 12 assumptions and a made-up hostel leaves the service with 13: it puts its own "Unknown hostel"
note first, past `AiFlyerResultSchema`'s `max(12)`. The client doesn't parse with zod, so nothing breaks today, but the
contract is broken. Keep 12: when the service adds its note, the model's last assumption goes.
- Node: a provider stub answering 12 assumptions and an unknown slug, in `tests/unit/ai-service.test.ts`.
- PHP: its twin in `php/tests/Ai/AiServiceTest.php`.

## Phase 5: a real call, by hand

1. `scripts/ai/smoke.ts` and `npm run ai:smoke -- [--share] [--to <app root>] [example file]`:
   - **Never part of `npm test`.** No test touches a provider.
   - **Without `--to`:** it runs only with a real provider and key in `.env` (`AI_PROVIDER`, `AI_API_KEY`) and refuses
     the fake. It goes the production way: `loadConfig().ai`, `createProvider`, `loadBundle`, the seed's hostels, the
     real clock, and `AiService` over an in-memory ledger, so it never spends a site's day.
   - **What it prints:** the brief, the assumptions, the share text, the tokens and the latency; on a failure, the
     reason the service logs.
   - **`--share`:** writes the caption of the example's flyer (`flyerFromBrief`) instead.
   - **`--to <app root>`:** goes through a site's API, as `scripts/flyers/post.ts` does (the write header, the site's
     login from `.env`). It says first that this spends one of that site's 3 generations today.
   - **The argument parsing** gets a unit test; the network part stays untested by design.
2. Artur runs it with his OpenAI key, then with an Anthropic one. `.env` holds one provider at a time: `AI_PROVIDER`
   and `AI_API_KEY`, OpenAI first, then both lines swapped for Anthropic. If a call is slow, `AI_EFFORT=low` (OpenAI)
   is the first knob, then `AI_TIMEOUT_MS` (25 s by default). Haiku 4.5 takes no effort setting.
   - Never print `.env` or a key into the conversation: check that a key is there with a script that says only yes
     or no.
   - With a real key in `.env`, `npm run dev` runs the real provider. The test suites don't: the render servers pin
     the AI off or on the fake, and the contract setups pass their own settings.
3. PHP, through the Laragon copy (`nest-flyers-php`, which runs `allowPublic`):
   - first give it the new release (`npm run build:php`, then copy it per `docs/deploy.md`): an older release answers
     503 to a `config.php` with an `ai` block;
   - then add the block with the key, and run `npm run ai:smoke -- --to http://localhost/nest-flyers-php/`.
   Laragon's PHP has `curl.cainfo` set (`C:\laragon\etc\ssl\cacert.pem`), so TLS should verify.

- Keys live only in `.env` (gitignored) and in that `config.php`. Never put one in a commit, a log line, the ledger or
  a doc.
- **Checkpoint:** two real briefs looked at (one per provider), with their tokens and latency, and one call through
  PHP.

## Phase 6: the docs

- `docs/deploy.md`:
  - the `ai` block of `config.php`, and where the key goes on IONOS;
  - curl, which the preflight checks;
  - that the AI may run on live while it is unlocked, capped at 3 a day (Artur, 2026-10-02);
  - the rollback note: remove `ai` from `config.php` before uploading an older release, or it answers 503.
- `docs/ai-flyers/README.md`: the rules now live in `ai/prompts/`; how a ledger record (`data/ai-usage/YYYY-MM.json`)
  becomes an example, with its `asked[].field`.
- `docs/reports/ai-assistant.md`, the report:
  - what each phase built, and the rulings from the ledger;
  - the gates' numbers;
  - the screenshots: ask Artur whether they go into git, under `docs/reports/ai-assistant/`;
  - the known limits:
    - two concurrent requests can both see `remaining: 1`;
    - Haiku 4.5 retires no sooner than 2026-10-15;
    - IONOS's FastCGI time limit stays unmeasured until a live call.
- `CLAUDE.md`:
  - the architecture: `server/ai/`, `php/src/Ai/`, the client files above, the render suite's two projects;
  - Commands: `ai:smoke`;
  - Status: rewrite the AI entry, which still says Phase 3 is next.
- `README.md`: the `AI_*` settings, `ai:smoke`, and what `config.php`'s `ai` block does. `.env.example` already lists
  the six `AI_*` settings (`tests/unit/ai-config.test.ts` pins them).

**Done means** (the feature's brief):
- `npm run typecheck && npm test && npm run test:contract && npm run test:render && npm run test:php` all green, and
  `npm run test:php-smoke`;
- no test touches a provider;
- the UI looked at in Chrome on and off: done in Phase 4, so look again only if it changed;
- `baseline.spec.ts` byte-identical: proved in Phase 4 against 7ccbeca, so redo it only if `src/flyer/`, `src/render/`
  or `src/shared/layout.ts` changed;
- commit only when asked, never push.

## Tooling notes

- The Bash tool turns `\\` into `\` inside heredocs. Write files that hold backslashes with the Write or Edit tool. In
  a Python heredoc, build a backslash with `chr(92)`.
- **Ports:**
  - 8787: `npm run dev`, which Artur often has running; server and shared edits restart it;
  - 8790: a process not of the session, with an older build;
  - 8795: the screenshot server;
  - 8797: the PHP smoke;
  - 8798: the render suite's `ai` project;
  - 8799: the render suite's `render` project.
- **The baseline proof:**
  - capture from the commit before the change, in a worktree under a plain folder name (`git worktree add --detach
    baseline-wt <commit>`, `npm run build` there);
  - never put that worktree under `.superpowers/`: Express's `send` refuses a path with a dot-segment, so
    `api/render` answers 404;
  - check with `RENDER_BASELINE=check RENDER_BASELINE_DIR=<dir> npx playwright test tests/render/baseline.spec.ts
    --project render`, then remove the worktree.
- `tests/storage/json.test.ts` can cross Vitest's 5 s default when the machine is busy (seen 2026-10-03 with another
  session running tests: 4 of 7 full `npm test` runs had one to three timeouts there, and the file alone passed in
  about 10 s). Rerun it alone before reading it as a regression. `copy.test.ts` got `describe('copy', { timeout: 30_000 }, …)` for the same reason: ask
  Artur whether this file should too.
- A textarea inside its `<label>` takes its own value into its accessible name: match such a field loosely
  (`getByLabel` without `exact`).
- In `ai.spec.ts`, a test that clicks Generate must not depend on what the tests before it spent: route `api/config`
  with `withLeft`.
