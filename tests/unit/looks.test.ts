import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ROOT } from '../../scripts/gen-shared.js';
import { CANVAS_IDS, PILL_TILT_ROOM, SHARED_GEOMETRY, pillBox } from '../../src/shared/layout.js';
import { FIRST_LOOK, allLooks, lookIds, lookOf } from '../../src/shared/looks.js';
import { DEFAULT_COLORS, DEFAULT_DOODLES, HAND_DRAWN, resolveDoodles } from '../../src/shared/looks/handDrawn.js';
import { geometryProblems } from '../geometry.js';

/** WCAG 2's contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* The registry of looks (src/shared/looks.ts): what every look must be, the resolver, and the one way to add a look.
   The proof look (tests/proof/) runs through the same tests in its own build. */

describe('the looks', () => {
  it('the first look is hand-drawn, called "Hand-drawn", and prints the shared boxes', () => {
    expect(FIRST_LOOK).toBe('hand-drawn');
    expect(allLooks()[0]).toBe(HAND_DRAWN);
    expect(HAND_DRAWN.name).toBe('Hand-drawn');
    expect(HAND_DRAWN.geometry).toBe(SHARED_GEOMETRY);
  });

  it('every look has an id of its own, in a slug’s shape, and a name', () => {
    const ids = lookIds();
    expect(new Set(ids).size, 'no id twice').toBe(ids.length);
    for (const look of allLooks()) {
      expect(look.id, look.id).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
      expect(look.name.trim(), look.id).not.toBe('');
    }
  });

  for (const look of allLooks()) {
    it(`${look.id}: its boxes keep every rule a look's boxes must keep (tests/geometry.ts)`, () => {
      expect(geometryProblems(look.geometry)).toEqual([]);
    });
  }

  it('hand-drawn paints in the flyer’s own ink, accent and ground, and in its own colours the rest', () => {
    const own = { bg: '#EEF3E2', ink: '#2B1D3A', accent: '#7A2E5C', mark: '#7FB800' };
    expect(HAND_DRAWN.palette({ colors: own })).toEqual({
      ground: '#EEF3E2',
      ink: '#2B1D3A',
      accent: '#7A2E5C',
      muted: '#3A3A34',
      surface: '#ffffff',
      highlight: '#FAC213',
      placeholder: '#E7E0CE',
      pillText: '#ffffff',
      pillDot: '#53CED1',
    });
  });

  it('hand-drawn sets each line of copy at the size and floor the renderer had (docs/prompts/looks-seam.md, the table)', () => {
    const sizes = Object.fromEntries(Object.entries(HAND_DRAWN.type).map(([line, t]) => [line, t.floor === undefined ? t.size : [t.size, t.floor]]));
    expect(sizes).toEqual({
      eyebrow: 36,
      headline1: [92, 0.5],
      headline2: [124, 0.5],
      spanish: [36, 0.8],
      chipLabel: 26,
      costGlyph: 36,
      chipBig: [46, 0.6],
      chipBigMarked: [46, 0.6],
      chipTime: [40, 0.7],
      chipSmall: [32, 0.7],
      extras: [30, 0.8],
      askEn: [62, 0.66],
      askEs: [34, 0.8],
      pill: [34, 0.7],
      weekDay: [34, 0.7],
      weekName: [44, 0.6],
      weekTime: [34, 0.7],
      weekPrice: [26, 0.7],
    });
    expect(HAND_DRAWN.type.extras.gap).toBe(16);
  });

  // Each look declares its inks and the grounds under them, and is held to its own minimum (the owner's answer 10:
  // another look's numbers are decided when its design arrives). Hand-drawn keeps the handoff's 4.5:1, and never prints
  // copy in the bright teal or in the website's orange. This holds the registry, not a stored flyer: hand-drawn's
  // three flyer colours are checked as a new flyer has them.
  for (const look of allLooks()) {
    it(`${look.id}: every line of copy reaches its contrast on the ground it sits on, in no ink the look forbids`, () => {
      const paint = look.palette({ colors: DEFAULT_COLORS });
      const forbidden = look.rules.forbiddenInks.map((c) => c.toLowerCase());
      for (const [line, t] of Object.entries(look.type)) {
        const ratio = contrast(paint[t.ink], paint[t.on]);
        expect(ratio, `${line}: ${paint[t.ink]} on ${paint[t.on]}`).toBeGreaterThanOrEqual(look.rules.minContrast);
        expect(forbidden, `${line}: ${paint[t.ink]}`).not.toContain(paint[t.ink].toLowerCase());
      }
    });
  }

  it('hand-drawn’s art is the flyer’s own arrangement, and its pencil at the end of the ask', () => {
    // Artur's pick from the mock-ups (2026-10-12): "same size, higher", 14 px after the copy and 10 px above its top.
    const pencil = { slug: 'doodle-pencil', anchor: 'askEnd', x: 14, y: -10, w: 104, rot: -4 };
    expect(HAND_DRAWN.art({ doodles: DEFAULT_DOODLES })).toEqual([...resolveDoodles(DEFAULT_DOODLES), pencil]);
    const arranged = DEFAULT_DOODLES.map((d, i) => (i === 2 ? { ...d, x: d.x + 1 } : d));
    expect(HAND_DRAWN.art({ doodles: arranged })).toEqual([...arranged, pencil]);
    expect(HAND_DRAWN.wordmark).toBe('assets/nest-logo-teal.png');
  });

  it('hand-drawn’s frame is the handoff’s code-drawn one: a 5 px stroke, and the photo’s 40 px corners', () => {
    const { path, ...frame } = HAND_DRAWN.frame;
    expect(frame).toEqual({ viewBox: '0 0 960 200', stroke: 5, photoRadius: 40 });
    expect(path).toMatch(/^M46 9 C .* Z$/);
  });

  for (const look of allLooks()) {
    it(`${look.id}: every art file it names is under assets/`, () => {
      const files = [
        ...Object.values(look.inline).map((name) => `assets/art/${name}.png`),
        ...look.art({ doodles: DEFAULT_DOODLES }).map((d) => `assets/art/${d.slug}.png`),
        look.wordmark,
      ];
      expect(files.length).toBeGreaterThan(10);
      expect(files.filter((file) => !existsSync(join(ROOT, file)))).toEqual([]);
    });
  }

  it('hand-drawn’s pill is the handoff’s: 20 px corners, -0.6°, its padding, a 14 px dot 18 px from the words', () => {
    expect(HAND_DRAWN.pill).toEqual({ radius: 20, tilt: -0.6, padding: '17px 38px 19px', gap: 18, dot: 14 });
  });

  // A tilted pill as wide as its column reaches past its sides by (height × sin θ − width × (1 − cos θ)) / 2. The
  // renderer holds the pill PILL_TILT_ROOM inside its column, so a look's tilt may lift it no further: the safe zone is
  // a hard limit. Hand-drawn's -0.6° lifts it 0.35 px on the story.
  for (const look of allLooks()) {
    it(`${look.id}: its pill's tilt keeps a full-width pill inside the safe zone`, () => {
      const θ = (Math.abs(look.pill.tilt) * Math.PI) / 180;
      for (const canvas of CANVAS_IDS) {
        const { width, height } = pillBox(canvas, look.geometry);
        const lift = (height * Math.sin(θ) - width * (1 - Math.cos(θ))) / 2;
        expect(lift, canvas).toBeLessThanOrEqual(PILL_TILT_ROOM);
      }
    });
  }

  it('hand-drawn’s rules are the handoff’s: 4.5:1, and neither the bright teal nor the orange as ink', () => {
    expect(HAND_DRAWN.rules).toEqual({ minContrast: 4.5, forbiddenInks: ['#53CED1', '#EA580C'] });
  });

  it('a flyer prints in the look it names; one that names none, or a look this release does not know, prints hand-drawn', () => {
    expect(lookOf({ look: 'hand-drawn' })).toBe(HAND_DRAWN);
    expect(lookOf({})).toBe(HAND_DRAWN);
    expect(lookOf({ look: 'a-later-look' })).toBe(HAND_DRAWN);
    for (const own of ['__proto__', 'toString', 'constructor']) expect(lookOf({ look: own }), own).toBe(HAND_DRAWN);
  });

  it('a look is added only before anything reads the registry, and only once', async () => {
    vi.resetModules();
    const fresh = await import('../../src/shared/looks.js');
    const extra = { ...HAND_DRAWN, id: 'extra', name: 'Extra' };
    fresh.registerLook(extra);
    expect(() => fresh.registerLook({ ...extra })).toThrow(/a look with that id exists/);
    expect(fresh.lookIds()).toEqual(['hand-drawn', 'extra']);
    expect(fresh.lookOf({ look: 'extra' })).toBe(extra);
    expect(() => fresh.registerLook({ ...HAND_DRAWN, id: 'late', name: 'Late' })).toThrow(/already read/);
    vi.resetModules();
  });
});

describe('no look is written into the renderer or the editor', () => {
  // A component reads a look's tokens through lookOf(); it never asks which look it is. A look's id written there is a
  // branch the next look does not get.
  const sources = ['src/flyer', 'src/editor'].flatMap((dir) =>
    (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => ({ file: `${dir}/${f.replace(/\\/g, '/')}`, text: readFileSync(join(ROOT, dir, f), 'utf8') })),
  );

  it('no look’s id is a string in src/flyer or src/editor', () => {
    expect(sources.length).toBeGreaterThan(20);
    const written = sources.flatMap(({ file, text }) =>
      lookIds().flatMap((id) => [...text.matchAll(new RegExp(`(['"\`])${id}\\1`, 'g'))].map(() => `${file}: '${id}'`)),
    );
    expect(written).toEqual([]);
  });
});
