# Session prompt: staff texts → flyers on the live site

Paste this at the start of a Claude Code session in this repo. Then paste staff texts, one or several per message.

---

You turn Nests Hostels staff event texts into saved flyers on the live site `https://nestpass.ai/activities/`. They
are text only: managers add the photos later in the editor.

**Read first:**
- `docs/ai-flyers/README.md`: the workflow, the rules for every field, the "ask first, then default" table, and the
  share-text format;
- every file in `docs/ai-flyers/examples/`: the real cases and Artur's corrections;
- `CLAUDE.md`, for the project's rules: never invent a hostel, commit only when asked, never push.

**For each text I paste:**

1. **Ask what it leaves open.** Use one AskUserQuestion with at most 4 questions. Each question's first option is
   the README's default, marked (Recommended). Don't ask what the text already says. The usual gaps are:
   - which hostel, or all of them;
   - the day, or every day;
   - the time and the place;
   - the price;
   - whether to print a phone number.
2. **Write the example file** `docs/ai-flyers/examples/<date>-<hostel slug | all-hostels>-<short-name>.json`:
   - `source`, the text exactly as pasted;
   - `brief`, following the README's rules, with a `share` caption in Spanish, then `---`, then English;
   - `asked`, every question with my answer;
   - `notes`, what you decided and why.
3. **Dry run against live:**
   `npx tsx scripts/flyers/post.ts <file> --to https://nestpass.ai/activities/ --dry-run`. Fix every error and lint
   warning. (`.env` has no `FLYERS_BASE_URL`, so pass `--to`.)
4. **Proof on the dev server:** `npx tsx scripts/flyers/post.ts <file> --to http://127.0.0.1:8787/`. Start
   `npm run dev` if it isn't running.
   - Open the proof in Chrome (Playwright MCP) and look at the Story 9:16 and WhatsApp 3:4 canvases.
   - Check for a WHEN/WHERE/COST small line that breaks badly (a range like `17:45 – 23:00`, a hyphenated word),
     anything the editor calls cut off, and the eyebrow fitting.
   - Shorten the brief and repeat until it is clean.
   - Then delete the proof: `DELETE api/flyers/<id>` with the header `X-Nest-Flyers: 1`.
5. **Show me the result:** one screenshot and the key fields. **Post live only after I say so:**
   `npx tsx scripts/flyers/post.ts <file> --to https://nestpass.ai/activities/`.
6. **Read it back** from `https://nestpass.ai/activities/api/flyers/<id>`. Check the chips, extras, ask lines, and a
   share text identical to the brief. Give me the link `https://nestpass.ai/activities/#/flyers/<id>`.
7. **Record what you learned.**
   - Every correction I make goes into that example's `notes`.
   - If a correction is a rule, it also goes into the README, either its rules section or its prompt files if they
     have moved to `ai/prompts/`.
   - These files become the in-app AI assistant's prompt and test set, so a correction left out is lost.

**Never:**
- guess a hostel slug;
- send to live without my go-ahead for that batch;
- re-post a brief whose file already has a `posted` entry for the site (the script skips it anyway);
- write "Book now".

At the end of a batch, list what was posted, with the links. Ask whether to commit the new example files.
