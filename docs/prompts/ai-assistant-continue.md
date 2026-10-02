# Brief: the AI assistant, continued from Phase 3 (PHP)

A standalone brief for a new session. The feature's own brief is `docs/prompts/ai-assistant.md`: read it first, then
`CLAUDE.md`, this file, and the approved plan at
`C:\Users\artur\.claude\plans\pasted-content-id-efe9-we-re-building-clever-crayon.md` (the Phase 0 research, the
decisions taken, every phase in detail). The execution ledger is
`.superpowers/sdd/pasted-content-id-efe9-we-re-building-clever-crayon/progress.md` (kept out of git through
`.git/info/exclude`): every ruling made so far is there; append yours, one line each, as you go.

Work on branch `feat/ai-assistant` (cut from `feat/flyer-briefs`). Phases 0–2 are committed there (`git log`). Work
phase by phase and stop at every checkpoint for Artur's go-ahead. The rules as always: SOLID and DRY, both backends
answer the same contract, every piece test first (watch the test fail), commit only when asked, never push.

## Decided: don't reopen

- Phase 0 answers (Artur, 2026-10-02): the default models are `gpt-6-luna` (OpenAI) and `claude-haiku-4-5`
  (Anthropic); AI may run on the live site now, while it is still unlocked. Keys come in Phase 5 (`.env`,
  `config.php`); until then everything runs on the fake provider.
- The plan's "Decisions taken" (ten points) and the ledger's rulings. In short: raw HTTPS adapters, no SDK;
  `BriefSchema` carries every limit; the ledger stores the Canary `day`; the JSON ledger is `ai-usage/YYYY-MM.json`,
  no counter, no migration id; `AI_EFFORT` and `AI_TIMEOUT_MS` are knobs; `ai_input` is every request-shape
  failure; `api/config.ai` is `{enabled: false}` or `{enabled: true, limit, remaining}`; only the contract's
  `node-ai` and `php-ai` projects generate; both backends answer `ai_off` when off.

## Where things are (Phases 1–2, done)

- Shared: `src/shared/ai.ts` (the constants, `aiDay`, `aiDateLine`), the AI schemas and `AiBundleSchema` in
  `src/shared/schema.ts`, the errors in `src/shared/errors.ts`, `StoredAiUsageSchema` in `src/shared/storage.ts`;
  `schema/ai.json` and the `ai` block of `schema/shared.json`, both from `npm run gen`; the prompts in `ai/prompts/`.
- Node: `server/ai/` — the seam `provider.ts`, `http.ts`, `providerSchema.ts` (the two transforms and `dropNulls`),
  `prompt.ts`, `service.ts`, `actor.ts`, `policy.ts`, `bundle.ts`, `composition.ts`, and
  `providers/{openai,anthropic,fake,common}.ts`; the ledger in `server/storage/{sqlite,json}/aiUsage.ts` (SQLite
  migration 3); the routes in `server/app.ts`; the settings in `server/config.ts` and `.env.example`.
- The contract: `docs/api-contract.md` ("The AI assistant" section: the checks in order, what counts, the fake's
  markers), `docs/json-storage.md` ("The AI ledger").
- The vectors PHP must replay, all in `tests/fixtures/`: `ai-day.json`, `ai-provider-schema.json`, `ai-prompt.json`,
  `ai-openai.json`, `ai-anthropic.json`. Their Node tests (`tests/unit/ai*.test.ts`) show how each is read; the
  Node service test (`tests/unit/ai-service.test.ts`) and the storage contract
  (`tests/storage/repositories.contract.ts`, `aiUsage`) are what PHPUnit mirrors.
- The contract suite: `tests/contract/ai.test.ts` (an off block for every backend; an on block that runs only where
  `inject('aiProvider') === 'fake'`), the `node-ai` project in `vitest.contract.config.ts`, wired by
  `tests/contract/setup/node.ts`.

## Phase 3: PHP, the peer (next)

Mirror the Node seams under `php/src/Ai/`, in the patterns the PHP code already has: read `php/src/Bootstrap.php`,
`Config.php`, `Shared.php`, `Http/Api.php`, `Http/AccessRule.php`, `Storage/Json/*`, `Validation/*` and the
corresponding tests first.

1. `LlmProvider`, `LlmCall`, `LlmResult`, `LlmFailure`; `OpenAiProvider` and `AnthropicProvider` over an
   `HttpClient` interface (`CurlHttpClient`; `#[\SensitiveParameter]` on the key; no key in any exception or log
   line: redact what the provider echoes, as `server/ai/providers/common.ts` does); `FakeProvider` with the same
   markers; `ProviderSchema` (the two transforms and `dropNulls`); `PromptBuilder`, byte-identical to
   `server/ai/prompt.ts` (`json_encode` with `JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES` matches
   `JSON.stringify` for the few-shot answers); `AiBundle`, reading `schema/ai.json` (add `Bootstrap::AI_FILE`);
   `AiService` with the same checks in the same order, the provider never called under the store lock (count under
   `shared()`, call, then append under `exclusive()`); `AiPolicy`; `Actor`, `ActorResolver`, `AnonymousActors`;
   `Shared::ai()` for the `ai` block of shared.json; the day and the date line as `src/shared/ai.ts` does them
   (`DateTimeImmutable` in `Atlantic/Canary`, `format('Y-m-d')` and `format('l j F Y')`).
2. `AiConfig`, a value object: `Config::KEYS` gains `ai`; `config.sample.php` gets the block (`provider`, `apiKey`,
   `model`, `effort`, `timeoutMs`, `enabled`); a missing block means off; unknown keys are refused like
   `AccessRule`. Note the rollback hazard for Phase 6: an older release answers 503 to a `config.php` with an `ai`
   key.
3. `Domain\AiUsageRepository` and `Storage\Json\JsonAiUsageRepository`: `ai-usage/YYYY-MM.json`, appended under
   `exclusive()`, made on the first append, reads never write, records rebuilt in `$defs.aiUsage` key order; no
   `RecordFile`, no id. Expose it on `Domain\Repositories`, wire it in `JsonRepositories::open`.
4. `Api.php`: the two routes replace the `ai_off` stubs; the config route takes the `Request`, so `ai.remaining`
   is per actor; `ApiConfig` emits the block. `Bootstrap::fromAppRoot(..., ?Clock)`, so PHPUnit can cross midnight.
5. `HostFacts::EXTENSIONS` and the preflight page's list gain `curl` (`PreflightTest` pins them equal).
6. `scripts/php/serve.ts`: `writeTestConfig` takes an `ai` posture (`'fake'`); `tests/contract/setup/php.ts` wires
   it for a new `php-ai` project in `vitest.contract.config.ts` (include only `tests/contract/ai.test.ts`,
   `fileParallelism: false`) and provides `aiProvider: 'fake'`.
7. PHPUnit, test first: the five fixture files replayed with `#[DataProvider]` (as `JsTrimTest` does);
   `AiServiceTest` with `FakeClock` crossing midnight; the ledger in `RepositoryContractTestCase` and
   `JsonRepositoriesTest` (the file, its key order, nothing written on a read); `ConfigTest` for the block (valid,
   unknown key, missing means off); `ApiTest` for the routes and the config block.

Constraints found in the code: `SchemaNormalizer` refuses `$ref`, `$defs`, `allOf`, `oneOf` (the bundle's schemas are
inline; keep them so); `FlockLock` blocks with no timeout; `tests/cross` pins that PHP adds nothing to a Node-written
store on reads; `ApiTest::testConfig` pins the `server` keys; PHP reads no environment, only `config.php`.

**Checkpoint:** `npm run test:contract` green on every project (`php-ai` included), `npm run test:php` green, and
`npm run typecheck && npm test` still green.

## Then

Phase 4, the client (`#/ai`, the bar entry with the count, the in-memory handoff, the draft note, "Write with AI",
render specs on the fake provider, Chrome at desktop and phone widths; checkpoint: screenshots). Phase 5, a real
call by hand (`npm run ai:smoke`, with `--to <url>` to go through a backend; for PHP the Laragon copy must run the
new release before its `config.php` gets an `ai` block). Phase 6, the docs (`docs/deploy.md` with the rollback
note, `docs/ai-flyers/README.md`, `docs/reports/ai-assistant.md`, `CLAUDE.md`, `README.md`). The plan file has each
in detail.

## Tooling notes

- The Bash tool in this environment turns `\\` into `\` inside heredocs and runs backticked text as commands: write
  files that hold backslashes or JSON escapes through the Write tool, and never put backticks in a `bash -c` string.
- Seen 2026-10-02: a process not of the session listens on `127.0.0.1:8790` with an older build of this app; use
  another port for a boot check.
