# Faster sessions: ceremony tiers, a slim CLAUDE.md, no needless rebuilds

One session. Do it before the new look's sessions: they are the ones it speeds up.

Read first: CLAUDE.md (all of it, once: this session moves most of it), README.md, package.json's scripts,
playwright.config.ts, playwright.php.config.ts, vite.config.ts, vite.proof.config.ts, and the memory index
(MEMORY.md) with the files it points to. Another session may be working in the same folder: stage by path, never
check out or reset.

## Why

A small change (a pill moved by 10 px, one sentence of copy) costs a session hours today: brief, plan, tests first,
every gate on every backend, a fresh-context review, screenshots on both backends at four widths, a report, a
CLAUDE.md status entry and a memory entry. And CLAUDE.md is about 1,260 lines that every session reads before its
first step, most of it history that is already in `docs/reports/`.

## 1. Ceremony tiers (the rule, in CLAUDE.md "How to work here")

A session names its tier in its first answer, with one line of why. Artur may raise it. When in doubt, the higher tier.

| Tier | When | What it does |
|---|---|---|
| **Small** | Copy, a token, a CSS rule, one visual nudge, a test fix, docs. No schema, API, storage or PHP change. | The tests nearest the change (the spec or unit file named), typecheck, one look in Chrome at the width it concerns. A commit message; no report, no CLAUDE.md entry, no memory entry unless Artur gives a new rule. |
| **Medium** | A feature in one layer (the editor, the renderer) with no data or API change. | Small's, plus the full gate once at the end (`typecheck`, `test`, `test:contract`, `test:render`). A short section in an existing report or a new short one. Screenshots on one backend: a client-only change draws the same pixels on both. |
| **Large** | A schema or data change, an API change, anything in `php/` or `server/`, a migration, a release, the AI's prompts, anything that changes a printed flyer for stored flyers. | Today's full process: brainstorm, plan approved, tests first, the full gate plus `test:php` and `test:php-smoke`, a fresh-context review, screenshots on both backends, a signed sheet for a print change, a report, the status line. |

Also in the rule:
- The fresh-context review is for Large alone.
- Screenshots on both backends only when a backend changed, or the change is Large.
- A sheet of every sample before and after stays mandatory for any change to the print (it is Artur's own rule), at
  any tier: a print change is never Small.
- The full gate is mandatory before a merge to `main` and before any release, whatever the tiers of the work in it.

## 2. A slim CLAUDE.md (target: 250 lines at most)

Nothing is deleted: everything moves, word for word, to a file CLAUDE.md links. Only CLAUDE.md is cut.

- **Keeps, as they are:** the opening paragraph, Commands, Non-negotiables, How to work here (with the tiers).
- **Architecture** becomes a map: one or two lines per area (what it is, its main files, the doc that holds the
  rest). The full text moves to `docs/architecture.md`, with the same headings so a link can point at a section.
- **Design decisions already made** becomes one line per decision (what was decided, so no session "fixes" it), with
  a link to its paragraph in `docs/design-decisions.md`, which takes the full text.
- **Status** moves to `docs/status.md`: on top, what is open, waiting or Artur's to decide, in short lines; under it
  the history, word for word. CLAUDE.md keeps five lines at most: the current branch's work, what is live, and the
  link.
- From now on a session records its work in its report and in one line of `docs/status.md`, never in CLAUDE.md,
  unless it changes a rule, a command or the map.
- Check every link (a script or a grep: each `docs/...` path and `#section` anchor exists). Check that no other file
  points at a CLAUDE.md section that moved (`grep -rn "CLAUDE.md" docs scripts tests src server php`), and repoint it.
- The memory: memory files that say "see CLAUDE.md" for something that moved get the new place. Shorten each line of
  MEMORY.md to one short hook (the file keeps the detail): show Artur the new index before writing it.

## 3. No rebuild when nothing changed (`test:render`, `test:php-smoke`)

- `scripts/build-if-changed.ts`: a hash of the build's inputs (`src/`, `server/`, `assets/`, `seed/`, `schema/`,
  `index.html`, `render.html`, the vite and tsconfig files, `package-lock.json`), stored beside the output
  (`dist/.inputs-hash`, `dist-proof/.inputs-hash`). It builds only when the hash differs or the output is missing.
  `FORCE_BUILD=1` builds anyway. Find the real input list from the configs; a missed input is a stale build, so
  prefer one too many.
- `test:render` and `test:php-smoke` use it for each of their builds. `npm run build` itself stays as it is.
- The hash is a pure function with a unit test: a changed file, a new file, a deleted file and an untouched tree.
- Document in CLAUDE.md's Commands: `npm run test:render -- tests/render/pill.spec.ts` runs one spec (the arguments
  reach `playwright test`), and `FORCE_BUILD=1`.

## Done when

- CLAUDE.md is 250 lines or fewer, and `docs/architecture.md`, `docs/design-decisions.md` and `docs/status.md` hold
  every line that left it (a diff of the old file against the four new ones shows nothing lost).
- `npm run typecheck && npm test && npm run test:contract && npm run test:render` are green.
- A second `npm run test:render` with nothing changed builds nothing: say how many seconds it saved.
- This session is Medium by its own rule: a short report, `docs/reports/faster-sessions.md`. Ask before committing.
