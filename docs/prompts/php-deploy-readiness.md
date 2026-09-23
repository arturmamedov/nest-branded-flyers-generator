# Next: make the PHP port deployable by Artur alone, on a real shared host

You are picking this up in a fresh session. The PHP shared-hosting port is **finished** — the app is built,
tested and running on the owner's local Laragon Apache. This brief is about the gap between "it works on my
machine's Apache" and "Artur can put it on a real hosting account, locked, and get it back if it breaks."

Build it straight through. No approval gates: stop only for a decision that genuinely belongs to Artur, and
ask it with a recommended option so nothing is blocked waiting.

## Read first

1. `CLAUDE.md` — the project rules. **SOLID/DRY, one source of truth, substitutable implementations proven
   by contract tests. No speculative abstractions beyond real seams.** One renderer only.
2. `docs/reports/php-port.md` — what the port proved, and the list of what could not be verified here.
3. `docs/prompts/php-shared-hosting.md` (the original spec: Definition of done, Security, Out of scope) and
   `docs/prompts/php-shared-hosting-continue.md` (how phases 2–5 were built). Both are marked done.
4. `README.md` — "Deploy to shared hosting (PHP)" (≈ lines 164–273) and `docs/json-storage.md`.
5. The code this touches: `php/web/**`, `php/src/{Config,Bootstrap}.php`, `php/src/Http/{Kernel,AccessGuard,
   ApiConfig,Api}.php`, `php/src/Photos/UploadLimits.php`, `scripts/php/*.ts`, `scripts/build-php.ts`,
   `tests/contract/**`, `vitest.contract.config.ts`, `playwright.php.config.ts`.

## Where things stand

- **Branch `feat/php-shared-hosting`**, seven commits `7e8cd7a..8467964`, **never pushed**. `origin/main` is
  still `932084b`. Work here, one commit per phase, never push unasked.
- **The Laragon deployment** `A:\serverpath\laragon\nest-flyers-php\` runs the release with the real library
  (3 hostels, 14 doodles, 6 photos, 9 flyers) and `allowPublic => true`. It is verified at both
  `http://localhost/nest-flyers-php/` (subfolder) and `http://nest-flyers-php.test/` (domain root): 110
  contract tests and the browser smoke test on each. **Do not deploy into it, reset it or write to it** —
  phase 5 uses a fresh throwaway folder.
- **Never open `data/flyers.db`.** `npm run copy` snapshots the three SQLite files instead. Its sha256 is
  recorded in `docs/reports/php-port.md` and must still match at the end.
- `npm run typecheck && npm test && npm run test:contract && npm run test:render && npm run test:php` are
  green today. `release/php/` on disk is from 2026-09-22 and predates this work.

## Ask Artur in your first message (none of it blocks you)

Put these in one message with the defaults, then start on phase 1 regardless.

1. **Which account, which domain, and is there a working HTTPS certificate?**
   *Default:* assume cPanel + Apache/LiteSpeed + PHP ≥ 8.1 over HTTPS, and keep both URL shapes working —
   both are already verified. Do not put Basic auth on a host without TLS: the shared staff password would
   go over the wire on every request and every photo.
2. **Which access rule on deploy day: a shared staff password, the office's static IP(s), or both?**
   *Default:* a shared password as the primary (staff work from phones and from home; a dynamic office IP
   locks everyone out), set in **both** places — `basicAuth` in `config.php`, which guards the API, and the
   same credentials in cPanel Directory Privacy or the `access-examples` snippet in `.htaccess`, which is
   the only thing guarding the editor page, the art and the photos. Same user and password in both, or the
   staff member is challenged by Apache and then 401'd by the app anyway. Never `allowPublic` on a public
   host.
3. **Which library goes up: `./data/flyers.db`, or the JSON store the Laragon deployment has been running
   since 2026-09-22?** Has anything been made in either since?
   *Default:* start the host empty (hostels and doodles seed themselves on the first request), then move the
   library across once the app is green and locked. Copy from `./data/flyers.db` with `npm run copy`. Only
   Artur knows which one he has been using, and the copy overwrites its target.
4. **May the session create a throwaway deployment under Laragon's DocumentRoot** (e.g.
   `A:\serverpath\laragon\nest-flyers-rehearsal\`) and edit its `.htaccess`?
   *Default:* yes, delete it at the end. Blocks phase 5 only. Without it the Apache access snippets stay
   unexercised, and that paste is the only thing protecting the editor page, the art and every staff photo.
5. **Who downloads the backup, how often, to where?** Shared hosting has no cron, so this is a habit.
   *Default:* Artur, by FTP — `data/` + `uploads/` + `config.php`, right after the library goes up and
   weekly after that, to the office drive.
6. **The other 10 hostels:** exact printed name, island, a slug that will never change, and dropdown order.
   Do per-hostel logo files exist, or does everyone keep the teal Nests wordmark?
   *Default:* go live with the three that exist. PHP re-seeds whenever `seed/hostels.json`'s sha256 changes,
   on the next request, so adding them later is one file upload with no redeploy and no data loss — **but
   the slug is the flyer's foreign key**, so a slug guessed now and corrected later orphans every flyer
   tagged with it. Never invent names. Send them to the repo at the same time.
7. **Push `feat/php-shared-hosting` to GitHub?** Seven commits exist only on this laptop.
   *Default:* decide it **before** the app is live, not after — if this machine is lost, nobody can rebuild
   or update the deployed host. Nothing is pushed without an explicit yes (CLAUDE.md). Phase 4's on-host
   rollback is the partial mitigation if the answer is no.

## Facts already established — do not re-derive them

Fifty-six claims behind this plan were adversarially verified against the repo. These are the ones that
matter, including the seven that came back wrong and the corrections that follow from them.

**The lock has never been exercised over HTTP.** A grep of `tests/` for `not_configured|ip_forbidden|
unauthorized` returns nothing. Every refusal is a PHPUnit unit test against a constructed `Request`. The
one CLAUDE.md non-negotiable — "never publicly reachable without an access rule" — has zero end-to-end
coverage.

**The checks cannot sign in.** `tests/contract/client.ts` has no credential surface: its `ProvidedContext`
declares only `baseUrl` and optional `stageDir`, and `playwright.php.config.ts` sets no `httpCredentials`.
Two details to get right: `send()`'s 4th parameter defaults to the `X-Nest-Flyers` header but callers
override it (`errors.test.ts` drops it deliberately), and `send()` also sets `Content-Type` itself.

**A credential in the URL is not a workaround — it throws.** Verified on this machine, node v25.6.0:

```
fetch('http://user:pass@host/')  ->  TypeError: Request cannot be constructed from a URL that includes credentials
new URL('api/config', 'http://user:pass@host/')  ->  same throw
new Request(url, {headers: {Authorization: 'Basic …'}})  ->  works
```

So `CONTRACT_BASE_URL=https://user:pass@host/` fails on every request. An explicit `Authorization` header is
the only route, which makes phase 1 necessary rather than optional.

**`config.php` guards only the API.** `php/web/.htaccess` routes only `^api/` to PHP. `index.html`,
`assets/`, `static/` and `uploads/` are plain files served by the web server. A `.htaccess` access snippet
that silently does not apply leaves the editor, the art and every staff photo open **while the owner's own
browser works perfectly** — which is why phase 5 checks from an anonymous vantage.

**The access check runs before everything.** `php/src/Http/Kernel.php` runs it first in `handle()`, before
boot, body parsing, the write guard and routing. So `GET api/config` is a 503 on a host with no `config.php`
— the app cannot diagnose a host until it is configured, which is backwards on deploy night.

**`AccessGuard` reads only `REMOTE_ADDR`** for the IP rule; `X-Forwarded-For` is never consulted. It takes
credentials from `PHP_AUTH_USER`, then `HTTP_AUTHORIZATION`, then `REDIRECT_HTTP_AUTHORIZATION`, and
challenges with `WWW-Authenticate: Basic realm="Nest flyers"`.

**Still unverified: whether `php -S` populates `PHP_AUTH_USER` or passes `HTTP_AUTHORIZATION` through.**
Nothing in the repo exercises it. Settle this in the first ten minutes of phase 1 — if it does neither, the
Basic-auth-over-HTTP half moves to phase 5's Apache vhost.

**The release is 385 files and 3.08 MB** (measured, not the 3.8 MB an earlier draft said), with exactly
**eight security dotfiles**: `.htaccess`, `.user.ini`, and one `.htaccess` each in `data/`, `uploads/`,
`src/`, `seed/`, `schema/`, `vendor/`. FileZilla and most cPanel file managers hide dotfiles by default, and
a release that arrives without `data/.htaccess` is a working app whose whole library is downloadable —
nothing in the app, the browser or any existing test can tell. It also carries 25 `.woff2` files under
`static/`.

**Corrections to fold in — an earlier draft of this plan got these wrong:**

- **The password hash is *not* unobtainable without a shell.** `config.sample.php` says the hash comes from
  `password_hash()` "on any machine with PHP"; `README.md:194` shows calling `password_hash()` *inline
  inside `config.php`*, evaluated by the host's own PHP; and `access-examples/htaccess-basic-auth.txt`
  offers two no-shell routes — run `htpasswd` locally (it ships with Apache and Laragon, which Artur runs)
  and upload the file, or use the host panel's password-protect tool. **A hash generator is a convenience
  that avoids a plaintext password sitting in `config.php`, not a gap-filler.** Do not justify it as "he
  physically cannot do this."
- **Browser-level export proof for PHP already exists.** `tests/php-smoke/smoke.spec.ts` drives the real
  editor against PHP and downloads both PNG and JPG; `tests/render/fidelity.spec.ts` forces the client
  exporter and holds it to the server export. Budget *running* these, not writing them.
- **Five of PHP's seven `server` sub-keys are already pinned** — `tests/contract/php.test.ts` requires
  `php`, `upload_max_filesize`, `post_max_size`, `memory_limit`, `imageProcessor`, and
  `php/tests/Http/ApiTest.php` asserts the exact key list *and order*. Only `formats`, the conditional
  `imageProcessorError` and Node's `node` can be renamed unnoticed. Renaming any of the others means
  editing those tests.
- **Only `vendor/` is fatal to `api.php`.** Its buffer-flush and `display_errors` lines run before the
  `require`, and a release missing `schema/` or `seed/` still answers — `Bootstrap` catches and returns a
  bare 500. The static editor page serves regardless. A standalone diagnostic file is still justified
  (it must answer before `config.php` exists and before `vendor/` lands), but not by "any missing file
  kills the app."
- **Do not propose deleting `.htaccess`'s `Options -Indexes -MultiViews`.** Its own comment records the
  opposite decision and names three override classes — Options, FileInfo **and** AuthConfig/Limit — so
  dropping Options alone is not a reliable cure for a 500 on a restrictive host.
- **`router.php`'s deny regex covers `.*\.log`, `.*\.md` and `\.ht.*`, which `RELEASE_LAYOUT` does not** —
  but generating it from the layout would expose only the *root* `.htaccess` and stray `.log`/`.md` files:
  `data/.htaccess` stays denied by the denied-dirs check and `uploads/.htaccess` by the images-only rule.
  Still: leave the regex hand-written, and keep `security.test.ts` as the drift gate.
- **Staff see a generic JSON error, not a blank 500.** `Kernel` answers
  `{code:'server_error', message:'Something went wrong on the server.'}`, which the editor shows as a
  banner. The real cause (an unwritable `data/`) exists only in the error log. Work here means
  distinguishing storage failures with a dedicated error key, not building error display.
- **`Config`'s `dataDir` guard leans on `DOCUMENT_ROOT`.** It always refuses a `dataDir` under the app root
  other than `data/` (and below), but refuses one elsewhere under the document root only when the server
  reports `DOCUMENT_ROOT`. Where that is absent, a sibling folder inside `public_html` passes.
- **`npm run build:php`'s staleness gate also covers the generated error table in `docs/api-contract.md`,**
  not just `schema/` and `seed/`. Hand-edit that table and the release build aborts with "Run npm run gen
  first". Conversely, not every `src/shared` edit needs a regen: only
  `{errors,limits,samples,defaults,schema,seed,storage}.ts` feed generated files.
- **`README.md` also documents the Node/VPS deploy** (≈ lines 115–162, plus `deploy/nest-flyers.service`
  and `deploy/nginx.conf.example`). Anything that moves the PHP deploy steps into `docs/deploy.md` must say
  what happens to that section, or the README ends up with two divergent deploy stories.
- **The README's check commands use the POSIX inline env form** (`CONTRACT_BASE_URL=… npm run …`), at
  line 211–212 and in the table at line 70. On Windows that works in Git Bash and fails loudly in
  PowerShell and cmd (`'CONTRACT_BASE_URL=…' is not recognized`, exit 1, npm never runs) — a documentation
  papercut, **not** a silent false green. The PowerShell form is
  `$env:CONTRACT_BASE_URL='http://…/'; npm run test:contract`, which is how the port was verified.

**Other facts worth having:** there is no photo DELETE route, so a photo uploaded by a test can never be
removed through the API; the contract suite creates 13 flyers and DELETE only soft-archives, so the full
suite runs against an **empty** deployment only; `catalogue.test.ts` compares the deployment to *this
checkout's* `seed/hostels.json`, so it fails the day Artur's extra hostels reach the host for a reason that
has nothing to do with the host; `php.test.ts` pushes a body the size of the host's `post_max_size`;
`config.test.ts`, `errors.test.ts` and `security.test.ts` are non-mutating and safe against a live
deployment; `scripts/php/reset-deploy.ts` exists and is guarded but is in no npm script; there is no backup
or restore script; `.user.ini` is cached for `user_ini.cache_ttl` (300 s) on CGI/FPM, so the shipped
`display_errors = Off` is not in effect for the first few minutes after upload — exactly the window in
which a printed warning corrupts the first JSON the owner sees.

---

## Phase 1 — Prove the refusal over HTTP, and let the checks sign in

**Goal:** turn "never publicly reachable without an access rule" from an untested claim into a
regression-protected property, and make every remote check runnable against a host that is actually locked.

**First ten minutes, before writing a test:** determine whether `php -S` fills `PHP_AUTH_USER` or passes
`HTTP_AUTHORIZATION` through. If neither, the Basic-auth-over-HTTP half moves to phase 5's Apache vhost.
Decide it now, not at the end of the phase, and record the answer as a comment in the new test file.

**Work:**

- **`scripts/env.ts`:** move `parseDotEnv` out of `scripts/php/phpBin.ts` (which re-exports it, so `PHP_BIN`
  resolution is unchanged) and give `CONTRACT_BASE_URL`, `CONTRACT_DEPLOY_DIR`, `CONTRACT_BASIC_USER` and
  `CONTRACT_BASIC_PASSWORD` the same environment-then-`.env` fallback. Add all four to `.env.example`,
  which has no `CONTRACT_*` entries today.
- **`tests/contract/client.ts`:** add `basicAuth?: {user, password}` to `ProvidedContext` and merge an
  `Authorization: Basic` header in `send()`. Keep `WRITE` overridable — with an ambient credential the
  `X-Nest-Flyers` header becomes the only CSRF defence, so the write-guard tests must keep working.
  `security.test.ts` fetches directly, bypassing `send()` — route it through the same client so no probe
  goes out unauthenticated by accident. `playwright.php.config.ts` gains `use.httpCredentials` from the
  same loader.
- **`scripts/php/serve.ts`:** widen `writeTestConfig(stage, dataDir)` with an access posture —
  `'loopback-ips'` (today's exact output, so existing callers are unchanged), `'basic'`, `'excluded-ips'`
  and `'none'` (no `config.php` at all). One function, not a forked copy. `assertInTmp` already refuses to
  write outside `os.tmpdir()`.
- **New local contract project `php-access`** in `vitest.contract.config.ts`, modelled on `cross`, with
  `tests/access/*.test.ts` — the first over-HTTP refusal proofs in this repo: anonymous → 401 with the
  challenge; wrong password → 401; wrong user → 401; correct credentials → 200 parsed with
  `ApiConfigSchema`; no `config.php` → 503 `not_configured` on a read **and** on a write; an `allowIps`
  stage excluding loopback → 403 with no challenge; and an `X-Forwarded-For` claiming an allowed address
  does **not** get in.
- **Negative control**, performed once and recorded in the commit message: comment out the access check in
  `Kernel::handle()`, confirm the new 401/503 tests go red, restore it. It is the only cheap proof the new
  tests test anything.
- Fix the README's Windows env form while you are here (both line ~70 and the fenced block at ~211).

**Gate:** `npm run typecheck && npm test && npm run test:contract` green with `php-access` among the local
projects; a grep of `tests/` for `not_configured|ip_forbidden|unauthorized` now returns hits; the negative
control performed and restored; the `php -S` credential question answered in writing. One commit.

## Phase 2 — The release says which build it is, and `api/config` says what the host is

**Goal:** make the one upload failure that does not announce itself — a missing dotfile — detectable, and
make the host's facts readable without inventing a new web surface.

**Work:**

- **`scripts/php/manifest.ts`:** over a staged release write `release.json` —
  `{version, builtAt, commit?, files: {path: {bytes, sha256}}}`, excluding itself. Call it from `stagePhp`,
  so the contract stage, the smoke stage and `release/php` all carry one and the reader is exercised on
  every test run.
- **Deny `release.json` in all three enforcers**: `RELEASE_LAYOUT.deniedFiles`, the `FilesMatch` in
  `php/web/.htaccess`, and `router.php`'s regex. `security.test.ts` then probes it automatically.
- **`php/src/Diagnostics/HostFacts.php`** — the host's facts in one place: PHP version and
  `php_sapi_name()`; the extensions the app cares about (json, gd, imagick, exif, fileinfo);
  `UploadLimits::fromIni(...)->diagnostics()`; the image processor and which accepted photo types it can
  actually decode; `open_basedir`; `date.timezone`; the resolved data and uploads dirs with `is_writable`
  and the real exception text from an actual temp write; the error-log path; `release {version, builtAt,
  commit}` with the manifest verdict (missing/changed, the eight dotfiles named); and `accessRule` —
  `allowPublic | allowIps | basicAuth | none`.
- Move `imageDiagnostics()`/`canRead()` out of `ApiConfig` into `HostFacts` and have `ApiConfig` delegate —
  one implementation, not a second copy. Remember that five `server` sub-keys are pinned by
  `tests/contract/php.test.ts` and `php/tests/Http/ApiTest.php` (exact list *and* order): update those
  tests deliberately rather than discovering it from a red run.
- `api/config`'s `server` block gains those facts. **No new top-level key, no schema change, no `npm run
  gen`** — `server` is already free-form. One line of `docs/api-contract.md` describes it.
- **One contract row that earns its keep:** when the backend is PHP, `server.accessRule` is present, and a
  run whose host reports `allowPublic` fails with a named message. That is the single setting that turns
  the non-negotiable into a breach.

**Gate:** `npm run gen` a no-op and `tests/unit/generated.test.ts` green; `npm run test:php` and
`npm run test:contract` green with `security.test.ts` now probing `release.json`; `npm run build:php` writes
`release/php/release.json`; deleting one ordinary file and one dotfile from a stage makes `HostFacts` name
exactly those two and nothing else; `api/config` on a stage reports the release version and the access-rule
kind. One commit.

## Phase 3 — `nest-preflight.php`: one file the owner uploads before the other 385

**Goal:** give Artur — who has FTP, cPanel and a browser — a single URL that says whether the account is
usable, and shows him his own site from the outside.

**Why it must be standalone:** `api.php` requires `vendor/autoload.php`, and the access check runs before
everything, so `api/config` is a 503 until `config.php` exists. Neither can answer on a bare account. This
file diagnoses the **account**, before the big upload is worth attempting, and it is the artifact Artur can
paste to the host's support.

**Work:**

- **`php/preflight/nest-preflight.php`** — one self-contained file: no `vendor/autoload.php`, no
  `NestFlyers` class, no CDN, inline styles only.
- `scripts/build-php.ts` copies it to `release/nest-preflight-<random>.php`, **beside** `release/php`, never
  inside it: the URL is then unguessable, a re-upload of the release cannot resurrect it, and it never
  appears in the manifest. It holds no write endpoint of any kind, which is why it needs no access gate.
- **What it reports**, each as pass/warn/fail with one sentence and what to do: PHP version and SAPI; the
  five extensions; `upload_max_filesize` / `post_max_size` / `memory_limit` against the app's 15 MiB;
  `open_basedir`; whether its own folder is writable; `date.timezone` (flyer `updatedAt` is the library's
  sort key); whether the request arrived over HTTPS and whether the `http://` URL redirects to it; and
  **which of `PHP_AUTH_USER` / `HTTP_AUTHORIZATION` / `REDIRECT_HTTP_AUTHORIZATION` carried credentials**
  when Artur reloads it behind a password — that single line closes the CGI/FPM Authorization hand-off the
  report lists as unverifiable without a real host.
- **The password step** — type a password once, get back the `config.php` `access` block with
  `passwordHash` already filled, and the matching `.htpasswd` line or `.htaccess` snippet. Printed only:
  nothing stored, nothing written, the password never reaches disk or the error log. This is a
  *convenience* that keeps a plaintext password out of `config.php` — the hash is obtainable without it
  (see the corrections above) — so do not build a "write `config.php` for me" button. By construction such
  a button would run only while no lock exists, so whoever loaded the page first would set the password.
- **The outside vantage**, run after the release is up: the file fetches its own public URL with **no**
  credentials — `index.html`, `api/config`, one `uploads/` path, one denied path. A 200 on the shell or a
  photo is a red line. Both curl and `allow_url_fopen` are commonly disabled on shared hosting, so the page
  **always** also prints the three URLs to open in a private window, and the runbook words that as the
  instruction with the server-side probe as the bonus.
- **The fonts probe**, because the deliverable is the exported flyer and not the page: read the font URLs
  out of the built CSS under `static/`, fetch each, require 200 and a font content type. A host that 404s
  them produces a flyer that renders, fits and downloads at exactly 1080 × 1920 **in the wrong typeface**,
  silently. (The php contract stage is built `dist: false`, so it has no `static/` — this probe belongs
  here or against a dist-backed stage, not in that project.)
- **The manifest check:** read `release/php/release.json` from disk and name missing or changed files, with
  the eight dotfiles listed by name.
- **Ship `php/web/.htaccess-minimal`** in the release — rewrite + `FilesMatch` only, no `Options`, no
  `php_flag`. Where the host's `AllowOverride` rejects a directive, Apache rejects the whole directory and
  `index.html`, `api.php` and the preflight page all answer 500 together. The runbook's step 1b becomes
  "if every page is 500, rename `.htaccess-minimal` over `.htaccess` and reload". Keep the original's
  `Options` line and its comment intact — the fix is to ask the host, and the minimal file is the fallback.
- Document the preflight file as **Apache/LiteSpeed only**, and add one `location` line beside the README's
  nginx block: that block deliberately has no generic `location ~ \.php$`, so on nginx a root-level `.php`
  file is served as source at exactly the moment it is needed.
- **PHPUnit for every pure part with the fetch injected**, so no test touches the network: parse the printed
  `config.php` text back through `Config::fromArray()` and check the hash with `password_verify` — the DRY
  proof that what the page prints is exactly what the app accepts — plus the ini parsing and the manifest
  comparison.

**Gate:** `npm run test:php` green with the new tests; the file renders from a fresh `php -S` stage with no
`vendor/` present at all; a password typed into it yields a `config.php` that the phase-1 `basicAuth` stage
accepts, letting those credentials in and refusing wrong ones; the fonts probe goes red when one `.woff2` is
renamed in a dist stage; `npm run build:php` emits `release/nest-preflight-<random>.php` beside
`release/php` while `release/php` itself still passes its completeness assertion. One commit.

**Phases 1–3 are the realistic session.** If time runs short, phases 4 and 5 become the next brief — the
repo is better after each one.

## Phase 4 — The runbook, the rollback, and a restore that has been rehearsed

**Goal:** leave one owner-facing page someone who has never opened this repo can follow from build to a
locked, working app — and make "copy `data/` and `uploads/` back" a tested claim instead of a sentence.

**Work:**

- **`docs/deploy.md`**, numbered and owner-facing, as the single copy. Trim the README's PHP deploy section
  to a pointer plus the developer-only bits (`npm run build:php`, `npm run copy`, the nginx block). One
  copy of each step — do not leave both. **Say explicitly what happens to the README's Node/VPS deploy
  section** so the README does not end up telling two stories.
- **The steps:** (0) download `data/` and `uploads/` from the host first, if anything is there; (1) upload
  `nest-preflight-<random>.php` **alone** and open it; (1b) if every page answers 500, rename
  `.htaccess-minimal` over `.htaccess`; (2) upload the release — zip `release/php` in Explorer and Extract
  it with the host's file manager, or FTP the contents **additively**, never a mirror/sync-with-delete
  mode, which deletes exactly the `config.php`, `data/` and `uploads/` the release deliberately omits, and
  with **hidden files shown**, because the eight dotfiles are the entire security posture; (3) reload
  preflight, type a password, paste the printed `config.php` and the `.htaccess` access block plus the
  force-https snippet; (4) reload until the outside-vantage lines are green, or open the three URLs in a
  private window; (5) open the app, make a flyer, download the PNG; (6) delete the preflight file;
  (7) download the first backup.
- **State the measured size** — 385 files, 3.08 MB — because file-manager caps and FTP timeouts go by size,
  not file count.
- **Rollback on the host:** upload each release into `release-<version>/` and swap by rename, or keep the
  uploaded zip on the host (denied by the same `FilesMatch`). Recovery is then a rename in the file
  manager rather than a rebuild from this laptop — which matters while the branch is unpushed.
- **Lockout recovery**, two sentences that prevent the worst outcome: a wrong hash, a wrong `AuthUserFile`
  path or an `AllowOverride` that rejects `AuthConfig` leaves Artur locked out with no shell. The way back
  is to delete `config.php` over FTP — everything then answers 503, which is safe, not broken — or to
  remove the pasted `.htaccess` block. Without this the tempting fix is `allowPublic`.
- **cPanel Directory Privacy, explained rather than mentioned:** it and `config.php`'s `basicAuth` are two
  separate challenges. Same user and password in both, or set only `allowIps` in `config.php` when
  Directory Privacy carries the lock — otherwise the staff member is prompted by Apache and then 401'd by
  the app anyway, which reads as "the app is broken".
- **`php/web/access-examples/htaccess-force-https.txt`** (redirect + optional HSTS), referenced from
  `config.sample.php` and the Basic-auth example: `php/web/.htaccess` contains no HTTPS rule at all, so
  Basic auth as shipped puts the shared staff password on the wire on every request and every photo load.
  Plus `php/web/robots.txt` (`Disallow: /`) — `stage.ts` copies `php/web` wholesale, so it ships for free.
  Add both to `build-php.ts`'s required list so that list stays honest.
- **The safe post-deploy re-check**, as a named file list rather than a new vitest project:
  `npx vitest run -c vitest.contract.config.ts tests/contract/config.test.ts tests/contract/errors.test.ts
  tests/contract/security.test.ts`. Leave `catalogue.test.ts` out of the default list **and say why** — it
  compares the deployment to this checkout's seed file, so it cries wolf the day Artur's extra hostels
  reach the host, and a check that cries wolf once stops being run. Warn that the full suite creates 13
  flyers that DELETE only soft-archives, and photos no endpoint can ever remove, so the full suite runs
  against an **empty** deployment only.
- **`scripts/php/backup-deploy.ts` and `restore-deploy.ts`** (`data/`, `uploads/` and `config.php` out to a
  timestamped folder and back), guarded exactly as `reset-deploy.ts` is. Wire backup, restore and the
  already-written but unreachable reset into `package.json` as `deploy:backup` / `deploy:restore` /
  `deploy:reset` — `reset-deploy.ts` is in no npm script today, so it is a tool Artur will never find at
  the moment he needs it.
- **An automated restore drill:** stage a deployment, create a flyer, upload a photo, back up, reset,
  restore, and assert the flyer lists and the photo loads.
- **Troubleshooting rows the README lacks:** `data/` not writable (the real exception is flattened into the
  generic `server_error` banner, and the log cannot be redirected until `data/` is writable, so the
  explanation goes to the host's default log); `php-errors.log` lives *inside* the denied data folder —
  fetch it by FTP; no gd/imagick (uploads fail, everything else works, `api/config` reports
  `imageProcessorError`); a firewall answering PUT/DELETE with HTML; an FTP client that hid the dotfiles;
  a stale release; and `.user.ini`'s 300 s cache on CGI/FPM.

**Gate:** `docs/deploy.md` carries every deploy step exactly once and the README repeats none of them;
`npm run build:php` succeeds and the release contains `robots.txt`, `htaccess-force-https.txt` and
`.htaccess-minimal`; `deploy:backup`, `deploy:restore` and `deploy:reset` all run from npm; the restore
drill passes from a wiped deployment; `npm run typecheck && npm test && npm run test:contract && npm run
test:php` green. One commit.

## Phase 5 — Rehearse it on real Apache, then write down what the host answered

**Goal:** execute `docs/deploy.md` literally against a live Apache with a real password, fix the document
wherever reality differs, and leave a committed record so the next session does not re-discover it.

**Work:**

- **Rebuild the release first.** `release/php` on disk predates all of this, and `build-php.ts` refuses to
  build against stale generated files. Confirm the interpreter and `composer.phar` before starting.
- **Deploy into a new folder** under Laragon's DocumentRoot (owner question 4). Never
  `A:\serverpath\laragon\nest-flyers-php\`, and never open `data/flyers.db`.
- **Follow `docs/deploy.md` literally**, changing nothing the rehearsal does not prove wrong. Start with
  the preflight file alone, exactly as Artur will.
- **Paste `access-examples/htaccess-basic-auth.txt` into that deployment's live `.htaccess`** with an
  `AuthUserFile` outside the web root, and set `config.php` to `basicAuth` only — no `allowPublic`, no
  `allowIps`. Then prove **both** layers from a vantage that genuinely carries no credential: `GET /` (the
  editor shell), one `uploads/` photo URL and `api/config` must all answer 401, and the password must let
  all three in. This has never been done, and `.htaccess` routes only `^api/` to PHP, so that paste is the
  only thing protecting the shell, the art and every photo.
- **Run the checks the way Artur will**, from the new `.env`-backed variables: the full contract suite and
  `npm run test:php-smoke` with `CONTRACT_BASE_URL` + the Basic credentials + `CONTRACT_DEPLOY_DIR` pointing
  at the rehearsal folder, so `security.test.ts`'s planting block actually runs instead of skipping. Full
  suite against the **empty** deployment only; then `deploy:reset`; then copy the library in.
- **If Laragon can serve PHP as FastCGI/CGI here** (unverified), repeat one authenticated request that way
  — the only local chance to exercise `REDIRECT_HTTP_AUTHORIZATION`, the path most cPanel hosts use. If it
  cannot, record it as still open and leave it to the preflight page on the real host.
- **`npm run copy`** into the rehearsal folder; record `data/flyers.db`'s sha256 before and after and show
  it unchanged. Then prove the way back: copy that JSON store into a scratch SQLite file and compare counts
  (hostels, doodles, photos, flyers including archived). **No JSON → SQLite return trip has ever been run.**
- **The last gate, which no server-side check covers:** open the rehearsal in Chrome, make a flyer and
  download a PNG at exactly 1080 × 1920 in the right typeface. PHP reports `exporters: ['client']`, so the
  render happens in the staff member's own browser — every other line can be green while the actual
  deliverable fails. (`npm run test:php-smoke` and the fidelity suite already automate this; run them, then
  look with your own eyes.)
- **`docs/reports/host-facts.md`**, a committed template the rehearsal fills in and the real host fills in
  later: PHP version and SAPI, the three ini limits, timezone, image library and decodable formats, whether
  PUT/DELETE survived, whether Authorization reached PHP, whether `Options` was allowed and which
  `.htaccess` variant is in place, the release version and the date.
- **Correct `docs/deploy.md`** wherever a step was wrong; append a "Deploy rehearsal" section to
  `docs/reports/php-port.md` and move what this session closed out of "Not verified here", leaving each
  genuinely host-blocked item with the single URL or command that closes it; shrink CLAUDE.md's open-items
  list to what is still genuinely open. Delete the rehearsal folder.

**Gate:** from a cold empty folder every step of `docs/deploy.md` was performed in order and produced the
answer the document promises — preflight green, anonymous 401 on the shell, on a photo URL and on the API,
the password lets the editor in, the deny probes and the planted files answer 403/404 with no `EXECUTED`,
the suites pass with credentials, the library copies in and shows the real flyers, `flyers.db`'s sha256
unchanged, the JSON → SQLite return trip matches counts, and a PNG downloaded in Chrome is exactly
1080 × 1920 in the right typeface; `docs/reports/host-facts.md` filled in and committed. One commit.

## Out of scope

- Handoff build **steps 7, 8 and 9** — per-element drag/nudge, the This week template, the doodle picker
  and icon uploads. On hold. Nothing here touches `src/flyer/`, `layout.ts` or `defaults.ts`, and no pixel
  of the output changes.
- **Inventing, guessing or reordering hostel names**, and per-hostel logo artwork. The plumbing already
  works end to end and PHP re-seeds from an uploaded `seed/hostels.json`, so this stays a one-file upload
  once Artur supplies names.
- A hand-written zip writer. Right-click → *Send to → Compressed folder* gives the identical one-transfer
  outcome for zero new code. The safety property lives in `release.json` and the preflight check, not in
  the archive.
- Moving `RELEASE_LAYOUT` into `src/shared` or generating `router.php`'s deny regex from the layout. DRY
  that buys nothing on deploy day and, as written, would drop the `\.ht.*`, `.log` and `.md` denies.
- A strict `version` key in `ApiConfigSchema`. The same information goes into the already free-form
  `server` record for one file's worth of change.
- A "write `config.php` for me" button, or any write endpoint on the preflight page.
- A planting endpoint on any web page. Planting stays in `security.test.ts` behind `CONTRACT_DEPLOY_DIR`.
- A two-implementation `Planter` interface, a read-only remote vitest project, a `SAFE_CONTRACT_FILES`
  constant or a `CONTRACT_READONLY` switch — seams invented for one prospective caller.
- A permanent `doctor.php` inside the release: a new unauthenticated entry point that cannot answer until
  the whole upload has landed, is served as source on the documented nginx setup, and never expires.
- A photo-delete endpoint, an orphan-photo pruner, a flyer restore route or an archived view.
- **A real login, user accounts, sessions or attribution.** No login is a CLAUDE.md non-negotiable, and a
  sign-in route would have to be exempted from the access check that runs before routing. If Artur wants
  one, that is its own brief.
- Brute-force protection, failed-attempt logging, flyer versioning, etags or concurrent-edit warnings.
- Opening, editing or repairing `data/flyers.db` with any tooling, and any read or write to the deployment
  at `A:\serverpath\laragon\nest-flyers-php\`.
- Verifying the nginx snippet, Imagick, LiteSpeed, PHP-FPM/CGI, ModSecurity, `open_basedir` or
  `AllowOverride` on a real account. Everything here makes the host **report** those rather than claiming
  them; they stay open until an account exists.
- A PDO/MySQL driver, thumbnails, search, pagination, touch support, backup automation, and the Node/VPS
  deploy path.
- **Pushing any branch or opening a PR.** One commit per phase on `feat/php-shared-hosting`, nothing more.

## Done means

- `npm run typecheck && npm test && npm run test:contract && npm run test:render && npm run test:php` green,
  with the new `php-access` project among them.
- The app refuses an unauthenticated request over real HTTP, proven by a test that has been seen to fail.
- `npm run build:php` produces a release that carries its own manifest and a preflight file beside it.
- `docs/deploy.md` has been followed literally, from a cold folder, by someone who then fixed it.
- `docs/reports/host-facts.md` exists and is filled in for the rehearsal.
- Artur can deploy to a real account with FTP, a browser and that one page — and get the library back if it
  goes wrong.
