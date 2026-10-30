// The proof look joins the registry before anything reads it: this import stays first.
import '../proof/register.js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../scripts/gen-shared.js';
import { CANVAS_IDS, photoFrame, SHARED_GEOMETRY } from '../../src/shared/layout.js';
import { allLooks, lookIds, lookOf, looksToPick } from '../../src/shared/looks.js';
import { DEFAULT_COLORS, DEFAULT_DOODLES, HAND_DRAWN } from '../../src/shared/looks/handDrawn.js';
import { fontPackage, lookContract } from '../lookContract.js';
import { PROOF_LOOK_ID } from '../proof/id.js';
import { PROOF_FAMILY, PROOF_LOOK } from '../proof/look.js';

/* The proof look (tests/proof/): a second look in the tests' build alone, which never ships (the owner's answer 14).
   It is held to everything a look must be, as the shipped looks are (tests/lookContract.ts), and it differs from
   hand-drawn in every token: that is what makes it a canary for the renderer (tests/render/looks.spec.ts). */

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe('the proof look', () => {
  it('joins the registry after the first look, in the tests’ build alone', () => {
    expect(lookIds()).toEqual([HAND_DRAWN.id, PROOF_LOOK_ID]);
    expect(lookOf({ look: PROOF_LOOK_ID })).toBe(PROOF_LOOK);
  });

  lookContract(PROOF_LOOK, { families: [PROOF_FAMILY], packages: pkg.devDependencies });

  // The editor's Look switch, with two looks in the registry (this release's own registry has one).
  it('the switch offers the site’s looks in its order, and a flyer’s own look after them when the site does not name it', () => {
    const hand = HAND_DRAWN.id;
    expect(looksToPick([hand, PROOF_LOOK_ID], {})).toEqual([HAND_DRAWN, PROOF_LOOK]);
    expect(looksToPick([PROOF_LOOK_ID, hand], { look: hand })).toEqual([PROOF_LOOK, HAND_DRAWN]);
    // M2: a flyer in a look the site no longer names still shows it, and so offers two.
    expect(looksToPick([hand], { look: PROOF_LOOK_ID })).toEqual([HAND_DRAWN, PROOF_LOOK]);
    // One look to pick: no switch. A flyer with no look, or a later release's, is drawn hand-drawn (lookOf).
    for (const data of [{}, { look: hand }, { look: 'a-later-look' }]) expect(looksToPick([hand], data), JSON.stringify(data)).toEqual([HAND_DRAWN]);
    expect(looksToPick([PROOF_LOOK_ID], { look: PROOF_LOOK_ID })).toEqual([PROOF_LOOK]);
  });

  it('its face ships nowhere: a devDependency, never imported by src/flyer/fonts.css', () => {
    expect(pkg.dependencies[fontPackage(PROOF_FAMILY)]).toBeUndefined();
    expect(readFileSync(join(ROOT, 'src/flyer/fonts.css'), 'utf8')).not.toContain(fontPackage(PROOF_FAMILY));
  });

  it('no file under src/ names it', () => {
    const files = (readdirSync(join(ROOT, 'src'), { recursive: true }) as string[]).filter((f) => /\.(tsx?|css|html)$/.test(f));
    expect(files.length).toBeGreaterThan(50);
    expect(files.filter((f) => readFileSync(join(ROOT, 'src', f), 'utf8').includes(PROOF_LOOK_ID))).toEqual([]);
  });

  // Against every look the release ships, not hand-drawn alone (docs/adding-a-look.md: a second shipped look arrived on
  // 2026-10-30): a value the proof look shares with any of them is a value the renderer could read from the wrong look
  // unseen.
  describe('differs from every shipped look in every token', () => {
    const shipped = allLooks().filter((l) => l.id !== PROOF_LOOK_ID);
    const lower = (values: Iterable<string>) => new Set([...values].map((v) => v.toLowerCase()));
    const shared = <T,>(a: Iterable<T>, b: Iterable<T>) => [...a].filter((v) => new Set(b).has(v));

    it('the shipped looks are the registry without it, hand-drawn first', () => {
      expect(shipped[0]).toBe(HAND_DRAWN);
      expect(shipped.map((l) => l.id)).toEqual(lookIds().filter((id) => id !== PROOF_LOOK_ID));
    });

    for (const theirs of shipped) {
      describe(`against ${theirs.id}`, () => {
        it('its colours', () => {
          const mine = lower(Object.values(PROOF_LOOK.palette({ colors: DEFAULT_COLORS })));
          expect(shared(mine, lower(Object.values(theirs.palette({ colors: DEFAULT_COLORS }))))).toEqual([]);
        });

        it('its faces, and the font and size of every line', () => {
          expect(shared(PROOF_LOOK.faces.map((f) => f.family), theirs.faces.map((f) => f.family))).toEqual([]);
          expect(PROOF_LOOK.body).not.toBe(theirs.body);
          for (const [line, t] of Object.entries(PROOF_LOOK.type)) {
            const other = theirs.type[line as keyof typeof theirs.type];
            expect(t.font, line).not.toBe(other.font);
            expect(t.size, line).not.toBe(other.size);
          }
        });

        it('its files: art, inline art and the wordmark', () => {
          const files = (look: typeof PROOF_LOOK) => [...Object.values(look.inline), ...look.art({ doodles: DEFAULT_DOODLES }).map((d) => d.slug), look.wordmark];
          expect(shared(files(PROOF_LOOK), files(theirs))).toEqual([]);
        });

        it('its frame, its pill and its rules', () => {
          for (const key of ['path', 'stroke', 'photoRadius'] as const) expect(PROOF_LOOK.frame[key], key).not.toBe(theirs.frame[key]);
          for (const key of Object.keys(theirs.pill) as (keyof typeof theirs.pill)[]) expect(PROOF_LOOK.pill[key], key).not.toBe(theirs.pill[key]);
          expect(PROOF_LOOK.rules).not.toEqual(theirs.rules);
        });

        it('its boxes on every canvas, the photo’s shape among them', () => {
          for (const canvas of CANVAS_IDS) {
            expect(PROOF_LOOK.geometry[canvas]?.boxes, canvas).toBeDefined();
            for (const mode of ['bleed', 'band'] as const) {
              const mine = photoFrame(canvas, mode, PROOF_LOOK.geometry)!;
              const other = photoFrame(canvas, mode, theirs.geometry)!;
              expect(mine.width / mine.height, `${canvas} / ${mode}`).not.toBeCloseTo(other.width / other.height, 2);
            }
          }
        });
      });
    }

    it('its boxes are not the shared table’s either', () => {
      for (const canvas of CANVAS_IDS)
        for (const mode of ['bleed', 'band'] as const) {
          const mine = photoFrame(canvas, mode, PROOF_LOOK.geometry)!;
          const theirs = photoFrame(canvas, mode, SHARED_GEOMETRY)!;
          expect(mine.width / mine.height, `${canvas} / ${mode}`).not.toBeCloseTo(theirs.width / theirs.height, 2);
        }
    });
  });
});
