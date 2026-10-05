# Review brief: the AI assistant (`feat/ai-assistant`)

A standalone brief for a review session, best run on a different model than the one that wrote the code. You review;
you change nothing. Run it once the feature is finished (after Phase 6). It also works earlier: skip what isn't there
yet.

## What to review

Everything the feature added: `git diff 1fbc991..HEAD` on branch `feat/ai-assistant` (1fbc991 is where it was cut from
`feat/flyer-briefs`). Read `git log 1fbc991..HEAD` first: one commit per piece, and each body says what it claims.

Read these before the code:
- `docs/prompts/ai-assistant.md`: the feature's brief. It is the spec.
- `docs/api-contract.md`, "The AI assistant": the checks in their order, what counts, the fake's markers.
- `CLAUDE.md`: the repo's rules. SOLID and DRY, one renderer, both backends as peers.
- `.superpowers/sdd/pasted-content-id-efe9-we-re-building-clever-crayon/progress.md`: every ruling taken while
  building. They are decided: don't argue a ruling's taste, but do report a ruling that causes a defect.

Don't take this brief's word, or a commit message's, for anything: check it in the code.

## What matters, most first

1. **The key never leaves the server.** Not into `api/config`, a log line, the ledger, an exception or a release.
   - Node: `server/ai/providers/common.ts` (`redact`), `http.ts`, and the logging in `service.ts`.
   - PHP: `ProviderAnswer::redact`, `CurlHttpClient`'s messages, `AiConfig`'s errors, and every `error_log('…' . $e)`.
     An exception's trace prints arguments when `zend.exception_ignore_args` is off, and `#[\SensitiveParameter]` only
     works from PHP 8.2 while the floor is 8.1.
2. **Money and the cap.**
   - A generation counts only when the answer passed its schema.
   - The provider is never called while a store lock is held.
   - No test can reach a real provider, even with a key in `.env`. Check `playwright.config.ts`, the contract setups
     and how `server/config.ts` reads `.env`.
   - The day is the Canary Islands day on both backends.
   - Accepted and not a finding: two concurrent requests can both see `remaining: 1`.
3. **The twins agree.** Node (`server/ai/`) and PHP (`php/src/Ai/`) must behave the same: the same checks in the same
   order, the same prompt bytes, the same provider requests, the same ledger file.
   - `tests/fixtures/ai-*.json` pin a lot. Look for what they do not pin: JavaScript truthiness against PHP's (`'0'`),
     JSON encoding, non-string or missing provider fields, token counts that are not integers, the 200-character cut,
     bytes that are not UTF-8, and `dropNulls` on shapes the vectors lack.
   - Any behaviour only one backend has is a finding.
4. **Untrusted input.** Staff text is fenced and named as data. The model's answer only ever becomes data held to a
   schema: never HTML, a command or a fetched URL. Length limits hold on the way in and on the way out. Unknown hostel
   slugs are handled on both routes.
5. **The client** (`src/editor/AiPage.tsx`, `handoff.ts`, `App.tsx`, `Editor.tsx`, `panel.tsx`, `share.tsx`):
   - with the AI off, no AI in the DOM at all;
   - the handoff is in memory and taken once;
   - the leave guard and `route.ts`'s rules still hold (`replaceHash`, never `history.replaceState`);
   - the counts are right after every error;
   - a late answer after the user moved on does no harm;
   - phone widths work, and the new controls are reachable by keyboard and named for a screen reader;
   - nothing reaches `<Flyer>`'s output. `baseline.spec.ts` proves that only if you run it.
6. **Storage.** The JSON ledger: a read never writes, the schema's key order, one file a month, a damaged file named.
   SQLite's migration 3 is append-only. The copy tool carries the ledger without doubling it.
7. **Configuration.** PHP's `ai` block: a missing block is off, a bad one is 503, and the rollback hazard is
   documented. Node's `AI_*` settings. Both backends must turn on and off under the same conditions.
8. **SOLID and DRY.** A fact written twice, in TypeScript and again by hand in PHP. Dead code. An abstraction with one
   user and no seam. A comment that no longer says what the code does.
9. **The tests.** Do they test behaviour, or a mock? What can break with every test still green? Is anything
   order-dependent or timing-dependent (`tests/render/ai.spec.ts` spends exactly the day's 3 generations on purpose)?

## How

- Run the gates yourself first and report the numbers:
  `npm run typecheck && npm test && npm run test:contract && npm run test:render && npm run test:php && npm run test:php-smoke`.
  `tests/storage/json.test.ts` is known to time out at 5 s on a busy machine: rerun it alone before calling it a
  failure.
- Reproduce every finding before you report it, with a failing test you wrote, a command, or a request. Then try to
  refute it. A finding you could not reproduce is reported as a suspicion, apart from the rest.
- If Artur opted into multi-agent work, fan out over the nine areas above and verify each finding adversarially.
  Otherwise, one careful pass in that order.
- Never call a real provider. `.env` may hold a real key, and `npm run dev` would then spend real generations: use the
  fake (`AI_PROVIDER=fake`) for anything you start.
- Change no file in the repo, commit nothing, push nothing. Scratch tests go in your scratchpad, or are deleted before
  you finish.

## What to hand back

In your reply, not in a file:
1. The gates' numbers.
2. Findings, most severe first. For each: `file:line`, what is wrong in one sentence, the concrete input or state that
   makes it fail and what happens then, how you verified it, and the smallest fix.
3. Suspicions you could not reproduce.
4. What you looked at and found sound: one line per area, so Artur knows what was covered.
5. Questions only Artur can answer.

Then stop. Artur picks what gets fixed. The fixes are their own session: `docs/prompts/ai-assistant-followup.md`.

## Since this brief was written (added 2026-10-05)

- **The branch is finished.** Phases 5 and 6 added ten commits, `566d823` to `bb2675c`. Read
  `docs/reports/ai-assistant.md` after the feature's brief: it says what was built, what the real calls showed and
  what is known to be open.
- **`.env` holds real keys now,** so "never call a real provider" is no formality. `npm run dev` and
  `npm run ai:smoke` both spend. The Laragon copy (`https://nest-flyers-php.test/`) has the AI on with a real key:
  don't generate there.
- **`tests/storage/json.test.ts` has 30 s now.** The test seen timing out since is the `fetchJson` one in
  `tests/unit/ai-providers.test.ts` ("hands back the status and the body text"), once, at its own 2000 ms, on a
  busy machine.
- **Recommended:** Fable 5.1 at high effort. Opus 5.5 wrote every commit on the branch.

## Seen while building: verify, don't trust

The session that wrote Phase 5 noticed these and did not change them. Each is a claim to reproduce or refute, like
any other.

- **PHP with no curl answers 500, not `ai_failed`.** `php/src/Ai/CurlHttpClient.php` calls `curl_init` without
  checking for the extension. `Bootstrap` then logs the `Error` with its trace. What that trace prints of the key
  on PHP 8.1, where `#[\SensitiveParameter]` does nothing, was not checked.
- **The echoed key, on Node.** Node proves at the adapter that a key a provider echoes never leaves it
  (`tests/unit/ai-providers.test.ts`, "The key never leaves the adapter"). PHP also proves it through the service,
  in the log and the ledger (`AiServiceTest`). Whether Node's proof is enough is yours to judge.
- **An empty share text passes.** `AiFlyerAnswerSchema` requires the key since `1490956`, with no minimum length.
- **Three browser `confirm`s** are part of the client: replacing a caption, leaving unsaved work, archiving a flyer.
