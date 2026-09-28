# Host facts

What each host answered, so the next deploy starts from facts rather than guesses. One column per
host. Fill a column from the preflight page (`docs/deploy.md`, steps 1–4) and from `GET api/config`
(its `server` block), signed in. Leave a cell empty rather than guessing.

The first column is the deploy rehearsal on this laptop (2026-09-23, report in
`docs/reports/php-port.md`, *Deploy rehearsal*). The IONOS column comes from the preflight page and
`api/config` on the live app (2026-09-28), with no lock on yet (the owner's decision until the real
login). The rows about the lock stay open until one is on; the *Login* row is the one that matters.

| | Laragon rehearsal (2026-09-23) | IONOS, `nestpass.ai/activities/` (2026-09-28) |
|---|---|---|
| Web server | Apache 2.4.57 (Win64), OpenSSL 1.1.1t | Apache (version not shown), behind IONOS's front layer (`x-ws-*` headers); HTTP/2 over https |
| App folder on disk | `A:\serverpath\laragon\nest-flyers-rehearsal\` | `/homepages/NN/dNNNNNNNNN/htdocs/subdominios/nest.ai/activities` (the account digits are left out here; the preflight page prints them) |
| PHP version and SAPI | 8.4.25, `apache2handler` (mod_php) | 8.4.24, `cgi-fcgi` (FastCGI) |
| `upload_max_filesize` / `post_max_size` / `memory_limit` | 5G / 5G / 2512M, so photos up to 15 MB (the app's own cap) | 64M / 64M / -1 (no limit), so photos up to 15 MB |
| `date.timezone` | UTC | Europe/Berlin (the app stores UTC regardless) |
| `display_errors` after the release | Off (the `.htaccess` `php_flag`, since this is mod_php) | Off (FastCGI: `php_flag` does not apply, the release's `.user.ini` does) |
| `open_basedir` | not set | not set |
| Image library and decodable formats | gd: jpeg, png, webp (no imagick) | gd: jpeg, png, webp (no imagick; exif and fileinfo present) |
| `data/` and `uploads/` take a real write | yes, both | yes, both |
| Error log | `data/php-errors.log` (moved there by the app); empty after the whole rehearsal | `data/php-errors.log` (moved there by the app) |
| `.htaccess` variant | the full file: `Options` allowed, `.htaccess-minimal` not needed | the full root file is refused: every URL, photos included, answered 403 with IONOS's own error page (a cookie banner). The likely line is `Options -Indexes -MultiViews`, since the shipped `uploads/.htaccess`, with `Options -Indexes -ExecCGI`, is accepted. Before, the root `.htaccess` was a hand-edited older copy with `Options`, the `php_flag` blocks and the `mod_rewrite` guard commented out, so newer rules such as the `release.json` deny were missing. What works is the `.htaccess-minimal` rules (rewrites, headers, `FilesMatch`) with the https redirect on top. Since 2026-09-28 that is the release's only root `.htaccess` |
| Lock block accepted (`AuthType`, `RequireAll`, `Require expr`) | yes | not tried (no lock yet) |
| `http://` behaviour with the lock | 302 to `https://` via the `ErrorDocument` line; no `WWW-Authenticate` over http | not tried. Without a lock, `http://` answered 200 until 2026-09-28, on the whole domain (`http://nestpass.ai/` too); the app's own redirect now answers 301 to `https://` |
| Anonymous over https: page, photo, API, `static/` | 401 each, with `WWW-Authenticate: Basic realm="Nest flyers"`; `release.json` 403 | 200 each (no lock, `allowPublic`). `release.json`, `composer.json`, `src/`, `vendor/`, `data/`, `.htaccess`, `.user.ini` 403 (`release.json` answered 200 under the older `.htaccess`); `static/` 404 (the listing rewrite); a wrongly-cased name gets a 301 to the real one, or a 300 listing names only (`Release` offers `release.json`, which is 403) |
| Content negotiation (MultiViews) | not enabled | on, and `Options -MultiViews` is refused. So `api/…` reaches `api.php` by negotiation before the rewrite runs (it works), and `REQUEST_URI` reads `api.php/…` by the time the rewrites run. So the https redirect takes the address from the request line. A denied file is never served under its bare name (`release`, `config`, `composer`, `router`: 404) |
| Which variable carried the login to PHP | `PHP_AUTH_USER` and `HTTP_AUTHORIZATION` (mod_php; the CGI path `REDIRECT_HTTP_AUTHORIZATION` was not exercised) | not known until a lock is on: the question this host has to answer, under FastCGI |
| `PUT` / `DELETE` reach the app | yes: our JSON 403 `Missing X-Nest-Flyers header.`, no firewall page | not tried |
| Fonts | 25 of 25 `.woff2` served as `font/woff2` (the probe run over http; over https the server-side probe could not verify Laragon's self-signed certificate and fell back to the manual list, as designed) | 25 of 25 load as fonts (the preflight's server-side probe, over https) |
| Server-side fetch from the preflight page | curl available; refuses the self-signed certificate over https | curl available; fetches the app's own https address |
| `api/config` cost of the release check | about 90 ms per call (0.50 s against 0.41 s for `api/hostels`, time to first byte) | none measurable: 0.36–0.47 s against 0.33–0.41 s for `api/hostels` (time to first byte, 4 of each) |
| Release in place | `5115b7ca1fdd` (`d4f1491`), 392 files, 3.09 MB | `56b82bc7cab3` (`e2c60be-dirty`, built 2026-09-28): every file as shipped except the root `.htaccess` |
| Upload method | copied into place (FTP and zip extraction not exercised) | |
