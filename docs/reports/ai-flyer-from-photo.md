# A flyer from a photo

The brief is `docs/prompts/ai-flyer-from-photo.md`: four stages, one session each. This report has one section per
stage that is built. **A stage with no section here is not built.**

| Stage | State |
|---|---|
| 1. A limit per feature | Built, 2026-10-06 (below) |
| 2. The read, on both backends | Built, 2026-10-06 (below, after stage 1). Its checkpoint: Artur's answers are built, the first case is in git, and the real reads are done (*The checkpoint*, at the end). Open: his choice of the photo's model, the 2048 px edge and the reader's words |
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

**The disk.** At the default limit a day's folder holds at most 9 pictures for one actor. `docs/deploy.md` keeps
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

- **Artur's choices, from the table:** the photo's model, whether the read runs on the middle model without being
  told to, whether 2048 px stays, and the reader's prompt's words. What he says yes to is built then, test first.
- **Not tested, and his to ask for:** what the flyer's assistant makes of a sign's words or of a misread hostel
  name; a smaller edge than 2048 px; a poster photographed at an angle; a chat screenshot of a message.
- **Nothing is pushed.** `.env` was not changed, and the live site was not called. One release was built, for the
  Laragon copy alone.
