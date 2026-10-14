import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ROOT } from '../scripts/gen-shared.js';
import { CANVAS_IDS, PILL_TILT_ROOM, pillBox } from '../src/shared/layout.js';
import type { Look } from '../src/shared/looks.js';
import { DEFAULT_COLORS, DEFAULT_DOODLES } from '../src/shared/looks/handDrawn.js';
import { geometryProblems } from './geometry.js';

/* What every look must be, whoever adds it: the shipped looks (tests/unit/looks.test.ts) and the tests' proof look
   (tests/unit/proof-look.test.ts) run through these same checks. */

/** A family's self-hosted package: @fontsource names it in lower case, words joined by hyphens. */
export const fontPackage = (family: string) => `@fontsource/${family.toLowerCase().replace(/ /g, '-')}`;

/** WCAG 2's contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
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

/** Where a look's faces may come from: the families it may name, and the packages (name → version) that self-host
    them. A shipped look's are src/shared/fonts.ts's and the app's dependencies; the proof look's are its own. */
export interface FaceSources {
  families: readonly string[];
  packages: Record<string, string>;
}

/** The checks every look passes, as one `it` each, named by the look's id. */
export function lookContract(look: Look, faces: FaceSources): void {
  it(`${look.id}: its boxes keep every rule a look's boxes must keep (tests/geometry.ts)`, () => {
    expect(geometryProblems(look.geometry)).toEqual([]);
  });

  // Each look declares its inks and the grounds under them, and is held to its own minimum (the owner's answer 10:
  // another look's numbers are decided when its design arrives). This holds the registry, not a stored flyer:
  // hand-drawn's three flyer colours are checked as a new flyer has them.
  it(`${look.id}: every line of copy reaches its contrast on the ground it sits on, in no ink the look forbids`, () => {
    const paint = look.palette({ colors: DEFAULT_COLORS });
    const forbidden = look.rules.forbiddenInks.map((c) => c.toLowerCase());
    for (const [line, t] of Object.entries(look.type)) {
      const ratio = contrast(paint[t.ink], paint[t.on]);
      expect(ratio, `${line}: ${paint[t.ink]} on ${paint[t.on]}`).toBeGreaterThanOrEqual(look.rules.minContrast);
      expect(forbidden, `${line}: ${paint[t.ink]}`).not.toContain(paint[t.ink].toLowerCase());
    }
  });

  it(`${look.id}: every art file it names is under assets/`, () => {
    const files = [
      ...Object.values(look.inline).map((name) => `assets/art/${name}.png`),
      ...look.art({ doodles: DEFAULT_DOODLES }).map((d) => `assets/art/${d.slug}.png`),
      look.wordmark,
    ];
    expect(files.length).toBeGreaterThan(10);
    expect(files.filter((file) => !existsSync(join(ROOT, file)))).toEqual([]);
  });

  // A tilted pill as wide as its column reaches past its sides by (height × sin θ − width × (1 − cos θ)) / 2. The
  // renderer holds the pill PILL_TILT_ROOM inside its column, so a look's tilt may lift it no further: the safe zone is
  // a hard limit. Hand-drawn's -0.6° lifts it 0.35 px on the story.
  it(`${look.id}: its pill's tilt keeps a full-width pill inside the safe zone`, () => {
    const θ = (Math.abs(look.pill.tilt) * Math.PI) / 180;
    for (const canvas of CANVAS_IDS) {
      const { width, height } = pillBox(canvas, look.geometry);
      const lift = (height * Math.sin(θ) - width * (1 - Math.cos(θ))) / 2;
      expect(lift, canvas).toBeLessThanOrEqual(PILL_TILT_ROOM);
    }
  });

  it(`${look.id}: its faces are every face its type uses, each a family it may name, self-hosted from a pinned package`, () => {
    const faceOf = (font: string, weight: number) => `${/^'([^']+)'/.exec(font)?.[1]} ${weight}`;
    // Every line of copy sets its own font: the root's, look.body, prints none.
    const used = new Set(Object.values(look.type).map((t) => faceOf(t.font, t.weight)));
    const listed = look.faces.map((f) => `${f.family} ${f.weight}`);
    expect([...used].filter((f) => !listed.includes(f)), 'a face the type uses and the export would not wait for').toEqual([]);
    for (const { family, weight } of look.faces) {
      expect(faces.families, family).toContain(family);
      expect(faces.packages[fontPackage(family)], `${fontPackage(family)} pinned to one version`).toMatch(/^\d+\.\d+\.\d+$/);
      expect(existsSync(join(ROOT, 'node_modules', fontPackage(family), `${weight}.css`)), `${fontPackage(family)}/${weight}.css`).toBe(true);
    }
  });
}
