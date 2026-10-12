# Putting the flyer app on shared hosting

For the owner. You need SFTP (FileZilla), the hosting panel and a browser; no shell. The
target is IONOS webhosting, `https://nestpass.ai/activities/`, but every step works on any
Apache or LiteSpeed host with PHP.

> **Status, 2026-09-23: not live.** The app goes public only once it has a real login
> (Supabase, or the Laravel app as the login issuer — its own brief). Until then, deploy it only
> behind the staff password as described here, as a locked trial, or not at all. Never set
> `allowPublic` on a host other people can reach.

This page is the only copy of these steps. The README keeps the developer side (building the
release, `npm run copy`, nginx) and the Node/VPS deploy, which is a separate, developer-run
setup.

---

## Before you start

**Build**, on the computer with the checkout (Laragon's PHP and Node):

```sh
npm run build:php
```

It prints three things you need:

- `release/php/` — the app, **434 files, 3.90 MB** (the build prints the current count, and
  `release/php/release.json` lists every file). FTP clients and file-manager uploads go by size,
  so a 3 MB upload is small.
- `release/nest-preflight-<16 letters and digits>.php` — the preflight page. Its name is random
  on purpose: it tells whoever opens it about the account, so nobody should be able to guess it.
- the release id, e.g. `release 24cb32b80539`. The preflight page and `api/config` show the same id
  once it is uploaded.

**Zip it** for the host: open `release/php/` in Explorer, select everything inside it
(Ctrl+A), right-click → *Send to* → *Compressed (zipped) folder*, and name the zip after the
release id (`nest-flyers-24cb32b80539.zip`). Keep every zip on the office drive: an old zip is
how you roll back (below).

**Show hidden files in FileZilla:** *Server* → *Force showing hidden files*. The release has
eight files whose names start with a dot (`.htaccess`, `.user.ini`, and one `.htaccess` each in
`data/`, `uploads/`, `src/`, `seed/`, `schema/`, `vendor/`). They are the whole security of the
app. A client that hides them uploads a working app whose code, settings and library can be
downloaded by anyone, and nothing in the browser looks wrong. The preflight page checks for them
by name.

---

## The steps

### 0. Save what is already there

If the app folder on the host already has a `data/` or `uploads/` folder or a `config.php`,
download all three to the office drive first (see *Backups*). A new upload never overwrites them,
but a mistake on the way can.

### 1. Upload the preflight page alone, and open it

Create the app folder (IONOS: `activities` inside the domain's folder) and upload **only**
`nest-preflight-….php` into it. Open `https://nestpass.ai/activities/nest-preflight-….php`.

Fix everything red under *This hosting account* before going on. The usual one is the PHP
version: in the IONOS panel, set this domain's PHP to 8.3 or newer, then reload. Yellow lines are
advice (`display_errors` is often On until the release's own settings arrive in step 2).
Everything under *The release* says "not uploaded yet" for now.

### 2. Upload the release

Either upload the zip and extract it into the app folder with the file manager (IONOS Webspace
Explorer, if it offers *Extract*), or upload the **contents** of `release/php/` with FileZilla,
hidden files shown. Two rules:

- **Upload additively.** Never use a *synchronise* or *mirror* mode: it deletes what is on the
  host and not in the release, and that is exactly `config.php`, the library in `data/` and every
  photo in `uploads/`.
- **Keep the zip out of the app folder.** Delete it from the host after extracting, or leave it
  in a folder the website does not serve. It is also on the office drive.

Reload the preflight page. *The release* must be green: every file arrived, the eight security
files by name. If a file is listed as missing or different, upload it again. *Connection* must be
green too: the release's `.htaccess` sends every `http://` visitor to `https://`.

If every page now answers an error (IONOS: a 403 on its own page, with a cookie banner), the host
refuses a line of the release's `.htaccess`. Upload the previous release's `.htaccess` to get
back, and tell a developer: the file carries only what IONOS accepted on 2026-09-28.

### 3. Set the password

On the preflight page, under *The staff password*, type the password the staff will use (user
`staff`) and press *Make the lines*. It prints three blocks. Nothing is stored, and the password
itself appears nowhere.

1. **`config.php`** — save it as `config.php` in the app folder, next to `api.php`. This locks the
   API: until it exists, the app answers every request with "not set up yet" (503), which is safe.
2. **The password file** — one line. Save it where the page says: outside the web folder if your
   SFTP login can reach that folder, otherwise as `.htpasswd` in the app folder (Apache never
   serves a file whose name starts with `.ht`). If you use the second place, change the
   `AuthUserFile` line in block 3 to match.
3. **The top of `.htaccess`** — open the app folder's `.htaccess`, paste the block **above
   everything else**, and save. It locks the editor page, the art and the photos, which
   `config.php` does not cover. If every page then answers an error, the host refuses the three
   `<If …>` lines at the end of the block: delete them. `http://` then answers a plain 403
   instead of switching to `https://`, which is still safe.

Why two locks with the same login: `config.php` guards the API, `.htaccess` guards everything
else. With the same user and password in both, the browser asks once. With different ones, a
staff member gets past the first and is refused by the second, and it looks like the app is
broken. (If a host offers a "password-protect this folder" tool, it writes the `.htaccess` half
for you: use the same login there, or leave `config.php` on `allowIps` only.)

The lock works over **https only**. Over `http://` Apache answers with a redirect to `https://`
(or a plain 403) and never asks for the password, so it is never sent unencrypted.

### 4. Check the lock from the outside

Reload the preflight page. It asks for the password now; enter it. Then:

- *From the outside* must be green: the editor page, a photo and the API each refuse a visitor
  without the login. A red line here means the `.htaccess` block is missing or does not reach.
- *Login* says which variable carried your password to PHP. IONOS runs PHP as CGI/FastCGI, where
  that hand-off is the step most likely to fail. If it says no login reached PHP, `config.php`
  will refuse everyone: tell the host, or use `allowIps` in `config.php` instead.
- *Connection* must still be green: this page arrived over https, and `http://` sends visitors
  to `https://` without asking for the password.
- *Flyer fonts* must be green. If a font does not load, flyers still export at their exact
  size (1080 × 1920 story, 1080 × 1440 WhatsApp), in the wrong typeface, and nothing else warns you.

If the page cannot fetch from the server (some hosts forbid it, and a test certificate the
server itself does not trust stops it too), those lines are yellow and say why, and the page lists
the addresses. Open each one in a **private window**: every one must ask for the login.

### 5. Make a flyer

Open `https://nestpass.ai/activities/`, sign in, make a flyer with a photo, and download the
PNG, once with **Story 9:16** and once with **WhatsApp 3:4** picked in the toolbar. Check that
they are 1080 × 1920 and 1080 × 1440 and in the right typeface (compare the story with one from
the old app). The PNGs are drawn by your own browser.

The library's top bar, with the links to the other Nests tools, is loaded from
`https://nestpass.ai/kit/`. That folder is uploaded from the `nestpass-tools` repo, not from this
release. Until it is there, the bar shows only "Flyers", and that is expected. The editor has no
bar, by design: its way back is "← Library" at the top of the form.

**5b. Move the library in** (once). A developer, on the computer with the checkout, copies the
current library into a folder that looks like the host's:

```sh
npm run copy -- --from-sqlite ./data/flyers.db --to-json <folder>/data --uploads-to <folder>/uploads
```

Upload that `data/` and `uploads/` into the app folder, additively. The copy reads a snapshot, so
`flyers.db` is never opened or changed. Reload the app: the flyers and photos are there, and the
hostel list refreshes itself from the release.

### 6. Delete the preflight page

Delete `nest-preflight-….php` from the host. A re-upload of the release cannot bring it back
(it is not part of the release). Build a fresh one when you need it again.

### 7. Take the first backup

Download `data/`, `uploads/` and `config.php` to the office drive (next section).

---

## Backups

**Monthly, by Artur, to the office drive**, and right after the library first goes up. Shared
hosting has no scheduled jobs, so a backup is a habit, not a setting.

With FileZilla (hidden files shown), download three things from the app folder into a folder
named with the date, e.g. `nest-flyers-2026-10-01`:

- `data/` — the library: every flyer, the hostels, the photo records;
- `uploads/` — the photos themselves;
- `config.php` — the lock they were served under.

A copy taken while nobody is saving a flyer is consistent. `data/.lock` and `data/php-errors.log`
are working files; the backup does not need them.

**Leave `data/ai-pictures/` out,** if the folder is there: delete it from the downloaded copy. It
holds the pictures the AI read in the last thirty days (*The AI assistant*, below). The app deletes
them itself after thirty days, and a backup that holds them keeps them for as long as the backup
lives. `npm run deploy:backup` leaves the folder out by itself.

**If `config.php` sets `dataDir`** to a folder outside the app folder (the safer setup when the
host allows it), the library is in *that* folder, and `data/` is empty. Download that folder
instead.

**Putting a backup back:** delete the host's `data/` and `uploads/` contents except their
`.htaccess` files, then upload the backup's `data/`, `uploads/` and `config.php`. A developer can
rehearse this on a local copy of the deployment:

```sh
npm run deploy:backup  -- <deploy folder> [--to <folder>]           # default: ./backups/
npm run deploy:restore -- <backup folder> <deploy folder> [--force]
npm run deploy:reset   -- <deploy folder>                            # empties the library
npm run deploy:update  -- <deploy folder> [--to <folder>]           # a newer release over a local copy
```

`deploy:restore` refuses a deployment that already holds flyers or photos, or a different
`config.php`, unless you add `--force`. The drill in `tests/cross/restore-drill.test.ts` proves
backup → wipe → restore brings back a flyer and its photo byte for byte.

`deploy:update` is *Updating to a new release*, below, for a local copy (a Laragon folder): it backs
the folder up, builds the release, copies it over the folder without deleting anything, and tags it.
If the folder's root `.htaccess` was not the last release's own (a lock pasted in), the backup keeps it
as `htaccess-before-update` and the command says so: paste the block again. A host is still updated by
SFTP, by hand. `tests/cross/update-drill.test.ts` proves the library, the photos, `config.php` and any
file the release does not ship are left exactly as they were.

---

## Updating to a new release

1. Build and zip the new release (*Before you start*).
2. Take a backup.
3. Upload the new release additively (step 2). `config.php`, `data/` and `uploads/` are not in
   it, so they stay.
4. **The upload replaces `.htaccess`, and with it the lock you pasted.** Paste the block at the
   top again right away (you kept it, or make it again on a fresh preflight page), and check in a
   private window that the editor page asks for the login. The https redirect is part of the
   release: nothing to paste for it.
5. Reload the app. If a release ever changes the store's format, the app says so rather than
   half-reading it.
6. **Tag the release**, on the computer with the checkout:

   ```sh
   npm run deploy:tag -- https://nestpass.ai/activities/
   ```

   It asks the site which release it runs and makes the git tag `release/<id>` on the commit that
   release was built from, with the site and the day in its message, so git says which code is live.
   It refuses a release built from uncommitted changes: commit, build and upload again. A tag is
   never pushed by itself: `git push origin release/<id>` when you want it on GitHub.

## The hostels' badges

- Each hostel's badge is `assets/logos/<slug>.png`, and `seed/hostels.json` points the hostel at it
  (`logo_path`; `null` prints the Nests wordmark alone). Both ship in the release.
- The PHP app refreshes its hostel list from `seed/hostels.json` by itself, on the first request
  after an upload that changed the file. A Node deployment needs `npm run seed` after the build
  (`npm run seed:dev` in development).
- To change a badge, give the new file a new name and point `logo_path` at it. The Node server
  caches exports by the hostel's record, not by the file, so a file replaced under the same name can
  keep coming back from its cache. The PHP host exports in the browser and has no such cache.
- Which marks print, the wordmark, the badge or both, is one setting in the code
  (`EYEBROW_MARKS` in `src/shared/defaults.ts`): it changes with a release, never on the host.

## The AI assistant

The app can write a flyer from a staff member's own text ("✨ Create with AI", on the library's
bar) and a flyer's share text ("✨ Write with AI", in the editor). They are two features, and each
runs only where `config.php` names it. Both are **off until `config.php` names a provider, holds
its key and names the features.** A feature that is off shows nothing, and with both off the app
looks and works as it did before.

**A third feature, `photo`, reads a picture into words,** so that a flyer can start from a photo of
a poster, a board or a screen. Staff find it on "Create with AI" as a second way in, **From a
photo**: they choose a picture (on a phone they can take one), press "Read the picture", check the
words in "Your idea", and ask for the flyer as from any text. A flyer from a picture is one picture
read and one flyer, each from its own daily count. What it keeps on the host is under *What it
keeps*, below.

- **Name `photo` together with `flyer`:** `'features' => ['flyer', 'share', 'photo']`. The read is
  on the flyer's page. Named without `'flyer'` it shows nowhere, though the server would still read
  a picture sent to it.
- **Its page came after its server half.** A release that knows the read and has no page shows
  nothing new for `photo`; one from before the read refuses it (*Rolling back*, below). The
  preflight page shows which release is up.

**To turn it on:**

1. **Check curl.** On the preflight page, *PHP extensions* must list `curl` (IONOS has it). Without
   curl everything else works, but the AI cannot reach its provider: staff then see "The AI didn't
   answer properly" every time, nothing is counted, and the log says PHP has no curl extension.
   Enable curl for this PHP version in the hosting panel first.
2. **Get a key** from the provider: OpenAI (platform.openai.com, *API keys*) or Anthropic
   (console.anthropic.com, *API keys*). Set a spending limit on it there if the provider offers one.
3. **Put it in `config.php`.** Download `config.php` from the app folder (IONOS: `activities/`)
   with FileZilla, add the block below just before the last `];`, and upload it again.
   `config.sample.php`, in the release, has the same block with every setting explained.

   ```php
       'ai' => [
           'provider' => 'openai',   // or 'anthropic'
           'apiKey' => 'sk-…',
           'features' => ['share'],  // "Write with AI" alone; ['flyer', 'share'] runs both
       ],
   ```

4. **Reload the app.** With `['share']`, a flyer's editor shows "✨ Write with AI (3 left today)" in
   its *Share text* section, and the library's bar shows nothing new. With both features, the bar
   also shows "✨ Create with AI · 3 left". With `photo` as well, that page has two ways in, "From
   your idea" and "From a photo", and the second shows "✨ Read the picture (3 left today)" under
   three numbered steps: Picture, Check the words, Flyer. Once a picture is read, the steps stand
   where the two ways were, and the flyer made from it offers "Use this picture as the flyer's
   photo".

**The staff trial: the share text alone on the host, both features on the developer's machine.**

- **On the host:** `'features' => ['share']`, as above. Staff get "Write with AI"; "Create with AI"
  is nowhere, and its address (`#/ai`) opens the library.
- **On a Node machine** (`npm run dev`): `AI_FEATURES=flyer,share` in `.env`, beside the provider
  and its key.
- **The release first, the keys second.** `features` and `dailyLimit` came with the release of
  2026-10-06 (`2ad58f28364e`), and `dailyLimits` with the one after it. An older release does not
  know them and refuses the whole `config.php`: every request answers 503 until they are gone.
  Upload the release, see the app load, and only then add them.
- **A key alone runs nothing.** A block from before that release (a provider and its key, no
  `features`) shows no AI on this one. Name the features and it is back.

What to know:

- **The key stays on the server.** `config.php` is never served over the web (the release's
  `.htaccess` denies it) and is in no release. The key never reaches the browser, `api/config`,
  the error log or the library. It *is* in every backup, because `config.php` is: keep backups
  where the key may be.
- **Three a day of each feature, unless you set your own.** Every feature has its own daily limit.
  With nothing set, the whole site gets 3 flyers and 3 share texts a day, counted on the Canary
  Islands day.
  - A generation counts only when it gave a flyer or a caption: a failed one is free.
  - A picture read that fails is free too, but only so many times: three tries for each read of its
    limit, so 9 a day at 3. Past them the button says the day's reads are used up, as it does when
    the reads themselves are. There is nothing to set: the tries follow the read's limit.
  - A flyer never uses up a share text, or the other way round. When one feature's are used up, its
    button says what ran out and when it comes back, and the other still works.
  - `'dailyLimit' => 5` in the block changes the number for every feature, without a release.
  - `'dailyLimits' => ['share' => 10]` gives one feature its own number. The features it does not
    name keep `dailyLimit`.
  - Each takes a whole number from 1 to 20: the bound lives in the code (`AI_DAILY_LIMIT_MAX`).
  - A `dailyLimit` set under release `2ad58f28364e` was the whole site's total, both features
    together. From the next release on it is each feature's: 5 becomes 5 flyers and 5 share texts.
- **While the app has no lock** (`allowPublic`), anyone who finds the address can spend the day's
  generations before the staff do. That is the whole exposure: the cost cannot pass the day's
  limits, one per feature. At 3 a day each that is a few cents at most, which Artur accepted on
  2026-10-02; higher limits raise it in step. The lock (steps 3–4) closes it.
  - A generation that fails does not count, so it is outside those limits. A picture read's failed
    tries are bounded, because each one keeps a picture on the disk. A flyer's and a share text's
    are not: each failed one still asks the provider.
- **What it keeps.** `data/ai-usage/2026-10.json`, one file a month: each text a staff member sent,
  what the model wrote back, and the tokens. It is part of the library and of its backups, and it
  never holds the key. `docs/ai-flyers/README.md` says how these records become the model's next
  examples.
- **What a picture read keeps: the picture, for thirty days.** Each picture a staff member has the
  AI read is kept in `data/ai-pictures/`, in a folder named by the day (`2026-10-07/`), as it was
  sent to the provider: turned upright, shrunk, with no location or camera data in it.
  - **Why:** when the AI misreads a poster, the picture is what shows why.
  - **Who can see it:** nobody through the web. `data/` is never served. Anyone with the SFTP login
    can open the folder.
  - **For how long:** thirty days. The app deletes older days by itself, once a day, when someone
    opens it. There is nothing to schedule.
  - **Deleting the folder by hand is safe,** at any time: the app makes it again on the next read.
    The ledger then names pictures that are gone, which harms nothing.
  - **It is not part of the library:** leave it out of backups (*Backups*, above).
  - **A picture used as a flyer's photo is a second copy, and an ordinary photo.** On the flyer the
    AI made, staff can tick "Use this picture as the flyer's photo". The picture is then uploaded to
    `uploads/` like any photo chosen in the editor. It is served with the flyer and is part of the
    library and of its backups. It is not deleted after thirty days, and one uploaded for a flyer
    nobody saved stays there, as a photo dropped in the editor does.
  - **Disk:** about 45 MB at 3 reads a day, and about 300 MB at 20. A failed read keeps its picture
    too, so at the very most it is three times that, with every try of every day used: the tries
    stop it there. They do not stop reads sent at the same moment, which are counted as each is
    answered: a known limit, and one more reason for the lock. If the host's disk is full, a read stops with an error before the provider is
    asked, and nothing is counted.
- **The other settings,** all optional:
  - `model`: the flyer's and the share text's model. The default is the provider's fast one;
  - `models`: a feature's own model, by its name: `'models' => ['photo' => '<model>']`. One provider
    and one key serve them all.
    - **The picture read needs nothing set.** It runs on the provider's middle model by itself:
      `gpt-6.1-sol` on OpenAI, `claude-sonnet-5-5` on Anthropic. The fast models read printed
      posters well and handwriting badly: in real reads on 2026-10-06 both wrote a wrong time off a
      chalkboard, every time.
    - `model` does not change the read's model. Only `'photo'` here does.
    - A model named for `photo` must be one that reads pictures: one that cannot makes every read
      fail with "The AI didn't answer properly", and the log says why.
    - A read on the middle model costs about a cent and takes 5 to 22 seconds on OpenAI, 4 to 12 on
      Anthropic, measured on this machine and not on the host;
  - `effort`: `'low'` makes OpenAI answer sooner. Leave it out for Claude Haiku, which refuses it.
    There is one `effort` for the whole site: if any feature runs on a model that refuses it, leave
    it out;
  - `timeoutMs`: how long the app waits for the provider, 25000 by default;
  - `enabled`: `false` hides the AI and keeps the key.
- **Speed,** measured on 2026-10-04 and 2026-10-05:
  - OpenAI answers a flyer in 6 to 9 seconds for a few lines of staff text, and in 14 to 20 for a
    long one (a tour's whole programme, about a thousand characters): the answer is twice as long.
    The longest seen is 20.3 seconds, of the 25 the app waits. If long texts start to fail,
    `'effort' => 'low'` is the first thing to try;
  - Anthropic takes about 20 seconds the first time after a release that changed the shape of the
    answer, then 4 to 5. If staff see "The AI didn't answer properly" once and it works on the
    next try, that is why;
  - a picture read is the slow one (its seconds are with its model, above), the longest on a
    screenshot dense with small print. The page waits for as long as the app does,
    and says so meanwhile. A read that runs out of time is free, though it is one of the day's
    tries: the page keeps the picture and says "try again, or type the event yourself". If reads
    fail often, `timeoutMs` can go up, but never above the host's own limit (next point).
- **The host's own time limit** for a PHP request is not known on IONOS until the first call there.
  If the app shows the host's error page instead of its own message, the host cut the request
  off: `timeoutMs` must then go *down*, below the host's limit, so the app can answer for itself.

## Rolling back

Extract the previous release's zip (from the office drive) over the app folder, additively,
then paste the lock back at the top of `.htaccess`. Nothing else changes: the library and
`config.php` are not in any release. No rebuild and no laptop needed.

**Going back to an older release? Take out of `config.php` what that release does not know, first.**
A release refuses the whole file for a key that came after it: every request answers 503 "not set
up yet" until the key is gone. Keep the lines somewhere safe, away from the app folder, to put
them back later.

| Going back to a release built | Take out |
|---|---|
| with the picture read and without its page, "From a photo" | nothing: `'photo'` stays valid there. The page's second way in is gone until the newer release is back, and the server still reads a picture sent to it |
| without the picture read (every release up to 2026-10-06, `2ad58f28364e` included) | `models`, from the `ai` block, and `'photo'` from its `features` |
| on 2026-10-06 (`2ad58f28364e`) | `dailyLimits` as well |
| before 2026-10-06 | `dailyLimits`, `features` and `dailyLimit`, from the `ai` block |
| before 2026-10-03 | the whole `ai` block |

**A release without the picture read leaves the kept pictures where they are.** It does not know
`data/ai-pictures/`, so it deletes nothing there: delete the folder by hand if the site stays on
that release. Its reads stay in the ledger and count for nothing on the older release.

**Release `2ad58f28364e` has one limit for both features.** Going back to it, a `dailyLimit` is the
whole site's total again: 5 is 5 generations a day in all, not 5 of each.

**A release from 2026-10-03 to 2026-10-05 has one switch for both features.** With the provider and
its key still in the block it runs "Create with AI" as well as "Write with AI". If only the share
text should run, add `'enabled' => false` before going back to one: no AI at all until the newer
release is up again.

A release from before the This week template (2026-09-29) shows a week flyer as an Activity one,
and a Save or a Download there turns it into an Activity flyer. Its rows and title are kept:
reopen it in a newer release and switch it back to This week.

**A line of copy longer than the older release allows.** Two limits were raised, and a flyer saved
since may use the room:

| The line | Was | Is | Since the release built |
|---|---|---|---|
| The Spanish line under the headline | 140 | 260 | after 2026-10-09 |
| The tag in the pill ("¡TAG US!") | 12 | 24 | after 2026-10-12 |

Going back to a release from before one of them, a flyer whose line is longer than "Was":

- **On the host (the PHP release): it opens, and it cannot be saved.** The library lists it and the
  editor shows its copy whole. The older editor does not shrink the pill's letters, so a long handle
  and tag print at full size and can run past the safe margins. Save answers "Some fields are not
  valid." for that line (`data.text.tag`, `data.text.headlineEs`) until it is shortened, and so does
  every Download, which saves first.
- **On a Node machine: it is listed, and it does not open.** The library names it, its picture stays
  empty, and opening it answers "Something went wrong on the server.", on SQLite and on the JSON
  store alike. Node checks a flyer against its rules on every read.

Nothing is lost either way: the flyer is in the library as the newer release saved it, and opens
there again. Both halves are held by tests (`php/tests/BootstrapTest.php`,
`tests/storage/repositories.contract.ts`). The other way round needs nothing: a newer release reads
every older flyer.

## Locked out?

A wrong password hash, a wrong `AuthUserFile` path (every page then answers 500) or a host that
refuses the lock block can leave you unable to get in. Over SFTP, delete `config.php` and remove
the pasted block from the top of `.htaccess`. The app then answers "not set up yet" (503) to
everyone, which is safe. Start again at step 3. **Never** turn on `allowPublic` to get back in.

---

## Checking from the computer with the checkout

Everything the preflight page checks, and more, can be run against the deployment by a developer.
Put it in `.env` (see `.env.example`):

```sh
CONTRACT_BASE_URL=https://nestpass.ai/activities/
CONTRACT_BASIC_USER=staff
CONTRACT_BASIC_PASSWORD=…
```

**On a deployment in use**, run only the checks that change nothing:

```sh
npx vitest run -c vitest.contract.config.ts tests/contract/config.test.ts tests/contract/errors.test.ts tests/contract/security.test.ts tests/contract/lock.test.ts
```

That is the API's settings (including a red line if `config.php` says `allowPublic`), the error
answers, the deny rules on code, config and the library, and the lock on the page, the art and
the photos. `catalogue.test.ts` is deliberately left out: it compares the host's hostels with this
checkout's `seed/hostels.json`, so it fails whenever the two differ for a harmless reason (a
hostel added in one place first), and a check that cries wolf stops being run.

**The full suite** (`npm run test:contract`, `npm run test:php-smoke`) only on an **empty**
deployment, before the library goes in: it creates 21 flyers (18 from the contract suite, 3 from the
smoke test) that deleting only archives, and photos no endpoint can remove.

Remove the three lines from `.env` afterwards. While `CONTRACT_BASE_URL` is set, every test run
goes to the host, and each run says so at the start.

**The AI, with one real generation.** It spends one of the site's generations of that feature for
the day:

```sh
npm run ai:smoke -- --share --to https://nestpass.ai/activities/
```

`--share` asks for a share text ("Write with AI"); without it the script asks for a flyer ("Create
with AI"). It asks `api/config` first and stops, spending nothing, when:

- the site's release is from before the AI, from before its features had their own switches, or
  from before each had its own daily limit;
- the AI is off there;
- the site does not run the feature asked for (a flyer, on a site that runs the share text alone);
- that feature's day is used up.

Then it prints what the site's model wrote and how long it took. For a locked site the login comes
from `FLYERS_BASE_URL`, `FLYERS_BASIC_USER` and `FLYERS_BASIC_PASSWORD` in `.env`. The tokens are in
the site's `data/ai-usage/` file, which no address serves.

---

## Troubleshooting

| What you see | Why, and what to do |
|---|---|
| 500 on every page in the folder, the preflight page too (IONOS: 403, on its own page with a cookie banner) | the host refuses a line of `.htaccess`. Right after pasting a block, it is that block: take it out again (the lock's `<If …>` lines are the likely one). Right after an upload, put the previous release's `.htaccess` back and tell a developer |
| photos alone answer 500 | the same, in `uploads/.htaccess` (IONOS accepts it as shipped) |
| 503 `not_configured` | `config.php` is missing, has no access rule, or PHP could not read it (a typo): check it against the one the preflight page printed |
| 503 on everything right after going back to an older release | `config.php` has a key the older release does not know: `dailyLimits`, `features` or `dailyLimit` in the `ai` block, or the whole block. Take it out (*Rolling back* has the dates) |
| 503 right after adding or changing the `ai` block | the release is older than the key (`features` and `dailyLimit` need the release of 2026-10-06 (`2ad58f28364e`), `dailyLimits` the one after it: upload it first), or a typo in the block: a setting the sample does not have, a feature that is not `flyer`, `share` or `photo`, a `dailyLimit` that is not a whole number from 1 to 20, a `dailyLimits` that is not written `['share' => 10]` with such a number, or a value of the wrong kind. The reason names the setting, never its value. **It is in the host's own PHP error log** (the hosting panel's logs), not in `data/php-errors.log`: PHP's log moves into the data folder only once `config.php` has been read. "`ai.apiKey` must not hold spaces or line breaks" means the key was pasted with one: write it between single quotes, with nothing after its last character |
| nothing of the AI shows | the AI is off: `config.php` has no `ai` block, the block has no `provider`, no `apiKey` or no `features`, or it says `'enabled' => false`. A provider and its key alone run nothing: name the features. `GET api/config` shows `"ai": {"enabled": false}` |
| "✨ Write with AI" in the editor, but no "✨ Create with AI" on the bar | by design where `features` names `share` alone. `GET api/config` then lists one feature: `"features": [{"name": "share", "limit": 3, "remaining": 3}]` |
| "Create with AI" has no "From a photo" | `features` does not name `photo`, or the release is from before its page (the preflight page shows the release). `GET api/config` lists `photo` where the server runs it. Named without `flyer`, the read has no page at all |
| "Read the picture" shows fewer left than the day's limit, with no read made | failed reads: each is free and is one of the day's tries, three for each read of the limit. When the tries run low the button shows what is left of them. They come back at midnight, Canary Islands time, with the reads |
| "The AI didn't answer properly", every time | the provider refused or did not answer; nothing was counted. `data/php-errors.log` has the reason, on a line starting `Nest flyers: AI`: a wrong key (401), a timeout, an answer the app would not take, or "PHP has no curl extension" (the preflight page's *PHP extensions* line says so too: enable curl for this PHP version in the hosting panel) |
| the browser asks for the password twice, or signs in and the app then says "Sign in" | the `.htaccess` login and `config.php`'s `basicAuth` differ: make them the same user and password |
| signed in, but every save or load fails with "Sign in" | the host drops the Authorization header on its way to PHP: the preflight page's *Login* line says so. Ask the host (CGIPassAuth), or use `allowIps` in `config.php` |
| every save fails with "Something went wrong on the server" | usually `data/` is not writable. The real reason is only in the error log, and PHP can move its log into `data/` only when `data/` is writable, so look in the host's own PHP error log. `GET api/config` shows `dataDir.writable` and PHP's own error text; fix the folder's permissions (755, or 775) |
| the reason for a 500 | `data/php-errors.log`, downloaded by SFTP. It is never served over the web |
| photos cannot be uploaded, everything else works | no `gd` or `imagick`: `api/config` shows `imageProcessorError`. Enable gd for this PHP version in the panel |
| saving or deleting answers with an HTML page, not the app's message | a host firewall (ModSecurity) blocks `PUT`/`DELETE`, which the app needs: ask the host to allow them for this folder |
| the app works but data is downloadable | an FTP client hid the dotfiles: the preflight page and `api/config` name the missing ones |
| the app shows an old version after an update | the upload stopped halfway or went to the wrong folder: the preflight page shows the release id and names every file that differs |
| a PHP warning appears before the JSON, right after upload | `.user.ini` turns `display_errors` off, but PHP rereads it only every 5 minutes on CGI/FastCGI hosts. Wait, then reload |
| photos fail at a size the editor accepted | the host's `upload_max_filesize`/`post_max_size`; the preflight page and `GET api/config` report them. Raise them in `.user.ini` |
| flyers export in the wrong typeface | the fonts do not load: the preflight page's *Flyer fonts* line names them |
