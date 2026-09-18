# API contract

This is the seam between the one frontend and its backends: Node (`server/`, SQLite or JSON storage) and PHP (`php/`,
JSON storage). Both implement exactly this. The judge is the HTTP contract suite, `tests/contract/`, which runs against
every backend (`npm run test:contract`), or against a deployment with `CONTRACT_BASE_URL`.

The shapes are zod schemas in `src/shared/schema.ts` (`FlyerInputSchema` for requests, and the `…Schema` response
objects). The contract suite parses every answer with them, so a backend cannot add, drop or retype a field unnoticed.
PHP validates requests against the generated `schema/flyer.schema.json`.

## Conventions

- **Everything is relative to the app root.** That covers `api/…` for the API, `assets/…` for built-in art and logos,
  and `uploads/…` for photos. The app may live at a domain root or in a subfolder, so the frontend resolves every path
  against `document.baseURI` (`src/flyer/urls.ts`). URLs in responses have no leading slash.
- **JSON in, JSON out.** Responses are `application/json`, except the 204 and the export download. Request bodies up
  to 1 MB, sent as `Content-Type: application/json`.
- **Timestamps** use `toISOString()` form: UTC, milliseconds, `Z` (`2026-09-18T12:31:27.522Z`).
- **Ids** are positive integers. Nothing is ever hard-deleted, so ids are never reused.
- **Order of checks** for every `api/` request:
  1. access (PHP only, see below);
  2. parse the JSON body (a malformed one is 400 `malformed`);
  3. the write guard;
  4. route matching;
  5. the route's own checks.

## Write guard

No login by design, so cross-site writes are blocked. Every method except GET, HEAD and OPTIONS needs the header
`X-Nest-Flyers: 1`. A custom header can't be sent from another origin without a CORS preflight, and preflights are never
granted. Without the header the answer is 403 `forbidden`.

## Access rule (PHP only)

The PHP backend refuses to serve until `config.php` sets an access rule. Node relies on binding to loopback or the
office network instead.

| `config.php` `access` | Result |
|---|---|
| none of `allowIps`, `basicAuth`, `allowPublic`, or no `config.php` at all | 503 `not_configured` on every request |
| `allowPublic: true` | everyone (local use only; never on a public host) |
| `allowIps` (CIDR list, IPv4/IPv6) | `REMOTE_ADDR` in the list is allowed. Otherwise 403 `ip_forbidden`, or 401 when Basic auth is also set. |
| `basicAuth` (`user` + `passwordHash`) | Right credentials are allowed. Missing or wrong ones get 401 `unauthorized` with `WWW-Authenticate: Basic`. |

Any configured rule grants access. `config.php` guards only the API. The `.htaccess` examples guard the app shell and
the photos too; see the README's shared-hosting section.

## Errors

Every non-2xx answer is `{"error": {"code": "…", "message": "…", "fields": {…}}}`. `fields` appears only on field
errors. The catalogue is `src/shared/errors.ts`, which PHP reads from `schema/shared.json`:

<!-- gen:errors:start -->
| Key | Status | Code | Message |
|---|---|---|---|
| `malformed` | 400 | `invalid` | Malformed request. |
| `invalid` | 400 | `invalid` | Some fields are not valid. |
| `unknown_hostel` | 400 | `invalid` | Unknown hostel. fields `{"hostel":"Unknown hostel"}` |
| `unknown_photo` | 400 | `invalid` | Unknown photo. fields `{"photoId":"Unknown photo"}` |
| `no_photo_field` | 400 | `invalid` | Attach the photo as the "photo" field. |
| `bad_format` | 400 | `invalid` | format must be png or jpg. |
| `unauthorized` | 401 | `unauthorized` | Sign in to use the flyer generator. |
| `forbidden` | 403 | `forbidden` | Missing X-Nest-Flyers header. |
| `ip_forbidden` | 403 | `forbidden` | This network is not allowed to use the flyer generator. |
| `no_such_flyer` | 404 | `not_found` | No such flyer. |
| `no_such_endpoint` | 404 | `not_found` | No such endpoint. |
| `not_found` | 404 | `not_found` | Not found. |
| `too_large` | 413 | `too_large` | That photo is over {mb} MB. Use a smaller JPG. |
| `too_many_pixels` | 413 | `too_large` | That photo has too many pixels to process here. Use a smaller JPG. |
| `heic` | 415 | `heic` | iPhone HEIC photos are not supported — export it as JPG (Settings › Camera › Formats › Most Compatible) and try again. |
| `unreadable` | 415 | `unsupported` | That file is not an image we can read. Use a JPG, PNG or WebP. |
| `unsupported_format` | 415 | `unsupported` | {format} files are not supported. Use a JPG, PNG or WebP. |
| `server_error` | 500 | `server_error` | Something went wrong on the server. |
| `storage_too_new` | 500 | `server_error` | The data folder was written by a newer version of this app. Update the app before using it. |
| `not_configured` | 503 | `not_configured` | This app is not set up yet: add an access rule to config.php. |
<!-- gen:errors:end -->

**Validation failures** (`invalid`, "Some fields are not valid.") set `fields`:
- The keys are dotted paths into the body, with array indices included: `title`, `data.chips.0.label`,
  `data.colors.bg`.
- A JSON array body is reported at `_`.
- Every bad field is reported, not just the first.
- The field *messages* are the backend's own wording, so only the keys are part of the contract.

## Routes

| Method and path | Success | Errors |
|---|---|---|
| `GET api/config` | 200 `ApiConfig` | — |
| `GET api/hostels` | 200 `Hostel[]` | — |
| `GET api/doodles` | 200 `Doodle[]` | — |
| `GET api/flyers?hostel=&template=` | 200 `FlyerListItem[]` | — |
| `POST api/flyers` | **201** `{id, flyer}` | `malformed`, `forbidden`, `invalid`, `unknown_hostel`, `unknown_photo` |
| `GET api/flyers/:id` | 200 `{flyer, hostel, photo}` | `no_such_flyer` |
| `PUT api/flyers/:id` | 200 `{id, flyer}` | `malformed`, `forbidden`, `no_such_flyer` (bad id, checked before the body is validated), `invalid`, `unknown_hostel`, `unknown_photo`, `no_such_flyer` (missing or archived) |
| `DELETE api/flyers/:id` | **204**, empty body | `forbidden`, `no_such_flyer` |
| `POST api/photos` (multipart, field `photo`) | **201** `PhotoInfo` | `forbidden`, `no_photo_field`, `too_large`, `too_many_pixels`, `heic`, `unsupported_format`, `unreadable` |
| `POST api/render/:id` `{format}` | 200, the image | `malformed`, `forbidden`, `no_such_flyer` (bad id), `bad_format`, `no_such_flyer` |

Each row lists its errors in the order they are checked. Anything else under `api/`, including a wrong method on a known
path, is 404 `no_such_endpoint`.

### `GET api/config`

```
{ backend: 'node' | 'php', storage: 'sqlite' | 'json',
  exporters: ['client'] | ['client', 'server'],
  limits: { maxUploadBytes, maxPhotoEdge },
  server: { …free-form diagnostics } }
```

- The editor picks its exporter from `exporters`: server if it is listed, else client.
- `limits` drives photo preparation in the browser.
- `maxUploadBytes` is the largest upload this backend accepts. Node: 15 MiB. PHP: the smallest of 15 MiB,
  `upload_max_filesize`, and `post_max_size` minus 64 KiB.
- `server` is diagnostics only. PHP reports `php`, `upload_max_filesize`, `post_max_size`, `memory_limit`,
  `imageProcessor` and the image formats it can read.

### Hostels and doodles

- Both come from `seed/hostels.json`, upserted by slug and never deleted. Node seeds with `npm run seed`. PHP seeds
  inside the first request, and again whenever the file changes.
- **Hostels** are `{id, slug, name, island, logoPath, sortOrder}`, ordered by `sortOrder`, then `name`.
- **Doodles** are `{id, slug, label, url, kind, builtin}`, built-ins first, then by `kind`, then `label`. `url` is the
  stored path, e.g. `assets/art/spark-teal.png`.
- Text ordering is by code point (`B` < `a` < `Á`), never locale.

### Flyers

- **The list** holds non-archived flyers, newest first: `updatedAt` descending, then `id` descending. Items are
  `{id, title, template, hostel, hostelName, updatedAt}`. `hostelName` is the hostel's current name, or null for a
  chain-wide flyer.
  - `hostel=<slug>` filters to that hostel. An unknown slug gives `[]`.
  - `hostel=none` gives chain-wide flyers only.
  - `template=<t>` filters by template.
  - An empty parameter means no filter.
- **A flyer record** is `{id, hostel (slug or null), template, title, data, photoId, createdAt, updatedAt}`.
  `GET api/flyers/:id` adds the resolved `hostel` (full object or null) and `photo` (`{id, url, width, height}` or null).
- **Create** sets `createdAt = updatedAt`. **Update** keeps `createdAt` and bumps `updatedAt`.
- **DELETE is a soft delete** (archive). It bumps `updatedAt`. From then on the flyer gives 404 to GET, PUT and DELETE,
  and drops out of the list.
- **Ids in the path:** anything that is not a positive integer gives 404 `no_such_flyer`, as does an unknown id.

### Request body: `FlyerInput`

`{title, hostel, template, data, photoId}`. All five keys are required; `hostel` and `photoId` may be null. The rules
live in `src/shared/schema.ts`. How a backend applies them:

1. **Trim.** `title` is trimmed exactly as JavaScript's `trim()` does before its length is checked (1–80). This is the
   `x-nest-trim` flag in the JSON Schema; `tests/fixtures/js-trim.json` holds the vectors.
2. **Validate.** String lengths count code points: 21 emoji fit a 40-character line. Numbers must be finite, so a JSON
   `1e400` is invalid at its path.
3. **Normalise.**
   - Missing defaulted keys are filled (`data.v`, `photoCrop`, `showPill`, `week`, `overrides`, override
     `dx`/`dy`/`scale`, doodle `rot`).
   - Unknown keys are dropped at every level, except inside `data.overrides`, which is a record keyed by block.
   - Then `src/shared/normalize.ts` applies: an empty `hostel` means chain-wide (null), and the `template` column wins
     over `data.template`.
4. **Check references.** A `hostel` slug that doesn't exist gives `unknown_hostel`. A `photoId` that doesn't exist
   gives `unknown_photo`. The hostel is checked before the photo.

### Photos

`POST api/photos` takes multipart form data with the file in the field `photo`.

- The type is sniffed from the bytes, never taken from the name or the header.
  - HEIC/HEIF (ISO-BMFF `ftyp` at byte 4, with one of the brands listed in `schema/shared.json` at byte 8) gives
    `heic`.
  - JPEG, PNG and WebP are kept.
  - Other images (GIF, TIFF, SVG, other ISO-BMFF) give `unsupported_format`, naming the format.
  - Anything else gives `unreadable`.
- **Stored as follows:**
  - the EXIF orientation is applied;
  - the long edge is at most 3240 px, never enlarged;
  - the short edge is rounded half up (`tests/fixtures/fit-long-edge.json`);
  - metadata is stripped;
  - the result is **PNG if the image has an alpha channel, else JPEG** at quality 88.
- **Answer:** 201 `{id, url, width, height}`. `url` is `uploads/YYYY/MM/<16 hex>.jpg|png`, relative to the app root, and
  `width`/`height` are the stored size.
- **Over the limit:** a file over `limits.maxUploadBytes` gives 413 `too_large`, and so does a request over PHP's
  `post_max_size`. The message's `{mb}` is `formatMb(maxUploadBytes)`.
- **What's asserted:** pixels and file bytes differ between sharp (Node) and GD (PHP), so the contract checks sizes,
  formats and rules, never bytes.

### Export: `POST api/render/:id`

- **Only where server-side export exists.** It exists when `api/config` lists `server` in `exporters` (Node, with its
  Playwright renderer). Elsewhere the path is not registered, so it gives 404 `no_such_endpoint`, and the editor
  exports in the browser with the same renderer.
- **Body:** `{format: 'png' | 'jpg'}`, default `png`.
- **Checks, in order:** the id (404), the format (400 `bad_format`), then that the flyer exists (404).
- **Answer:** the 1080 × 1920 image, with `Content-Disposition: attachment; filename="<slug>.<format>"`. The slug comes
  from `src/shared/filename.ts`, which the client exporter uses too. `X-Render-Cache: hit|miss` is also set.

## Static files

`assets/…` (built-in art and logos) and `uploads/…` (photos) are plain files at those paths. The contract says only
that an existing file is served (200). Missing files, caching and directory handling are the web server's business.

## Deliberately unspecified

The backends may differ here, and the suite doesn't pin them:

- a JSON body over 1 MB;
- a body that is a bare JSON primitive (`"x"`, `42`, `null`), an empty body, or one not sent as `application/json` (Node
  answers `malformed`, `invalid` on every required field, and `invalid` at `_` respectively);
- a file sent under a field other than `photo`;
- a truncated or corrupt image that passes sniffing;
- lone UTF-16 surrogates in strings;
- odd id spellings such as `1e2` or `0x10`;
- the wording of field-level validation messages.
