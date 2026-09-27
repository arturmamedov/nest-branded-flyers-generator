# Host facts

What each host answered, so the next deploy starts from facts rather than guesses. One column per
host. Fill a column from the preflight page (`docs/deploy.md`, steps 1–4) and from `GET api/config`
(its `server` block), signed in. Leave a cell empty rather than guessing.

The first column is the deploy rehearsal on this laptop (2026-09-23, report in
`docs/reports/php-port.md`, *Deploy rehearsal*). The IONOS column waits for the preflight page to
be uploaded there. It is one file with no write endpoint, so it can go up alone before the app
itself is ready to go live.

| | Laragon rehearsal (2026-09-23) | IONOS, `nestpass.ai/activities/` |
|---|---|---|
| Web server | Apache 2.4.57 (Win64), OpenSSL 1.1.1t | |
| PHP version and SAPI | 8.4.25, `apache2handler` (mod_php) | |
| `upload_max_filesize` / `post_max_size` / `memory_limit` | 5G / 5G / 2512M, so photos up to 15 MB (the app's own cap) | |
| `date.timezone` | UTC | |
| `display_errors` after the release | Off (the `.htaccess` `php_flag`, since this is mod_php) | |
| `open_basedir` | not set | |
| Image library and decodable formats | gd: jpeg, png, webp (no imagick) | |
| `data/` and `uploads/` take a real write | yes, both | |
| Error log | `data/php-errors.log` (moved there by the app); empty after the whole rehearsal | |
| `.htaccess` variant | the full file: `Options` allowed, `.htaccess-minimal` not needed | |
| Lock block accepted (`AuthType`, `RequireAll`, `Require expr`) | yes | |
| `http://` behaviour with the lock | 302 to `https://` via the `ErrorDocument` line; no `WWW-Authenticate` over http | |
| Anonymous over https: page, photo, API, `static/` | 401 each, with `WWW-Authenticate: Basic realm="Nest flyers"`; `release.json` 403 | |
| Which variable carried the login to PHP | `PHP_AUTH_USER` and `HTTP_AUTHORIZATION` (mod_php; the CGI path `REDIRECT_HTTP_AUTHORIZATION` was not exercised) | |
| `PUT` / `DELETE` reach the app | yes: our JSON 403 `Missing X-Nest-Flyers header.`, no firewall page | |
| Fonts | 25 of 25 `.woff2` served as `font/woff2` (the probe run over http; over https the server-side probe could not verify Laragon's self-signed certificate and fell back to the manual list, as designed) | |
| Server-side fetch from the preflight page | curl available; refuses the self-signed certificate over https | |
| `api/config` cost of the release check | about 90 ms per call (0.50 s against 0.41 s for `api/hostels`, time to first byte) | |
| Release in place | `5115b7ca1fdd` (`d4f1491`), 392 files, 3.09 MB | |
| Upload method | copied into place (FTP and zip extraction not exercised) | |
