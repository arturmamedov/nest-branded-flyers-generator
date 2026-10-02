# Brief: the AI assistant (an idea → a flyer, and a flyer → its share text)

A standalone brief for a new session. Read `CLAUDE.md` and `README.md` first, then `docs/ai-flyers/README.md` and
every file in `docs/ai-flyers/examples/`. Those hold the rules and the real cases this feature automates. Start in
plan mode, and work phase by phase: stop at each checkpoint below for Artur's go-ahead.

## Why

Staff at Nests Hostels write their events the way they would post them in a group chat: a few lines, emoji, Spanish
or English. Today Artur pastes those texts into a Claude Code session, Claude writes a *brief*, and
`npm run flyers:post` saves it as a flyer (since 2026-10-01; live examples #4 and #5). Every flyer also carries a
share text: the ES + EN caption staff paste when they post it.

This brief puts the same thing in the app. There are two features:

1. **Your idea → a flyer.** A staff member pastes their text. The model writes the brief: every field, both
   languages, and the share text. The app opens it as a new, unsaved flyer, and the staff member adjusts it and
   saves.
2. **A flyer → its share text.** In the editor, one button writes the caption from what the fields say now. This is
   for a flyer made by hand, or one changed after the AI made it.

## Decisions already made (Artur, 2026-10-01): don't reopen them

- **Providers.** OpenAI first, then Anthropic and others. Build a provider seam with both adapters from day one,
  plus a fake one for tests. Which provider runs is configuration, never code. Artur will supply the keys.
- **Cost cap.** At most **3 generations a day**, set in code: `AI_DAILY_LIMIT` in `src/shared/ai.ts`.
  - It is one counter for both features. An idea → flyer generation already includes the share text, so one
    generation is a whole flyer.
  - A generation counts only when the provider answered with output that passed validation. A call refused before
    reaching the provider never counts. Neither does one that failed (timeout, provider error, invalid output).
  - The day is the Canary Islands day (`Atlantic/Canary`).
- **AI can be turned off completely.** No API key means AI is off: no AI UI at all (hidden, not disabled), and the
  AI routes answer `ai_off`. An explicit switch in config turns it off even with a key.
- **No login yet, but who may use AI is a seam.** A real login comes in its own brief, with two kinds of user: AI
  allowed, and guests. Today every request is the one anonymous actor. Write the seam now, so the login only adds
  an implementation: an actor, and a policy that says whether the actor may use AI and what their daily limit is.
  The quota is counted per actor id; today that is one id, so the cap is site-wide.
- **Where the AI lives in the UI** (the recommendation Artur asked for):
  - **A separate "Create with AI" page** (`#/ai`), reached from the library. It is a generator: you put an idea in,
    a flyer comes out, and the generator ends at "Open in editor". The editor stays the place where you adjust.
    This keeps the editor simple, and keeps the AI's code in one place.
  - **One small "✨ Write with AI" button in the editor's Share text section.** The caption depends on the fields
    being edited, so it belongs there.
- **SOLID and DRY, as everywhere in this repo.** Infrastructure goes behind interfaces with implementations chosen
  by config. Substitutability is proven by shared contract tests run against every implementation. Every fact has
  one source; derived copies are generated.

## The shape (verify against the code, and adjust names to its idioms)

### One source for everything both backends share

The Node server (`server/`) and the PHP backend (`php/`, the one running live on IONOS) are peers that both answer
`docs/api-contract.md`. So:
- the rules, the schema and the examples are written once, in TypeScript and Markdown;
- `npm run gen` copies them for PHP, as it already does for `schema/` and `schema/shared.json`.

- **`src/shared/ai.ts`** (zod-free, so the client imports it):
  - `AI_DAILY_LIMIT = 3`;
  - `AI_INPUT_MAX`, the longest idea text (about 4000 characters);
  - the two feature names, `flyer` and `share`;
  - the day's time zone.
  - `npm run gen` copies these into `schema/shared.json`, as it does with `writeGuard.ts`.
- **Schemas** (`src/shared/schema.ts`, zod, the source of truth):
  - `BriefSchema` already exists.
  - Add the AI request and answer shapes:
    - `AiFlyerRequest { text, hostel? }`;
    - `AiFlyerResult { brief, assumptions: [{ field, note }] }`;
    - `AiShareRequest { hostel, template, data, idea? }`;
    - `AiShareResult { share }`;
    - the `ai` block of `api/config`.
  - Generate `BriefSchema` and the result schemas into `schema/`. PHP validates the model's answer with them, and
    each adapter turns them into the JSON schema its provider wants.
- **The prompts.** Move the "The rules" section of `docs/ai-flyers/README.md` into prompt source files, e.g.
  `ai/prompts/flyer.md` and `ai/prompts/share.md`, and leave the README linking to them.
  - `npm run gen` bundles three things into a generated file both backends read (e.g. `schema/ai.json`):
    - the prompts;
    - the few-shot examples taken from `docs/ai-flyers/examples/*.json` (`source` → `brief`, and `asked` →
      `assumptions`);
    - the schemas.
  - `tests/unit/generated.test.ts` already keeps generated files current; extend it to cover this bundle.
  - At request time the server adds the site's hostels (slug + name) to the prompt, so the model can only choose
    real slugs. It also adds today's date, so "today" and "this Friday" resolve.
- **Errors.** Add them to `src/shared/errors.ts` (one catalogue, generated for PHP and for the table in
  `docs/api-contract.md`):
  - `ai_off` (404, AI is disabled or has no key);
  - `ai_forbidden` (403, for the future guest role);
  - `ai_quota` (429, with when it resets);
  - `ai_input` (400);
  - `ai_failed` (502: a timeout, a provider error, or output that failed validation).

### The routes

Add these to `docs/api-contract.md` first, then implement them on both backends.

| Route | Body | Answer |
|---|---|---|
| `GET api/config` | — | gains `ai: { enabled, limit, remaining }` for the current actor. Never the provider's key, never a model's raw error |
| `POST api/ai/flyer` | `{ text, hostel? }` | `{ brief, assumptions, remaining }` |
| `POST api/ai/share` | `{ hostel, template, data, idea? }` | `{ share, remaining }` |

Both POSTs need the write header (`src/shared/writeGuard.ts`) and pass through the access rule, like every write.

### The server side, the same seams on both backends

- **`LlmProvider`**: one method. It takes `{ system, messages, schema, maxOutputTokens, timeoutMs }` and returns
  `{ json, usage: { inputTokens, outputTokens }, model }`. It throws a typed failure on a timeout, a refusal or bad
  output. Three implementations:
  - **OpenAI** and **Anthropic**: thin adapters over HTTPS, hand-written, so both backends behave the same. A
    Node-only SDK such as the Vercel AI SDK would make PHP a fork.
    - Each adapter turns the shared JSON schema into what its provider's structured output needs. OpenAI's strict
      mode, for example, wants every key required and optional ones made nullable; null then maps back to
      "absent".
    - **Check the providers' current docs before writing an adapter**: the exact endpoint, the structured-output
      parameters and the current model IDs. Don't rely on memory.
  - **Fake**: deterministic answers from fixtures. The contract suite runs on it, and it never touches the network.
  - **Prove the adapters with shared vectors** (the `tests/fixtures` pattern that `shared-vectors.test.ts` uses).
    Each vector pairs the request body expected for a given input with a recorded provider answer and its parsed
    result. The Node and PHP adapters must both pass every vector.
- **`AiService`**: builds the prompt from the generated bundle plus the hostels and the date, calls the provider,
  and validates the answer.
  - A brief must pass `BriefSchema`, and its hostel must exist. An unknown slug becomes `null` plus an assumption,
    never a 400.
  - It writes the usage record and returns the result.
  - It owns no HTTP and no storage details.
- **`AiUsageRepository`**, in each storage driver: the sqlite one gets a new migration, never an edit of an applied
  one; the JSON one follows the JSON driver's own file conventions; PHP's uses the JSON store.
  - It keeps one append-only record per generation: `at, actorId, feature, provider, model, tokens, ok, input,
    output`.
  - The quota is the count of today's `ok` records for the actor: one ledger, no separate counter.
  - The ledger doubles as the eval and few-shot set later: it holds real staff text and what the model made of it.
  - Prove it in `tests/storage/repositories.contract.ts` against every driver.
- **`Actor` and `AiPolicy`:**
  - `ActorResolver` returns the request's actor. Today that is one anonymous actor.
  - `AiPolicy` answers `enabled()`, `mayUse(actor)` and `dailyLimit(actor)`. Today: enabled only with a provider
    and a key, everyone may use it, and the limit is `AI_DAILY_LIMIT`.
  - The future login replaces the resolver and adds a role to the policy. Nothing else should need to change: say
    so in a comment where the seam is.
- **A `Clock`**, injected wherever the day matters, so the tests can cross midnight.
- **Configuration.** The key is server-side only. It never reaches `api/config`, a log line, the ledger, a
  release or git.
  - **Node:** `.env`, with `AI_PROVIDER` (`openai` | `anthropic` | `fake`), `AI_API_KEY`, optional `AI_MODEL`,
    and `AI_ENABLED` (default on when a key is set). Add them to `.env.example`, empty.
  - **PHP:** an `ai` block in `config.php`, the one file an admin edits. `Config::KEYS` is strict, so add the
    block there and to `config.sample.php`, and validate it. A missing block means AI is off, not a 503.
- **Time limits.** IONOS runs PHP under FastCGI; `docs/reports/host-facts.md` has what is known. Keep the provider
  timeout safely under the host's limit, and choose a fast model by default. The UI shows a waiting state.
- **Untrusted input.** Staff text is untrusted (prompt injection). The model's answer only ever becomes data
  validated by the schemas: never HTML, never a command, never a URL fetched. Length limits apply on the way in and
  on the way out.

### The client

- **Hidden when off.** All AI UI shows only when `config.ai.enabled`. Today a guest is the same as AI being off: no
  AI UI.
- **Library.** A "✨ Create with AI" entry beside the new-flyer action, with "2 left today".
- **`#/ai`, a focus page like the editor** (with "← Library"):
  - A "Your idea" textarea. Its placeholder is a real staff text, shortened.
  - An optional hostel select whose first option is "Let the AI decide". A **Generate** button shows what's left
    today.
  - The result shows:
    - the flyer through the existing `<Preview>`/`<Flyer>`. **Never a second renderer.** The brief becomes a flyer
      with `flyerFromBrief()` (`src/shared/brief.ts`, already DOM-free and zod-free for exactly this);
    - the assumptions, as "The AI assumed…" lines ("Price: Ask at reception");
    - the share text;
    - **Open in editor** and **Try again** (which costs one generation, and says so).
  - The idea text stays in the box, so it can be refined.
- **Open in editor** opens a *new, unsaved* flyer filled from the brief, through an in-memory handoff (not the URL,
  not storage). Nothing is saved until the staff member presses Save, so tries don't fill the library with junk.
  - The leave guard (`src/editor/leaveGuard.ts`) already protects unsaved work.
  - The editor shows an "AI draft: check every fact before you print" note until the first save.
- **The editor's Share text section** gets "✨ Write with AI". It asks before replacing a caption that isn't empty,
  and fills the textarea with the answer.
- **Make the AI visible.** Everything AI-made is marked as AI: the ✨, the word "AI", the draft note. Staff should
  always know which words a model wrote.
- **Errors.** Each `ai_*` error shows its catalogue message. For `ai_quota`, that says when it resets.

## Phases and checkpoints

0. **Setup.**
   - Branch `feat/ai-assistant` from the current branch. If the tree has uncommitted work, ask Artur before
     anything else.
   - Read the providers' current docs (structured outputs, model IDs).
   - Ask Artur:
     - the default model per provider;
     - whether AI may run on the live site while it is still unlocked (`allowPublic`). Anyone could spend the 3
       daily generations, though the cap keeps the cost at 3. The recommendation is to keep AI off on live until the
       lock in `docs/deploy.md` steps 3–4 is on.
   - **Checkpoint:** the plan.
1. **The contract and the shared sources.**
   - `src/shared/ai.ts`, the schemas, the errors, the prompt files and the generated bundle.
   - The two routes in `docs/api-contract.md`.
   - Unit tests for the prompt builder (hostels, date, examples) and the schema transforms.
   - **Checkpoint.**
2. **Node.**
   - The provider seam with the fake, OpenAI and Anthropic adapters, all passing the shared vectors.
   - `AiService`, the usage ledger in both drivers, the policy and actor, the routes.
   - The contract suite on the fake provider:
     - off → `ai_off`, with no `ai` UI data beyond `enabled: false`;
     - 3 generations, then `ai_quota`;
     - the next day resets the count;
     - an invalid model answer → `ai_failed`, and it doesn't count;
     - an unknown hostel → `null` plus an assumption;
     - the write header is required.
3. **PHP, the peer.** The same seams in `php/src/`, with curl adapters passing the same vectors, the ledger in the
   JSON store, and the `config.php` block. The same contract suite runs green on every backend (`npm run
   test:contract`), plus PHPUnit.
4. **The client.**
   - The library entry, the `#/ai` page, the editor handoff with its draft note, and the share button.
   - Render specs driving it all on the fake provider, including the hidden-when-off state.
   - Look at it in Chrome at desktop and phone widths.
   - **Checkpoint:** screenshots.
5. **A real call, by hand.**
   - An opt-in smoke script (e.g. `npm run ai:smoke`). It is never part of `npm test`, and it runs only when a key
     is in `.env`. It sends one of the example texts to the configured provider and prints the brief and the
     tokens.
   - Artur runs it with his OpenAI key, then with an Anthropic one.
6. **Docs.**
   - `docs/deploy.md`: the `config.php` `ai` block and where the key goes on IONOS.
   - `docs/ai-flyers/README.md`: the rules now live in `ai/prompts/`, and how a ledger record becomes an example.
   - A report, `docs/reports/ai-assistant.md`.
   - `CLAUDE.md`'s architecture and Status.

## Done means

- `npm run typecheck && npm test && npm run test:contract && npm run test:render && npm run test:php` all green.
  No test touches a real provider.
- The UI has been looked at in Chrome, desktop and phone, with AI on and off.
- With no key, the app looks and behaves exactly as before. `baseline.spec.ts` stays byte-identical, because
  nothing here reaches `<Flyer>`'s output.
- Commit only when Artur asks. Never push.

## Out of scope: don't start these

- The login and real user roles (their own brief). Only the seam is built here.
- Streaming, chat-style back-and-forth, generating images or photos, and AI on the This week rows beyond what a
  brief already carries.
- Moving the manual workflow (`npm run flyers:post`) onto the AI: it stays as it is, Artur's checked route.
