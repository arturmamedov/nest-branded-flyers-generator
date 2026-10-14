# Flyers from staff text

Staff write an event the way they would post it in a group chat: a few lines, emoji, Spanish or English, often both.
This folder turns that text into a saved flyer, and keeps every case.

- **By hand (since 2026-10-01): Artur's checked route.**
  - Artur pastes the text into a Claude Code session.
  - Claude writes a *brief* from it, using the rules below.
  - `npm run flyers:post` saves the brief on the live site, without a photo.
  - Managers add the photo in the editor.
- **In the app (branch `feat/ai-assistant`, 2026-10-04).** Staff paste their own text on the "✨ Create with AI" page.
  A model writes the brief, with its share text, and the app opens it as a new, unsaved flyer. It runs on a site
  once that site's settings hold a provider's key (`docs/deploy.md`, "The AI assistant").
  - The rules in `ai/prompts/` are that model's system prompt.
  - `examples/` holds its few-shot cases and its eval set.
  - Every generation is kept in the site's ledger, where the next examples come from ("From the ledger to an
    example", below).

The pieces, each defined once:

| What | Where |
|---|---|
| A brief's shape (zod, strict) | `BriefSchema` in `src/shared/schema.ts` |
| Brief → flyer, every default filled | `flyerFromBrief()` in `src/shared/brief.ts`: DOM-free and zod-free, so the editor can call it |
| The share text field (not printed) | `data.share`, limit in `src/shared/share.ts` |
| The flyer's labels (not printed) | `data.labels`, the list and its rules in `src/shared/labels.ts` |
| Every field's limit | `schema/flyer.schema.json` (generated). Never copy a number into this file |
| Brand-voice warnings | `lintFlyer()` in `src/shared/copyRules.ts` |
| The writer | `scripts/flyers/post.ts`: the API, with the write header, idempotent |
| The rules, as the model reads them | `ai/prompts/flyer.md` and `ai/prompts/share.md` |
| What the model must answer | `AiFlyerAnswerSchema` in `src/shared/schema.ts`: a brief, always with its share text and its labels (of the list alone), and at most 12 assumptions |
| What both backends send a provider | `schema/ai.json` (generated): the prompts with their limits, these examples as few-shot turns, the answer's schema |
| What a site keeps of each generation | the AI ledger (`docs/json-storage.md`) |
| One real generation, by hand | `npm run ai:smoke` (`scripts/ai/smoke.ts`) |
| The rules for reading a picture | `ai/prompts/photo.md` |
| What a picture read answers | `AiPhotoAnswerSchema`: `{ text }`, the words as written, empty when the picture has none |
| The picture reads' eval set | `image-examples/` ("From a picture", below) |

## From a picture

Since 2026-10-06 the app can read a picture into the words it shows (`POST api/ai/photo`, the `photo` feature). Its
page is "From a photo" on Create with AI: a staff member chooses or takes a picture and presses "Read the picture".
The read stops at the words: they check them in "Your idea" and then ask for the flyer, as with any text. So a flyer
from a picture is two calls, and everything above applies to the second.

The page shows that way as three steps: Picture, Check the words, Flyer. On the flyer, staff can take the picture
along as its photo ("Use this picture as the flyer's photo", unticked by default). That is an ordinary upload
through `POST api/photos`, made from the picture as it was chosen: the model is asked nothing more, and the read's
own copy in `ai-pictures/` is a different file.

`image-examples/` is the read's eval set. It is no part of the few-shot: a picture is never a turn of the prompt.

- A case is `<date>-<hostel>-<name>.json` with its picture beside it under the same name.
- `source` is the words the picture prints, typed out exactly: what a read should give.
- `brief` is the flyer those words should give, as in `examples/`.
- **A picture goes into git only after Artur has looked at it,** and as the read would send it: no larger than
  2048 px, without its metadata, and in the read's format (a PNG without transparency goes out as a JPEG).
  `npm run ai:smoke -- --photo <picture> --save <file>` writes exactly that file.
- `tests/unit/ai-image-examples.test.ts` holds every case to this.
- `npm run ai:smoke -- --photo <the case's .json>` reads a case for real, and prints the words read under `source`.

## Running it

```sh
# .env: FLYERS_BASE_URL=https://nestpass.ai/activities/  (+ FLYERS_BASIC_USER / FLYERS_BASIC_PASSWORD once locked)
npm run flyers:post -- docs/ai-flyers/examples --dry-run              # checks every brief, saves nothing
npm run flyers:post -- docs/ai-flyers/examples --to http://127.0.0.1:8787/   # a proof on the dev server
npm run flyers:post -- docs/ai-flyers/examples/2026-10-01-adeje-nest-sunset-stretching.json

# .env: AI_PROVIDER=openai (or anthropic) and AI_API_KEY=…
npm run ai:smoke -- docs/ai-flyers/examples/2026-10-01-adeje-nest-sunset-stretching.json   # what the model makes of that text
npm run ai:smoke -- --share                                                                  # the share text of the first example's flyer
```

- **What a smoke run shows.** The example's text goes to the provider `.env` names, held out of the few-shot, so the
  brief that comes back is the model's own and not the example read back. Read it against the brief written by
  hand. What differs is either something the text never said (it belongs in `asked`) or a rule the prompt lacks.
  It prints the tokens and the seconds too, and spends no site's daily generations.
- **What it checks first.** A brief is checked against the site's hostels and the API's own rules before anything is
  sent. A misspelt key, an unknown hostel or a line past its limit stops that brief, with the reason.
- **No duplicates.** A brief already saved on that site is skipped. Either its file records the save (`posted`), or a
  flyer with the same title and hostel is there. So sending the whole folder again is safe.
- **Where the record goes.** After a save to a real site, the file gets a `posted` entry with the site, the id and
  the time. A proof run on the dev server records nothing.

## An example file

`examples/<date>-<hostel slug>-<short name>.json`. The date is the day the text came in.

```json
{
  "source": "the staff text, exactly as it came — never cleaned up",
  "brief": { "hostel": "adeje-nest", "template": "activity", "text": { … }, "when": "…", "where": "…", "cost": "…", "extras": [], "share": "…", "labels": ["stretching"] },
  "asked": [{ "question": "How much does it cost?", "answer": "Free", "field": "cost" }],
  "notes": "what was decided, and Artur's corrections",
  "posted": [{ "site": "https://nestpass.ai/activities/", "id": 4, "at": "2026-10-01T…Z" }]
}
```

- **When Artur corrects a flyer in the editor,** copy the correction into that example's brief and say why in
  `notes`. If it is a rule, add it to the prompt file too. The examples are only worth as much as their corrections.
- **Record every question in `asked`.** That is every question the text left open, with the answer and the brief key
  it settles (`field`: `hostel`, `cost`, `when`, `text.askEn`). The assistant cannot ask, so `npm run gen` shows it
  each one as an assumption: the `field`, with the answer as its note.
- **An example carries its share text.** The model is shown the example as the whole answer to give, and its answer
  must always have a share text. `npm run gen` refuses an example without one.
- **An example carries its labels,** for the same reason, as slugs of the list in `src/shared/labels.ts`: every label
  its text clearly supports, and an organiser's only when the text names the organiser (Artur, 2026-10-14). So the
  Teide tour is `teide` and `excursions`, with no organiser. A label taken off the list later stops `npm run gen`
  until the examples that name it are put right. Only Artur adds a label to the list.
- **Never invent a hostel.** The slug comes from Artur or from the text. If neither names one, ask; never guess.

## From the ledger to an example

Every generation a site attempts is one record in its ledger: `data/ai-usage/YYYY-MM.json` on the PHP host and the
JSON store, the `ai_usage` table on SQLite. A record holds `at`, `day`, `actorId`, `feature`, `provider`, `model`,
`tokens`, `ok`, `input` and `output`. The ledger is real staff text with what the model made of it, so it is where
the next examples come from.

1. **Pick a record worth keeping.** A `flyer` record whose flyer someone then corrected in the editor, or one with
   `ok: false`. A flyer the staff printed as it came teaches the model nothing new.
2. **`input` is the `source`,** exactly as it came: never cleaned up.
3. **`output` is the model's answer,** `{ brief, assumptions }`, as text. Start the example's `brief` from it, then
   make it the flyer it should have been: the corrections from the editor, and the share text as posted.
4. **Each thing the text left out becomes an `asked` entry.** The model's `assumptions` list them. For each: the
   `question` the text leaves open, the true `answer` (at most 200 characters), and the `field` it settles.
5. **Say why in `notes`:** what was decided, and what Artur corrected. A correction that is a rule goes in
   `ai/prompts/flyer.md` as well, in one line.
6. **Run `npm run gen`, then `npm test`.** The first rebuilds `schema/ai.json`; the second fails while it is stale.
7. **See what the model makes of it now:** `npm run ai:smoke -- docs/ai-flyers/examples/<the new file>`.

- **The ledger holds what staff typed,** phone numbers included, and an example file is committed. Leave out of the
  example anything that should not be in git.
- **The ledger never holds a key,** and no address serves it: download it with the library (`docs/deploy.md`,
  *Backups*).

---

## The rules (the assistant's system prompt)

The rules live in two prompt files, the model's own instructions:

- [ai/prompts/flyer.md](../../ai/prompts/flyer.md): an idea → a brief. The model cannot ask, so each gap takes a default and
  is listed in the answer's `assumptions` for the staff member to check. The share text is always part of the answer.
- [ai/prompts/share.md](../../ai/prompts/share.md): a flyer → its share text.

`npm run gen` bundles them with the examples in this folder and the schemas into `schema/ai.json`, which both backends read;
the limit each field has is rendered into the prompt from the schema, never written by hand. A correction Artur makes is
a rule: put it in the prompt file, and the case in `examples/` (its `asked` entries name the brief key each answer settled,
`field`, which becomes the assumption the model is shown).
