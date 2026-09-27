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

- `release/php/` — the app, **392 files, 3.09 MB** (the build prints the current count, and
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

**1b.** If the page answers **500** *after* step 2 (and so does everything else in the folder),
the host refuses a line of the release's `.htaccess`. In the file manager, rename
`.htaccess-minimal` to `.htaccess` (replacing it), and `uploads/.htaccess-minimal` to
`uploads/.htaccess`, then reload. Ask the host to allow `Options` in `.htaccess` too: the full
files are the tested ones.

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
files by name. If a file is listed as missing or different, upload it again.

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
3. **The top of `.htaccess`** — open the app folder's `.htaccess`, paste both blocks **above
   everything else**, and save. They lock the editor page, the art and the photos, which
   `config.php` does not cover.

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
- *Connection* must be green: this page arrived over https, and `http://` sends visitors to
  `https://`.
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
```

`deploy:restore` refuses a deployment that already holds flyers or photos, or a different
`config.php`, unless you add `--force`. The drill in `tests/cross/restore-drill.test.ts` proves
backup → wipe → restore brings back a flyer and its photo byte for byte.

---

## Updating to a new release

1. Build and zip the new release (*Before you start*).
2. Take a backup.
3. Upload the new release additively (step 2). `config.php`, `data/` and `uploads/` are not in
   it, so they stay.
4. **The upload replaces `.htaccess`, and with it the lock you pasted.** Paste the two blocks at
   the top again right away (you kept them, or make them again on a fresh preflight page), and
   check in a private window that the editor page asks for the login.
5. Reload the app. If a release ever changes the store's format, the app says so rather than
   half-reading it.

## Rolling back

Extract the previous release's zip (from the office drive) over the app folder, additively,
then paste the lock back at the top of `.htaccess`. Nothing else changes: the library and
`config.php` are not in any release. No rebuild and no laptop needed.

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
deployment, before the library goes in: it creates 13 flyers that deleting only archives, and
photos no endpoint can remove.

Remove the three lines from `.env` afterwards. While `CONTRACT_BASE_URL` is set, every test run
goes to the host, and each run says so at the start.

---

## Troubleshooting

| What you see | Why, and what to do |
|---|---|
| 500 on every page in the folder, the preflight page too | the host refuses a line of `.htaccess` (usually `Options`): step 1b |
| photos alone answer 500 | the same, in `uploads/.htaccess`: rename `uploads/.htaccess-minimal` over it |
| 503 `not_configured` | `config.php` is missing, has no access rule, or PHP could not read it (a typo): check it against the one the preflight page printed |
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
