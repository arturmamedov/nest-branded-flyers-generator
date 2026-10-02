# Flyers from staff text

Staff write an event the way they would post it in a group chat: a few lines, emoji, Spanish or English, often both.
This folder turns that text into a saved flyer, and keeps every case.

- **Now (since 2026-10-01).**
  - Artur pastes the text into a Claude Code session.
  - Claude writes a *brief* from it, using the rules below.
  - `npm run flyers:post` saves the brief on the live site, without a photo.
  - Managers add the photo in the editor.
- **Later.** The editor gets an AI assistant: a modal with a textarea where staff paste their own text. A model
  writes the brief and the editor opens it as a new flyer.
  - The rules in `ai/prompts/` are that model's system prompt.
  - `examples/` holds its few-shot cases and its eval set.

The pieces, each defined once:

| What | Where |
|---|---|
| A brief's shape (zod, strict) | `BriefSchema` in `src/shared/schema.ts` |
| Brief → flyer, every default filled | `flyerFromBrief()` in `src/shared/brief.ts`: DOM-free and zod-free, so the editor can call it |
| The share text field (not printed) | `data.share`, limit in `src/shared/share.ts` |
| Every field's limit | `schema/flyer.schema.json` (generated). Never copy a number into this file |
| Brand-voice warnings | `lintFlyer()` in `src/shared/copyRules.ts` |
| The writer | `scripts/flyers/post.ts`: the API, with the write header, idempotent |

## Running it

```sh
# .env: FLYERS_BASE_URL=https://nestpass.ai/activities/  (+ FLYERS_BASIC_USER / FLYERS_BASIC_PASSWORD once locked)
npm run flyers:post -- docs/ai-flyers/examples --dry-run              # checks every brief, saves nothing
npm run flyers:post -- docs/ai-flyers/examples --to http://127.0.0.1:8787/   # a proof on the dev server
npm run flyers:post -- docs/ai-flyers/examples/2026-10-01-adeje-nest-sunset-stretching.json
```

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
  "brief": { "hostel": "adeje-nest", "template": "activity", "text": { … }, "when": "…", "where": "…", "cost": "…", "extras": [], "share": "…" },
  "asked": [{ "question": "How much does it cost?", "answer": "Free" }],
  "notes": "what was decided, and Artur's corrections",
  "posted": [{ "site": "https://nestpass.ai/activities/", "id": 4, "at": "2026-10-01T…Z" }]
}
```

- **When Artur corrects a flyer in the editor,** copy the correction into that example's brief and say why in
  `notes`. If it is a rule, add it below too. The examples are only worth as much as their corrections.
- **Record every question in `asked`.** That is every question the text left open, with the answer. Those are the
  questions the assistant has to learn to ask.
- **Never invent a hostel.** The slug comes from Artur or from the text. If neither names one, ask; never guess.

---

## The rules (the assistant's system prompt)

The rules live in two prompt files, the model's own instructions:

- [ai/prompts/flyer.md](../../ai/prompts/flyer.md): an idea → a brief. The model cannot ask, so each gap takes a default and
  is listed in the answer's `assumptions` for the staff member to check.
- [ai/prompts/share.md](../../ai/prompts/share.md): a flyer → its share text.

`npm run gen` bundles them with the examples in this folder and the schemas into `schema/ai.json`, which both backends read;
the limit each field has is rendered into the prompt from the schema, never written by hand. A correction Artur makes is
a rule: put it in the prompt file, and the case in `examples/` (its `asked` entries name the brief key each answer settled,
`field`, which becomes the assumption the model is shown).
