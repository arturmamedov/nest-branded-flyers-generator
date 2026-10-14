# Status

What is open on top, in short lines; then a log, one line per session; then the history, CLAUDE.md's Status until
2026-10-14 as it was written. A session adds its line to the log and changes the lines on top it settles.

## Now

- `main` is ahead of origin (`8e14547`) by the library's search (`cbbb511..9f7b7ea`) and the faster sessions; nothing
  of it is pushed. Origin has everything before, looks stages 5 to 7 included: the history's "`main` is still at
  `a96d1bf`" is from before that push.
- Next: the real second look, from Claude Design's handoff (`docs/prompts/second-look.md`). After it is signed, the
  faster tests (`docs/prompts/speed-tests.md`).

## Live

- IONOS (`https://nestpass.ai/activities/`) runs release `81639a1deb21`, built on 2026-10-09 from `74b6761` (the
  editor's UX round, Parts 1 and 2), tagged on 2026-10-13. `main` is 80 commits past it.
- It answers without a password (`allowPublic`) while the public tools page links to it. It goes public only once a
  real login exists (the history's "Not live, by the owner's decision").
- The Laragon copy (`nest-flyers-php`) runs `58e8863b20da`, built from `c249e02` (looks stages 3 and 4), tagged on
  2026-10-14.

## Left for Artur

- The release, uploaded whole (`npm run build:php`, then `npm run deploy:tag -- <the site>`). It carries what `main`
  holds past `74b6761`: the WHEN chip and the Spanish line of 260, Parts 3 and 4 of the editor's UX round (a tag of
  24), the reception flyer, the library's views, labels, looks and the search. Labels and the tag need it whole: new
  schema files.
- After that release, on live: `npm run flyers:labels -- --to <the site> --apply backups/flyer-labels/live-table.json`
  (a dry run), again with `--write` when nobody is editing, once more afterwards; then his own pass over the labels.
- The `ai` block in live's `config.php`, `'features' => ['share']`, never before its release; then
  `npm run ai:smoke -- --share --to <the site>` once, whose seconds measure the host's time limit. Whether it is done
  is not recorded.
- Phone trials over https: Part 3 (copy and share the picture) and the library's views.
- The lock on live (`docs/deploy.md`, steps 3–4).

## Waiting, don't start unasked

- The counts of what is left today confuse the interface a little (2026-10-07).
- A second shape for the share text, "one mixed caption", behind a switch (2026-10-06). Not designed.
- Steps 7 (drag and nudge) and 9 (the doodle picker, icon uploads), with what each must decide (the history's entry).
- The real login (Supabase, or the Laravel app as the issuer): its own brief.

## For Artur to decide

Each report's "For Artur to decide" has the reasons.
- The AI assistant (`docs/reports/ai-assistant.md`): "daily" and "tomorrow" printed "Every day"; `autoloader-suffix`
  for a repeatable release id; two requests at once both see `remaining: 1`.
- The AI's switches (`docs/reports/ai-feature-switches.md`): a small copy of each photo for the library; where a
  refused `config.php` logs; Node's number spellings; the start-up line's `AI_MODEL`.
- A flyer from a photo (`docs/reports/ai-flyer-from-photo.md`): the sentence at a limit of 1; `['share' => null]`;
  the words of "Open in editor"'s question; a failed read's picture as the photo; Try again and the tick; reads sent
  at once pass the tries together; Read waiting with no flyer left; a generation on its way unguarded; the first
  example's "Free".
- The editor's UX round (`docs/reports/editor-ux.md`): handle and tag as details, six seconds; the fold button's word,
  Flyer closed on a saved flyer, Photo left open, "Open all", the cut-off warning's section; the iPhone's sheet, two
  clicks to download, a save before every way out, a toast with a step that stays; a full-width pill on the teal
  blob, the pencil under a fifth row, the closed Tag pill's ellipsis, the swapped files not in the seed, a long ask
  under the pencil.
- The library's views (`docs/reports/library-views.md`): Open in More; the toast over the lowest card; a flyer that
  cannot load greys with no word; the editor's last canvas.
- Labels (`docs/reports/flyer-labels.md`): the list item still carries them; "All hostels"; the AI's rule words, hints
  and check generations; the list's order; the last of two saves wins.
- The search (`docs/reports/library-search.md`): the words that are mine; the phone's cut "why" line; 16 characters
  before the word; a remembered search reads every flyer; "Sign up at reception." matches nearly every flyer.
- Looks (`docs/reports/looks.md`): `LOOKS=` with nothing; a name spelt exactly; the sample's `'looks'` commented out;
  the words in `docs/deploy.md`.

## Open

- Whether the login reaches PHP under FastCGI (the preflight page's *Login* line, once a lock is on).
- The eyebrow's marks after the pilot (`EYEBROW_MARKS`, `'both'` today).
- `claude-haiku-4-5`, Anthropic's default model here, retires no sooner than 2026-10-15: one line of settings changes
  it.
- The Laragon copy runs `allowPublic`, so the contract row that forbids it fails there by design.
- A flake to watch: `panel.spec.ts`, "the form keeps its place…" (404 px for 400), seen once.
- Two traps for a look, in `docs/adding-a-look.md`: the fit's height pass can re-wrap a line past its width, and a
  look's `highlight` is not checked against its highlighter file.

## Log

- 2026-10-14, faster sessions: ceremony tiers, CLAUDE.md a map (with `docs/architecture.md`,
  `docs/design-decisions.md` and this file), `test:render` and `test:php-smoke` build only when their inputs changed
  (`docs/reports/faster-sessions.md`).

## History

- Done: handoff build steps 1–6 (branch `feat/flyer-generator-mvp`).
- Done: step 8, the This week template, on every canvas and both backends (branch `feat/week-template`,
  2026-09-29). The brief is `docs/prompts/week-template.md`, the report `docs/reports/week-template.md`.
- Done: the This week follow-up (branch `feat/week-template-followup`, 2026-09-30; brief
  `docs/prompts/week-template-followup.md`, report: the "Follow-up" section of `docs/reports/week-template.md`).
  - Staff see a named red note when a taken row can't join, a "Try again" when the saved flyers can't load, and
    one action at a time in the editor (a photo dropped meanwhile is refused with a reason).
  - The library applies only its latest answer, and a long day shrinks inside its row.
  - The samples read the hostels' names from `seed/hostels.json`, and eight gaps in the tests are closed.
  - `baseline.spec.ts` takes every sample, lists its cases in `manifest.json`, and names what it skips.
  - Declined by Artur: flagging a slash between two times (`15:00/17:00`).
- Done: the open items (branch `feat/open-items`, 2026-09-30; brief `docs/prompts/open-items.md`, report
  `docs/reports/open-items.md`): the fit's floors, an untitled week flyer's name, the per-hostel badges (a pilot
  at `'both'`), `copy.test.ts`'s timeout, and the baseline's overlays, which are now shot from a context with no
  route (a route made Chrome's raster vary from load to load). Both proof sheets signed off; committed, unpushed.
- Built: flyers from staff text, and the share text (branch `feat/flyer-briefs`, 2026-10-01; the plan's record is
  `docs/ai-flyers/README.md`).
  - `data.share` is a caption saved with the flyer, and never printed. It is defaulted, so no migration; an older
    release drops it (live has kept captions since release `d1f7ddb40170`, 2026-10-01).
  - Staff copy it with "Copy text" under the caption in the panel. A small "Share text" pill also floats over the
    stage's corner and copies it in one tap: bottom-left on desktop, bottom-right on a phone. It takes no layout
    space, so the flyer keeps the whole stage (Artur's markup, 2026-10-01: a card under the preview took too much).
  - `npm run flyers:post` saves briefs on a site through its API (`FLYERS_BASE_URL`, or `--to`). It is idempotent,
    and it records each save in the example file.
  - `docs/ai-flyers/` holds every staff text with its brief (`examples/`): the AI assistant's few-shot and eval
    set. Add a correction there every time Artur makes one. The rules themselves are the prompt files in
    `ai/prompts/`.
  - Seen 2026-10-01: the live host reported `Disk quota exceeded` on `data/` and `uploads/`. Artur freed the IONOS
    space the same day.
- Built: the AI assistant (branch `feat/ai-assistant`, 2026-10-02 to 2026-10-04; brief `docs/prompts/ai-assistant.md`,
  continued by `ai-assistant-continue.md` and `ai-assistant-continue-phase5.md`; report
  `docs/reports/ai-assistant.md`). Committed, unpushed.
  - A "Create with AI" page (`#/ai`) and a "Write with AI" button in the editor's Share text section, on both
    backends, with OpenAI and Anthropic behind one seam. Artur's Phase 0 choices (2026-10-02): `gpt-6-luna` and
    `claude-haiku-4-5` as the default models.
  - Both providers answered real calls on 2026-10-04 (`npm run ai:smoke`), and one went through PHP on the Laragon
    copy.
  - The real calls found one fault, since fixed: Anthropic left the optional share text out, so
    `AiFlyerAnswerSchema` requires it.
  - Not on the live site yet. IONOS needs the new release, then the `ai` block with a key (`docs/deploy.md`, "The
    AI assistant"). Artur allowed it on live while it is unlocked (2026-10-02): the cap keeps it at 3 a day.
  - Known limits: two concurrent requests can both see `remaining: 1` (and so a burst passes the picture read's
    tries together: found on 2026-10-06, for Artur to decide); `claude-haiku-4-5` retires no sooner than
    2026-10-15 (a default: one line of settings changes it); IONOS's FastCGI time limit is unmeasured until a live
    call; Anthropic's first call after the answer's schema changes takes about 20 s of the 25 s limit; a long staff
    text (a thousand characters) takes 14 to 20 s on `gpt-6-luna`, where a short one takes 6 to 9.
- Done: the AI assistant, closed (branch `feat/ai-assistant-followup`, 2026-10-05; brief
  `docs/prompts/ai-assistant-followup.md`; the report's *Follow-up* section). `main` is fast-forwarded to it,
  locally; nothing is pushed.
  - The review (2026-10-05, another model, changed nothing) found F1 to F4 and two suspicions. Artur: "Do
    everything". All fixed, each test first: the ledger never takes `api/config` down, the adapters and the
    ledger agree on field types, `__proto__` as an assumption's field, no bundle read when off, one home for the
    field names, a staff text cannot close its own fence, a key with a line break is refused by name.
  - The AI was used in a browser with a real provider on both backends, with Artur's own staff text. The Claude
    extension was not connected, so it was Playwright's Chrome, step by step. Two things looked wrong and were
    fixed: with none left the page said nothing about midnight, and "one of the 1 generations".
  - The five known items are done: PHP without curl, a brief's blanks (`flyerFromBrief`, `printedExtras`), "never
    Free" for a missing price (an invitation is not a price: seen to hold on both providers), the stretching
    example's notes, the `fetchJson` test's room.
  - Releases: `deploy:update`, `deploy:tag`, three tags (`release/d1f7ddb40170` live, `release/8b9c8556afa1` and
    `release/3f909ea91548` the Laragon copy). The copy runs `3f909ea91548` with the AI on (its key is set again).
  - Left then, Artur's: the release and the key on IONOS. The steps are in the next entry, which changed them
    (the block names its features, and the smoke takes `--share`).
  - For Artur to decide (the report has each): a text with both "daily" and "tomorrow" printed "Every day";
    `"autoloader-suffix"` in `php/composer.json` would make a release id repeatable.
- Done: the AI's feature switches, three editor changes and the library's pictures (branch
  `feat/ai-feature-switches`, 2026-10-06; the brief was pasted into the session, the report is
  `docs/reports/ai-feature-switches.md`). `main` is fast-forwarded to it, locally; nothing is pushed.
  - Artur's answers (2026-10-05, quoted in the report): none until named; the cap a setting, 3 by default and
    20 at most; WhatsApp the default on screen only; the library's pictures always WhatsApp, in today's row with
    a thumbnail; the placeholder in English; the Laragon copy left with the share text alone.
  - A fresh-context review found no way for a switched-off feature to run, be spent, be recorded or be shown.
    Seven of its points were fixed, each with a test that failed first: among them a blank page when the
    client met a backend older than itself (`aiFor` now reads any answer it does not know as "no AI").
  - The Laragon copy ran release `2ad58f28364e` then (tag `release/2ad58f28364e`, on `2c9e5f8`) with
    `'features' => ['share']`; since the photo checkpoint it runs `8c7a635bd009`, still the share text alone
    (below). This machine's `.env` has `AI_FEATURES=flyer,share`.
  - Three real generations, all captions on the Laragon copy: 5.4, 3.7 and 5.3 s.
  - Left, Artur's, in this order: `npm run build:php` and upload, then `npm run deploy:tag -- <the site>`; the
    `ai` block in live's `config.php` with `'features' => ['share']`, never before the new release is up;
    `npm run ai:smoke -- --share --to <the site>`, once, whose seconds measure the host's time limit.
  - For Artur to decide (the report has each): a small copy of each photo for the library's pictures (both
    backends and a backfill); where a refused `config.php` logs its reason (the host's own PHP log today, not
    `data/php-errors.log`); Node reads a few number spellings PHP refuses; the Node start-up line prints
    `AI_MODEL` as typed.
- Done, closed by Artur on 2026-10-07: a flyer from a photo (brief `docs/prompts/ai-flyer-from-photo.md`, four
  stages; report `docs/reports/ai-flyer-from-photo.md`, one section per stage built, and one for the follow-up to
  the page). Designed with Artur on 2026-10-06: his answers are quoted in the brief, and are not to be reopened.
  Nothing is pushed, `main` is at `684189e`, and the release to IONOS is his.
  - **Stage 1 is done: a daily limit per feature** (2026-10-06, on `feat/ai-feature-switches` by Artur's choice,
    on top of `684189e`). `main` stays at `684189e` until he says; nothing is pushed.
    - A review found no defect in the counting, the settings or the wording on either backend. What it and the
      look found is fixed, each test first: a `null` entry in `api/config`'s list that took the page down
      (`aiWithRemaining()`), the browser suite's unpinned limit, "Try again (uses one of 0 left)".
    - The look ran in Playwright's Chrome on both backends, with the fake: nothing was spent, and no provider
      was called in the stage. The Laragon copy, `.env` and the live site were not touched.
    - No release was built. A host needs the release first and `'dailyLimits'` second.
    - For Artur to decide (the report has each): the sentence at a limit of 1 ("Today’s 1 AI share texts are used
      up"); a feature with nothing for its number is refused (`['share' => null]`); the words "Try again (none
      left today)".
  - **Stage 2 is built: the read, on both backends, with no page** (2026-10-06, on `feat/ai-feature-switches` by
    Artur's choice again: "Stay on feat/ai-feature-switches"; 14 commits on top of `650d3a9`, committed as each
    piece went green, on his standing go-ahead for the stage). Nothing is pushed.
    - With `photo` not named the app looks and behaves as before: the baseline is byte-identical (32 cases).
    - A fresh-context review found no way for a switched-off read to run or spend. What it found is fixed, each
      test first: among them a 500 on Node for a file under another field's name, and a clean-up of kept pictures
      that one stuck folder stopped for good.
    - **Its checkpoint, taken up in a later session the same day** (the report's *The checkpoint*; five commits
      on top of `747e4c8`, each as it went green on Artur's word; the gates all green on `43aa907`):
      - Artur's answers: stay on this branch, for the checkpoint and stage 3; a number of tries for the read alone,
        three times its limit, with the used-up sentence (built, above); the reader's prompt's words are settled
        after the real reads; the first case goes in as it is; a PNG with transparency is left, a known limit.
      - The first case is in git as the read sends it: a JPEG of 154 KB from the server's own intake. The test
        holds a case to the read's format. Artur's 1.4 MB PNG is in `backups/image-examples-originals/`, which git
        ignores.
      - **The real reads are done** (2026-10-06, on his go: eleven pictures, 40 reads, about 19 cents, on
        `gpt-6-luna`, `claude-haiku-4-5` and the middle model of each provider, `gpt-6.1-sol` and
        `claude-sonnet-5-5`). His ten pictures are in `backups/photo-reads/`, which git ignores; some are no
        event, on purpose. The report has every row. What they say:
        - Printed posters and screenshots: every model reads them.
        - Handwriting: both fast models wrote a wrong time on a board, three reads of three each, with no `[?]`.
          Both middle models read it right. `gpt-6.1-sol` had no misread on any picture.
        - A picture that is no event still gives its words; no model made an activity out of erased chalk.
        - Seconds of the 25: `claude-haiku-4-5` to 4.0, `claude-sonnet-5-5` to 11.5, `gpt-6.1-sol` to 17.7,
          `gpt-6-luna` to 20.7.
      - **Artur's choices from that table, all built:** `gpt-6.1-sol` reads pictures on OpenAI, and the read runs
        on each provider's middle model by itself (`AI_FEATURE_DEFAULT_MODEL` in `src/shared/ai.ts`; on Anthropic
        `claude-sonnet-5-5`). That default wins over `AI_MODEL` / `'model'`, which is the flyer's and the share
        text's: only `AI_MODELS=photo:…` changes it (my ruling, in the report). 2048 px stays. The reader's
        prompt gained three rules: a brand printed on a board or its frame is left out (a poster keeps what it
        says of its own event), each activity of a board goes on one line, and a picture that announces no event
        answers empty.
      - **Eleven check reads on `gpt-6.1-sol` with those rules:** no fact misread on any picture. Known from them:
        the dense website screenshot took 12.7 to 21.9 s of the 25 s over three reads. Only `npm run ai:smoke`,
        by hand and on his go, called a provider: 52 reads and 5 generations in all, about 28 cents.
      - For stage 3's words: an empty answer can now mean "no event", not only "no words".
      - **The checkpoint is closed.** Stage 3 is for a new session, by his word: its standalone prompt is
        `docs/prompts/ai-flyer-from-photo-stage-3.md`.
      - One read went through the Laragon copy, on his word: `gpt-6-luna`, 7.4 s with the upload. The copy now
        runs release `8c7a635bd009` (tag `release/8c7a635bd009`, on `a10e92f`), and is left with the share text
        alone, as he said.
      - The case's `source` is as its picture prints it, line for line and capital for capital (his answer).
    - No release was built. A host needs the release first, then `'models'` and `'photo'`; both come out before
      going back (`docs/deploy.md`, "Rolling back").
  - **Stage 3 is built: the page, "From a photo" on Create with AI** (2026-10-06, on `feat/ai-feature-switches`,
    twelve commits on top of `ceea60f`, each as it went green on his word). Nothing is pushed.
    - It is the client alone, on both backends: the architecture section above says how it works. With `photo` not
      named the page is as it was, and the baseline is byte-identical (32 cases).
    - Artur's answers: the empty read's line ("The AI found no event in this picture. Write the event here
      yourself."); the line after a failed read; no polling and nothing more for a slow read ("Nothing more now");
      the phone test from this PC over the office Wi-Fi, with the fake.
    - The look ran on both backends, desktop and phone, in the installed Chrome driven by a script, on the fake:
      nothing was spent. 20 of 23 pairs of screenshots are the same file on both backends.
    - A fresh-context review of `747e4c8..61cd7ec` found no way for a switched-off feature to run or leak. What
      it found is fixed, each test first: among it, words that lost their leave guard after a second, empty
      read, a read on its way that leaving did not ask about, and "try again" over a button with none left.
    - **The real phone was tried the same evening** (his Galaxy S23, Chrome, the fake provider): Take a photo
      opened the camera, Choose a picture the gallery, and both reads worked. The browser shrank each camera-sized
      photo to 1153 × 2048, and the server kept it upright. Not tried there: Generate, a sideways photo, an iPhone.
      The two pictures are in `backups/phone-test-2026-10-06/`, outside git.
    - A phone reaches this PC over the PC's own hotspot (`192.168.137.1`), with the server bound to that address
      alone. A hostel's Wi-Fi keeps its devices apart and is no closed network: the app is never served on it.
    - **The checkpoint has all it asked for.**
  - **The follow-up to the page is built: numbered steps, and a link** (2026-10-06, in the session of
    `docs/prompts/ai-flyer-from-photo-stage-4.md`, on `feat/ai-feature-switches` by his word, a commit per piece).
    - It is his observation: after a read the page looked like a step back, to the tab it starts on. Of three
      shapes he chose **"Numbered steps"** (over my advice, "One way forward"). The architecture section above
      says how it works.
    - His answers in that session: the steps show **"From the first tap on From a photo"** (over my advice, "Once
      a picture is read"), and a read with no event names the second step **"Write the event"**.
    - In the failed-read line "type the event yourself" is a link to the idea box. His sentence is unchanged.
  - **Stage 4 is built: the picture as the flyer's photo** (the same session; seventeen commits on top of
    `bab60d0` for both parts and their record, each as it went green). Nothing is pushed.
    - It is the client alone, on both backends. With `photo` not named the app is as it was, and the baseline is
      byte-identical (32 cases, against a capture of `bab60d0`).
    - His answers: the tick box is offered for a picture with no event too (**"Yes, offer it"**), and while the
      picture uploads the button reads the editor's own **"Uploading…"**, with "Adding your picture to the
      flyer…" in the stage.
    - The look ran on both backends, desktop and phone (390 and 360 px), in the installed Chrome driven by a
      script, on the fake: nothing was spent. 44 of 57 pairs of screenshots are the same file on both backends. A
      phone-sized photo (3600 × 4800, 11 MB) went up as 1.96 MB, under PHP's 2 MB.
    - A fresh-context review of `61cd7ec..0d61f95` found no severe defect, and no way for a switched-off feature
      to run. What it found is fixed, each test first: among it, "Open in editor" on an older flyer leaving words
      read behind without a question (older than the session), an upload's answer landing after the page was left
      and come back to, and a check on the examples' ranges that a range of days passed.
    - The gates on `e447fbd`: 603 unit, 378 contract, 182 in the browser (66 of them the AI project's), 893 PHP,
      2 in the PHP smoke test. No provider was called in the session.
    - **The checkpoint has what the brief asks: the screenshots on both backends and the gates.**
    - **The whole path was tried on his phone, and he closed the work** (the first hour of 2026-10-07; his Galaxy
      S23, Chrome, the fake, over this PC's own hotspot): a picture, Read, Generate, the tick, Open in editor, Save.
      "We can close that, everything nice working."
      - The server kept two files of two sizes: the read's copy at 1153 × 2048, and the flyer's photo at
        1824 × 3240, made from the original. Both upright. They are in `backups/phone-test-2026-10-07/`, outside git.
      - Not tried there: Take a photo (the picture came from the gallery), a sideways photo, an iPhone.
    - **For Artur to decide** (the report has each; he answered none of these when he closed it):
      - the words of the question "Open in editor" now asks with words read and an older flyer on the stage (the
        leave question's own, as where there is no flyer yet);
      - whether a picture that failed to read is offered as the photo once the event is typed;
      - whether a Try again keeps the tick, and where the box sits;
      - the red notes a screen reader is not told of, which the editor shares (answered since by the toasts:
        an error is an alert, 2026-10-07);
      - and stage 3's list, unchanged: **reads sent at the same moment pass the tries together** (a limit of 1,
        20 reads at once, 20 provider calls and 20 pictures kept; holding the bound means recording a try before
        the provider is asked, on both backends); the words on the page that are mine; that Read the picture
        waits when no flyer is left today; whether a generation on its way should be guarded as a read now is;
        the first example's "Free".
    - No release was built. A host needs nothing new for this work: it comes with the files. A host that names
      `photo` names it with `flyer`.
- Built, all four parts (2026-10-07 to 2026-10-12, and three last changes on 2026-10-13): **the editor's UX
  round** (brief `docs/prompts/editor-ux.md`; the report is `docs/reports/editor-ux.md`, one section per part,
  and a last one for those three). Designed with Artur on 2026-10-07: his
  answers are quoted in the brief and the report, and are not to be reopened. Parts 1 and 2 are in `main`, on
  origin. Parts 3 and 4 were on `feat/editor-ux-part-3`; they are in `main` and on origin since 2026-10-14. Left,
  his: the release, the live site, and a phone trial of Part 3 over https.
  - **Part 1 is built: the toasts, and the AI caption that saves itself** (2026-10-07, five commits on top of
    `497186c` and their record). Artur approved the plan with every *Mine* point kept. Nothing is pushed.
    - The toasts: the architecture section above says how they work.
    - "Write with AI" writes the caption and saves the flyer as one action (`writeShare()` in `Editor.tsx`).
      `save(draft)` takes the draft to write: the answer lands after the render its action started from, so it
      saves `latestDraft` with the caption in it.
    - The button is a small "Write again" link while the caption stands for the flyer's details: `captionOf`
      holds the details it was written from (after a generation, or as a flyer opened with a caption), and
      `captionWritten` compares them with the fields now. A detail changed, or the caption emptied, brings the
      button back. Nothing new is stored with a flyer.
    - "The flyer's details" are the hostel, the template and `SHARE_DETAILS` in `src/shared/share.ts` (`text`,
      `chips`, `extras`, `week`). The server's `ShareInput` is typed from the same list.
    - A refused save keeps the caption in the form and says so (`captionUnsaved`). A caption that lands after
      the page was left writes nothing (the URL and the page's own `here` ref, as on the AI page).
    - The AI draft warning leaves at the staff member's own Save or download (`ownSave`), not at that save.
    - It is the client alone, on both backends, and the baseline is byte-identical to `497186c`.
    - A fresh-context review found no blocking defect. What it found is fixed, each test first: among it, a
      success that never closed while anyone typed, and a toast below the fold on a short phone.
    - The look ran in the installed Chrome driven by a script, on Node with the fake, at 1440, 1280, 390 and
      360 px. The screenshots are in `backups/editor-ux-part-1/`, outside git. Not looked at by eye on PHP.
    - **For Artur to decide** (the report has each): the handle and the tag count as details; the words that
      are mine; a generation on its way is still not guarded when leaving; six seconds for a success.
    - Answered since (Artur, 2026-10-12): the toast that lies over the flyer's bottom-right corner on a desktop
      stays as it is. "The toast like this is perfect, is opening closing correctly and now not disturbing
      users they can decide if see it or not."
    - Part 2's standalone prompt is `docs/prompts/editor-ux-part-2.md`.
  - **Part 2 is built: the panel folds, and so do its sections** (2026-10-07, five commits on top of `1139234`
    and their record). Nothing is pushed.
    - How it works is in the architecture section above ("The editor's form folds").
    - Artur's choices in the session: the plan with every *Mine* point kept (the brief's seven and the plan's own
      eight); folded, the panel is **"A slim rail"**, of three shapes; of two looks shown as pictures, **"Look A
      and please make it more marked that we are in that session"**, so an open section is a lightly tinted card;
      the head and the rail **"As drawn"**, with the fold button first.
    - It is the client alone, on both backends, and the baseline is byte-identical to Part 1's capture.
    - The form's head now stands above the form in the editor and on the AI page (the plan left `AiPage.tsx`
      alone): the sticky head with scroll padding scrolled the form to its top when one of its buttons took the
      focus.
    - A fresh-context review found no fault in the fold's own logic and two regressions from that move, both
      fixed with their tests first: the panel widened with a long line in it (473 px, where it is 421), and on a
      short phone the AI page scrolled as a whole and lost its way back. Also fixed: a refused file opened
      Photo, "Empty" over a Spanish line that prints, a test that could not fail.
    - The look ran in the installed Chrome driven by a script, on Node with the fake, at 1440, 1280, 390 and
      360 px. The pictures he chose from and the screenshots are in `backups/editor-ux-part-2/`, outside git.
      Not looked at by eye on PHP, and not tried on a real phone.
    - With the panel folded the warning toast is beside the flyer (0 px over it, where it is 106 px at 1440 wide
      and 132 px at 1280 with the panel open). On a desktop the flyer is as tall as the stage, so it does not
      grow; on a phone it does (342 px wide where it was 279, at 390 wide).
    - **For Artur to decide** (the report has each): the fold button's word ("Hide" / "Form" says its state by
      its name alone; one word in both states could say it to a screen reader); the words that are mine; on a
      saved flyer the template and the hostel are in "Flyer", which starts closed; a dropped photo leaves Photo
      open on every saved flyer until it is closed; "Open all" is the other template's sections too; the cut-off
      warning marks no section.
    - Part 3's standalone prompt is `docs/prompts/editor-ux-part-3.md`.
  - **Part 3 is built: copy the picture, share it, and one clipboard** (2026-10-12, on `feat/editor-ux-part-3`,
    cut from `main` at `4e86083` by Artur's word of that day: "Work in a new branch from main"). The branch is
    not pushed.
    - Seen at its start: `main` is on origin at `4e86083`, with Parts 1 and 2 in it and the two commits of
      2026-10-09 and 2026-10-10 on top (the WHEN chip's time, the two copy warnings dropped).
    - How it works is in the architecture section above ("The flyer leaves the editor as a picture four ways").
    - It started with a spike, in real Chrome and Edge: a clipboard write must start inside the tap, and the
      share sheet opens only within 5 s of it. The report has the table.
    - Artur approved the plan as written, the brief's six *Mine* points and the plan's own fourteen.
    - **The phone's silent "Copy text" is fixed** (he saw it on 2026-10-07): it reached the editor over plain
      http, where a browser gives a page no clipboard, and the call threw. "Copy text" now says so, and why.
    - It is the client alone, on both backends, and the baseline is byte-identical to the capture of before the
      round.
    - A fresh-context review found no fault in the main paths (the copy inside the tap, the menu, the bar's
      rule). What it found is fixed, each test first: among it, "Share now" pressed twice or after the flyer was
      changed to one with an empty frame, a caption said to be on the clipboard from minutes before, a picture's
      failure left unheard where the clipboard refused at once, and where the focus went after a toast's step.
    - The look ran in the installed Chrome driven by a script, on Node and once on the staged PHP backend, at
      1440, 1280, 390 and 360 px, against a build of `main`: the bar has the rows it had at every width. One real
      copy was read back from Windows at 1080 × 1440. The scripts and screenshots are in
      `backups/editor-ux-part-3/`, outside git.
    - **Not tried: a real phone, an iPhone, Safari, Firefox.** A phone reaches this PC over plain http, where
      neither the clipboard nor the share sheet exists. The trial over https is Artur's: the report has the steps.
    - **For Artur to decide** (the report has each): the iPhone (an open WebKit report says a sheet given a
      picture and a text hands WhatsApp the text alone); a download is two clicks now; every way out saves first,
      even when nothing changed, and a save empties the server's picture cache; a toast with a step stays until
      it is used or closed; the words that are mine.
    - Part 4's standalone prompt is `docs/prompts/editor-ux-part-4.md`.
  - **Part 4 is built: a tag of 24, a pill that fits, and the art that follows the copy** (2026-10-12, on
    `feat/editor-ux-part-3` by his word, in two sessions; the second was launched with
    `docs/prompts/editor-ux-part-4-close.md`). The branch is not pushed.
    - How it prints is in "Design decisions already made" above ("The tag pill, and the art that follows the
      copy"). It is the only part that changes a flyer's drawing.
    - The first session made the pill a fitted line (`7c42d35`). He saw its proof sheet and asked for the spark,
      the blobs and the pencil to move. The second settled that from mock-ups, one question a picture, then built
      it and landed the limit.
    - His answers there: the spark follows the pill; the blobs stay and trade inks ("Let's invert the blob
      colors", on both canvases); the photo's sparks are left; the pencil is "same size, higher". He signed a
      sheet of every sample before and after, then the sheet of the tag at 8, 14 and 24.
    - Stored flyers did not change, and there is no migration. A flyer whose art was arranged by hand is drawn
      as stored.
    - **It needs a release, uploaded whole.** It brings four art files (`assets/art/blob-left-teal.png`,
      `blob-right-yellow.png`, `spark-left-yellow.png`, `spark-right-teal.png`) and the new schemas. An older
      release refuses a flyer saved with a tag over 12:
      `docs/deploy.md`, "Rolling back", says what staff see on each backend, and a test holds each half.
    - The story's byte-identical baseline ended with this part. A capture of the new drawing is in the temp
      folder `nest-ux4-baseline`, outside git.
    - The mock-ups, both signed sheets, the look's screenshots and their scripts are in
      `backups/editor-ux-part-4/`, outside git.
    - A fresh-context review found no defect in the renderer, the fit or the schemas. What it found was in the
      tests, and each is fixed: among it, the export check could not see a spark drawn off its pill (it now
      compares the spark and the pencil in their own boxes, `follow` in `tests/render/pixels.ts`), and the
      pencil's test held a week flyer to an Activity flyer's bound.
    - **Three last changes, after he had looked at it** (2026-10-13, the same branch, a commit each; the report's
      last section). His words: "The toggle show pill should also remove the sparks under it", "Invert also the
      image sparks on the top", and the form's sections "in the order on how we editing the flyer", with "Top and
      tag pill" split.
      - The form is the client alone, and the drawing stayed byte-identical to Part 4's capture (32 cases). The
        two art changes are the renderer's: stored flyers did not change, and there is no migration.
      - He signed a sheet of every sample before and after, with its pill and with the pill switched off
        (`backups/editor-ux-part-4/sheet-c/`).
      - A fresh capture of the drawing is in the temp folder `nest-ux4c-baseline`, outside git.
    - **For Artur to decide** (the report has each): on WhatsApp a full-width pill's left end lies on the teal
      blob; on a story week flyer with five rows the pencil's top is 4 px under the fifth row's frame; a long
      pill's copy still ends in an ellipsis in the closed Tag pill's line; the four swapped files are not in the
      seed's doodles; and, older than the round, an ask too long for its 760 px column is not cut there: it prints
      on under the pencil and, at 60 characters, past the safe margin, with the editor's cut-off warning.
    - Answered since (2026-10-13): the two inks cross again, by the photo's sparks trading theirs.
  - The round is over: there is no next part and no next prompt.
- Built: **the library's views, a lightbox, and the ways out on every flyer** (2026-10-13, branch
  `feat/library-views`, cut from `feat/main-flyer-library` at `fcfaf06`; brief
  `docs/prompts/library-views-lightbox-actions.md`, report `docs/reports/library-views.md`). Three commits; in `main`
  and on origin since 2026-10-14, with the reception flyer.
  - How it works is in the architecture section above ("The library is a list or a grid…").
  - Artur approved the plan with every *Mine* point kept, then chose from mock-ups drawn by the real library: the
    **magnifier**; **"Ways out only, rest in a menu"** (Duplicate and Archive behind More, over my advice to keep
    them in a row); **"Two columns, small buttons"** for a phone's grid; the lightbox **as drawn**. Not to be
    reopened.
  - It is the client alone, on both backends, and the baseline is byte-identical (32 cases, against
    `nest-ux4c-baseline`).
  - Three assertions of `library.spec.ts` changed, by his second answer: the card is one link (Open is in More),
    Tab from it reaches the zoom button, and Archive is pressed through More. The PHP smoke test too.
  - A fresh-context review found the editor's refactor equivalent and the clipboard still asked inside the tap.
    What it found is fixed, each test first: among it, a toast's step that could copy another flyer's caption, a
    toast over the lightbox's close button on a phone, and a menu off a phone's left edge.
  - The gates on `75bea4c`: 704 unit, 381 contract, 352 in the browser, 3 in the PHP smoke test.
  - The look ran in Playwright's Chromium on Node, by a script, at 1440, 1280, 390 and 360 px
    (`backups/library-views/`, outside git, with the mock-ups he chose from). **Not done: the installed Chrome by
    hand, PHP by eye, a real phone, Safari, Firefox.**
  - **For Artur to decide** (the report has each): Open is in More and is the card's click; the library's toast
    lies over the lowest card's buttons at 1280 px and on a phone; a flyer that cannot load greys its buttons
    with no word of why; the library makes the editor's last canvas and has no switch of its own; Safari on a Mac
    may not hand the focus back to the zoom button.
  - Left, his: the release (nothing new on the host), and a phone trial over https, as for Part 3.
- Built: **labels on every flyer, a filter by label in the library, and the AI sets them** (2026-10-14, branch
  `feat/flyer-labels`, cut from `feat/library-views` at `16e1527`; brief `docs/prompts/flyer-types-filter.md`, report
  `docs/reports/flyer-labels.md`). Fourteen commits and their record; in `main` and on origin since 2026-10-14.
  - How it works is in the architecture section above ("A flyer carries labels").
  - Artur's answers are in the report's table, and are not to be reopened: several on a flyer, from a fixed list;
    the word "Labels"; up to 8; a new flyer has none; a label off the list stays stored and hidden; no setting from
    a card's More menu; "Classify the flyers I trust you"; "The AI may suggest one"; "An organiser only when named".
    From pictures drawn on the real library: the phone's top "B: compact, two a row", a card's labels "A: pills
    under the line".
  - **One answer replaced another.** From text previews he chose "Headings, under every label"; an hour later,
    seeing it drawn, "I dont want the Group by label functionality." There is no grouping.
  - Unlike the library's views it is on both backends: it **needs a release, uploaded whole** (new schema files,
    and `shared.json` is read on every request). Nothing new in `config.php`.
  - The drawing is byte-identical to `nest-ux4c-baseline` (32 cases), checked four times on the way.
  - Part A of the brief, his answer "as suggested": Safari's focus after the lightbox is fixed (the library hands
    it to the zoom button); the other four open decisions of the library's views wait for his phone trial.
  - **The live site was read, never written** (2026-10-14, on his word "You read the live site"): its 16 flyers,
    to choose their labels. The table he approved is `backups/flyer-labels/live-table.json`, outside git, with
    what was read beside it. The Laragon copy was not touched.
  - A fresh-context review found no blocking defect and nothing unsafe in the live write. What it found is fixed,
    each test first: among it, the script judging "has a label" by the checkout's list and not the site's, a tick
    printed for labels the site saved and does not show, "oldest first" passing with an order by id, and a picker
    greyed with no word of why. One break I found while it read: a blank editor on a backend older than itself.
  - The gates on `ec75579`: 765 unit, 387 contract, 374 in the browser, 938 PHP (38 skipped, as before), 3 in the
    PHP smoke test. No provider was called.
  - The look ran in the installed Chrome, driven by a script, on Node with the JSON store, at 1440, 1280, 390 and
    360 px (`backups/flyer-labels/`, outside git, with the pictures he chose from). **Not done: PHP by eye (the
    smoke test drove it), a real phone, Safari, Firefox.**
  - **For Artur to decide** (the report has each, M1 to M10 and after):
    - the list item still carries the labels with grouping gone (pills at once, and each list opens every listed
      flyer's file on the JSON store: about 12 ms more at 16 flyers on this PC, 30 ms at 160; the host unmeasured);
    - "All hostels" now reads in the hostel filter and in a chain-wide card's line;
    - the AI's part: the words of its rule, three hints in `labels.ts`, the examples' labels (the Teide example
      has no organiser's label, since its text names none), and the real check generations, on his go;
    - the order of the list, which is the order of the picker, the filter and the pills;
    - a save replaces the whole flyer, so the last of two saves wins: older than this work, and the script is the
      first thing that makes it likely.
  - Left, his, in this order: the release; then `npm run flyers:labels -- --to <the site> --apply
    backups/flyer-labels/live-table.json` (a dry run), and again with `--write`, when nobody is editing, and once
    more afterwards; his own pass over the labels; a phone trial.
- Built: **a search box in the library** (2026-10-14, directly on `main` by Artur's word, on top of `8e14547`; brief
  `docs/prompts/library-search.md`, report `docs/reports/library-search.md`). Seven commits, `cbbb511..d33acb3`, and
  their record; nothing pushed, no release. A fresh-context review found nothing severe; what it found is fixed (the
  reads stop when the search is cleared or the library is left, a new list takes the queue, Clear keeps the focus).
  - How it works is in the architecture section above ("The library has a search box").
  - His answers are in the report and are not to be reopened. In words: remembered like the filters; Clear empties
    the search and the filters too; from 3 characters. From pictures of the real library: the box first in the
    filters; teal marks; the "why" line on one line.
  - The drawing is byte-identical to the capture before the first change (36 cases, temp folder
    `nest-search-baseline`).
  - **For Artur to decide** (the report has each): the words that are mine; on a phone the one-line "why" line can cut
    the word; it starts 16 characters before the word, not about 30; a remembered search reads every flyer when the
    library opens; the default ask "Sign up at reception." matches nearly every flyer.
  - Left, his: the release (the files alone), his look on a phone.
- Waiting, don't start unasked: **the counts of what is left today confuse the interface a little** ("AI credits
  left", in Artur's words, on his phone, 2026-10-07; "Follow ups will fix in future"). Not designed, and not part
  of the editor's UX round.
- Waiting, don't start unasked: **a second shape for the share text, "one mixed caption"** (Artur, 2026-10-06):
  one caption in English with the key facts repeated in Spanish, where today's has two blocks. He wants a switch
  to turn it on and generate it as another option for the share text. Not designed: where the switch lives (a
  site's setting, or a choice beside "Write with AI"), and no flyer of his shows the shape yet.
- Waiting, don't start unasked: step 7 (drag/nudge everything on the canvas, sizes, colours, order, reset),
  step 9 (doodle picker + icon uploads). With two canvases and two templates: step 7's stored `overrides`
  (dx/dy) are shared by every canvas, so it must decide how they apply per canvas; step 9, when it stores
  the render-only anchors (`bottomLeft`, `bottomRight`, `pillEnd`), must add a JSON migration id so an older
  release refuses the store cleanly. A stored `pillEnd` piece would also need the renderer's rule for it (drawn
  with the pill, and not at all on a flyer that prints none), which today only the template set reaches, and
  step 9 decides whether staff may pick the four swapped inks (`SWAPPED_INKS`).
- Built, all 7 stages: **looks, the seam for more than one flyer design** (2026-10-14, branch `feat/looks`,
  cut from `feat/flyer-labels` at `a55589d`; the design `docs/prompts/looks-seam.md`, designed with Artur on
  2026-10-13; the report `docs/reports/looks.md`, one section per session). Stages 1 and 2: eleven commits,
  `c1d7e29..4139d14`. Stages 3 and 4: five, `9a665cc..11773dc`, and their record.
  - **`main` is fast-forwarded to `feat/looks` and pushed to origin** (2026-10-14, Artur's word, so Claude Design can
    read the repo): Parts 3 and 4 of the UX round, the reception flyer, the library's views, labels and looks stages 1
    to 4, and the prompts in `docs/prompts/` that were untracked, his two among them. The feature branches stay
    unpushed. No release was built: the host still runs what it ran.
  - **His brief to Claude Design for the real second look** is `docs/prompts/claude-design-brief.md`, brought up to
    date that day: the word "look", the `Look` interface as the hand-back's shape, the repo's paths, a box's own top
    and height per canvas within `tests/geometry.ts`'s checks, PNG art only, 4.5:1, orange left open (his answer).
    The real look is ported after stage 7, from Claude Design's handoff folder, by `docs/adding-a-look.md`: stages 5
    to 7 do not wait for it.
  - How it works is in the architecture section above ("A flyer prints in a look").
  - Artur's answers are in the design and the report, and are not to be reopened: among those of 2026-10-14, a look
    may give a box its own top and height, the photo's too (he struck "move only"), and M2 to M6 kept.
  - Nothing a staff member sees changed: the drawing was byte-identical on both canvases after every commit (the
    temp folder `nest-looks-baseline`, 36 cases).
  - The gates at the end of stage 2: 782 unit, 299 in the `render` project, 75 in `ai`, 387 contract. PHP was not
    run: nothing it reads changed.
  - Also `0eadafa`: a flake in the labels work's own `library-labels.spec.ts`, fixed.
  - **Stages 3 and 4** (the same day, a session of their own): `data.look` on both backends with the two rollback
    rules, `LOOKS` / `'looks'`, `api/config`'s `looks`, and a new flyer in the site's first look. Artur approved
    the plan as written, with eight points where the code disagreed with the design (the report has them). Nothing
    a staff member sees changed: the baseline byte-identical (36 cases) after every commit that touched `src/`.
  - The gates at the end of stage 4: 809 unit, 387 contract, 374 in the browser (299 `render`, 75 `ai`), 958 PHP
    (38 skipped, as before), 3 in the PHP smoke test.
  - **For Artur to decide** (the report has each): `LOOKS=` with nothing is refused (`AI_FEATURES=` means none); a
    look's name spelt exactly; the sample's `'looks'` commented out; the words in `docs/deploy.md`.
  - **Stages 5 to 7** (the same day, a session of their own, launched by `docs/prompts/looks-seam-stages-5-7.md`):
    eight commits, `bfcb54c..ced1571`, and their record. The proof look in the tests' build alone, the Look switch,
    `fitKey`, and `docs/adding-a-look.md`. Artur approved the plan as written (eight points where the code disagreed
    with the design: the report has them), saw the switch in pictures first, and chose "Look last in the line". On
    `feat/looks`, nothing pushed: `main` is still at `a96d1bf`.
    - Nothing a staff member sees changed: a site with one look shows no switch, and the baseline was byte-identical
      (36 cases) after every commit that touched `src/`. Seen in Chrome on both builds.
    - The gates at the end: 831 unit, 387 contract, 390 in the browser (299 `render`, 75 `ai`, 16 `looks`), 958 PHP
      (38 skipped, as before), 3 in the PHP smoke test. One `render` test failed once in a whole run and not since
      (`panel.spec.ts`, "the form keeps its place…", 404 px for 400): a flake to watch.
    - Found: the fit's height pass can re-wrap a line past its width, unchecked (hand-drawn never meets it; `fit.ts`
      unchanged); a look's `highlight` colour is not checked against its highlighter file. Both are traps in
      `docs/adding-a-look.md`.
    - I ran `npm run build:php` once, which the brief ruled out: `release/php/` is empty since (what I built came from a
      dirty checkout and was removed). The next `build:php` makes it again.
  - **Left, Artur's:** fast-forwarding `main` to `feat/looks` and pushing, when he wants; the release (nothing in it
    changes for staff). The real second look is a later session, from Claude Design's handoff folder, by
    `docs/adding-a-look.md`.
- Done: output canvases, Instagram story 9:16 + WhatsApp 3:4 (branch `feat/output-canvases`, 2026-09-23).
  The review is `docs/reports/output-canvases-review.md`, the report `docs/reports/output-canvases.md`.
- Done: the PHP shared-hosting port, phases 2–5 (branch `feat/php-shared-hosting`): the seams, the PHP
  backend, the Node JSON driver and the copy tool, the release and the Laragon verification. The report is
  `docs/reports/php-port.md`; the briefs are `docs/prompts/php-shared-hosting*.md`.
- Done: deploy readiness (`docs/prompts/php-deploy-readiness.md`, same branch, 2026-09-23). It adds:
  - the access rule proven over HTTP (`tests/access`), and the checks can sign in (`.env`, `scripts/env.ts`);
  - `release.json` and the host facts in `api/config`;
  - the preflight page (`php/preflight/`);
  - `docs/deploy.md`, the owner's single copy of the deploy steps, with backup/restore/reset;
  - an Apache rehearsal, recorded in `docs/reports/php-port.md` and `docs/reports/host-facts.md`.
  `seed/hostels.json` now has all 14 hostels.
- Built: the shared top bar (branch `feat/shared-nav`, 2026-09-27; the plan's decisions are in
  `nestpass-tools/README.md`).
  - The same bar runs in Flyers, Newsletter, QR and Social vanity URLs (`nestpass.ai/vanity/`, in the
    website repo `H-Nests/www_cur/tools/vanity-links`), and the tools page `nestpass.ai/` lists them.
  - Live since 2026-09-28: SSL, the tools page and the kit, and Flyers and Newsletter with the bar.
    QR's part is on its branch `claude/shared-nav-7477311f`.
  - Still open: this app answers without a password (`allowPublic`; seen 2026-09-28, still so on
    2026-09-29), while the public tools page links to it. The lock is `docs/deploy.md` steps 3–4.
- Built: the editor as a focus page (branch `feat/editor-focus`, 2026-09-28, cut from `feat/shared-nav`).
  The bar shows on the library only; the editor has a back link, a guard on unsaved work, "In a frame" by
  default and an exclamation budget (the design decisions above).
- Done: the write guard is one constant (branch `refactor/write-header-constant`, 2026-09-29). The header,
  its value and the methods that need none live in `src/shared/writeGuard.ts`. `npm run gen` copies them to
  `schema/shared.json`, and `Shared::writeGuard()` feeds PHP's `WriteGuard`. Both backends, the editor and
  every test read them; only `WriteGuardTest` spells the header out, to pin the rule. PHP reads that block on
  every request, reads included, so upload a release whole: a stale `shared.json` answers 500.
- **Not live, by the owner's decision:** the host is IONOS (`https://nestpass.ai/activities/`), and the app
  goes public only once a real login exists. That login (Supabase, or the Laravel app as the issuer) is its
  own brief, and is not to be started unasked. It will have to exempt a sign-in route from the access check,
  and decide what guards the static files.
- IONOS answered the preflight page on 2026-09-28 (the IONOS column of `docs/reports/host-facts.md`):
  PHP 8.4 under FastCGI, gd, every account check green.
  - Its root `.htaccess` was a hand-edited older copy, so `release.json` was served.
  - `http://` was not redirected.
  - The then-shipped full `.htaccess` was refused: 403 on every URL, shown on IONOS's own page with
    a cookie banner. The likely line is `Options -Indexes -MultiViews`.
  - MultiViews is on and cannot be turned off from `.htaccess`.
  So the release's root `.htaccess` is now the one IONOS runs: rewrites, headers and `FilesMatch`
  only, with the https redirect first (taken from `THE_REQUEST`, because of MultiViews).
  `.htaccess-minimal`, step 1b and the separate https example are gone. The lock's `<If>` lines
  (http 403 → redirect) may be refused there too; the block says to delete them if so.
- Open: whether the login reaches PHP under FastCGI (the preflight page's *Login* line, once a lock is
  on); the final format of the eyebrow's marks, after the pilot (`EYEBROW_MARKS`). The local Laragon deploy
  (`nest-flyers-php`) still runs `allowPublic`, so the contract row that forbids it fails there by design.
  The branch is unpushed, by the owner's choice.
