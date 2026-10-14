# Report: labels on every flyer, and a filter by label in the library

The brief is `docs/prompts/flyer-types-filter.md`. Built on 2026-10-14, on `feat/flyer-labels`, cut from
`feat/library-views` at `16e1527`. Nothing is pushed and no release was built. The live site was read, never written
(its 16 flyers, to choose their labels); the Laragon copy was not touched. No AI provider was called.

Unlike the library's views, this one is on both backends and **needs a release, uploaded whole**. A flyer prints the
same: the drawing is byte-identical to the capture of before (32 cases), checked four times on the way.

## What Artur chose

The brief suggested one type per flyer. He wanted several, so that a Masca flyer by Tenerife Tours is found under
all three.

| Question | His answer |
|----------|-----------|
| One type, or several | **"Several, fixed list"** |
| The word staff see ("Tag" is the pill's) | **"Labels"** |
| The AI sets them | **"Yes, as a second stage"** |
| Part A, the five open decisions of the library's views | **"Yes, as suggested"**: Safari's focus now, the other four after his phone trial |
| Where they are stored | **In the flyer's data**, like the caption |
| How many on a flyer | **Up to 8** |
| A new flyer | **Has none** until one is picked |
| Setting them from a card's More menu | **Not in this version** |
| The flyers that exist | **"Classify the flyers I trust you"**: I read each flyer and choose, with no keyword rules |
| This week flyers | **"Label This week flyers too"** |
| A filter value for flyers with none | **"A 'No label' filter value"** |
| A label taken off the list later | It **stays stored** on its flyers, on no screen, and shows again if it comes back |
| A flyer the script fills moves to the top | **Kept** |
| Who can create a label | **"The AI may suggest one"**: the list is fixed, and the AI names a missing one in a note |
| An organiser's label | **"An organiser only when named"** |
| A note in "The AI assumed" for chosen labels | **None** |
| Real check generations | **On his go** |
| Reading the live flyers | **"You read the live site"**, reads only; he runs the write |
| The first list | **"Yes, all 13 and the table"** |
| The phone's top (picture 1) | **"B: compact, two a row"** |
| A card's labels (picture 2) | **"A: pills under the line"** |

**One answer replaced another.** From three options shown as text he first chose **"Headings, under every label"**
for the library. An hour later, with the same thing drawn on the real library (`backups/flyer-labels/mockups/`),
he answered: **"I dont want the Group by label functionality."** So there is no grouping, no switch and no heading.
The picker he did not speak of: it is built as drawn.

## What was built

**The list** (`src/shared/labels.ts`)

- Thirteen labels, each a slug and a name. His six: Dinners, Stretching, Masca, Teide, Excursions, Tenerife Tours.
  Seven from the flyers on the live site, with his yes: Shows, Movie nights, Beach, Games, Dance, Workshops, What's on.
- The list is in the release. A new label is one line there and a release.
- `npm run gen` writes it to `schema/shared.json` for PHP. The rules (how labels are saved, which ones a screen
  shows, the filter's match) are written once in TypeScript, with a twin in PHP (`Domain\FlyerLabels`), and
  `tests/fixtures/flyer-labels.json` holds both to one table.

**Saved with a flyer** (`data.labels`)

- Like the caption: no migration, and every flyer saved before reads back with none.
- A label is checked by its shape, never against the list. So a label taken off the list never stops a flyer from
  opening or saving. It stays stored and is on no screen.
- A save puts the labels in the list's order, once each.

**The library**

- A third filter, **Label**: All labels, No label, then each label. The server filters
  (`GET api/flyers?label=<slug>`, `label=none`). The choice is remembered, and a remembered label that is no longer
  on the list is ignored.
- Each card shows its labels as small pills under its line. They come with the list, so they are there at once and
  the card does not change size when its picture lands.
- The top is two rows: the name with List / Grid, then the three filters. On a phone the filters are two to a row
  and the words "Hostel", "Template", "Label" are not drawn, so the cards start where they did. Each select's first
  choice says what it is.

**The editor**

- In the Flyer section, under the library name: a row of buttons, one a label, pressed for the ones the flyer
  carries.
- Pressing one and pressing it again leaves the flyer "Saved": nothing to lose on leaving.
- With 8 pressed, the others wait greyed, and the line under them says why: "A flyer carries 8 labels at most:
  take one off to add another."
- The closed section names the labels after the template and the hostel.
- Duplicate copies them. A row taken into a This week flyer does not carry them.

**The script** (`npm run flyers:labels`)

- With nothing more it prints every flyer of a site and writes nothing.
- `--apply <table>` takes a table of flyer ids and labels, says what it would do, and writes nothing. With
  `--write` it does it.
- It fills flyers that carry no label, oldest first, and never changes one that has any, a label this checkout's
  list does not have included.
- It stops before anything on a site whose release would drop the labels. It leaves a flyer that was renamed or
  saved meanwhile. It refuses a table that is another site's or names a label off the list.
- After a write it asks the site's own "No label" filter, and marks with "!" a flyer it saved that the site does
  not show: a site whose release is behind the list.
- A flyer that cannot be opened is named and does not stop the rest.
- Tried on a throwaway store: the dry run changed no file, the write changed `labels` and `updatedAt` alone, and a
  second run changed nothing.
- **What it cannot guard:** a save replaces the whole flyer. Someone who saves a flyer from an editor they opened
  before the run puts it back without its labels. Run it when nobody is editing, and once more afterwards: the
  second run fills what is still empty and changes nothing else.

**The AI** (stage 2)

- A flyer the AI writes carries labels, picked from the list alone. "Open in editor" shows them pressed, to change.
- It cannot invent one: its answer is held to the list on both backends.
- When the list has no label for the event, it names the one it would add in a note, shown under "Labels" in "The
  AI assumed…". That label is on no flyer.
- The list is written into its prompt by `npm run gen`. No route, PHP class or provider adapter changed.

**Part A**

- Safari on a Mac gives a pressed button no focus, so the lightbox had nothing to hand the focus back to. The
  library now hands it to the zoom button itself. No Safari runs in the suite: the test makes the same state in
  Chrome, and failed before the change.

## What is mine, for him to keep or strike

| # | Point |
|---|-------|
| M1 | **The list item carries the labels.** With grouping gone they were no longer needed there. I kept them: a card shows its pills at once, and nothing jumps when its picture lands. The price is in *What the list costs* |
| M2 | The hostel filter's first choice reads **"All hostels"** (it read "All flyers"): with the words hidden on a phone, it has to say what the select is. On a desktop too. The review saw that "All hostels" now means two things on one screen: no filter in the select, and a chain-wide flyer in a card's line |
| M3 | Labels show in the list's order, never the order picked. There is no main label |
| M4 | "No label" means "no label of the list": a flyer whose only label was taken off the list is among them |
| M5 | **Three hints for the AI**, written beside the label in the list: Excursions ("a trip out of the hostel"), Tenerife Tours ("the organiser Tenerife Tours, only where the text or the picture names it"), What's on ("what is on in the city: concerts, festivals and other events that are not the hostel's own") |
| M6 | **The words of the AI's rule** on labels (`ai/prompts/flyer.md`, "Label the flyer") |
| M7 | **The examples' labels**: the stretching one is Stretching; the Teide one is Teide and Excursions; the bachata picture is Dance and Workshops |
| M8 | The words under the picker: "For the library's filter — not printed", and with a flyer's 8 places taken, "A flyer carries 8 labels at most: take one off to add another." |
| M9 | The table of the live flyers' labels is kept outside git (`backups/flyer-labels/live-table.json`) |
| M10 | The branch and this report are named "labels", where the brief said "types" |

M7 has one thing to see. On the live site the Teide flyer gets Tenerife Tours, on his word. The AI's example of the
same tour does not: its text never names the organiser, and his rule is "only when named". The example now shows
that rule.

## What differs from the plan

- **No grouping** (above). Step 8, and the plan's notes on headings and on a card repeated under several of them,
  were dropped.
- **Steps 6 and 7 are one commit**: the filter, the top and the pills went green together, in one spec.
- **The script has no keyword rules**, by his answer. The plan's first draft had them.
- **A dry run is the default**, and `--write` does it. The plan said "dry run by default" for a keyword script; it
  holds for the table as well.
- **The PHP smoke test got a labels step.** The plan named it under the picker; it now also covers the card and the
  filter on PHP.

## What the list costs

Both JSON stores listed from an index of six fields and opened no flyer. The list now opens each listed flyer's own
file, for its labels alone. The index was left as it is: a release from before labels rewrites every index row to
its six fields at its next save, so labels kept there would be lost by one save.

Timed on this PC, the PHP backend, the median of 25 requests, against a request that reads one small file:

| Flyers | The list takes longer by about |
|--------|-------------------------------|
| 16 (the live library today) | 12 ms |
| 160 | 30 ms |
| 320 | 38 ms |
| 1,600 | 150 ms |

The host's disk is slower than this PC's and was not measured. The first sign of it will be how long the library
takes to list after the release.

## The tests

- **One table for both backends**: `tests/fixtures/flyer-labels.json`, with a list of its own, replayed by Vitest
  and PHPUnit.
- **Every backend over HTTP** (`tests/contract/`): labels saved in the list's order, held to their shape and their
  number; the list item's labels; the filter by slug, by "none", with the other two filters, given twice.
- **Every storage driver** (`tests/storage/`, `php/tests/Storage/`): the same list and filter; a flyer saved before
  labels; a flyer whose file is missing, damaged or no flyer at all is still listed, with none.
- **PHP serving a store Node wrote** (`tests/cross/`): the same lists by label from both.
- **In a browser**: `library-labels.spec.ts` (10), `flyer-labels.spec.ts` (11), a labels step in the PHP smoke test,
  and the AI's labels in `ai.spec.ts`.
- **The script**: `tests/unit/flyer-label-table.test.ts` (21), on a stand-in for a site.

## What the review found

A fresh-context review read the whole branch, most of all the script, since it is run against the live site. **It
found no blocking defect and nothing that makes the live write unsafe.** One break it found I had found and fixed
while it was reading: the editor showed a blank page on a backend older than itself, which sends no labels. What
else it found is fixed, each with a test that failed or could not fail before:

| What it found | What was done |
|---------------|---------------|
| The script judged "has a label" by this checkout's list. On a site with a later list, a flyer would have been given more labels | Any stored label now leaves a flyer alone |
| A site whose release is behind the list saves a label and shows none, and the script printed a tick | After a write it asks the site's "No label" filter and marks such a flyer with "!" |
| One flyer that cannot be opened stopped the print, and a write when it was the newest | The print names it and goes on; the first flyer that opens is asked about the release |
| `flyers:post` guarded the share text on an older site, not the labels a brief now carries | It asks for both, through one helper (`siteKeeps`) |
| "Oldest first" passed with an order by id; nothing reached the check after a save; two more cases were pinned by nothing | Four tests rewritten or added |
| No SQLite test had a row nobody saved through the app | One with twelve such rows. Without the guard in the SELECT it fails on "malformed JSON" |
| The shared table of rules did not pin slugs that look like numbers, labels stored twice, numbered keys, and more | Ten vectors added. PHP's loose read took a shape the store never hands it, and now reads objects alone |
| The phone's filters were said to keep their names, and the spec found them by their markup | The spec asks the accessibility tree for a select of each name |
| With 8 labels the picker greyed its buttons and said nothing; a label off the list takes a place unseen | The line under the buttons says why, and how many are unseen |
| `docs/deploy.md` left "Write with AI" out of what saves a flyer | Added |

Left as it is, and said: a save replaces the whole flyer, so the script cannot stop an editor opened before the
run from putting a flyer back without its labels (above, under the script). And "All hostels" (M2).

## The look

In the installed Chrome, driven by a script, on Node with the JSON store, at 1440, 1280, 390 and 360 px: the
library as a list and as a grid, a label chosen in the filter, and the editor's Flyer section closed and open. The
screenshots are in `backups/flyer-labels/look/`, and the pictures he chose from in `backups/flyer-labels/mockups/`,
both outside git.

**Not done: PHP by eye (the smoke test drove it), a real phone, Safari, Firefox.**

## The gates

On `ec75579`, the last commit before this record:

| Gate | Result |
|------|--------|
| `npm run typecheck` | clean |
| `npm test` | 765 passed |
| `npm run test:contract` | 387 passed, on every backend |
| `npm run test:render` | 374 passed |
| `npm run test:php` | 938 run, 38 of them skipped, as before this work |
| `npm run test:php-smoke` | 3 passed |
| The drawing against `nest-ux4c-baseline` | 32 cases, byte-identical |

No provider was called: the AI's part ran on the fake.

## For Artur to decide

- M1 to M10, above.
- **The real check generations** for the AI's labels: a few through `npm run ai:smoke`, the cheap model first. I
  will show what each should give before any is spent.
- **A way to set labels from a card** without opening the flyer: left out by his answer, and the place to add it is
  the card's More menu.
- **The order of the list** is the order of the picker, the filter and the pills. Today it is his six, then mine as
  they came up. He may want another.
- **"All hostels"** in the hostel filter (M2), where a card's line already says "All hostels" for a chain-wide
  flyer. "Every hostel" for the filter, or "Chain-wide" on the card, would tell them apart.
- **A save replaces the whole flyer**, in the editor as in the script. Two people who save the same flyer, or one
  person with an old tab, overwrite each other: the last save wins. It is older than this work and was never asked
  for; the script is the first thing that makes it likely. A save that is refused when the flyer changed meanwhile
  would close it, on both backends.

## Yours to do

In this order:

1. **The release**: `npm run build:php`, upload whole, `npm run deploy:tag -- <the site>`. Nothing new in
   `config.php`.
2. **The live flyers' labels**, once the release is up. First see what it would do, then do it:

   ```sh
   npm run flyers:labels -- --to https://nestpass.ai/activities/ --apply backups/flyer-labels/live-table.json
   npm run flyers:labels -- --to https://nestpass.ai/activities/ --apply backups/flyer-labels/live-table.json --write
   ```

   Fifteen flyers get labels; "This is a TEST" gets none. Each one it labels moves to the top of the library with
   today's date. A flyer renamed since 2026-10-14 is left alone and named.

   Run it when nobody is editing a flyer, from this checkout, and run the second command once more afterwards. A
   line that starts with "!" means the site saved a label its release does not list: the release is not the one
   built from this checkout.
3. **Your own pass** over the labels, in the editor's Flyer section.
4. A phone trial, as for the library's views.
