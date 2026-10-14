# Launch prompt: the real second look, from Claude Design's handoff

Written 2026-10-14, at the end of the session that finished the looks seam (stages 5 to 7, `bfcb54c..993bf4b`), for a
session with no memory of it. Before launching it, put Claude Design's handoff in **`design_handoff_new_look/`** at the
repo's root, next to the first handoff (`design_handoff_flyer_generator/`), as it came: the README or spec, the
mock-ups, the art, the fonts' names. Then paste the block below.

Suggested run: Claude Opus 5.5 (`claude-opus-5-5`), effort **high**, started in plan mode.

```
Read CLAUDE.md (its "A flyer prints in a look" and the looks status entry), then docs/adding-a-look.md whole (the
checklist: follow it), the answers in docs/prompts/looks-seam.md (decided: don't reopen them), and
docs/prompts/claude-design-brief.md (what Claude Design was asked for). Then read design_handoff_new_look/ whole: it
is Claude Design's handoff for the second look.

Port that design into the app as a look: one entry in src/shared/looks/, its art under assets/art/, its fonts, read by
the one renderer. Hand-drawn must not change by one pixel. The proof look stays as the tests' canary.

HOW TO WORK

- Start in plan mode. Check git first: branch feat/second-look from main. If the tree is not clean, or another
  session may be writing in this folder, stop and ask. Stage by path. Warn me before a src/shared/ edit if npm run dev
  may be running.
- Show me SHORT, in a table: what the design asks for, token by token, against the Look interface; what it asks for
  that a look cannot hold (a width, the order of the boxes, a safe zone, a field, a text limit, fit.ts, the marks or
  the badges, a size written inside the renderer), each with what you would do; its fonts and art files, with their
  names. Ask me, one question at a time:
  - the look's id (stored in every flyer, forever) and the name staff see on the switch;
  - its contrast minimum and its forbidden inks, orange among them (my answer 10: decided when the design arrives);
  - anything the design leaves open or that you would change.
  Build nothing before I say go.
- Show me pictures, not words: proof sheets drawn by the real renderer, every sample on both canvases, both
  templates, each photo mode, the new look beside Hand-drawn, and a flyer whose photo crop someone set (a photo of
  another shape re-cuts it). I sign them before the commit that ships the look.
- Capture the baseline first (tests/render/baseline.spec.ts, RENDER_BASELINE=capture, a temp folder) and check it
  after every commit that touches src/: Hand-drawn byte-identical.
- Every change with its test first; a commit per piece as it goes green. Push nothing, build no release (npm run
  build:php empties release/php/: don't run it unless I ask), don't touch the live site or the Laragon copy.
- Before calling it done: npm run typecheck && npm test && npm run test:contract && npm run test:render, then
  npm run test:php and npm run test:php-smoke; the baseline; and the editor in Chrome with both looks (the switch,
  the preview, the library card, one download per look per canvas).
- Then stop and record it: docs/reports/ (a report of its own), CLAUDE.md (architecture, decisions, status) in the
  style of its other entries, README.md, docs/deploy.md, and docs/adding-a-look.md where it was wrong or short. Tell
  me what is left that is mine: the release, then 'looks' in config.php (the Laragon copy first, then live).

NOT NOW

Steps 7 and 9 of the handoff (drag and nudge, the doodle picker), a look switch on Create with AI, a filter by look in
the library, a third look, the release.
```
