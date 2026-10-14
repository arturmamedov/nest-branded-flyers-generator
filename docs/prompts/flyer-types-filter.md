# Launch prompt: a type on every flyer, and a filter by type in the library

Written 2026-10-13, at the end of the session that built the library's views (`feat/library-views`, `16e1527`), for
a session with no memory of it. Paste the block below.

Suggested run: Claude Opus 5.5 (`claude-opus-5-5`), effort **high**, started in plan mode.

```
Read CLAUDE.md, then docs/reports/library-views.md. Two things in this session, in this order:

A. Five small decisions left open by the library's views. Ask me them first, build what I answer.
B. A new feature: every flyer has a type (dinners, stretching, Masca, Teide, excursions…), and the library filters
   by it. Brainstorm it with me, then plan it, then build it.

HOW TO WORK

- Start in plan mode. Build nothing before I approve the plan. Keep the plan SHORT: what changes, in a table, and
  the order. I can't read a long one. Points marked "Mine" are your suggestions: show each so I can keep or strike it.
- Check git first. The branch is feat/library-views (three commits on fcfaf06, not pushed; main has neither it nor
  the reception flyer). Cut a new branch from it (feat/flyer-types). The untracked files in docs/prompts/ that are
  not this one are not part of this: leave them alone. If anything contradicts this, stop and ask.
- Ask with pictures where it is visual (where the filter sits at 1440 and 360 px, where the type shows on a card,
  the editor's field), drawn from the real library. backups/library-views/mockups.mts shows how: a throwaway seeded
  server and draft CSS injected into the real page.
- Every change with its test first; a commit per piece as it goes green. Push nothing, build no release, don't touch
  the live site or the Laragon copy. This one DOES edit src/shared/: warn me first if npm run dev may be running.
- Before calling it done: npm run typecheck && npm test && npm run test:contract && npm run test:render, and
  npm run test:php and npm run test:php-smoke (PHP changes here). Look at it in a browser at 1440, 1280, 390 and
  360 px. A flyer's drawing must not change: the baseline stays byte-identical (the capture is the temp folder
  nest-ux4c-baseline; take a new one first if it is gone).
- Record it: a section in docs/architecture.md and an entry in docs/status.md in the style of the others, and docs/reports/flyer-types.md.

PART A: THE OPEN DECISIONS (ask, one question each, then build the answers)

The seven faults the review found are fixed and tested: there is nothing to repair. These are choices:
1. "Open" is an entry of the card's More menu and also the card's own click. Should it be a button again?
2. The library's toast (bottom-right) lies over the lowest visible card's buttons at 1280 px and on a phone until
   it closes. Leave it (the editor's rule), or move it in the library?
3. A flyer that cannot load greys its buttons and says nothing. Should the card say why?
4. The library copies and downloads the canvas I last used in the editor, and has no switch. The lightbox names
   it. Should the library have its own switch (Story / WhatsApp)?
5. On Safari on a Mac the focus may not return to the zoom button when the lightbox closes. Fix it now (focus it
   by hand on close), or leave it until someone tries Safari?
Mine: 5 is cheap and safe, do it. The rest wait for the phone trial unless I say otherwise.

PART B: WHAT I ASKED FOR

"One filter more in the flyers: a field like tags, and group the flyers by types, like dinners, stretching, Masca,
Teide, excursions etc. For now just the evident ones, and after I will manually refine what and where. And add a
filter to the library with these tags/types."

So: (1) a flyer carries its type; (2) the flyers that exist get the evident one filled in for me; (3) I can change
it by hand; (4) the library has a third filter beside Hostel and Template.

WHAT EXISTS (read before planning)

- The library's list is GET api/flyers?hostel=&template= on both backends (docs/api-contract.md). FlyerListItem has
  six fields and no flyer data; each card fetches its own flyer only when it nears the screen. So a filter by type
  cannot be done in the browser: the server has to filter, and the list has to carry the type if a card shows it.
- hostel and template are fields of the record (FlyerRecordSchema, FlyerInput), filtered by the storage drivers
  (server/storage/sqlite, server/storage/json, php/src/Storage/Json; the list query's type is in
  server/storage/types.ts). The contract suite runs every backend against one table of cases.
- data.share is the precedent for a field that is not printed: defaulted in FlyerDataSchema, so no migration was
  needed, flyers saved before it read back with none, and an older release drops it. src/shared/share.ts holds its
  facts, zod-free; npm run gen writes them to schema/ for PHP. A rule is written once in TypeScript.
- The library's filters remember themselves in localStorage (library.hostel, library.template) through prefs.ts,
  and a stored value that is no longer valid is ignored. tests/editor.ts has filterLibrary().
- The editor's form: sections are in sectionFolds.ts and fields.ts; "Flyer" is the first section (template, hostel,
  library name). A closed section shows one line of what is inside.
- Hostel names are only ever supplied by me (seed/hostels.json). Treat the list of types the same way: never
  invent one; propose, and I confirm.
- The AI assistant writes flyers from text and pictures (docs/ai-flyers/, ai/prompts/). It is NOT part of this:
  it does not set a type in this session.
- An older release meeting newer data: docs/deploy.md, "Rolling back", says what each past change does there. This
  feature needs its own lines.

OPEN POINTS (the brainstorm: settle them with me before the plan)

- One type per flyer, or several tags? Mine: ONE type, optional ("No type"). My examples are all kinds of
  activity, a filter by one value is simple, and a flyer with no type still shows under "All types". Tags can come
  later if one type proves too little.
- A fixed list, or free text? Mine: a fixed list in src/shared/ (slug and label, like the templates), generated
  for PHP. Free text gives "dinner", "Dinners" and "cena" as three filters. To add a type is one line and a release.
- The list itself. I named: dinners, stretching, Masca, Teide, excursions. Propose the full first list from the
  flyers that exist (the seed's samples, docs/ai-flyers/examples/, and ask me for the live library's titles), with
  the flyers each would catch, and let me edit it. Note that Masca and Teide are also excursions: ask whether they
  are their own types or one "Excursions".
- Where it is stored. Two shapes, say what each costs:
  (a) in data, like share: no migration; SQLite filters with a JSON expression, the JSON drivers read it; an older
      release drops it on its next save of that flyer.
  (b) on the record, like template: a SQLite migration (append-only), a JSON-store migration id so an older
      release refuses the store cleanly, a change to FlyerInput and FlyerRecord on both backends.
  Mine: (a), unless the filter is too slow or too awkward in SQLite: measure before choosing (b).
- The API: GET api/flyers?type=<slug> (and a value for "no type"), the type added to FlyerListItem, an unknown
  slug answered the way an unknown template is. Both backends, the contract suite first.
- "Just the evident ones": how the flyers that exist get a type. Mine: a script (npm run flyers:types, in the
  style of flyers:post, through the API with scripts/site.ts), that proposes a type from each flyer's title and
  headline by keywords, PRINTS the table and changes nothing until I say; it only fills flyers with no type, never
  overwrites one. No AI call. Week flyers: ask me (probably no type).
- Where I change it by hand. Mine: a select in the editor's "Flyer" section, and the closed section's line shows
  it. Changing it marks the flyer unsaved like any field. Should the card's More menu also set it without opening
  the flyer (quicker for my manual pass over many flyers)? Ask.
- A new flyer: no type until chosen, or guessed from the headline as I type? Mine: none, no guessing in the editor.
- The library: a third select, "Type", after Template, remembered as library.type; at 360 px the three filters and
  the view switch must not push the cards off the screen (draw it). Should a card show its type (in its meta line)?
  Should "grouped by type" also mean headings in the list, or is the filter enough? Mine: the filter and the meta
  line; no grouping headings in this first version.
- Duplicate copies the type. A row taken from a flyer into a This week flyer does not carry it.

NOT NOW

Several tags per flyer, free-text tags, a page to manage the list of types, the AI choosing a type, sorting, search,
bulk edit in the library (unless I say yes to the More-menu question), anything that changes how a flyer prints.
When done, tell me what is left that is mine: the release (this one needs it, both the files and the order on the
host), running the script on the live library, and my manual pass.
```
