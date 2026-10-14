import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ROOT } from '../../scripts/gen-shared.js';
import { SHARED_GEOMETRY } from '../../src/shared/layout.js';
import { FIRST_LOOK, allLooks, lookIds, lookOf } from '../../src/shared/looks.js';
import { HAND_DRAWN } from '../../src/shared/looks/handDrawn.js';
import { geometryProblems } from '../geometry.js';


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
      placeholder: '#E7E0CE',
      pillText: '#ffffff',
      pillDot: '#53CED1',
    });
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
