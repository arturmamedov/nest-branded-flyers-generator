# Faster tests: measure, parallel browser specs, only the affected suites, incremental checks

One session. Do it after the new look is done and signed: parallel specs can bring flakes, and the look's work
needs render tests it can trust. `docs/prompts/speed-process.md` comes first (its tiers say when the full gate runs).

Read first: CLAUDE.md, `docs/reports/faster-sessions.md`, package.json's scripts, playwright.config.ts,
playwright.php.config.ts, vitest.config.ts, vitest.contract.config.ts, the tsconfig files, `tests/browser.ts`,
`tests/editor.ts`, and the render specs' setup (what each one creates, reads and changes in the library). Another
session may be working in the same folder: stage by path, never check out or reset.

## 0. Measure first

Before any change, and again at the end, in the same table:
- each suite's wall time: `typecheck`, `test`, `test:contract` (per project), `test:render` (build apart from
  tests, and per project), `test:php`, `test:php-smoke`;
- the ten slowest render specs and the ten slowest contract files.

Run each twice and keep the second (a cold first run lies). Aim the work below at what the numbers show; if a step
would save little, say so and skip it rather than build it.

## 1. Parallel browser specs (`playwright.config.ts`)

Today `workers: 1` on an 8-core PC, three servers.
- Audit every spec for shared state: flyers it expects in the library (the seeded samples), flyers it creates,
  deletes or renames, list order or counts it reads (the library specs), the AI project's day of generations, the
  clock. Write the audit into the report as a table.
- Make the `render` project parallel (`workers` from an env var, default half the cores). A spec that reads or
  changes the shared library either works on flyers of its own (made in the spec, named so no other spec meets them)
  or moves to a serial project of its own. The `ai` project stays serial: its counts are the day's.
- Never weaken an assertion to make it pass in parallel. A flake found is a defect: fix its cause.
- `baseline.spec.ts` and the fidelity checks must give the same bytes as before.
- Proof: the whole browser suite green three runs in a row, in parallel, with no retry.

## 2. Only the suites a change can reach: `npm run test:affected`

- `scripts/affected.ts`: the changed files (against the merge base with `main`, plus staged, unstaged and untracked),
  mapped to suites by one table in that file, a pure function with its own unit tests.
- The mapping, to check against the code (a path that matches nothing runs everything):
  - `docs/**` only: nothing.
  - `src/editor/**`, `editor.css`: typecheck, `test`, `test:render`.
  - `src/flyer/**`, `src/render/**`, `assets/**`: typecheck, `test`, `test:render`, `test:php-smoke`.
  - `server/**`: typecheck, `test`, `test:contract`, `test:render`.
  - `php/**`: `test:php`, `test:contract`, `test:php-smoke`.
  - `src/shared/**`, `schema/**`, `seed/**`, `ai/**`, `package*.json`, configs, `tests/` helpers: everything.
- It prints what it runs and why, then runs it. `--list` prints only.
- It is for working. The full gate stays mandatory before a merge to `main` and before a release (CLAUDE.md, the
  tiers): say so in its output and in CLAUDE.md's Commands.

## 3. Faster small loops: vitest on changed files, incremental typecheck

- `npm run test:changed`: `vitest run --changed` (against `main`'s merge base, as `test:affected`), for the
  loop inside a session.
- `typecheck` incremental: build info kept between runs (`--incremental` with a `tsBuildInfoFile` under
  `node_modules/.cache/`, or `tsc -b` with project references). The project is on TypeScript 7: check that the
  flag works there, and measure; if it saves nothing, leave `typecheck` as it is and say so.
- Nothing of either goes into git (`.gitignore`).

## Done when

- The table of step 0 has a before and an after column for every row.
- `npm run typecheck && npm test && npm run test:contract && npm run test:render`, `npm run test:php` and
  `npm run test:php-smoke` are green, and the browser suite is green three runs in a row in parallel.
- `test:affected` and `test:changed` are in CLAUDE.md's Commands, with the rule that they never replace the full gate
  before a merge or a release.
- This session is Medium by the tiers: add its section to `docs/reports/faster-sessions.md`. Ask before committing.
