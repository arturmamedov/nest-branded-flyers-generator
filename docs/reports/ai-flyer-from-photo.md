# A flyer from a photo

The brief is `docs/prompts/ai-flyer-from-photo.md`: four stages, one session each. This report has one section per
stage that is built. **A stage with no section here is not built.**

| Stage | State |
|---|---|
| 1. A limit per feature | Built, 2026-10-06 (below) |
| 2. The read, on both backends | Not started |
| 3. The page | Not started |
| 4. The picture as the flyer's photo | Not started |

# Stage 1: a limit per feature

Branch `feat/ai-feature-switches`, on top of `684189e`, on 2026-10-06, in the session that planned the feature
(Artur: "Stay on feat/ai-feature-switches"). One commit per piece, each test first. Nothing is pushed, and `main`
stays at `684189e`.

## What it is

One cap covered every AI feature: three flyers used up the day's share texts too. Now each feature has its own
daily limit, set per site. A flyer never uses up a share text, and a feature that ran out says so while the other
still works. It comes before the photo feature because a picture read needs a count of its own.

## Artur's answers (2026-10-06)

| Question | Answer |
|---|---|
| Which features get their own limit? | Every one: `flyer`, `share`, and the one to come |
| What becomes of the single cap? | **"Each feature's default."** `AI_DAILY_LIMIT` and `'dailyLimit'` stay, and mean each feature's number unless it has its own |
| How is a feature's own number written? | **"One setting, pairs":** `AI_DAILY_LIMITS` in `.env`, `'dailyLimits'` in `config.php` |
| When is it built? | **"Own stage, own release,"** before anything of the photo feature exists |
| Where? | In this session, on `feat/ai-feature-switches`. Stages 2 to 4 go to a new session |

**What changes for a site that already set a number:** `'dailyLimit' => 5` was 5 generations a day in all. From this
release on it is 5 flyers and 5 share texts. `docs/deploy.md` says so where the setting is described.

## What was built

| | Node (`.env`) | PHP (`config.php`, the `ai` block) |
|---|---|---|
| Each feature, unless named below | `AI_DAILY_LIMIT=3` | `'dailyLimit' => 3` |
| A feature's own number | `AI_DAILY_LIMITS=share:10` | `'dailyLimits' => ['share' => 10]` |

- **The settings.** Every number is a whole number from 1 to 20, and the default is still 3. Both loaders resolve
  a number for every feature the app has. Refused by the setting's name, never its value: a name no feature has, a
  feature named twice, a number out of range, a pair not written `name:number`, a list where pairs belong. The new
  setting reads digits alone on both backends, so Node accepts no spelling PHP refuses (`1e1`, `2.0`, `+5`). A
  number for a feature the site does not run is accepted and does nothing. One table holds both loaders to this:
  `tests/fixtures/ai-settings.json`.
- **The policy answers `dailyLimit(actor, feature)`:** the feature's own number, else the site's, else 3.
- **The ledger answers a day's count feature by feature, from one read.** `countOk(actorId, day)` returns a count
  under each feature's name, so `api/config` still reads a month's file once however many features run. SQLite
  groups the day's rows by feature; the existing index serves it, so there is no migration.
- **`api/config` lists each feature that runs with its own count:**
  `ai: { enabled: true, features: [{ name, limit, remaining }, …] }`. The single `limit` and `remaining` are gone.
  Each route's `remaining` is its own feature's. The schema is strict and shared, so both backends, the client,
  the contract suite and `docs/api-contract.md` changed in one commit.
- **The used-up sentence names what ran out:** "Today’s 3 AI flyers are used up. They come back at midnight, Canary
  Islands time." and "Today’s 10 AI share texts are used up. …". The nouns are written once, in `src/shared/ai.ts`
  (`AI_FEATURE_NOUNS`), and generated for PHP.
- **The client keeps a count per feature.** The bar and Generate show the flyer's, "Write with AI" the share
  text's. A limit reached empties that feature's count alone. Two functions in `src/shared/ai.ts` are the only
  readers of the answer: `aiFor()` shows a feature, `aiWithRemaining()` moves its count.
- **`npm run ai:smoke`** reads the count of the feature it would call, says what a run spends in that feature's
  own words ("one of this site's 10 AI share texts for today (4 left)"), and names a site that answers the older
  shape as a release from before each feature had its own limit. Nothing is sent to such a site.
- **The Node start-up line** names each feature with its number: `features: flyer (2 a day), share (5 a day)`.
- **The docs:** `docs/deploy.md` (the settings, *Rolling back*, the troubleshooting rows), `README.md`,
  `docs/json-storage.md`, `.env.example`, `config.sample.php`, `CLAUDE.md`.

Not in this stage: a model per feature. It changes the provider seam, so it is stage 2's.

## How each piece was proved

Every piece was red first, for its stated reason.

| Piece | Commit | Seen red | Then green |
|---|---|---|---|
| The brief | `4b2f165` | (a document) | |
| `AI_DAILY_LIMITS` on Node's loader | `0010c90` | 30 tests: the setting was not read | `ai-config` 59 of 59 |
| `'dailyLimits'` on PHP's loader | `96b3b50` | 10 errors and 17 failures: an unknown key | `ConfigTest`, 119 |
| The ledger's count per feature, Node | `17602c3` | 5 tests on both drivers: one number where a count per feature was expected | the storage contract, both drivers |
| The same on PHP | `ed2edd0` | a fatal error: the interface still answered one number | PHPUnit, 805 |
| Each feature its own limit: both backends, the client, the contract | `e182665` | Node: 29 tests in 7 files. PHP: a fatal error with `php/src` put back as it was (the policy took no feature). Browser: with the client broken on purpose to share one count, "a limit reached…" failed | every suite |
| The smoke script | `db2d091` | 2 tests, then 1 more for the hint with its words taken out | `ai-smoke`, 32 |
| The docs | `3ec6898` | (documents) | |

Two of those reds were made on purpose, because the first run had not shown them: PHP's in piece 5 (the code was
put back to the commit before, seen to fail, and restored byte for byte), and the browser's (the client was made to
empty every count, rebuilt, seen to fail, and restored).

## A client and a backend from different releases

While a release is being uploaded, its new files answer beside the old ones. Both directions show no AI, and the
page still loads.

- **This client against an older backend:** three browser tests, one per older answer (one limit with the features
  by name; one limit and no list; no `ai` block at all). Each shows no AI and a working editor.
- **An older client against this backend cannot be run here.** It is read off the released code: `aiFor()` at
  `2c9e5f8`, the source of release `2ad58f28364e`, asks `features.includes(feature)`. The new list holds objects,
  so it finds no name and shows no AI.
- **A client from the releases of 2026-10-03 to 2026-10-05** reads the old `limit` directly and would show a broken
  count. No deployment runs one: the Laragon copy's `release.json` says `2ad58f28364e`, and the live site was on
  `d1f7ddb40170`, from before the AI, when last reported.

## Findings along the way

- **"Try again (uses one of 0 left)."** After the day's last flyer, the greyed button in the result's bar said
  that. Seen in the look on both backends. It is older than this stage: any day's last generation showed it. It now
  reads **"Try again (none left today)"**. The words are mine: change them if they are not yours.
- **The browser suite let `.env` change what it ran against.** `playwright.config.ts` pins every AI setting its
  server counts on, because that server also reads `.env`. It did not pin the new one, so a line such as
  `AI_DAILY_LIMITS=flyer:1` in `.env` failed two tests. Seen red by setting that pair in the surrounding
  environment, which reaches the server the same way (2 failed, 15 passed); with each feature's limit pinned,
  17 passed. The contract suite and PHP's stages never read `.env`.
- **Stopping a `php -S` look stage on Windows leaves its `php` running.** Five such processes outlived their
  shells during the look. Each was confirmed by its command line, stopped by its port, and its temporary folder
  removed. `scripts/php/serve.ts` was not changed: the test suites stop their stages themselves.

## The review

One fresh-context review of the stage's seven commits after the brief (`0010c90` to `3ec6898`), by another agent
that was given the code and not my conclusions. It read the diffs and the changed files whole, and probed the real
PHP classes and the built Node code in memory. It ran no suite and wrote nothing.

**It found no defect in the counting, the settings or the wording, on either backend.** Among what it checked and
found sound: nine scenarios through the real services of both backends gave identical JSON; a switched-off feature
answers `ai_off` before any count and its earlier records move nothing; about 45 strings through Node's loader and
25 values through PHP's turned up nothing but the notes below; fourteen answers `aiFor()` should not read came back
as "no AI".

What it found, and what was done. The brief says to fix what the review finds, each test first:

| What it found | What was done | Commit |
|---|---|---|
| A `null` entry beside a readable one in `ai.features`: the button showed, and its first answer took the whole page down. No backend answers such a list | `aiWithRemaining()` now moves a count, beside `aiFor()` and reading as loosely: an entry it cannot read stays as it came. Red: six unit tests, and a browser test where the caption's field was gone with the page | `90173b8` |
| `aiFor()` showed a count the contract refuses: "-1 left" beside a live Generate | A count is a whole number from zero up. In the same six | `90173b8` |
| The share text's limit reached in the editor had no browser test (the flyer's page had) | Added. It passed as written, so it was seen red with the editor's line for a 429 taken out, and the line put back | `90173b8` |
| The browser suite did not pin `AI_DAILY_LIMITS` | Already found and fixed (above) | `6b25f5c` |
| What a driver does with a later release's record was said in a commit and held by no test | Pinned on each driver and at both services (below) | `c9d619b` |
| Four tests named "a count leaves the others alone" and run one feature | Renamed to what they hold, with where the rest is held. The app has two features, and those tests leave one out | `c9d619b` |
| `docs/deploy.md` showed the old `api/config` answer in one row, and named a release by its date alone | Corrected | `e0d8294` |
| Comments on both backends still spoke of one cap; a docblock lacked `featureNouns` | Corrected | `e0d8294` |
| This report and `CLAUDE.md`'s status were missing | Written | |

**A later release's ledger record, met after going back.** Stage 2 will write `photo` records, and this release may
meet them after a rollback. While one cap covered everything, every record of the day counted against it. Now:

| Driver | What it does with a record of a feature it does not know |
|---|---|
| PHP, JSON | counts it under its own name, so it moves no count of a feature the release runs. A record that names no feature counts for none |
| Node, SQLite | the same |
| Node, JSON | refuses the month: the AI is hidden until the newer release is back |

Each is a test now, and both services have one: such a record counts against no feature the release runs. Seen
red with the counts added up, on both backends, and with PHP's check for a name removed. `docs/json-storage.md`
describes the difference.

**Left as it is, for Artur:**

- **A limit of 1 reads "Today’s 1 AI share texts are used up. They come back…".** The sentence is the one you
  approved, and "1 AI generations" had the same shape before. A site that sets 1 will read it. Mending it needs a
  second noun per feature and a second sentence, on both backends: your words.
- **A feature with nothing for its number is refused:** `AI_DAILY_LIMITS=share:` stops a Node server, and
  `'dailyLimits' => ['share' => null]` answers 503. `null` means "unset" for the block's other keys, so you may
  want it to mean "no own number". It is a row of the settings table now, so changing it is that row and two
  lines.
- **`'share' => 010` in `config.php` is 8,** PHP's octal, before the app sees it. `.env`'s `share:010` is 10.
  Nothing the loader can do: do not write a leading zero.
- **Older, unchanged:** with several settings wrong, Node names `AI_FEATURES` first and PHP `ai.dailyLimit`;
  `AI_DAILY_LIMIT` itself still reads `1e1` and `2.0` on Node; the Node start-up line prints `AI_MODEL` as typed.

**Small things noted and not changed:** the test helper `on()` takes its arguments in two orders across four test
files; `countOk` keeps its name though it answers a count per feature.

## Rulings

Each was mine, with its cost if wrong.

- **`countOk(actorId, day)` answers every feature's count from one read,** not one feature's per call. `api/config`
  asks on every page load and would otherwise read the month's file once per feature. If wrong: one signature, on
  one interface, three drivers and their test doubles.
- **The single number leaves the settings' answer on both backends.** A limit is asked per feature and there is no
  other. If wrong: one field back on two classes.
- **The settings table's accepted rows say which features differ and what the rest get,** so adding `photo` edits
  no row. If wrong: a fixture's shape.
- **`aiFor()` still shows a feature listed beside an entry it cannot read.** The other choice was "any odd entry
  hides the AI". A later backend will list a feature this client has no name for, and that must not cost the
  features it does know. If wrong: one line.
- **A route that answers with no count to show leaves the count as it was.** The flyer just made stays on screen,
  and the server still refuses at the limit. If wrong: the number on a button is stale until the page is loaded
  again.
- **The browser suite pins each feature's limit in the setting's own words** (`flyer:3,share:3`), not as an empty
  value: an empty variable is not reliably set on Windows. If wrong: one line of configuration.
- **"Try again (none left today)"** is my wording.
- **One picture of the old button is kept** beside the report (`before-the-fix-…png`): it is the finding.

## The look in a real browser

**Not in Artur's own Chrome.** The Claude extension was not connected, so the look ran in Playwright's Chrome 143,
with its own profile. A script walked the same path on both backends at 1440 × 900 and 390 × 844, and every
screen was read in a screenshot.

- **Node** was the built app on a throwaway data folder. **PHP** was a `php -S` stage with the built client
  (`scripts/php/serve.ts`). Both ran the fake provider: nothing was spent.
- The limits were different per feature on purpose: 2 a day and 5 for the share text; then 3 a day and 2 for the
  share text, to use that one up.
- The Laragon copy was not used and not changed.

| What was looked for | Node | PHP |
|---|---|---|
| Each button shows its own count | the bar "Create with AI, 2 left today", "Generate (2 left today)", "Write with AI (5 left today)" | the same |
| A flyer leaves the share text's count alone | two flyers: 2 → 1 → 0, and "Write with AI" still says 5 | the same |
| A share text leaves the flyer's alone | two share texts: 2 → 1 → 0, and the bar still says 3, with Generate live | the same |
| The flyer's used-up sentence | "Today’s 2 AI flyers are used up. They come back at midnight, Canary Islands time." under a greyed Generate | the same |
| The share text's | "Today’s 2 AI share texts are used up. …" under a greyed "Write with AI" | the same |
| The question before a caption is replaced | "It uses one of the 5 generations left today.", and with one left "It uses the last generation left today." | "the last generation" seen; the first caption went into an empty box, which asks nothing |
| `api/config` afterwards | flyer 0 of 2, share 4 of 5 | the same |
| A site with the share text alone | no "Create with AI" on the bar, `#/ai` typed by hand opens the library, "Write with AI (5 left today)" | the same |
| A site with the flyer alone | "Create with AI, 2 left today", "Generate (2 left today)", no "Write with AI" in the editor | the same |
| A number for a feature the site does not run | the flyer-alone site started with `share:5` set, and ran | the same |
| On the phone | the bar's entry is "✨ AI", every count and sentence as on the desktop, no sideways scroll | the same |
| After the day's last flyer | "Try again (none left today)", greyed, and "Open in editor" live | the same |

| | Node | PHP |
|---|---|---|
| The library: the bar's count is the flyer's | ![](ai-flyer-from-photo/node-desktop-library.png) | ![](ai-flyer-from-photo/php-desktop-library.png) |
| The flyers used up, and the corrected button | ![](ai-flyer-from-photo/node-desktop-ai-try-again-none-left.png) | ![](ai-flyer-from-photo/php-desktop-ai-try-again-none-left.png) |
| Meanwhile "Write with AI" still has its five | ![](ai-flyer-from-photo/node-desktop-editor-share.png) | ![](ai-flyer-from-photo/php-desktop-editor-share.png) |
| The share texts used up | ![](ai-flyer-from-photo/node-desktop-editor-share-used-up.png) | ![](ai-flyer-from-photo/php-desktop-editor-share-used-up.png) |
| The same on a phone | ![](ai-flyer-from-photo/node-phone-editor-share-used-up.png) | ![](ai-flyer-from-photo/php-phone-editor-share-used-up.png) |
| A site with the share text alone | ![](ai-flyer-from-photo/node-share-alone-desktop-library.png) | ![](ai-flyer-from-photo/php-share-alone-desktop-library.png) |
| A site with the flyer alone: no "Write with AI" | ![](ai-flyer-from-photo/node-flyer-alone-desktop-editor-share.png) | ![](ai-flyer-from-photo/php-flyer-alone-desktop-editor-share.png) |

Also in `ai-flyer-from-photo/`, for each backend: the AI page after one flyer (`…-desktop-ai-flyer.png`), the phone's
library, used-up page and editor (`…-phone-library.png`, `…-phone-ai-used-up.png`, `…-phone-editor-share.png`,
`…-phone-ai-try-again-none-left.png`), and the rest of the one-feature sites at both sizes
(`…-share-alone-…`, `…-flyer-alone-…`). `before-the-fix-try-again-one-of-0-left.png` is the button as it was.

## The release

**None was built, and nothing outside this folder was touched.** The Laragon copy still runs `2ad58f28364e` with
the share text alone. `.env` was not changed. The live site was not called.

A release of this stage needs this order on a host: the release first, `'dailyLimits'` second, and `'dailyLimits'`
out again before going back. Release `2ad58f28364e` and older refuse that setting (503). `docs/deploy.md`,
*Rolling back*, has the row.

## The gates

One sequence on 2026-10-06, on the tree of `e0d8294`: the stage's last code commit.

| Gate | Result | On `2c9e5f8` (the last report) |
|---|---|---|
| `npm run gen` | every generated file up to date | the same |
| `npm run typecheck` | 0 errors | 0 |
| `npm test` | 28 files, 492 tests passed | 28 files, 448 tests |
| `npm run test:contract` | 38 files, 359 tests passed (7 files and 215 tests skipped by project) | the same |
| `npm run test:php` | 810 tests, 9,858 assertions, 37 skipped (PHP 8.3.4) | 781 tests, 9,779 assertions |
| `npm run test:render` | 135 passed, 1 skipped (the opt-in baseline) | 130 passed |
| `npm run test:php-smoke` | 2 passed | 2 passed |
| `baseline.spec.ts` | 32 cases byte-identical against a capture of `4b2f165`, taken before any code changed | 32 |

- **No test touches a provider, and no provider was called in this stage,** by a test, a script or the look.
- The same gates were green on `3ec6898`, before the look and the review: 482 unit tests, 806 PHP tests, 132 in
  the browser. The difference is the tests the look and the review added.
- **Tests added as pins,** green from the start because the code was already right: the share text's limit in the
  editor, a later release's record on each driver and at both services, and the settings row for a number left
  empty. Seen to fail with the code broken on purpose: the editor's test, both services' tests, and PHP's "names
  no feature". Not seen to fail: the three driver tests whose assertion is the exact answer (PHP's and SQLite's
  "counted under its own name", Node's JSON "refuses the month") and the settings row, which runs on both loaders.
- The 37 skipped PHP tests are the same 37 as before.

## What is left

- **Nothing is pushed.** `main` is at `684189e`. This branch is ahead of it by the stage's commits: the brief, seven
  pieces, five fixes, and this report.
- **Artur's:** whether `main` moves to this branch; and the release, when you want it. It can go up before stage 2,
  as you chose ("own stage, own release"). On a host: `npm run build:php` and upload, `npm run deploy:tag -- <the
  site>`, and only then any `'dailyLimits'`.
- **For Artur to decide** (each is above, under *The review*): the sentence at a limit of 1; a feature with nothing
  for its number; the words "Try again (none left today)".
- **Stages 2 to 4** are for a new session, on `feat/ai-flyer-from-photo`, cut from this stage's last commit.

**For the session that builds stage 2,** what this stage leaves ready:

- Adding `photo` to `AI_FEATURES` does not compile until `AI_FEATURE_NOUNS` has its noun ("picture reads").
- The settings table needs no row edited for it, and `playwright.config.ts` pins its limit by itself.
- The four tests that leave one feature out will then run two. Their `call` and `BODY` maps need a `photo` entry,
  and their names can say "a count leaves the others alone" again.
- `aiFor()` and `aiWithRemaining()` are the only readers of `api/config`'s `ai` block in the client.
- This release already does what the brief's stage 2 says of an older build that meets a `photo` record, and tests
  hold it there.
- After a look, check for `php -S` processes left on the look's ports.
