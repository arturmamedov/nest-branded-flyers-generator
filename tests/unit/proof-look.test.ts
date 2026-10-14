// The proof look joins the registry before anything reads it: this import stays first.
import '../proof/register.js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../scripts/gen-shared.js';
import { CANVAS_IDS, photoFrame, SHARED_GEOMETRY } from '../../src/shared/layout.js';
import { lookIds, lookOf } from '../../src/shared/looks.js';
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

  it('its face ships nowhere: a devDependency, never imported by src/flyer/fonts.css', () => {
    expect(pkg.dependencies[fontPackage(PROOF_FAMILY)]).toBeUndefined();
    expect(readFileSync(join(ROOT, 'src/flyer/fonts.css'), 'utf8')).not.toContain(fontPackage(PROOF_FAMILY));
  });

  it('no file under src/ names it', () => {
    const files = (readdirSync(join(ROOT, 'src'), { recursive: true }) as string[]).filter((f) => /\.(tsx?|css|html)$/.test(f));
    expect(files.length).toBeGreaterThan(50);
    expect(files.filter((f) => readFileSync(join(ROOT, 'src', f), 'utf8').includes(PROOF_LOOK_ID))).toEqual([]);
  });

  describe('differs from hand-drawn in every token', () => {
    const lower = (values: Iterable<string>) => new Set([...values].map((v) => v.toLowerCase()));
    const shared = <T,>(a: Iterable<T>, b: Iterable<T>) => [...a].filter((v) => new Set(b).has(v));

    it('its colours', () => {
      const mine = lower(Object.values(PROOF_LOOK.palette({ colors: DEFAULT_COLORS })));
      const theirs = lower(Object.values(HAND_DRAWN.palette({ colors: DEFAULT_COLORS })));
      expect(shared(mine, theirs)).toEqual([]);
    });

    it('its faces, and the font of every line', () => {
      expect(shared(PROOF_LOOK.faces.map((f) => f.family), HAND_DRAWN.faces.map((f) => f.family))).toEqual([]);
      expect(PROOF_LOOK.body).not.toBe(HAND_DRAWN.body);
      for (const [line, t] of Object.entries(PROOF_LOOK.type)) {
        const theirs = HAND_DRAWN.type[line as keyof typeof HAND_DRAWN.type];
        expect(t.font, line).not.toBe(theirs.font);
        expect(t.size, line).not.toBe(theirs.size);
      }
    });

    it('its files: art, inline art and the wordmark', () => {
      const files = (look: typeof PROOF_LOOK) => [...Object.values(look.inline), ...look.art({ doodles: DEFAULT_DOODLES }).map((d) => d.slug), look.wordmark];
      expect(shared(files(PROOF_LOOK), files(HAND_DRAWN))).toEqual([]);
    });

    it('its frame and its pill', () => {
      for (const key of ['path', 'stroke', 'photoRadius'] as const) expect(PROOF_LOOK.frame[key], key).not.toBe(HAND_DRAWN.frame[key]);
      for (const key of Object.keys(HAND_DRAWN.pill) as (keyof typeof HAND_DRAWN.pill)[]) expect(PROOF_LOOK.pill[key], key).not.toBe(HAND_DRAWN.pill[key]);
      expect(PROOF_LOOK.rules).not.toEqual(HAND_DRAWN.rules);
    });

    it('its boxes on every canvas, the photo’s shape among them', () => {
      for (const canvas of CANVAS_IDS) {
        expect(PROOF_LOOK.geometry[canvas]?.boxes, canvas).toBeDefined();
        for (const mode of ['bleed', 'band'] as const) {
          const mine = photoFrame(canvas, mode, PROOF_LOOK.geometry)!;
          const theirs = photoFrame(canvas, mode, SHARED_GEOMETRY)!;
          expect(mine.width / mine.height, `${canvas} / ${mode}`).not.toBeCloseTo(theirs.width / theirs.height, 2);
        }
      }
    });
  });
});
