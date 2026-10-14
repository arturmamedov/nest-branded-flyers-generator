# Faster sessions: ceremony tiers, a slim CLAUDE.md, no needless rebuilds

2026-10-14, on `main`. The brief is `docs/prompts/speed-process.md`. The session was **Medium** by its own rule:
scripts, docs and two `package.json` scripts, with no schema, API, storage, PHP or print change.

Artur approved the plan with M1 to M4 and M8 kept. For M5 to M7 he chose the brief as written: no head line on the
moved files, every file the grep finds repointed (finished briefs and reports too), and the memory's frontmatter left
as it is.

## 1. Ceremony tiers

The rule is in CLAUDE.md, "How to work here", "Ceremony tiers": the brief's table and its four rules. A session names
its tier in its first answer. Next to it: a session records its work in its report and in one line of
`docs/status.md`'s log, never in CLAUDE.md, unless it changes a rule, a command or the map. "Before calling work
done" under Commands now points to the tiers, and keeps the full gate before a merge to `main` and before any release.

## 2. A slim CLAUDE.md

| | Lines | Bytes |
|---|---|---|
| CLAUDE.md before | 1,262 | 120,792 |
| CLAUDE.md now | 176 | 15,238 |
| `docs/architecture.md` (the 21 areas, a heading each) | 613 | 55,234 |
| `docs/design-decisions.md` (the 9 decisions, a heading each) | 140 | 11,127 |
| `docs/status.md` (short lines on top, a log, then the history) | 610 | 55,376 |

- A script copied the three sections out of `git show HEAD:CLAUDE.md` by line range, so nothing was retyped. Each area
  and each decision got a plain `##` heading, so its anchor is predictable.
- **Nothing lost.** A second script looked for every non-blank line of the old file in the four new ones, word for
  word. 5 of 1,263 lines were not found, all of them changed on purpose: the two lines of `test:render`'s comment
  and `test:php-smoke`'s (both now "build when their inputs changed"), and the two lines of "Before calling work
  done" (now the tiers).
- CLAUDE.md keeps the opening, Commands, Non-negotiables and How to work here as they were. The rest is in short
  form: the map (one or two lines an area, with any rule that must never break), one line a decision, and three
  lines of status. Every area and decision links to its section.
- **`tests/unit/claude-md.test.ts`** (M1): every link of CLAUDE.md and every `docs/….md` it names exists, every
  `#anchor` is a heading there (GitHub's slugs), and the file stays at 250 lines or fewer. Shown to fail on a
  misspelt file and on a misspelt anchor.
- **`docs/status.md`** opens with what was not in one place before. Now: what is unpushed, and what is next. Live:
  taken from the release tags. Left for Artur, Waiting, For Artur to decide (one line per feature, naming its
  report), Open. Then the log (M4), then the history.
- **Found on the way: the Status was behind on releases.** The tags say live runs `81639a1deb21` (built on
  2026-10-09 from `74b6761`, Parts 1 and 2 of the editor's UX round, tagged on 2026-10-13). The Laragon copy runs
  `58e8863b20da` (from `c249e02`, tagged on 2026-10-14). Looks stages 5 to 7 are in `main` and on origin
  (`8e14547`), where the history still says `main` is at `a96d1bf`. The lines on top say so; the history is left as
  it was written.

### Repointing

`grep -rn "CLAUDE.md"` on `docs scripts tests src server php` and README found 95 lines: 87 in tracked files, and 8 in
the two untracked briefs (`library-search.md`, `speed-tests.md`). One rule decided each:
- **Repointed**: the text sends a reader to a section that moved. 40 replacements in 24 files:
  - `docs/adding-a-look.md`;
  - 22 briefs in `docs/prompts/`, the pending `second-look.md` among them, with
    `library-search.md`, which is not tracked;
  - `docs/reports/open-items.md`.

  Examples: "Read CLAUDE.md (its 'A flyer prints in a look' and the looks status entry)" became
  `docs/architecture.md` ("Looks") and the looks entry of `docs/status.md`'s history. "Update the Status section of
  CLAUDE.md" became `docs/status.md`. "CLAUDE.md, 'Waiting'" became `docs/status.md`, "Waiting".
- **Left alone**:
  - a reference to the whole file: 22 lines of "Read CLAUDE.md", and others such as "`CLAUDE.md`: the project
    rules";
  - a section that stayed: the Non-negotiables, How to work here, Commands, the tiers. This covers
    `tests/cross/php-serves-a-node-store.test.ts:56`, `tests/render/fidelity.spec.ts:168` and
    `docs/spikes/client-export.md:144`;
  - a sentence that records what a past commit touched, such as the tables of files in `docs/reports/ai-assistant.md`
    and `docs/reports/ai-flyer-from-photo.md`, or "`CLAUDE.md` said the examples 'carry' the rules".
- README's rows for `test:render` and `test:php-smoke` say they build only when their inputs changed.

### Memory

- Six pointers in five files now name the new place: `ai-assistant-build.md` (two), `ai-flyer-briefs.md`,
  `editor-ux-round.md`, `flyer-labels.md` and `library-views.md`. Two lines of `looks-seam.md` record what a commit
  held, and stay.
- MEMORY.md is a short hook per file (7,358 bytes, now 1,860), as shown to Artur in the plan. Every fact the long
  lines carried was checked to be in its file first.
- Left by his answer (M7): `looks-seam.md`'s frontmatter `description` has two versions run together, with unescaped
  quotes, which breaks its YAML.

## 3. No rebuild when nothing changed

- **`scripts/build-if-changed.ts`** is a table of two targets:
  - `build` (`npm run build`: `dist/` and `dist-server/`, hash in `dist/.inputs-hash`);
  - `proof` (`npm run build:proof`: `dist-proof/`, hash in `dist-proof/.inputs-hash`).
- Each target has its inputs and the outputs that must exist. `inputsHash()` is sha256 over each input file's path and
  bytes (never its time), with a mark for an input that is missing. M3: it also hashes the command and the input
  list, and covers `package.json` and `node_modules/.package-lock.json` (what is really installed).
- `proof` leaves out `server/`, since `tests/proof/server.ts` runs the server from source, and adds `tests/proof/`
  and `vite.proof.config.ts`.
- It builds when the hash differs, when an output is missing, or when `FORCE_BUILD=1` is set. The hash file is
  deleted before a build and written after it succeeds.
- Seen: a `vite build` by hand empties `dist/`, the hash with it, and the next run rebuilds. `build:php` runs
  `npm run build` first, so a release never holds `.inputs-hash`.
- `test:render` runs `build proof`. `test:php-smoke` runs `build` (M2): it used to be `vite build` alone. Now it also
  makes `dist-server/` when it builds (tsc, about 1.5 s), so the two suites share one hash and never rebuild each
  other's `dist/`. Arguments still reach Playwright: `npm run test:render -- tests/render/pill.spec.ts`.
- **`tests/unit/build-if-changed.test.ts`**, 16 tests on temp folders:
  - a tree left alone, its file times changed, gives the same hash;
  - a changed, new, deleted or renamed file each gives a different hash;
  - a missing input gives a steady hash, and its arrival changes it;
  - a file that is not an input changes nothing;
  - a different command or input list gives a different hash;
  - the reasons to build, and `FORCE_BUILD`'s values;
  - every input of both targets exists in this checkout (a misspelt one would be "missing" for good);
  - each hash file is inside one of its target's own output folders.

**What it saves** (this PC, measured several times each; wall time):

| Step | Before | Now, nothing changed | Now, building |
|---|---|---|---|
| `test:render`'s build (`npm run build && npm run build:proof`) | 4.2 to 5.8 s | 0.7 s | 4.1 s of builds (2.2–2.4 + 1.6–1.8) |
| `test:php-smoke`'s build (`vite build`) | 1.1 to 2.2 s | 0.7 s | 2.4 s (now with tsc) |

- Of the 0.7 s, the hash takes 0.02 to 0.09 s; the rest is tsx starting up.
- So a second `test:render` with nothing changed saves about **4 to 5 s**. `test:php-smoke` saves 0.4 to 1.5 s, and
  costs about 1 s more when it builds (the tsc of M2), which the suites' shared hash pays back the next time either
  runs.
- That is less than the brief hoped for: Vite 8 builds the client in 0.4 s and TypeScript 7's tsc takes about 1.5 s,
  so the build was never the slow part. The time is in the specs, which `docs/prompts/speed-tests.md` measures first.

## The gates

All green, on this PC, with the dev server running beside them:

| Run | Result | Time |
|---|---|---|
| `npm run typecheck` | clean | 4.4 s |
| `npm test` | 888 passed (55 files, the 20 new tests among them) | 34 s |
| `npm run test:contract` | 387 passed, 235 skipped (as before) | 121 s |
| `FORCE_BUILD=1 npm run test:render` | built (2.76 s + 1.98 s); 405 passed, 1 skipped | 620 s |
| `npm run test:render` again, nothing changed | **both builds skipped** (checked in 0.08 s and 0.02 s); 405 passed, 1 skipped | 648 s |
| `npm run test:php-smoke` (M8) | **build skipped** (the hash `test:render` left); 3 passed | 43 s |
| `npm run test:render -- tests/render/pill.spec.ts` | builds skipped; 10 passed | 22.5 s |

No UI changed, so there was no look in Chrome and no screenshot. The drawing did not change, so no sheet was needed.

## Left

- The commits, when Artur says: the build script and its test; the split, the repointing and the link test; this
  report.
- Nothing else of this session is his. `docs/prompts/speed-tests.md` comes after the new look, as it says.
