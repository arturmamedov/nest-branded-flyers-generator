# The AI assistant: an idea → a flyer, and a flyer → its share text

Branch `feat/ai-assistant`, 2026-10-02 to 2026-10-04, cut from `feat/flyer-briefs` (`1fbc991`). 24 commits,
unpushed. The brief is `docs/prompts/ai-assistant.md`; it was continued by
`docs/prompts/ai-assistant-continue.md` (Phase 3) and `docs/prompts/ai-assistant-continue-phase5.md` (Phase 5 to
the end). The review brief, for a fresh session on another model, is `docs/prompts/ai-assistant-review.md`: it has
not been run.

## What it is

- **"✨ Create with AI"** (`#/ai`, reached from the library's bar). A staff member pastes their text; a model writes
  the brief, with what it had to assume and the flyer's share text; the page shows the flyer through the app's own
  renderer. "Open in editor" hands it over as a new, unsaved flyer.
- **"✨ Write with AI"**, in the editor's Share text section, writes the caption from what the fields say now.
- **Off until a site has a key.** Then nothing of it shows, and the app is as it was.
- **At most 3 generations a day**, both features together, counted on the Canary Islands day.
- **Both backends** (Node and PHP) answer the same two routes, and **two providers** (OpenAI, Anthropic) sit
  behind one seam, with a fake one for the tests. Which provider runs is configuration.

## Artur's decisions

| When | What |
|---|---|
| 2026-10-01, the brief | OpenAI first, then Anthropic, both adapters from day one, and a fake for the tests. The cap: 3 a day, in the code, one counter for both features; a generation counts only when its answer passed validation; the day is the Canary Islands day. No key means no AI and no AI UI. Who may use it is a seam (an actor and a policy), for the login to fill. A separate "Create with AI" page, and one button in the Share text section |
| 2026-10-02, Phase 0 | The default models: `gpt-6-luna` (OpenAI) and `claude-haiku-4-5` (Anthropic). The AI may run on the live site while it is still unlocked: strangers could spend the day's 3 before staff do, and the cap keeps the cost there |
| 2026-10-03 | Phases 3 and 4 committed. For Phase 5: Claude runs the real calls, and a key is never printed; no stop between Phase 5 and Phase 6; `tests/storage/json.test.ts` gets 30 s; the Phase 4 screenshots go into git |

## What each phase built

| Phase | Commits | What |
|---|---|---|
| 1. The shared sources and the contract | `f5b76f2` | `src/shared/ai.ts`; the AI schemas and `BriefSchema`'s limits in `schema.ts`; five errors (`ai_off`, `ai_forbidden`, `ai_quota`, `ai_input`, `ai_failed`); the rules moved into `ai/prompts/`; `schema/ai.json` (prompts, few-shot, schemas) from `npm run gen`; the two routes in `docs/api-contract.md`; both backends answering them off |
| The ledger | `40f84d0` | one append-only record per generation, in both Node drivers: SQLite's migration 3 (`ai_usage`), the JSON store's `ai-usage/YYYY-MM.json`; the copy tool carries it |
| 2. Node | `cae300e` | `server/ai/`: the provider seam and its three adapters, the schema dialects, the prompt builder, the service, the actor and the policy, the routes; the `node-ai` contract project |
| 3. PHP, the peer | `79c0c62` … `8bbc759` | `php/src/Ai/`: the same seams over curl, replaying the same five vector files; the ledger in the JSON store; `config.php`'s `ai` block (`AiConfig`); the routes; the `php-ai` contract project; curl in the host facts and the preflight page |
| 4. The client | `c704651`, `ee0fdd9` | `AiPage.tsx` (`#/ai`), `handoff.ts`, "Write with AI", the bar entry; the form pieces moved out of `Editor.tsx` into `panel.tsx` and `share.tsx`; `tests/render/ai.spec.ts` on a second server with the fake provider |
| 5. A real call | `566d823` … `1490956` | the thirteenth-assumption slip; the settings' refusals; `scripts/site.ts`; `npm run ai:smoke`; the real calls, and the fault they found |
| 6. The docs | this commit and the one before | `docs/deploy.md`, `docs/ai-flyers/README.md`, `README.md`, `CLAUDE.md`, this report |

## Phase 5: what was built before the real calls

- **The thirteenth assumption** (`566d823`). A model answer with 12 assumptions and a made-up hostel left the
  service with 13, past the answer's limit. On both backends the service's "Unknown hostel" note still comes first,
  and on a full list it takes the place of the model's last one. The 12 has a name, `AI_ASSUMPTIONS_MAX`, which PHP
  reads from `shared.json`.
- **The settings refuse a bad value without repeating it** (`944764d`). `loadAiSettings` quoted the `AI_PROVIDER`
  it refused, so a key pasted on that line of `.env` would have been printed back. `AI_TIMEOUT_MS=25s` became `NaN`
  and was recorded as a network failure. PHP's `AiConfig` already did both right.
- **`scripts/site.ts`** (`977e5cd`): the one way a script calls a site's API. `flyers:post` used to do it inline. A
  redirect is refused, with the address it points to: a POST that follows a 301 arrives as a GET.
- **A guard on Anthropic's limits** (`523c969`): at most 24 optional properties and 16 union-typed ones in a
  request's schemas, or every generation answers 400. The flyer answer had 17 and 1, and has 16 and 1 since the
  share text became required. A test counts them.
- **`npm run ai:smoke`** (`5e36809`): one real generation, by hand.
  - Direct, it runs the provider `.env` names, composed as `server/index.ts` composes it, over a ledger in memory.
    It refuses the fake, a missing key and a switched-off AI.
  - `--to <app root>` goes through a site's API. It asks `api/config` first, and a release from before the AI, the
    AI off and a used-up day each stop it there, with nothing spent.
  - `--share` writes the caption of the example's flyer.
  - Everything but the two calls themselves is tested without the network.
- **`tests/storage/json.test.ts`** (`f243ac2`) has 30 s, set for the whole file: one of its three blocks is the
  shared repository contract, which a `describe` option in that file would not reach.

## The real calls (2026-10-04)

The first example's text (the sunset stretching class), held out of the few-shot, so each brief is the model's own.
`.env` was checked by a script that printed only yes or no. The Anthropic key was taken from `.env` into the
environment without being printed.

| # | Call | Model that answered | Tokens in / out | Time |
|---|---|---|---|---|
| 1 | OpenAI, flyer | `gpt-6-luna` | 3854 / 658 | 8.4 s |
| 2 | OpenAI, share text | `gpt-6-luna` | 1645 / 408 | 5.0 s |
| 3 | Anthropic, flyer (the first call with this schema) | `claude-haiku-4-5-20251001` | 5267 / 139 | 20.8 s |
| 4 | Anthropic, flyer again | `claude-haiku-4-5-20251001` | 5267 / 144 | 3.7 s |
| 5 | Anthropic, share text | `claude-haiku-4-5-20251001` | 2199 / 378 | 4.7 s |
| | *after the share text became required (below):* | | | |
| 6 | Anthropic, flyer (a new schema, so the first call again) | `claude-haiku-4-5-20251001` | 5302 / 483 | 20.6 s |
| 7 | OpenAI, flyer | `gpt-6-luna` | 3871 / 585 | 6.3 s |
| 8 | Anthropic, flyer again | `claude-haiku-4-5-20251001` | 5302 / 473 | 4.4 s |
| | *through PHP, on the Laragon copy (Apache, mod_php 8.4.25, curl), with both examples in the few-shot:* | | | |
| 9 | OpenAI, flyer | `gpt-6-luna` | 4529 / 722 | 6.7 s |
| 10 | OpenAI, share text | `gpt-6-luna` | 2267 / 454 | 5.0 s |

What they showed:

- **Both adapters worked at the first attempt.** No provider refused a request, a schema or a header.
- **OpenAI answers in 5 to 9 seconds.** `AI_EFFORT` was never needed.
- **Anthropic's first call with a new schema takes about 20 seconds,** then 4 to 5. It compiles the schema once and
  keeps it for a day (its docs, read 2026-10-02). 20.8 s and 20.6 s are close to the 25 s limit: on a slower day
  that first call fails, counts nothing, and the next one works.
- **The cost,** at the prices read on 2026-10-02: a flyer is about 0.08 cents on `gpt-6-luna` and about 0.8 cents
  on `claude-haiku-4-5`. Three a day is 0.25 or 2.3 cents.
- **The Canary day, on a real record.** Call 9's ledger record has `at: 2026-10-03T23:32:41Z` and
  `day: 2026-10-04`.
- **PHP's curl verified the provider's certificate** with Laragon's CA bundle from 2022 (`curl.cainfo` in its
  `php.ini`). The site's error log gained no line.

### The fault the real calls found

**Anthropic's flyer came back without its share text, twice out of twice** (calls 3 and 4: 139 and 144 tokens out).
`share` was optional in the answer's schema, and the prompt says to leave a key out rather than guess it. OpenAI's
strict dialect makes every key required, so `gpt-6-luna` wrote one. The brief's rule is that one generation is a
whole flyer.

Fixed in `1490956`, test first on both backends:
- `AiFlyerAnswerSchema` requires the share text, so a provider's structured output has to write it, and both
  backends answer `ai_failed`, uncounted, for an answer without it;
- PHP needed no code: it holds the answer to the generated schema;
- `BriefSchema` is unchanged, so a brief written by hand may still go without one;
- the prompt says the same in two lines, and `npm run gen` refuses an example that could not be the answer it shows.

Calls 6 to 8 are the proof: each provider answered a flyer with its share text.

### The briefs, read against the one written by hand

The text names no hostel and no price; Artur supplied both when the example was written ("Adeje Nest", "Free").

| | By hand | `gpt-6-luna` (call 1) | `claude-haiku-4-5` (call 6) |
|---|---|---|---|
| Hostel | `adeje-nest` | every hostel, said in an assumption | every hostel, said in an assumption |
| Headline | Stretching class / at sunset. | Stretch, breathe / and watch sunset. | Stretching & / sunset class. |
| When, where | Today · 19:00, Pool area | the same | the same |
| Cost | Free | Ask at reception, said in an assumption | Free, said in an assumption |
| Extras | Bring a towel, Bring water, Comfy clothes | Bring water, Bring a towel, Comfortable clothes | Bring water, Bring a towel, Comfy clothes, and a blank fourth |
| Ask | See you there. / ¡Te esperamos! | left out: the template's "Sign up at reception" prints | left out, the same |
| Share text | the staff text as it came | rewritten, shorter, with the assumed price in it | close to the staff text |

- **Both did what the rules say with what the text leaves out:** chain-wide, and listed for the staff member to
  check. Neither made a hostel up.
- **`claude-haiku-4-5` assumed "Free",** where the rules' default for a missing price is "Ask at reception". It said
  so in its assumptions, so the staff member sees it.
- **Neither kept the text's own ask.** The hand-written brief did, as a judgment recorded in that example's notes;
  the rules give the model no line for it. If it matters, it is one line in `ai/prompts/flyer.md`.
- **A blank extra** (`" "`, call 6) prints nothing: the flyer drops blank extras. The editor shows one empty field.
- **"and watch sunset."** (call 1) is not quite English. A staff member would correct it in the editor.

Each of these is a question of the rules, for Artur, not a defect of the code. An example file per corrected flyer
is how the model learns them (`docs/ai-flyers/README.md`, "From the ledger to an example").

## What in the brief did not hold

- **The Laragon address.** `--to http://localhost/nest-flyers-php/` cannot work: that copy answers 301 to https (the
  release's own rule), and Node refuses Laragon's certificate. It is
  `--to https://localhost/nest-flyers-php/` with `NODE_EXTRA_CA_CERTS=C:\laragon\etc\ssl\laragon.crt`. The script
  says both, each in its turn (`README.md` has the lines).
- **An example sent to the model is also in its few-shot,** so its own brief would come back. The direct mode holds
  the text out. Through a site nothing can be held out, and the script says so.

## The rulings

Decided while building, each with its cost if wrong. The full list, with the reasons, is in the session ledger
(`.superpowers/sdd/…/progress.md`, kept out of git).

- **Phase 0, the plan's ten decisions:** raw HTTPS adapters, no SDK (a Node SDK would make PHP a fork);
  `BriefSchema` carries every limit the flyer has; the ledger stores the Canary `day`; the JSON ledger is one file a
  month, with no id counter and no migration id; two knobs, `AI_EFFORT` and `AI_TIMEOUT_MS`; request-shape errors on
  the AI routes are `ai_input`; `api/config`'s `ai` is `{enabled: false}` or `{enabled: true, limit, remaining}`;
  the examples name the brief key each asked question settles (`asked[].field`); the AI routes generate only on
  `node-ai` and `php-ai`; both backends answered the routes off from Phase 1.
- **Phase 1:** the share few-shot is built from each example's brief directly, so PHP ports two formatters and not
  the whole brief → flyer logic; `BriefSchema.hostel` holds at most 60 characters; the ledger's `tokens` is null
  when no answer came.
- **Phase 2:** off builds no service at all; the copy tool appends the ledger keyed by `at|actorId|feature`, so a
  second copy does not double it; a failed call's ledger output is the model's raw text or null, and the reason goes
  to the console, redacted.
- **Phase 3:** the answer formats' names and the fake's facts live in `ai.ts`, for both backends; a provider's 200
  that is no JSON object is a provider failure, not a 500; PHP's ledger is `record` and `countOk` only; a bad `ai`
  block is 503, a missing one is off, `''` means unset; PHP builds the service only when the AI is on; the preflight
  prints no `ai` block, and a missing curl is a warning.
- **Phase 4:** the render suite has two projects and two servers; `ai.spec.ts` spends exactly the day's 3; the AI
  page asks before leaving a flyer nobody has opened; `#/ai` with the AI off is the library.
- **Phase 5:**
  - the 12 is `AI_ASSUMPTIONS_MAX`, carried to PHP in `shared.json`, not read off the answer schema's `maxItems`;
  - the share text is required in the answer's schema, not only asked for in the prompt. An empty string still
    passes: nothing polices it;
  - the smoke holds its example out of the few-shot. It costs one example's input tokens against the production
    prompt (call 9 shows the full one: 4529 in);
  - `flyers:post`'s request closure moved into `scripts/site.ts`. Its dry run printed the same before and after;
  - no `fetch` seam was added to `createAiService` for the smoke's tests: the vectors prove the adapters, and the
    smoke is proved on the fake through the same composition;
  - one ledger for the whole build, and no reviewer dispatched at the end: the review is Artur's own session;
  - the Laragon copy stays on the new release with the AI on.

## What was verified, and how

The gates, run in one sequence on 2026-10-04 with a real key in `.env`. One three-line tidy of
`scripts/ai/smoke.ts` came after it; typecheck and `npm test` were run again, with the same numbers.

| Gate | Result |
|---|---|
| `npm run gen` | every generated file up to date |
| `npm run typecheck` | 0 errors (client, server, scripts and tests) |
| `npm test` | 23 files, 337 tests passed |
| `npm run test:contract` | 37 files, 353 tests passed (7 files and 212 tests skipped by project, as designed) |
| `npm run test:php` | 726 tests, 9589 assertions, 37 skipped (the same 37 as before the AI) |
| `npm run test:render` | 114 passed, 1 skipped (the opt-in baseline), the `ai` project's 7 among them |
| `npm run test:php-smoke` | 2 passed |

- **No test touches a provider,** with a key in `.env` or without: the render servers pin the AI off or on the fake,
  the contract setups pass their own settings, and every unit test hands `loadConfig` an explicit environment. The
  environment wins over `.env` (checked again in this run).
- **Every piece was written test first,** and the failing run was read before the code existed. What each showed:
  - the thirteenth assumption: "expected … to have a length of 12 but got 13" on Node, "actual size 13 matches
    expected size 12" on PHP;
  - the settings: the refusal repeated the pasted value, and `25s` was accepted;
  - `scripts/site.ts`, against the closure moved as it was: a 301 on a POST was followed and answered as a GET, and
    a host's own error page threw a `SyntaxError`;
  - the share text: an answer without it passed its schema and the service, on both backends.
- **Mutations, each caught by a test:** the assumptions' limit set to 13 (four tests fail); the smoke's hold-out
  removed; the Anthropic guard's bound lowered to 16 ("expected 17 to be less than or equal to 16", before the share
  text became required).
- **By hand, with no key:** the smoke's refusals (the fake, a switched-off AI, an unknown flag, a missing file);
  `--to` through a throwaway Node server and a throwaway PHP stage, both on the fake (a flyer, a share text, the
  day's limit, a failed generation); and against the Laragon copy before its update: the redirect, the untrusted
  certificate, and the release from before the AI, each named, with nothing spent.
- **`flyers:post` is unchanged:** its dry run against a throwaway server printed the same before and after
  `scripts/site.ts`, and a real save there and its repeat worked.
- **The baseline was not redone,** and the UI was not looked at again: nothing in `src/flyer/`, `src/render/`,
  `src/editor/` or `src/shared/layout.ts` changed after Phase 4, where both were done (`baseline.spec.ts`:
  32 cases byte-identical against `7ccbeca`).
- **Not run:** the whole-branch review. It is Artur's own session.

## Screenshots (Phase 4, the fake provider)

The UI has not changed since they were taken (`git diff ee0fdd9..HEAD -- src/editor src/flyer src/render` is
empty). `.superpowers/screens/phase-4/shoot.ts`, kept out of git, retakes them against a server on port 8795.

| | |
|---|---|
| The library, AI on: the bar's "✨ Create with AI · 3 left" | ![The library with the AI on](ai-assistant/desktop-1-library-ai-on.png) |
| `#/ai`, empty | ![The AI page, empty](ai-assistant/desktop-2-ai-page-empty.png) |
| `#/ai`, a flyer made | ![The AI page with a result](ai-assistant/desktop-3-ai-page-result.png) |
| The assumptions and the share text | ![The AI page: what the AI assumed, and the share text](ai-assistant/desktop-4-ai-page-result-assumptions-share.png) |
| The editor, with the "AI draft" note until the first save | ![The editor with an AI draft](ai-assistant/desktop-5-editor-ai-draft.png) |
| "✨ Write with AI" in the Share text section | ![Write with AI in the editor](ai-assistant/desktop-6-editor-write-with-ai.png) |
| The library, AI off: nothing of it shows | ![The library with the AI off](ai-assistant/desktop-7-library-ai-off.png) |
| The editor, AI off | ![The editor with the AI off](ai-assistant/desktop-8-editor-ai-off.png) |
| Phone: the library, AI on ("✨ AI") | ![The library on a phone](ai-assistant/phone-1-library-ai-on.png) |
| Phone: `#/ai`, empty | ![The AI page on a phone, empty](ai-assistant/phone-2-ai-page-empty.png) |
| Phone: `#/ai`, a flyer made | ![The AI page on a phone, with a result](ai-assistant/phone-3-ai-page-result.png) |
| Phone: the editor, AI draft | ![The editor on a phone, with an AI draft](ai-assistant/phone-5-editor-ai-draft.png) |
| Phone: "✨ Write with AI" | ![Write with AI on a phone](ai-assistant/phone-6-editor-write-with-ai.png) |

## Known limits

- **Two concurrent requests can both see `remaining: 1`.** The provider is never called under a store lock, so the
  count and the record are apart. Accepted for one anonymous actor and 3 a day.
- **`claude-haiku-4-5` retires no sooner than 2026-10-15.** It is a default: `AI_MODEL`, or `model` in `config.php`,
  changes it in one line.
- **IONOS's FastCGI time limit is unmeasured** until the first call there. If it is under 25 s, `timeoutMs` goes
  down to stay beneath it (`docs/deploy.md`, "The AI assistant").
- **Anthropic's first call after the answer's schema changes takes about 20 s** of the 25 s limit.
- **PHP with no curl answers 500, not `ai_failed`,** when a staff member presses Generate: `CurlHttpClient` calls
  curl without checking for it. The preflight page warns about a missing curl, and IONOS has it. Not changed here;
  it is noted for the review.
- **The client does not parse the routes' answers with zod** (it would bundle zod into the editor), so the contract
  is held on the server side only.
- **Under load, two tests can time out** though the code is right: `tests/storage/json.test.ts` did (it has 30 s
  now), and `tests/unit/ai-providers.test.ts`'s `fetchJson` test did once in this session, at its own 2000 ms,
  against a local server. Alone it passed 3 times out of 3.

## Left open

- **The review:** `docs/prompts/ai-assistant-review.md`, in a fresh session on another model. It changes nothing;
  Artur picks what gets fixed.
- **The live site:** IONOS needs the new release, then the `ai` block with a key (`docs/deploy.md`). The first call
  there measures the host's time limit.
- **The Laragon copy** (`A:\serverpath\laragon\nest-flyers-php`) runs release `8b9c8556afa1` with the AI on: its
  `config.php` holds the OpenAI key. The backup from before is
  `backups/nest-flyers-php-2026-10-03-23-31-12`.
- **`.env` holds both keys:** OpenAI's in `AI_API_KEY`, and Anthropic's in `ANTHROPIC_API_KEY`, a line the app does
  not read. The Anthropic calls took it from there through the environment, which wins over `.env`. With a key in
  `.env`, `npm run dev` runs the real provider; no test does.
- **The rules:** the three points above (the text's own ask, "Free" on Haiku, a blank extra) are Artur's to decide.
- **Nothing is pushed.**
