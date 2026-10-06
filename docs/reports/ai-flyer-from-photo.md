# A flyer from a photo

The brief is `docs/prompts/ai-flyer-from-photo.md`: four stages, one session each. This report has one section per
stage that is built. **A stage with no section here is not built.**

| Stage | State |
|---|---|
| 1. A limit per feature | Built, 2026-10-06 (below) |
| 2. The read, on both backends | Built, 2026-10-06 (below, after stage 1). Its checkpoint: Artur's answers are built, the first case is in git, and the real reads are done, and what he chose from them is built (*The checkpoint*, at the end). **The checkpoint is closed** |
| 3. The page | Built, 2026-10-06 (the last section). Looked at on both backends, reviewed, and tried on a real phone the same evening. **Its checkpoint has all it asked for; what is left is Artur's to decide** |
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

# Stage 2: the read, on both backends

Branch `feat/ai-feature-switches`, on top of `650d3a9`, on 2026-10-06. Asked which branch, Artur chose "Stay on
feat/ai-feature-switches" again. One commit per piece, each committed as it went green on his go-ahead for the
stage ("Commit each as it goes green"). Nothing is pushed, and `main` stays at `684189e`.

**The checkpoint is open.** Everything below is built and green. The real reads have not been run: they wait for
Artur's go and his pictures. No provider was called in this stage, by a test, a script or by hand.

A later session the same day took the checkpoint up: Artur answered what this section left for him, and what he
said yes to is built. That is *The checkpoint*, at the end of this section. The sections between here and there
are as the stage left them.

## What it is

The server can read a picture into the words it shows. `POST api/ai/photo` takes a picture and answers those words;
a staff member will check them in "Your idea" and then ask for the flyer, as with any text. It is a third AI
feature, `photo`, with its own switch, daily limit and model. There is no page yet: that is stage 3. With `photo`
not named in a site's settings, the app looks and behaves exactly as before.

## What was built

| | Node (`.env`) | PHP (`config.php`, the `ai` block) |
|---|---|---|
| The read runs | `photo` in `AI_FEATURES` | `'photo'` in `'features'` |
| Its daily limit | `AI_DAILY_LIMITS=photo:5`, else `AI_DAILY_LIMIT` | `'dailyLimits' => ['photo' => 5]`, else `'dailyLimit'` |
| Its model | `AI_MODELS=photo:<model>`, else `AI_MODEL` | `'models' => ['photo' => '<model>']`, else `'model'` |

- **The route.** `POST api/ai/photo`, the picture as a file in the field `photo`, answers `{ text, remaining }`.
  Checks in the contract's order: the write guard, `ai_off`, `ai_forbidden`, the photo route's own checks with its
  messages, the reads' limit, the provider. Nothing is written to `uploads/`.
- **The words.** 0 to 4000 characters, so they always fit the idea box. `[?]` stands where the model could not
  read a word. An empty text means the picture has no words, and that read counts.
- **The used-up sentence:** "Today’s 3 picture reads are used up. They come back at midnight, Canary Islands time."
- **What the model gets:** the picture upright, without its metadata, at most 2048 px on its long edge, a PNG when
  it has transparency and a JPEG otherwise; the reader's rules (`ai/prompts/photo.md`); and one fixed line. No
  hostels, no date, no examples.
- **The provider seam carries a picture** on both backends. Anthropic gets an image block and then the text;
  OpenAI an `input_image` at high detail and an `input_text`. A text turn goes out exactly as before: the existing
  vectors' bodies were not edited.
- **A model per feature.** One provider and one key serve every model. The call names its model.
- **One photo intake per backend,** used by both routes that take a picture. `POST api/photos` behaves as before.
- **What a site keeps.** The picture as it was sent, in `ai-pictures/<Canary day>/` of the data folder, never
  served, for 30 days. It is written before the provider is asked. The ledger's record names it in one line and
  never holds it. `GET api/config` deletes what is past its days, at most once a day, AI on or off.
  `deploy:backup` and `npm run copy` leave the folder out.
- **The fake provider reads pictures:** it answers its first example's text, and a picture's width steers it
  (11 px a bad answer, 12 a timeout, 13 a refusal, 14 no words).
- **`npm run ai:smoke -- --photo <picture | case .json> [--save <file>] [--to <site>]`:** one real read by hand.
- **The eval set,** `docs/ai-flyers/image-examples/`, held to its shape by a test. Its first case is not committed
  yet (below).
- **The docs:** `docs/api-contract.md` (written first), `docs/deploy.md`, `docs/json-storage.md`, `README.md`,
  `.env.example`, `config.sample.php`, `docs/ai-flyers/README.md`, `CLAUDE.md`.

## How each piece was proved

| Piece | Commit | Seen red | Then green |
|---|---|---|---|
| The seam carries a picture | `9b6271d` | the picture's request entry alone, twice on each backend | 415 unit, 812 PHP |
| A model per feature | `15c926c` | Node: 22 tests (the setting was not read), then the service's test with the model taken out of the call. PHP: 10 errors and 14 failures, then a fatal error (the interface still asked a provider for its model) | 516 unit, 837 PHP, the contract suite |
| One photo intake, Node | `37ce322` | 7 tests: neither function existed | the photo contract tests, untouched |
| One photo intake, PHP | `a61c15a` | 5 errors: no class | 842 PHP; the photo contract tests, untouched |
| The reader's prompt, the schema, the bundle | `6743310` | Node: 9 tests. PHP: 2 errors, 2 failures | 528 unit, 844 PHP |
| The fake reads pictures | `7996a38` | Node: 4 tests. PHP: 1 error, 1 failure | 451 unit, 846 PHP |
| The kept pictures and their deleting, Node | `6c372b5` | the test file could not load: no module | 539 unit |
| The same on PHP; backup and copy | `c7fc00a` | PHP: 5 errors, 3 failures. The restore drill: a backup carried the folder | 855 PHP, the cross tests |
| `photo` joins the features: service and route, both backends | `65395c6` | Node: 49 tests. PHP: 39 errors, 8 failures | 558 unit, 872 PHP, 374 contract |
| The smoke's `--photo` | `98d7967` | 12 tests | 568 unit |
| The eval set's test | `d5cd8a3` | not seen red: a pin | |
| The docs | `6ca9b83` | (documents) | |
| What the review found | `5ed6af0` | Node: 4 tests. PHP: 1 error, 5 failures | 577 unit, 878 PHP, 378 contract |

**Not seen red, said plainly:**
- The contract suite's cases for the read were written before either route existed but first run after Node's.
- `npm run copy` leaving the kept pictures behind: it never carried them. A pin.
- The eval set's test: it passed against the case on this machine.
- PHP's guard for a folder it cannot list: no test can make `scandir` fail here.
- PHP's link test is skipped on this Windows account, which cannot make a link. Node's runs.

**One piece is one commit where the brief has two.** `photo` joined the features on both backends together: the
list is generated for PHP and both backends' tests run over it, so the name on Node alone would leave PHP red.
Stage 1's fifth piece was one commit for the same reason.

## What the providers' docs said (read 2026-10-06)

- **Anthropic:** an `image` block with a `base64` source, before the text. At most 10 MB a picture in base64.
  `claude-haiku-4-5` reads at up to 1568 px on the long edge; Claude 4.7 and later at 2576. Structured outputs list
  Haiku 4.5 and name no conflict with pictures. Haiku 4.5 still says "not sooner than 15 October 2026".
- **OpenAI:** `input_image` with a data URL and `detail`, and `input_text`. At `high` the current models read at
  most 2048 × 2048 and 2,500 patches of 32 px, about 1,600 px square. The page names `gpt-6-astra` and the `gpt-5.6`
  family, not `gpt-6-luna`.
- **What follows:** both default models shrink a 2048 px picture themselves, and only a stronger Claude uses all
  of it. That is a number for the checkpoint's table, not a change: 2048 and `high` are built as the brief says.

## The review

One fresh-context review of the twelve commits `9b6271d` to `6ca9b83`, by another agent that was given the code and
the brief and not my conclusions. It read the diff and the changed files, and ran five small probes in memory. It
ran no suite and wrote nothing.

**It found no way for a switched-off read, the AI off, or a request without the write header to read a file,
prepare a picture, keep one, ask a provider, count or record.** It also found sound: the order of checks on both
backends, the ledger's line byte for byte, the 30-day boundary, the adapters' picture parts against the vectors,
`POST api/photos` unchanged by the intake's split, and that neither the key nor a picture reaches `api/config`, the
ledger or an error message.

What it found, and what was done (`5ed6af0`), each test first:

| What it found | What was done |
|---|---|
| A file under another field's name was a 500 on Node, where PHP answers `no_photo_field`. Older than this stage on `api/photos`; the shared intake gave it to the read | `no_photo_field` on both routes and both backends, in the contract and its suite |
| One day's folder that could not be deleted ended the whole clean-up for good: always first in the listing, and the day never marked. On PHP, a walk of the folder and a log line on every page load | Each folder is tried, the day is marked, one line names what is stuck |
| PHP's clean-up followed a link where a day's folder belongs, and would delete what it points at | A link is never followed. A test holds Node, which never did |
| PHP read a folder it could not list as one entry with no name, itself, and recursed about 4,000 deep, logging each step | It is an error now |
| PHP's day pattern took a name ending in a line break | `\z` |
| `'models'` and `'apiKey'` on PHP took a no-break space; Node refuses it | Both read spaces as JavaScript's `\s` does. Two rows in the settings table |
| When a picture could not be kept, PHP's trace printed its first 15 bytes into the log | The argument is marked sensitive |
| `--save` wrote a JPEG under any name | It refuses a name that does not say what the file holds |
| `.swept` was written once in each backend | A shared fact now (`STORAGE_FILES`) |
| A test named an order and tested none; a check that could not fail | Cases with two faults at once; the check is gone |

**Left as it is, with the reason:**
- **The eval set's test does not yet hold a case to the format a read sends.** The case on this machine is a PNG
  without transparency, which a read sends as a JPEG. The check goes in with the case, once Artur has looked at it
  (below): adding it now would fail on a file that is his to replace.
- **A partial upload** (new `php/src`, old `schema/ai.json`) answers 500 on `api/config` for a site with the AI on,
  even one that never names `photo`. It is the known rule, "upload a release whole", and `docs/deploy.md` says so.
- **A request the host kills mid-call** leaves a kept picture with no ledger record.
- **Noted, not changed:** the kept picture's path pattern is used by the Node tests alone, and PHP's tests spell
  their own; the picture extensions are listed in three places.

## For Artur to decide

Items 1 to 4 were answered on 2026-10-06: *The checkpoint*, below, has each answer and what was built from it.

1. **A read that fails is free, and keeps its picture.** Both are your decisions: a failed call never counts, and a
   failed read's picture is the one worth having. Together, on a site with no lock, they have no bound: a stranger
   with a script can send pictures that fail (a page of dense text makes an answer over 4000 characters, which
   also pays the provider each time) and fill the disk, about 0.3 MB a picture. The live site has hit its disk
   quota once. The smallest change that reopens neither decision is a second, higher daily number for *attempts*.
   I did not build it: it is a new rule.
2. **The reader's prompt's words** (`ai/prompts/photo.md`). They are mine, from the brief's seven rules, plus one
   line the first case asked for: a brand badge or a slogan that names no hostel is left out ("ONE PASS · MORE
   HOSTELS" on the Canva page). The plan said you would read them before their commit; your later go-ahead to
   commit each piece as it went green overtook that, so they are committed and waiting for your eye. Changing them
   is that file and `npm run gen`.
3. **The first case's picture.** It shows, besides the flyer: browser tabs ("…est Hostel", "La Isleta Nest Hostel",
   "KPIs HOSTALES NEST", "Pinterest"), a piece of the Canva address ("…QxFI819skn5Q/edit"), three bookmarks
   ("La Isleta Nest Gran…", "CHECK OUT LA ISLE…", "Worldpackers") and the Windows taskbar. As a read would send it,
   it is a JPEG of 154 KB, not the PNG of 1.4 MB. Cropping the tabs away would weaken the case: leaving out what
   surrounds the flyer is one of the rules it tests. Say yes and I commit the case with that JPEG.
4. **A PNG with transparency stays a PNG,** as the brief says. A very large one could pass Anthropic's 10 MB and
   answer `ai_failed`.
5. **Older, unchanged:** the three items stage 1 left (the sentence at a limit of 1, a feature with nothing for its
   number, "Try again (none left today)").

## Rulings

Each was mine, with its cost if wrong.

- **The call names its model,** instead of one provider built per model. If wrong: one field moves back.
- **A read longer than the idea box fails** (`ai_failed`, nothing counted), as any answer over a limit does. The
  other choice was to cut it. If wrong: one line in each service.
- **The words are trimmed,** so a read of spaces alone is "no words". If wrong: one call in each service.
- **Kept for 30 days** means a day's folder goes once that day is more than 30 days before today's Canary day.
- **A disk that cannot keep the picture answers the app's ordinary 500,** logged, with nothing spent or recorded.
- **The route prepares the picture and the service takes it prepared,** on both backends, so the service owns no
  image work. If wrong: one call moves.
- **The kept pictures have a second implementation, in memory,** for the tests and the smoke's direct read.
- **The fake's widths are 11 to 14 px:** small enough that neither backend ever shrinks them.
- **The read's route asks the switch before any of the upload's checks,** so a site that does not run it says
  nothing about the file.
- **`photo` in the docs is "the server's half":** a host is told to leave it out of `'features'` until the page's
  release, since naming it shows nothing.

## The look in a real browser

**None, and none is owed by this stage:** it has no page. What stands in for it is the baseline, byte-identical
over 32 cases against a capture of `650d3a9` taken before any code changed, and the whole render suite, whose AI
server now names `photo` among its features and shows nothing new.

## The release

**None was built, and nothing outside this folder was touched.** The Laragon copy still runs `2ad58f28364e` with
the share text alone. `.env` was not changed. The live site was not called.

A release of this stage needs this order on a host: the release first, then `'models'` and `'photo'`; both out
again before going back. Every release up to `2ad58f28364e` refuses them (503). `docs/deploy.md`, *Rolling back*,
has the row, and says that such a release never cleans `data/ai-pictures/`.

## The gates

One sequence on 2026-10-06, on the tree of `5ed6af0`: the stage's last code commit.

| Gate | Result | On `e0d8294` (stage 1) |
|---|---|---|
| `npm run gen` | every generated file up to date | the same |
| `npm run typecheck` | 0 errors | 0 |
| `npm test` | 31 files, 577 tests passed | 28 files, 492 tests |
| `npm run test:contract` | 38 files, 378 tests passed (7 files and 235 tests skipped by project) | 359 tests |
| `npm run test:php` | 878 tests, 10,161 assertions, 38 skipped (PHP 8.3.4) | 810 tests, 9,858 assertions, 37 skipped |
| `npm run test:render` | 135 passed, 1 skipped (the opt-in baseline) | 135 passed |
| `npm run test:php-smoke` | 2 passed | 2 passed |
| `baseline.spec.ts` | 32 cases byte-identical against a capture of `650d3a9`, taken before any code changed | 32 |

The same sequence was green on `6ca9b83`, before the review: 572 unit tests, 374 contract tests, 135 in the
browser, the baseline identical. The difference is the tests the review added.

- **No test touches a provider, and no provider was called in this stage.**
- The 38 skipped PHP tests are the 37 as before and the link test.

## What is left

- **The checkpoint: the real reads,** on your go. Your pictures: the Canva page, a handwritten board, a poster, a
  chat screenshot, a photo with no words. Each on both providers, on the default model and on a stronger one named
  through `AI_MODELS`, and one through the Laragon copy for PHP's side. You get the table: the picture, the model,
  the seconds, the tokens, what was misread. Then you choose the photo's model and whether 2048 px stays.
  - This machine's `.env` names `flyer,share`. The reads would run with `AI_FEATURES` and `AI_MODELS` set in the
    command's own environment, which wins over `.env`: `.env` is not changed, and no key is printed.
  - The Laragon copy needs the new release (`npm run deploy:update`) and `'photo'` named for that one read, by a
    script that prints nothing of its `config.php`. Say how it should be left.
- **The first case** of `docs/ai-flyers/image-examples/`, after your look (above).
- **Nothing is pushed.** `main` is at `684189e`.
- **Stages 3 and 4** are not started.

**For the session that builds stage 3,** what this stage leaves ready:

- `aiFor(ai, 'photo')` already answers the reads' own `{ limit, remaining }`; nothing in the client asks it yet.
- The browser's `preparePhoto()` takes its limits as an argument: `AI_PICTURE_MAX_EDGE` is in `src/shared/ai.ts`.
- The client's API helper sends a form as it is (`uploadPhoto` is the model for the read's call).
- The fake answers a read with its first example's text, so a read and then Generate give that example's flyer.
  A picture 14 px wide is "no words"; 11, 12 and 13 are the failures.
- `playwright.config.ts` names `photo` and pins its limit by itself; the suite's pictures must not be 11 to 14 px
  wide by accident.
- A read's failure early (the switch, the write guard) may answer before a large upload is taken: a browser can
  see a dropped connection there instead of the refusal. No page shows the read where it is off, so it has not
  mattered yet.
- Added by the checkpoint: a failed read answers no count, and it is one of the day's tries. So after failed reads
  the page's "N left today" can be higher than the server's until `api/config` is asked again. The server still
  refuses at the right moment, with the used-up sentence.

## The checkpoint

A later session on 2026-10-06, on `feat/ai-feature-switches`, on top of `747e4c8`. Asked which branch, Artur chose
"Stay on this branch", for the checkpoint and for stage 3. Asked how to commit, he chose "Each piece as it goes
green". Nothing is pushed, and `main` stays at `684189e`.

**Where it stands:** Artur's answers are built, the first case is in git, and the gates are green. **The real
reads are done: eleven pictures, 40 reads, and one more through the Laragon copy. What is open is Artur's choice
from the table.** No test and no script but `npm run ai:smoke`, by hand and on his go, called a provider.

### Artur's answers (2026-10-06)

| Question | Answer | What follows |
|---|---|---|
| A daily number for failed reads? | **"Yes, picture reads only"** | Built (below). Flyers and share texts stay as they were |
| How many tries? | **"Three times its limit"** | 3 reads give 9 tries, 20 give 60. No new setting |
| What does staff see when the tries run out first? | **"The used-up sentence"** | The same 429 `ai_quota`. The button's count is the smaller of reads left and tries left |
| The words of `ai/prompts/photo.md` | **"Read with them, settle after"** | Open until the table of real reads |
| The first case's picture | **"Yes, as it is"** | Committed as the read sends it (below) |
| A PNG with transparency | **"Leave it"** | Nothing built. A known limit (below) |
| Where does the original PNG go? | **"Move it to backups/"** | `backups/image-examples-originals/`, which git ignores |

### A number of tries for the picture read

A failed read is free and keeps its picture: both Artur's decisions. Together, on a site with no lock, nothing
bounded them. Now a picture read gets three tries a day for each read of its limit, failed ones included.

- **A try** is every read that reached the provider: the actor's ledger records of that feature for the Canary
  day. The ledger already kept them, so there is no new stored data and no migration.
- **What is left of the reads** is the smaller of reads left and tries left. That number is `remaining`, in
  `api/config` and in the route's answer.
- **With none left** the route answers the same 429 `ai_quota`, with the reads' limit in the sentence, before the
  picture is kept: a refused read keeps nothing, asks no provider and is not recorded.
- **It is no setting.** One fact, `AI_TRIES_PER_LIMIT = { photo: 3 }` in `src/shared/ai.ts`, generated for PHP. A
  site's own limit for the read moves its tries with it.
- **The flyer and the share text have no such bound.** Their failed generations never count, however many.
- **The policy decides:** `dailyTries(actor, feature)`, a number, or null where there is no bound. Each service
  has one function for what is left, behind `status()` and every route's check.
- **The ledger answers both counts from one read.** `countOk` became `countDay`, which answers `{ ok, tried }`
  feature by feature, so `api/config` still reads a month's file once.

| Piece | Commit | Seen red | Then green |
|---|---|---|---|
| The ledger answers a day's tries, Node | `2f38e5f` | 9 tests of the storage contract and its two drivers' files: `countDay is not a function` | 577 unit |
| The same on PHP | `51ce77d` | 6 errors and 2 failures in `JsonRepositoriesTest`: `Call to undefined method … countDay()` | 878 PHP |
| The rule on both backends, and the contract's text | `54bc036` | Node: 3 tests. PHP: 3 failures. On both: the fact was missing, and the two days where the tries bind said more was left than the table allows | 583 unit, 884 PHP, 378 contract |
| The docs | `43aa907` | (documents) | |

**One table holds both backends:** `tests/fixtures/ai-tries.json`, five days as lists of steps, replayed by
`tests/unit/ai-service.test.ts` and `php/tests/Ai/AiServiceTest.php` on the fake provider with a ledger in memory.

**Three of its days passed before the rule existed, by design:** they say what must not change. Each was then
seen red on both backends with the rule broken on purpose, and the rule put back:

| Broken on purpose | What failed, the same on Node and on PHP |
|---|---|
| Every feature's tries bounded | 3 tests: "a failed flyer and a failed share text never count", the policy's test, and the day with another feature's records |
| A failed read counted against the limit | 6 tests: "an ordinary day at the default limit is as it was" among them, with both days where the tries bind, the day with other records, and stage 2's own two "charges nothing" tests |
| Every feature's tries counted together | 2 tests: "another actor's tries, another day's, another feature's and a later release's record move nothing", and the failed-flyer day |

**Not seen red, said plainly:**
- In that last day, the rows for another actor and another day are left out by the test's ledger in memory, not by
  the service. What they hold the service to is asking the ledger for its own actor and day. The drivers' own
  filter is the storage contract's, on both drivers and both backends.
- `tests/unit/generated.test.ts` spells out the AI block PHP is told. It failed once the fact was generated, and
  passed with the fact added to its list: a pin of the generated file, not a test written first.

**Not proved over HTTP.** The contract suite's day makes three failed reads and needs three good ones: six of its
nine tries. No point in that day shows the tries without losing a read the suite needs. Its expectations were not
touched and stayed green, which shows that an ordinary day over HTTP is as it was.

**The disk.** At the default limit a day's folder holds at most 9 pictures for one actor. (Not against reads sent
at the same moment: stage 3's review found that, *The review* at the end of this report.) `docs/deploy.md` keeps
its own cautious figure of about half a megabyte a picture: 45 MB over the thirty days when every read works, and
three times that at the very most. The first case's picture is 0.15 MB, so the real figure is likely lower.

### The first case

Committed in `7ff9b05`: `docs/ai-flyers/image-examples/2026-10-05-la-isleta-nest-bachata-workshop.json` with its
`.jpg`.

- **The picture is the JPEG a read sends:** 899 × 1599, 154,388 bytes, made by the server's own intake
  (`preparePhoto()` at `AI_PICTURE_MAX_EDGE`). No provider was called. Read beside the PNG, it shows the same: the
  pale "20:00", "La isleta Nest" and "Rooftop" are as legible as before.
- **The phone's file** was a PNG of 1,441,995 bytes without transparency. It is in
  `backups/image-examples-originals/` on Artur's machine, outside git.
- **The test holds a case to the format a read sends,** and its name to that format. Seen red on the PNG:
  "expected 'image/png' to be 'image/jpeg'". The naming rule is the one `--save` already held, so both use one
  function (`namesItsFormat`, `scripts/ai/smoke.ts`).

### A PNG with transparency: left as it is

It stays a PNG for the read, as the brief says. A very large one could pass Anthropic's 10 MB and answer
`ai_failed`, which would also be one of the day's tries. Through the page it is unlikely: the browser's own
`preparePhoto()` already sends a PNG with no real transparency as a JPEG whenever it re-encodes one. It takes a
picture that is truly see-through, photographic, and about 7.5 MB after shrinking.

### The real reads: eleven pictures, 40 reads

Artur's go, 2026-10-06: **"Go: the first case now"**, on **"The middle one of each"** as the stronger model. He
then put ten pictures of his own in `backups/photo-reads/`, some of them "lying and not from activities", to see
what a mistaken upload does, and asked that the calls be optimized and each picture understood first.

**What the reads say, before the tables:**

- **Printed posters and screenshots: every model reads them.** The fast models are enough there.
- **Handwriting: the fast models are not to be trusted with it.** On the Muay Thai board both wrote a wrong time,
  three reads out of three each, and never a `[?]`: "19:30" and "20:30" where the board says "10:30". Both middle
  models read "10:30" every time.
- **A picture that is no event still gives its words.** All four models wrote out the framed "What's on today?"
  sign. No model made up an activity from erased chalk.
- **The seconds:** `claude-haiku-4-5` 1.7 to 4.0, `claude-sonnet-5-5` 4.3 to 11.5, `gpt-6.1-sol` 8.5 to 17.7,
  `gpt-6-luna` 2.2 to 20.7, of the 25 s the app waits.
- **The cost:** all 40 reads together came to about 19 cents.

**The Canva page** (`2026-10-05-la-isleta-nest-bachata-workshop`), sent as 899 × 1599, a JPEG of 150 KB. Each read
is `npm run ai:smoke -- --photo <the case's .json>` with the feature, the provider and the model in the command's
own environment; the ledger is in memory.

| Model | Seconds | Tokens in / out | What was misread, against the picture |
|---|---|---|---|
| `gpt-6-luna` | 5.7 | 2,158 / 301 | Nothing. It wrote "La Isleta Nest" where the picture prints "La isleta Nest": a capital corrected |
| `gpt-6.1-sol` | 8.5 | 2,158 / 203 | Nothing. The same corrected capital |
| `claude-haiku-4-5` | 3.4 | 2,139 / 69 | "la isleta Nest": the capital L read as a small one |
| `claude-sonnet-5-5` | 8.4 | 2,644 / 626 | Nothing: "La isleta Nest", letter for letter |

- **Every model read every fact:** Today, the bachata workshop, 20:00, the hostel and the rooftop, the two palest
  words included. Each wrote the hostel's name from the logo on a line of its own, "LA ISLETA Nest".
- **Every model left out what surrounds the flyer:** the browser's tabs and bookmarks, Canva's own bar and page
  controls, "ONE PASS · MORE HOSTELS", the next page and the taskbar.
- **The case's typed words differ from its own picture in two places,** seen by enlarging the picture: it prints
  "BACHATA" and "WORKSHOP" on two lines, and "La isleta Nest" with a small "i". `source` has one line and a
  capital. All four models wrote the two lines, as the reader's rule asks ("a line for each line of the picture").
  Asked, Artur said **"Yes, as the picture prints"**: `source` is now exact. `claude-sonnet-5-5`'s read matches it
  to the letter. The other three differ by the one capital in their rows, and `gpt-6-luna` by an empty line after
  "Today" as well. The brief and the flyer did not change.
- **The cost of these four reads:** about 2 cents in all, from the tokens and the providers' prices: a fast model
  under half a cent, a middle one about one cent. Less than the estimate given before them.
- The stronger Claude model thought before answering (626 tokens out for 15 words) and still answered in 8.4 s of
  the 25 s.

**The ten pictures Artur gave.** All are WhatsApp JPEGs of 1080 to 1534 px wide and at most 2048 px tall, so the
intake sent each as it came: the 2048 px edge shrank none of them. They stay in `backups/photo-reads/`, outside
git.

| # | Short name | His file (`WhatsApp Image …`) | What it is |
|---|---|---|---|
| 1 | web-tunnel | `2026-09-21 at 11.24.51` | A phone screenshot of the Nests website, a partner's techno poster inside |
| 2 | photo-yoga | `2026-09-28 at 10.43.45` | Yoga at sunset: no words |
| 3 | poster-femme | `2026-10-01 at 10.57.13` | A designed poster: a slogan and a name, no date, no place |
| 4 | poster-cacao | `2026-10-04 at 09.03.077` | A complete poster: date, time, price, place, a phone number |
| 5 | poster-week | `2026-10-04 at 11.11.03` | A printed week of four dance classes |
| 6 | sign-whatsapp | `2026-10-06 at 13.54.58` | **Lying:** the framed "What's on today?" sign with its QR code. It looks like a flyer and is no event |
| 7 | chair | `2026-10-06 at 13.54.588` | **Lying:** a painted chair, its patterns like writing |
| 8 | board-empty | `2026-10-06 at 13.54.589` | **Lying:** a chalkboard with four day names, empty boxes, and erased chalk still faint |
| 9 | board-week | `2026-10-06 at 13.54.68` | The handwritten weekly board: four activities in six colours |
| 10 | board-muaythai | `2026-10-06 at 13.54.78` | One handwritten event in bubble letters |

**Each picture was read by eye first,** with its hard spots enlarged, and what it should give was written down
before any model was asked. The misreads below are judged against that, not against each other.

**The calls were made in two rounds, so none was spent where it could teach nothing.** Round 1: all ten on the two
fast models. Round 2: the middle models on the five pictures where a fast model had slipped or where the answer is
a judgment. The other five were read right by both fast models, so a stronger model had nothing to add: 10 reads
not made. Then the one result the choice hangs on, the Muay Thai time, was read again, to see that it was not luck.

What was misread, with the seconds of each read:

| # | `gpt-6-luna` | `claude-haiku-4-5` | `gpt-6.1-sol` | `claude-sonnet-5-5` |
|---|---|---|---|---|
| 1 web-tunnel | One name of the line-up, "LIRR" for "LTRR". `[?]` for the half-hidden place. **20.7 s** | The venue "Tunel Las Brujas" and the half-hidden place left out, with no `[?]`. "Asymetric" corrected to "Asymmetric". 4.0 s | Nothing. `[?]` for the place and for the cut-off sentence. 17.7 s | Nothing. It added the sponsors' names. 11.5 s |
| 2 photo-yoga | Nothing: empty. 2.2 s | Nothing: empty. 1.7 s | not run | not run |
| 3 poster-femme | Nothing. 5.3 s | Nothing. 2.3 s | not run | not run |
| 4 poster-cacao | "neccessary" corrected to "necessary". 7.3 s | Nothing: the misspelling copied. 2.8 s | not run | not run |
| 5 poster-week | Nothing. Each class as a block of four lines. 6.2 s | Nothing. Each class on one line, with a "\|" the picture has as a drawn rule. 3.7 s | not run | not run |
| 6 sign-whatsapp | The sign's words, where no event is. The word a light bulb hides was filled in. 5.1 s | The same. 3.1 s | The sign's words, with `[?]` for the hidden word. 10.2 s | The same as `gpt-6.1-sol`. 9.0 s |
| 7 chair | Nothing: empty. 2.3 s | Nothing: empty. 1.7 s | not run | not run |
| 8 board-empty | "DORADA Especial" and the four day names, where empty is right. 6.6 s | The same, with hearts. 2.7 s | Nothing: empty. 12.6 s | Nothing: empty. 4.3 s |
| 9 board-week | The beer brand kept. "21h3[?]" for "21h". "Asharana" for the hostel Ashavana. A flourish read as "?" and as ":". 16.6 s | The beer brand kept. "Asharama" for Ashavana. A star emoji added to each row. 2.6 s | **Nothing.** "Ashavana" read right, each activity on one line. 14.6 s | "Asharana" for Ashavana. The rest right, each activity on one line. 8.5 s |
| 10 board-muaythai | **The time: "19:30" for "10:30"**, with no `[?]`. 6.9 s | **The time: "20:30" for "10:30"**, with no `[?]`. 2.3 s | Nothing: "10:30". 9.2 s | Nothing: "10:30". 6.2 s |

**The Muay Thai board, read again:**

| | `gpt-6-luna` | `claude-haiku-4-5` | `gpt-6.1-sol` | `claude-sonnet-5-5` |
|---|---|---|---|---|
| Second read | "19:30" again | "20:30" again | "10:30" again | "10:30" again |
| Third read | "19:30", and the title and the day in Thai script, the day as Friday | "20:30", and the title in Thai script | not run | not run |

- **"10:30" is the reading by eye,** with the digits enlarged: a bubble "1" with a flag and a foot, joined to the
  "0". Artur knows the real time, and can say if the board means another.
- **The fast models' wrong time is steady, not chance:** each gave its own wrong answer three times out of three.
  The reader's rule ("Never guess a word, a time or a price") did not help: a model that misreads a digit does not
  know it is guessing.
- **No model read the erased chalk as an activity,** on any of the three boards. The fast models did write what is
  printed or still chalked on the empty board: the brand and the day names.
- **The hostel's name in handwriting was read right by one model of four.** The reader is not given the hostels'
  names, by the brief's shape. Whether the flyer's assistant, which has them, maps "Asharana" to Ashavana Nest was
  not tested: that is a flyer generation, another feature.
- **No model answered empty for the sign.** The reader copies words: it does not judge whether they announce an
  event. What the flyer's assistant then makes of a sign's words was not tested either.
- **One read is one sample.** Only the Muay Thai time was repeated. `gpt-6-luna` read the Canva page's two columns
  in two different orders in two calls (*One read through the Laragon copy*, below).

**The numbers, per model, over every direct read:**

| Model | Reads | Seconds | Tokens in, per read | Tokens out, per read | Cost per read |
|---|---|---|---|---|---|
| `gpt-6-luna` | 13 | 2.2 to 20.7 | 2,158 to 3,359 | 14 to 1,671 | about 0.05 cent |
| `claude-haiku-4-5` | 13 | 1.7 to 4.0 | 2,119 to 2,143 | 8 to 169 | about 0.25 cent |
| `gpt-6.1-sol` | 7 | 8.5 to 17.7 | 2,158 to 3,139 | 84 to 462 | about 0.9 cent |
| `claude-sonnet-5-5` | 7 | 4.3 to 11.5 | 2,644 to 3,682 | 225 to 1,170 | about 1.3 cents |

- **The cost is from the tokens and the providers' prices,** not from a bill: about 19 cents for the 40 reads.
- **`gpt-6-luna`'s seconds swing widely:** 20.7 s on the dense screenshot and 16.6 s on the weekly board, with
  1,671 and 998 tokens out for answers of a few lines. It thinks at length on a hard picture. On a host with a
  shorter limit than this machine's 25 s, those two reads are the ones at risk.
- **`claude-haiku-4-5` is sent about the same tokens whatever the picture:** it reads at a lower resolution than
  the other three, which fits its misreads of small and stylised text.

**What the reads cannot say:**

- **Whether 2048 px matters.** No picture here was larger, so the edge never shrank one: WhatsApp had already
  brought each down to about 2000 px. A photo taken with the phone's own camera will be the first one shrunk:
  stage 3's phone test.
- **A photographed poster at an angle, and a chat screenshot of a message.** None of the ten is one. The closest
  are the framed sign, photographed straight on behind cables, and the website screenshot.
- **IONOS's own time limit.** Every read ran on this machine or the Laragon copy.

**For Artur to choose, from this:**

1. **The photo's model.** The middle model of the site's provider. On OpenAI, which this machine and the Laragon
   copy run: `AI_MODELS=photo:gpt-6.1-sol`, the only model with no misread on any picture, at 8.5 to 17.7 s and
   about a cent a read. On Anthropic: `claude-sonnet-5-5`, one handwritten name misread, at 4.3 to 11.5 s.
2. **Whether the read should run on the middle model without being told to.** Today a site that names `photo` and
   no model reads pictures on the fast one, the one that wrote the wrong time.
3. **Whether 2048 px stays.** Nothing here speaks against it.
4. **The reader's prompt's words.** What the reads suggest:
   - say plainly that a brand printed on a board is left out (the fast models kept "DORADA Especial");
   - say that each activity of a board goes on one line with its day, its time and its place (the prompt's two
     rules about lines pulled the fast models two ways);
   - whether a picture that is no event should answer empty, which no model did for the sign.

**Artur's choices (2026-10-06), and what was built from them:**

| Question | Answer | What was built |
|---|---|---|
| Which model reads pictures? | **"gpt-6.1-sol, on OpenAI"** | It is the read's default on OpenAI, below |
| Should the read use the middle model by itself? | **"Yes, a default in the code"** | `a66309c`: `AI_FEATURE_DEFAULT_MODEL`, the read on `gpt-6.1-sol` (OpenAI) and `claude-sonnet-5-5` (Anthropic), on both backends |
| Does the 2048 px edge stay? | **"It stays"** | Nothing to build |
| The reader's words | **All three changes:** a brand on a board is left out; one line per activity; no event answers empty | `7597e75`: `ai/prompts/photo.md`, and the bundle both backends read |

- **A ruling of mine in the default:** the read's default wins over the site's own model (`AI_MODEL`, `'model'`),
  which is now the flyer's and the share text's. A host that pins the text model must not put the read back on a
  model that misreads a board. Only the read's own setting changes it. If wrong: one line in each loader and one
  row of `tests/fixtures/ai-settings.json`.
- **"No event answers empty" went in against my advice,** which Artur heard: a model could empty a real poster
  that gives no date. So the rule carries its own guard: "A poster that names one activity is an event even when it
  gives no day, time or place: copy it." The check reads below show the guard holding on the one such poster.
- **For stage 3's words:** an empty answer can now mean "no event", not only "no words". The brief's line for it
  is "The AI found no words in this picture. Write the event here yourself."

**The check reads: the chosen model with the new rules.** On Artur's go ("All eleven pictures"): 11 reads on
`gpt-6.1-sol`, about 8 cents.

| Picture | What came back | Seconds |
|---|---|---|
| Canva page | Every fact. "La Isleta Nest" for "La isleta Nest": the capital corrected again | 9.6 |
| 1 web-tunnel | Every fact, `[?]` for the hidden place. "Funktion-One Soundsystem" left out: the new rule about a maker's name reaches it | **21.9** |
| 2 photo-yoga | Empty | 4.6 |
| 3 poster-femme | Every word. **Not emptied,** though it gives no day, time or place | 4.9 |
| 4 poster-cacao | Every fact. "neccessary" corrected to "necessary" | 5.0 |
| 5 poster-week | Every fact, **each class on one line** | 6.7 |
| 6 sign-whatsapp | **Empty.** Before the rule it wrote the sign out | 5.1 |
| 7 chair | Empty | 4.8 |
| 8 board-empty | Empty | 6.2 |
| 9 board-week | Every fact, each activity on one line, "Ashavana" read right, the beer brand left out | 14.0 |
| 10 board-muaythai | "10:30", for the third time | 9.8 |

- **No fact was misread on any of the eleven.** What is left are copying slips: one capital, one corrected
  misspelling, and "Activities" for "ACTIVITIES".
- **The rule about a maker's name had a side effect:** a sound system's brand on a techno poster was dropped with
  the beer brand on the board. Asked, Artur said "Narrow it to boards": done, and checked with one more read
  (*Beside the checkpoint*, below).
- **The seconds are the risk:** 21.9 s on the dense screenshot, of the 25 s the app waits, and 17.7 s the first
  time. A read that runs out of time answers "The AI didn't answer properly", costs nothing against the reads, and
  is one of the day's tries. On a host with a shorter limit than this machine's, that picture would fail.

**What was prepared before the first read:**

- **`.env`** names `AI_PROVIDER`, `AI_API_KEY`, `AI_FEATURES`, `AI_DAILY_LIMITS` and the parked
  `ANTHROPIC_API_KEY`: read by name alone, no value printed. It sets no effort, no model and no time limit, so a
  read needs nothing overridden beyond the feature, the provider and the model.
- **The models, from the providers' pages on 2026-10-06:**

  | | Fast (the default) | Middle | Strongest |
  |---|---|---|---|
  | OpenAI | `gpt-6-luna`, $0.10 in and $0.50 out per million tokens | `gpt-6.1-sol`, $2 and $10 | `gpt-6-astra`, $10 and $50 |
  | Anthropic | `claude-haiku-4-5`, $1 and $5 | `claude-sonnet-5-5`, $2 and $10 | `claude-opus-5-5`, $4 and $20 |

- **The Anthropic adapter needs no change for the stronger Claude models.** It sends no field they refuse. They
  think before answering by default, and that time counts against the 25 s the app waits: the reads measure it.

### One read through the Laragon copy: PHP's side

Asked first, Artur said **"Yes, now, with the Canva page"**, and to leave the copy with **"The share text alone, as
before"**.

- **The release.** `npm run deploy:update` backed the copy up (`backups/nest-flyers-php-2026-10-06-12-48-33`: 10
  flyers, 6 photos, with its `config.php`), built from `a10e92f` and copied the release over it: **`8c7a635bd009`**,
  437 files, 3.94 MB, nothing deleted. It made the local tag `release/8c7a635bd009`. Nothing is pushed.
- **The setting.** A script named `photo` beside `share` in the copy's `ai` block. It printed the feature names and
  one "yes": PHP itself read the edited file, and everything else in it hashed the same as before. No line of
  `config.php` was printed.
- **`api/config` then listed the read with its own count:** `photo`, 3 of 3, beside the share text's.
- **The read:** `npm run ai:smoke -- --photo <the case's .json> --to https://nest-flyers-php.test/`.

| | |
|---|---|
| The model | `gpt-6-luna` on OpenAI: the copy's own provider, on its default model |
| The seconds | 7.4, with the upload and PHP's preparing. The same model took 5.7 s directly on Node, the provider alone |
| The tokens | 2,158 in and 372 out: the same tokens in as Node's read, since the picture has the same pixels |
| What the copy kept | `ai-pictures/2026-10-06/d7758a1be13c89c7.jpg`, 899 × 1599, 163,512 bytes: PHP's JPEG, where Node's is 150 KB |
| The count | 3 reads left before, 2 after |
| What was misread | No fact. The two columns were read row by row: "WHEN?" and "WHERE?" first, then "20:00", "La Isleta Nest" and "Rooftop". The capital again |

- **The same model read the same picture's layout two ways in two calls.** Directly, `gpt-6-luna` kept each label
  with its value. Through the copy it wrote the two labels and then the two values. Both give every fact, and the
  reader's rule ("the order they are read in") allows either. It is one for the table's judgment, not a fault of
  PHP: both backends send the same rules and the same pixels.
- **The copy is left as Artur said.** `photo` is out of its settings again: `api/config` lists the share text
  alone, and `POST api/ai/photo` there answers 404. The new release stays. The read's picture stays in the copy's
  data folder for its thirty days.

### Beside the checkpoint: the flyer's and the share text's rules

Not part of the photo's brief, which leaves the flyer's prompt alone. Artur asked for it on 2026-10-06, with his
answer about the reader's words: "not include the price if it's not specified", "No points ending in the main
title", and the share text "before in english and after spanish", "more for English speakers, so it's not always
just translation". He named his flyers #4, #5 and #8 on the live site as references.

**What those flyers showed.** He had corrected all three by hand that day. Read from the site with GET requests
alone, which change nothing there, they differ from the repo's examples in the same three ways:

| | The repo's examples, which the AI imitates | His flyers on the live site |
|---|---|---|
| The big title's second line | "at sunset.", "& stargazing." | "at sunset", "& stargazing", "at La Marquesina" |
| The Spanish line | ends with a full stop | no full stop |
| A text with no price | COST "Ask at reception", and a price line in the share text | #8: an empty COST chip, and no price line |
| The share text | Spanish, a `---` line, English | English, a `-- 🇪🇸 --` line, Spanish. #5 also has "🇪🇸 Español abajo 👇" near the top |

**His answers:**

| Question | Answer |
|---|---|
| A text with no price? | **"Drop it, and say so":** no COST chip, no price line, and a note in "The AI assumed". It supersedes his rule of 2026-10-04, "Ask at reception". "Free" still needs the word |
| How far does "no full stop" go? | **"Both title lines and the Spanish line".** The ask keeps its own punctuation. The This week template's built-in title, "this week.", is left as designed |
| The share text? | **"As your flyers", as the default.** English first, written for English-speaking guests; the line `-- 🇪🇸 --`; then Spanish. On a long caption, "🇪🇸 Español abajo 👇" after the hook |
| "One mixed caption"? | **Saved for later:** "I will build a switcher for enable it and try to generate it as another option for share text." Nothing of it is built |

**What was built:**

- **The rules,** in `ai/prompts/flyer.md` and `ai/prompts/share.md`, and the bundle both backends read.
- **The examples,** which the AI imitates more than it obeys. The sunset class and the Teide tour take their share
  texts from his live flyers as they are, with the line between the languages spelled one way. All three briefs,
  the picture case's too, lose the full stops; the picture case loses its stand-in price.
- **One fact for the line:** `SHARE_SPANISH_BREAK` in `src/shared/share.ts`. The editor's placeholder for a caption
  shows the new order with it.
- **A test holds every example to the three rules** (`tests/briefRules.ts`), the few-shot's and the picture
  cases'. Red first: four tests, on the old prompts and the old examples.

**Not taken from his live flyers** at this point (the range became a rule the same day: *Two more answers of
his*, below), because he did not ask for them as rules: the WHEN chip with a time range
("17:45-23:00"; the prompt keeps one time, since a range breaks over two lines in the chip), and the asks' own
words ("Book/Contact us: …", "Reserva y vien con nosotros!"). His to say.

**Said plainly:**

- **Checked with five real generations,** on Artur's go ("On OpenAI, plus two boards end to end"), on
  `gpt-6-luna`, under half a cent in all:

  | From | What came back | Seconds |
  |---|---|---|
  | The Canva page's words, a flyer | "Bachata" / "workshop", no full stop; no COST chip; "cost: No price in the text: none printed" | 7.4 |
  | The same, a share text | English first, the line, Spanish; no price line | 6.4 |
  | The sunset class's text, a flyer | "Stretch and unwind" / "at sunset"; no COST chip, noted | 7.6 |
  | The Muay Thai board's words, a flyer | An Activity flyer, "Today · 10:30" (the board's Tuesday 6 was that day); no place and no price, both noted | 12.0 |
  | The weekly board's words, a flyer | **A This week flyer:** four rows, each with its hostel, "Ashavana Nest" among them; no prices, noted | 15.9 |

  - Every share text came back in two blocks, English first, with no price line.
  - **The rule beat the example:** the first example still prints "Free" for a text that names no price, because
    Artur answered "Free" for that flyer when asked. The sunset class's own text came back with no COST chip.
  - **A board of several activities made a This week flyer.** The brief leaves that path "not designed, not tested
    and not promised". It is now seen once to work, and no more than that.
- **Two more answers of his, the same day** (`fd03fdd`): the reader's rule about a maker's name is **narrowed to
  boards**, and one more read of the techno poster on `gpt-6.1-sol` gave "Funktion-One Soundsystem" back, in
  12.7 s; and **a time range in WHEN is a rule**, written as on his Teide flyer, "17:45-23:00", with a hyphen and
  no spaces. The asks' own words on his live flyers stay his.
- **The editor's placeholder changed** and no test reads it, so it was looked at in the installed Chrome, on the
  built app with a throwaway data folder, at 1440 × 900 and 390 × 844. It reads as meant:

  ![](ai-flyer-from-photo/editor-caption-placeholder.png)

  On a Windows PC the flag in the line shows as the letters "ES": Windows has no flag emoji. On a phone, and where
  the caption is pasted, it is the flag.
- **Committed in `50fe11a`.** The gates ran green on that tree: `npm run gen` up to date, 0 type errors, 596 unit
  tests, 378 contract tests (7 files and 235 tests skipped by project), 893 PHP tests (38 skipped), 135 in the
  browser (1 skipped, the opt-in baseline), 2 on the PHP smoke, and the baseline byte-identical over 32 cases
  against the capture of `747e4c8`.

### The gates

One sequence on 2026-10-06, on the tree of `43aa907`: the checkpoint's last commit before this report.

| Gate | Result | On `5ed6af0` (stage 2) |
|---|---|---|
| `npm run gen` | every generated file up to date | the same |
| `npm run typecheck` | 0 errors | 0 |
| `npm test` | 31 files, 583 tests passed | 577 tests |
| `npm run test:contract` | 38 files, 378 tests passed (7 files and 235 tests skipped by project) | the same |
| `npm run test:php` | 884 tests, 10,235 assertions, 38 skipped (PHP 8.3.4) | 878 tests, 10,161 assertions, 38 skipped |
| `npm run test:render` | 135 passed, 1 skipped (the opt-in baseline) | 135 passed |
| `npm run test:php-smoke` | 2 passed | 2 passed |
| `baseline.spec.ts` | 32 cases byte-identical against a capture of `747e4c8`, taken before any code changed | 32 |

- **No test touches a provider.** The six new tests on each backend are the policy's and the table's five days.
- The 38 skipped PHP tests are the same 38.
- **No fresh-context review was run for the checkpoint.** By Artur's instruction there is one, at the end of
  stage 3: its range starts at `747e4c8`, so it covers these commits too.

### What is left of the checkpoint

- **Nothing of the checkpoint itself:** Artur chose from the table, and what he chose is built and checked with
  real reads (above).
- **Not tested, and his to ask for:** what the flyer's assistant makes of a misread hostel name; a smaller edge
  than 2048 px; a poster photographed at an angle; a chat screenshot of a message.
- **Stage 3, the page,** is for a new session, by his word: its prompt is
  `docs/prompts/ai-flyer-from-photo-stage-3.md`.
- **Every real call of the checkpoint:** 52 picture reads and 5 generations, about 28 cents, from the tokens and
  the providers' prices.
- **Nothing is pushed.** `.env` was not changed, and the live site was not called. One release was built, for the
  Laragon copy alone.

# Stage 3: the page

Branch `feat/ai-feature-switches`, on top of `ceea60f`, on 2026-10-06, in a session started from
`docs/prompts/ai-flyer-from-photo-stage-3.md`. The branch was Artur's earlier answer ("Stay on this branch"). Asked
how to commit, he chose "Each piece as it goes green". Nothing is pushed, and `main` stays at `684189e`.

**The checkpoint has all it asked for:** the screenshots on both backends, and what a real phone did (*The
phone*, below). Everything is built and green, was looked at in a browser on both backends, and was reviewed. No
provider was called in this stage, by a test, a script, the look or the phone.

## What it is

"Create with AI" has a second way in. Where a site runs the picture read, the page shows a switch, **From your
idea / From a photo**. A staff member chooses a picture, or takes one with a phone, and presses **Read the
picture**. The words land in "Your idea". They check them, add what is missing, and press Generate: from there the
page is the one it was. A flyer from a picture costs one read and one flyer, each from its own count.

The stage itself changed the client alone: no route, schema or PHP class. A site that does not name `photo` looks
and behaves exactly as before. (The review at its end also covered the checkpoint's commits, and what it found
there touched one phrase of the flyer's prompt and one line of PHP: *The review*, below.)

## Artur's answers (2026-10-06, this session)

| Question | Answer | What follows |
|---|---|---|
| What does the page say when a read comes back empty? It can now mean "no event" as well as "no words" | **"The AI found no event in this picture. Write the event here yourself."** | Built. It replaces the brief's line |
| Should the page add a line after the server's sentence when a read fails? | **"Add a line"**: "Your picture is still here: try again, or type the event yourself." | Built |
| "Can't we mitigate somehow for this with an AJAX call or something that will wait the AI to answer and update the UI when it does?" | After the explanation below: **"Nothing more now"** | No polling, no second try, no new setting |
| How to commit? | **"Each piece as it goes green"** | Twelve commits, staged by path |
| The real phone? | **"This PC, office Wi-Fi, fake AI"** | Done the same evening, over this PC's own hotspot: *The phone*, below |

**A read that runs out of time, and why polling would not help.** The page already waits for the server for as long
as it takes, and fills the box when the answer comes: the browser never gives up. What ends a slow read is the
app's own 25 seconds on the provider call (`AI_TIMEOUT_MS`, `'timeoutMs'`).

- That limit is there for the shared host, which ends a PHP request that runs too long. IONOS's own limit is not
  known until the first live call.
- Shared-hosting PHP has no process that outlives a request. A read started in one request and polled from
  another would still run inside a request, under the same limit. It would work on Node alone, for a second
  contract on both backends.
- What helps is more time where the host allows it, and that setting exists. It is one number for every feature.
- No real read has run out of time so far. The slowest took 21.9 s.

## What was built

- **The switch.** `App.tsx` asks `aiFor(ai, 'photo')`, as it asks for the other two features, and hands the page
  the read's own count. With it the page shows the switch; without it, nothing. The bar keeps the flyer's count.
- **From a photo.**
  - **Choose a picture** everywhere. With a mouse, a picture can also be dropped on the box, or a screenshot
    pasted.
  - **Take a photo** where the main pointer is a finger: a file input with `capture="environment"`, which opens
    the device's own camera. A laptop's browser ignores `capture`, so it has no such button.
  - The chosen picture shows small with its name and a Remove. Choosing sends nothing.
  - **✨ Read the picture (3 left today)**: the read's own count, and under it the used-up sentence when none is
    left.
- **The read.** The browser shrinks the picture first (`preparePhoto()`, as for a flyer's photo), to the read's
  2048 px and under the site's upload limit, and sends it to `POST api/ai/photo`. While it works the button says
  "Reading…", the stage says "✨ The AI is reading your picture… it can take half a minute.", and the other buttons
  and the switch wait.
- **After the read** the page is on From your idea, and the focus is on the line under the box.
  - With words: they are in the box, and under it: "Read from your picture. Check every word, and add what is
    missing (the price?). [?] marks a word the AI could not read. If it lists several activities, keep the one this
    flyer is for."
  - With none: Artur's line, and the box as it was.
  - If the box held text, the page asks before the read is sent: "Replace your idea with the words the AI reads
    from this picture? It uses one of the 3 picture reads left today."
- **What goes wrong.**
  - The day's reads used up: the server's sentence, and the read's count at 0. The flyer's count is untouched.
  - The picture refused, a HEIC among them: the photo route's own message, alone.
  - Anything else: the server's sentence and Artur's added line, while a read is left to try again with. The
    picture stays chosen.
- **The count after a failed read.** A failed read answers no count and is one of the day's tries, so the number
  on the button could be too high. The page asks `GET api/config` again and moves the read's count alone. If that
  request fails, the count stays, and the server still refuses at the right moment.
- **No flyer left today:** Read the picture waits, and the flyers' own used-up sentence stands under it. A read
  would be spent on words nothing can be made from.
- **Leaving** asks first while words read are in the box, and while a read is on its way, until "Open in editor".
  A picture chosen and not read, and a read that found no event, ask nothing.
- **The docs:** `README.md`, `.env.example`, `config.sample.php`, `docs/deploy.md` (where staff find it, name
  `photo` with `flyer`, two troubleshooting rows, a row in *Rolling back*), `docs/ai-flyers/README.md`, and one
  line in `docs/api-contract.md`: a failed read's answer carries no count.

**Where it lives:** `src/editor/AiPhoto.tsx` is the photo way's form and makes no request. `AiPage.tsx` holds the
picture, has it read and takes the words. `photoPrep.ts` gained `pictureLimits()`; `preparePhoto()` itself is
reused unchanged. `api.ts` gained `aiPhoto()`, which shares its form with `uploadPhoto()`.

## How each piece was proved

| Piece | Commit | Seen red | Then green |
|---|---|---|---|
| The switch and the read's count | `6801c52` | 3 browser specs waited for a switch that was not there | 23 in the AI project |
| Choosing, dropping, pasting | `45d3cbf` | 1 spec: no input to choose with | 25 |
| Take a photo | `79cdd28` | 1 spec: no such button in a touch context | 27 |
| The read into the box | `c2bc8df` | 9 browser specs (Read did nothing) and 2 unit tests (`pictureLimits is not a function`) | 36, and 598 unit |
| The leave guard | `aec6101` | 1 spec: with words read, "← Library" left without a question | 37 |
| The phone layout | `03a1074` | not red first: a pin (below) | 38 |
| The docs | `61cd7ec` | (documents) | |
| What the review found in the page | `b629410` | 8 browser specs, each for its finding | 44 |
| What it found in the checkpoint's commits | `27adc76` | 2 unit tests: the prompt's phrase, and the range no example was held to | 599 unit |
| The focus ring on the line under the box | `9e5621a` | (one CSS rule, seen in the second look) | |

**Six specs passed at once, because the code was already right or because they say what must not happen.** Each
was then seen red with the code broken on purpose, and the code restored. So was a seventh (the fifth row), whose
first red had been at an earlier line than the one it is named for:

| Pin | Broken on purpose | What failed |
|---|---|---|
| A site without the read has no switch | the switch shown to every site | "expected 0, received 1" |
| A paste on From your idea chooses nothing | a paste listened for page-wide | "expected 0, received 1" |
| With a mouse there is no Take a photo | the button shown to every pointer | "expected hidden, received visible" |
| The photo way fits a phone | the small picture given no bounds | the picture 44 % in view |
| A failed read asks the server what is left | the recount taken out | no `GET api/config`; the button still said 2 |
| The recount moves the read's count alone | the whole answer taken over | Generate read 1 where 3 was expected |
| A picture over the read's edge is shrunk in the browser | the photo's own limits used | it went out 3000 px wide, not 2048 |

**Two of those breaks found a weak test, and the tests were mended:**
- The paste pin first passed for the wrong reason: it pasted before the page had rendered. It now waits for the
  page, and then fails with the break.
- The phone pin did not fail with the small picture's width alone unbounded. Its sideways check now measures the
  form as well as the page, and it fails with both bounds gone.

**Not seen red, said plainly:**
- A stray drop being refused: the page's guard is older than the stage, and `editor.spec.ts` holds it. The spec
  here reads the refusal off the event.
- PHP's null array offset: PHP 8.3 says nothing about it. It is deprecated from 8.5 on.
- The routed specs that passed with the read's first build were all red before it, at an earlier line than their
  last assertion.

**What the browser suite spends on the fake's day:** all three flyers (one more than before), two reads of three,
and one of the nine tries. Everything else is routed. The file's header says so. The spec that spends the last
flyer runs last, since with none left the photo way reads nothing.

## Rulings

Each was mine, with its cost if wrong.

- **The question before replacing is asked before the read is spent,** as "Write with AI" asks. A no sends
  nothing. If wrong: one line moves.
- **An empty read never empties a box that held text.** Nothing is worth less than what was typed.
- **The chosen picture is the page's state.** It survives the switch, a failed read and a good one, so stage 4 has
  the original file at hand.
- **A paste is listened for on From a photo alone,** and any file may be chosen: the server judges formats, as in
  the editor.
- **Take a photo shows by CSS, where the main pointer is a finger** (`pointer: coarse`). A touch laptop, and a
  tablet with a mouse attached, get Choose a picture alone. If wrong: one media query.
- **Both inputs name the same three formats** (`ACCEPTED_PHOTO_TYPES`), the camera's too. The phone will say
  whether its camera wants `image/*`.
- **"Refused" is a picture nothing was sent of, or a 4xx.** Then the message stands alone. Anything else gets the
  added line and the recount, a dropped connection included: the read may have reached the provider.
- **With no flyer left today, Read the picture waits** (from the review, which left it to the owner). Every way in
  ends in a flyer. The other choice lets staff read today and make the flyer tomorrow, but the words do not
  outlive the page. If wrong: one condition.
- **A read on its way is unsaved work** (from the review; my first ruling was the opposite). A generation on its
  way still is not: changing that would change the page for a site without the read.
- **After a read the focus goes to the line under the box,** not to the box: on a phone the box would raise the
  keyboard over the words to check.
- **A new picture is a new start:** what the last one was told is cleared. So is a note once the action it spoke
  of has finished.
- **The line under the box stays until the next read.**
- **The waiting line is the stage's,** as Generate's is. On a phone it is on screen under the form.
- **The specs are at the end of `tests/render/ai.spec.ts`,** in one `describe`: one file, one account of the day.

**Words that are mine, for Artur to change:**
- the photo way's hint: "A poster, a board, a Canva page or a chat screenshot. The AI reads its words into “Your
  idea”; you check them, then Generate.";
- "Reading…", and "it can take half a minute" after the brief's waiting line;
- "Or drop a picture here, or paste a screenshot.";
- the question before replacing, and its last-one form: "It uses the last of today’s picture reads.";
- "Still working on the last action — try the picture again in a moment.";
- "Remove", beside the chosen picture.

## The look in a real browser

**Not in Artur's own Chrome profile:** a script drove the installed Chrome 143 through Playwright, with its own
profile, at 1440 × 900 with a mouse and at 390 × 844 with a finger. Every screen was read in a screenshot.

- **Node** was the built app on a throwaway data folder, with `AI_FEATURES=flyer,share,photo` in the command's own
  environment. **PHP** was a `php -S` stage with the built client. Both ran the fake provider: nothing was spent.
- `.env`, the Laragon copy and the live site were not touched.
- The pictures were real: the Canva page of the first case, and two of Artur's from `backups/photo-reads/`. The
  fake reads every picture as its first example's text, and fails or empties a picture by its width.
- It ran twice: once on `61cd7ec`, before the review, and again on the states the review's fixes changed.

| What was looked for | Node | PHP |
|---|---|---|
| The switch, and the read's own count | "From your idea" on; "✨ Read the picture (3 left today)" greyed until a picture is chosen | the same |
| Choose, drop, paste | each shows the picture small with its name; the box turns green under a drag | the same |
| Take a photo | on the phone, beside Choose a picture; its input asks for `capture="environment"`. None with a mouse | the same |
| While it reads | "Reading…", the other buttons and the switch greyed, the waiting line in the stage | the same |
| After the read | on From your idea, the words in the box, the line to check them by, the focus on that line | the same |
| The whole path | the flyer of those words, then "Open in editor" with "Stretching class" in Line 1, no question asked | the same |
| Each count its own | a read left Generate at 2; a flyer left the reads alone | the same |
| A failed read | the server's sentence and the added line; the picture still chosen; the count still 2 | the same |
| The day's last try failed | the server's sentence alone, over "0 left today" and the used-up sentence | the same |
| No event | "The AI found no event in this picture. Write the event here yourself." under an empty box | the same |
| Used up | "✨ Read the picture (0 left today)", greyed, over "Today’s 3 picture reads are used up. They come back at midnight, Canary Islands time." | the same |
| No flyer left | Read the picture greyed with reads left, over "Today’s 3 AI flyers are used up. …" | the same |
| `api/config` after the first look | flyer 1 of 3, share 3 of 3, photo 0 of 3 | the same |
| What the site kept | four pictures in `ai-pictures/`: two of the Canva page (899 × 1599), the failed one, the empty one. Nothing in `uploads/` | the same four |
| A site with `flyer` and `share` alone | no switch, at both sizes; `POST api/ai/photo` answers 404 | the same |
| On the phone | no sideways scroll; Read in view with a picture chosen | the same |

**Twenty of the first look's twenty-three pairs of screenshots are the same file, byte for byte, on both
backends.** The page is one client. The three that differ are the library (each store has its own flyers) and two
phone shots, by a few bytes.

**One thing the second look found:** with a keyboard, the browser drew its own black ring tight on the line under
the box, cutting into its first letters. It is the app's teal ring now (`9e5621a`).

| | Node | PHP |
|---|---|---|
| From a photo, nothing chosen | ![](ai-flyer-from-photo/stage3-node-desktop-photo-empty.png) | ![](ai-flyer-from-photo/stage3-php-desktop-photo-empty.png) |
| A picture chosen | ![](ai-flyer-from-photo/stage3-node-desktop-photo-chosen.png) | ![](ai-flyer-from-photo/stage3-php-desktop-photo-chosen.png) |
| A picture over the box | ![](ai-flyer-from-photo/stage3-node-desktop-photo-dragover.png) | ![](ai-flyer-from-photo/stage3-php-desktop-photo-dragover.png) |
| While it reads | ![](ai-flyer-from-photo/stage3-node-desktop-reading.png) | ![](ai-flyer-from-photo/stage3-php-desktop-reading.png) |
| The words, to check | ![](ai-flyer-from-photo/stage3-node-desktop-words.png) | ![](ai-flyer-from-photo/stage3-php-desktop-words.png) |
| The flyer of those words | ![](ai-flyer-from-photo/stage3-node-desktop-flyer.png) | ![](ai-flyer-from-photo/stage3-php-desktop-flyer.png) |
| A failed read | ![](ai-flyer-from-photo/stage3-node-desktop-failed-read.png) | ![](ai-flyer-from-photo/stage3-php-desktop-failed-read.png) |
| The day's last try failed | ![](ai-flyer-from-photo/stage3-node-desktop-last-try-failed.png) | ![](ai-flyer-from-photo/stage3-php-desktop-last-try-failed.png) |
| No event | ![](ai-flyer-from-photo/stage3-node-desktop-no-event.png) | ![](ai-flyer-from-photo/stage3-php-desktop-no-event.png) |
| The day's reads used up | ![](ai-flyer-from-photo/stage3-node-desktop-used-up.png) | ![](ai-flyer-from-photo/stage3-php-desktop-used-up.png) |
| No flyer left today | ![](ai-flyer-from-photo/stage3-node-desktop-no-flyer-left.png) | ![](ai-flyer-from-photo/stage3-php-desktop-no-flyer-left.png) |
| A site without the read | ![](ai-flyer-from-photo/stage3-node-no-photo-desktop-ai.png) | ![](ai-flyer-from-photo/stage3-php-no-photo-desktop-ai.png) |
| On a phone: Take a photo | ![](ai-flyer-from-photo/stage3-node-phone-photo.png) | ![](ai-flyer-from-photo/stage3-php-phone-photo.png) |
| On a phone: a picture chosen | ![](ai-flyer-from-photo/stage3-node-phone-photo-chosen.png) | ![](ai-flyer-from-photo/stage3-php-phone-photo-chosen.png) |
| On a phone: while it reads | ![](ai-flyer-from-photo/stage3-node-phone-reading.png) | ![](ai-flyer-from-photo/stage3-php-phone-reading.png) |
| On a phone: the words | ![](ai-flyer-from-photo/stage3-node-phone-words.png) | ![](ai-flyer-from-photo/stage3-php-phone-words.png) |
| On a phone: the flyer | ![](ai-flyer-from-photo/stage3-node-phone-flyer.png) | ![](ai-flyer-from-photo/stage3-php-phone-flyer.png) |
| On a phone: a site without the read | ![](ai-flyer-from-photo/stage3-node-no-photo-phone-ai.png) | ![](ai-flyer-from-photo/stage3-php-no-photo-phone-ai.png) |

The line under the box with the keyboard's focus on it, after the fix:

![](ai-flyer-from-photo/stage3-node-desktop-words-keyboard.png)

**What the look cannot say,** and the phone is for:
- whether Take a photo opens a real phone's camera, and whether the picture comes back upright;
- what the browser's shrink to 2048 px does to a real camera photo: no picture so far was larger;
- what an iPhone hands over. A HEIC is held by a spec, with a made-up file.

After each look the servers were stopped by their ports, no `php` was left running, and the PHP stages' folders
were removed.

## The phone

Artur's Galaxy S23, Chrome on Android, on the evening of 2026-10-06, against the built app on this PC with the fake
provider and a throwaway data folder. Nothing was spent.

- **Take a photo opened the camera, and Choose a picture the gallery.** Each picture showed small on the page, the
  right way up.
- **Both reads worked:** the words landed in "Your idea". Each upload arrived in a fifth of a second, and the answer
  came in about a second.
- **The browser's shrink ran on a real camera photo for the first time.** Both pictures reached the server at
  1153 × 2048: the long edge is the read's, exactly. No picture of the real reads had been larger than 2048 px.
- **The pictures came back upright,** with no orientation tag left: both were read by eye as the server kept them.
- **Handwriting stays legible at that size.** One is a chalk board photographed at an angle, a second board beside
  it: "Karaoke Night 06/10 (today), free event, Medano Nest hostel". The other is the Muay Thai board of the real
  reads: "Tuesday 6 at 10:30".

| | Take a photo | Choose a picture |
|---|---|---|
| What it was | the karaoke board, taken on the spot | the Muay Thai board, from the gallery |
| The upload, as the browser sent it | 606,897 bytes, complete in 168 ms | 658,147 bytes, complete in 205 ms |
| The answer | 200 after 988 ms | 200 after 1,074 ms |
| What the server kept | 1153 × 2048, a JPEG of 520,841 bytes | 1153 × 2048, a JPEG of 562,680 bytes |

**What went wrong on the way, none of it the app's:**

- **The hostel's Wi-Fi keeps its devices apart.** On it the phone could not reach this PC at all ("address
  unreachable"). It is also no closed office network, so the app was stopped there at once: it has no lock.
- **On this PC's own hotspot** the page loaded, then the phone switched Wi-Fi by itself and the first reads died on
  the way. The server had logged nothing, kept nothing and counted nothing.
- **The page said what it should:** "Failed to fetch. Your picture is still here: try again, or type the event
  yourself." That is the failed-read line with the full stop the review asked for, seen on a real phone, and the
  picture was still chosen.
- A small relay in front of the app showed that no request of the phone's was arriving. With the phone back on the
  hotspot, both reads went through.

**Not tried on the phone, said plainly:**
- Generate and "Open in editor": no flyer was asked for, and the server's count stayed at 5 of 5.
- A photo taken sideways: both were upright.
- An iPhone, and so a HEIC. A spec holds the hint, with a made-up file.
- A real provider: the words that came back were the fake's.
- Whether the camera opened straight away or after a menu was not said.

**Kept, outside git:** `backups/phone-test-2026-10-06/` has the two pictures as the server kept them, and the
relay's log. The camera's picture exists nowhere else. The throwaway data folder is deleted, and both servers were
stopped.

## The review

One fresh-context review of `747e4c8..61cd7ec`, by another agent that was given the code and the brief and not my
conclusions. Its range starts at the checkpoint, whose commits had no review of their own. It read the diff and
both services side by side, and ran three read-only probes: the generator against the committed files, the Node
service on the fake with a ledger in memory, and the built page in a headless browser with every request answered
in the test. It ran no suite and wrote nothing.

**It found no way for a switched-off feature to run, spend, be recorded or be shown, and no leak of the key or of
a picture.** It also found sound: the tries on both backends, line for line, with the table's five days recomputed
by hand; the default model per feature on both loaders; the counts in the client; that the `busy` flag always
clears; that a site without `photo` has the same page as before; and the project's own rules (no value imported
from `schema.ts`, nothing importing `samples.ts`, no second renderer).

What it found in the page, and what was done (`b629410`), each test first:

| What it found | What was done |
|---|---|
| A second read that found no event took the leave guard off the first read's words, still in the box | The guard follows the words, not the last read's line |
| A read on its way was not unsaved work: "← Library" left a 5 to 22 second wait without a question | It asks, as the editor does for a photo on its way |
| "Request failed (504) Your picture is still here…", and the same after a dropped connection | A message with no full stop of its own gets one before the line |
| The line said "try again" over a button that read "0 left today" | The line shows only while a read is left; the used-up sentence says the rest |
| "Still working on the last action…" stayed over the words once the read had landed | A finished action clears it |
| The focus was dropped after a read, and the line was not reliably announced | The focus goes to the line, and the box is described by it |
| A read could be spent with no flyer left to make from its words | Read the picture waits, under the flyers' sentence (a ruling, above) |
| Three specs claimed more than they checked: the recount "moves only the read's", a stray drop "is refused", the browser "shrinks" | Each now checks it; the recount's and the shrink's were seen red with the code broken |

What it found in the checkpoint's commits, and what was done (`27adc76`):

| What it found | What was done |
|---|---|
| The flyer's prompt still sent "the end time" to the share text, as something the flyer had no room for | The phrase is out. **Not checked with a real generation** |
| The range in WHEN was a rule no example was held to | `tests/briefRules.ts` holds every example to it |
| PHP looked a feature's default model up under a null provider: deprecated from PHP 8.5 on | Guarded |
| Two rows of the settings table named "every feature takes it" for the site's own model | Renamed |
| The Teide example's notes said both that WHEN prints the start alone and that it prints the range | One story |
| `docs/deploy.md` gave the read two speeds, and its 503 row listed the features without `photo` | Corrected |
| This report said the range is not a rule in one place and a rule in another | A pointer where it was first said |

**The finding that is not fixed, and is Artur's: the tries do not bound reads sent at the same moment.**

- Each read is counted when it is answered. Reads that arrive together all see the same count and all pass.
- The review's probe on Node: a limit of 1, so 3 tries, and 20 reads sent at once. 20 provider calls, and 20
  pictures kept. PHP releases its lock before the provider is asked, so parallel workers do the same.
- It is the known limit of every daily count ("two concurrent requests can both see `remaining: 1`"). It matters
  most here: the tries were built as the bound for a site with no lock.
- The docs said the bound held. `docs/deploy.md` and `docs/json-storage.md` now say what it does not hold against.
- Holding it means recording a try before the provider is asked, on both backends and in each ledger driver. That
  is a design of its own, and nothing was built.

**Left as it is, with the reason:**
- **The first example still answers `cost: "Free"`** for a text that says "te invitamos", against the rule that an
  invitation is not a price. Artur answered "Free" for that flyer himself, and the real check saw the rule win over
  the example once. `CLAUDE.md` said the examples "carry" the rules; it now names the exception. The price check in
  `tests/briefRules.ts` refuses a stand-in ("Ask at reception"), not a `Free` nobody wrote.
- **`ai/prompts/flyer.md` still shows `when: "Every day · 17:45"`** where it explains an event that runs every
  day. It shows a start alone, which is right for an event with no end.
- **"🇪🇸 Español abajo 👇" on a long caption is held by no test:** the prompt does not say how long is long.
- **A generation on its way is still not guarded on leaving.** It is older than the stage (a ruling, above).
- **The tries over HTTP, and "From a photo" on PHP in an automated browser:** not proved, as before. The tries are
  held in process on both backends; the page on PHP was looked at.
- **A request the host cuts off mid-call** keeps its picture and records no try. It needs a host limit under the
  app's 25 s, which is unmeasured.

## The gates

One sequence on 2026-10-06, on the tree of `9e5621a`: the stage's last code commit.

| Gate | Result | On `43aa907` (the checkpoint) |
|---|---|---|
| `npm run gen` | every generated file up to date | the same |
| `npm run typecheck` | 0 errors | 0 |
| `npm test` | 32 files, 599 tests passed | 31 files, 583 tests |
| `npm run test:contract` | 38 files, 378 tests passed (7 files and 235 tests skipped by project) | the same |
| `npm run test:php` | 893 tests, 10,254 assertions, 38 skipped (PHP 8.3.4) | 884 tests, 10,235 assertions, 38 skipped |
| `npm run test:render` | 160 passed, 1 skipped (the opt-in baseline) | 135 passed |
| `npm run test:php-smoke` | 2 passed | 2 passed |
| `baseline.spec.ts` | 32 cases byte-identical against a capture of `ceea60f`, taken before any code changed | 32 |

- **No test touches a provider, and no provider was called in this stage.**
- The unit, contract, PHP and smoke gates ran on `27adc76`. `9e5621a` after it is one CSS rule, and the browser
  suite and the baseline ran again on it.
- The same gates were green on `61cd7ec`, before the review: 598 unit tests and 154 in the browser. The difference
  is the tests the review added.
- The 38 skipped PHP tests are the same 38. The one skipped browser spec is the opt-in baseline.
- Between the checkpoint's gates and these, `50fe11a` and `fd03fdd` added tests of their own (596 unit and 893 PHP
  on `50fe11a`).

## What is left

- **Nothing of the checkpoint itself.** The phone was tried (*The phone*, above). What it did not try is listed
  there: Generate on the phone, a sideways photo, an iPhone.
- **Nothing is pushed.** `main` is at `684189e`. `.env` was not changed, no release was built, and neither the
  Laragon copy nor the live site was touched.
- **A release of this stage** needs nothing new on a host that already names `photo`: the page comes with the
  files. A host names `photo` with `flyer`. Going back to a release with the read and without its page takes
  nothing out of `config.php`.
- **Stage 4** is not started: the picture as the flyer's photo.

**For Artur to decide:**

1. **Reads sent at the same moment pass the tries together** (*The review*, above). Leave it as the known limit
   until the login, or build the reservation: a try recorded before the provider is asked, on both backends.
2. **The words that are mine** (the list under *Rulings*).
3. **With no flyer left today, Read the picture waits.** Say if staff should be able to read anyway.
4. **Leaving asks in the flyer's words** ("This flyer has unsaved changes. Leave without saving?") for words read
   and for a read on its way, where there is no flyer yet. A sentence of their own is yours to write.
5. **A generation on its way is not guarded on leaving.** The read now is. Guarding both would change today's page
   for every site.
6. **The first example's "Free"** (above): keep your answer for that flyer, or let the example follow the rule.
   It is also what the fake provider answers, so the tests that quote its flyer follow it.
7. **The time limit.** Once your smoke call has measured IONOS, `timeoutMs` can go up to just under the host's own
   limit, for every feature.
8. **The phone's two pictures as cases for the reads' eval set** (`backups/phone-test-2026-10-06/`): a board
   photographed at an angle is what the real reads lacked. They go into git only after you have looked at them.
9. **Older, unchanged:** the three items of stage 1 (the sentence at a limit of 1, a feature with nothing for its
   number, "Try again (none left today)").

**For the session that builds stage 4,** what this stage leaves ready:

- The chosen picture is `AiPage`'s state (`picture`, a `File`) and survives the read, so the tick box has the
  original at hand. It is not the copy that was sent: that one was shrunk to the read's edge.
- `wordsRead` says the box holds words a read was spent on; the brief's "when the idea came from a picture" can
  read it. It goes false when the box is emptied.
- `handoff.ts`'s draft has no photo ("minus the photo an AI flyer never has"), and `Editor.tsx` sets
  `photo: null` on taking it.
- The upload wants the photo's own limits: `preparePhoto(picture, limits)`, not `pictureLimits(limits)`.
- The browser suite spends all three of the fake's flyers. A new spec that makes a real flyer needs a routed
  answer, or a higher limit pinned in `playwright.config.ts`.
- A spec that sends the server a real read must run before the one that spends the last flyer, which is last in
  its `describe`.
- After a look, check for `php -S` processes left on the look's ports.
- A phone reaches this PC over the PC's own hotspot (`192.168.137.1`), never over a hostel's Wi-Fi, which keeps
  its devices apart and is no closed network. The phone must be kept from switching Wi-Fi by itself meanwhile.
