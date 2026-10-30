import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ROOT } from '../../scripts/gen-shared.js';
import { EYEBROW_MARKS, marksOf } from '../../src/shared/defaults.js';
import * as fonts from '../../src/shared/fonts.js';
import { SHARED_GEOMETRY } from '../../src/shared/layout.js';
import { FIRST_LOOK, allLooks, lookIds, lookOf, siteLooks } from '../../src/shared/looks.js';
import { DEFAULT_COLORS, DEFAULT_DOODLES, HAND_DRAWN, resolveDoodles } from '../../src/shared/looks/handDrawn.js';
import { SUNSET_VIBES, sunsetIconSlug } from '../../src/shared/looks/sunsetVibes.js';
import { fontPackage, lookContract } from '../lookContract.js';

const PACKAGES = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }).dependencies;

/* The registry of looks (src/shared/looks.ts): what every look must be (tests/lookContract.ts), the resolver, and the
   one way to add a look. The proof look (tests/proof/) runs through the same checks in tests/unit/proof-look.test.ts. */

/** The families a shipped look may name: src/shared/fonts.ts's. */
const FAMILIES = Object.entries(fonts).filter(([name]) => name.endsWith('_FAMILY')).map(([, family]) => family);

describe('the looks', () => {
  for (const look of allLooks()) lookContract(look, { families: FAMILIES, packages: PACKAGES });

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
      // The three roles the Sunset look brought (2026-10-30), each the colour hand-drawn prints there anyway.
      hot: '#7A2E5C',
      value: '#2B1D3A',
      line: '#0D6F82',
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
      // The price after the middle dot, on its own line: hand-drawn sets it as the price (the Sunset look sets it smaller).
      weekPriceSub: [26, 0.7],
    });
    expect(HAND_DRAWN.type.extras.gap).toBe(16);
  });

  it('hand-drawn’s art is the flyer’s own arrangement, and its pencil at the end of the ask', () => {
    // Artur's pick from the mock-ups (2026-10-12): "same size, higher", 14 px after the copy and 10 px above its top.
    const pencil = { slug: 'doodle-pencil', anchor: 'askEnd', x: 14, y: -10, w: 104, rot: -4 };
    expect(HAND_DRAWN.art({ doodles: DEFAULT_DOODLES })).toEqual([...resolveDoodles(DEFAULT_DOODLES), pencil]);
    const arranged = DEFAULT_DOODLES.map((d, i) => (i === 2 ? { ...d, x: d.x + 1 } : d));
    expect(HAND_DRAWN.art({ doodles: arranged })).toEqual([...arranged, pencil]);
    expect(HAND_DRAWN.wordmark).toBe('assets/nest-logo-teal.png');
  });

  it('hand-drawn’s inline art is the handoff’s files: the € glyph where a look may draw a cost icon, and nothing above the ask', () => {
    expect(HAND_DRAWN.inline).toEqual({
      eyebrowIcon: 'icon-calendar',
      eyebrowRule: 'rule-teal-wide',
      photoRule: 'rule-teal-wide',
      askRule: 'rule-teal-ask',
      whenIcon: 'icon-calendar',
      whereIcon: 'icon-pin',
      costIcon: null,
      askIcon: null,
      clock: 'icon-clock',
      highlighter: 'mark-yellow',
    });
  });

  it('hand-drawn’s marks are the app’s setting, at the wordmark’s height', () => {
    expect(HAND_DRAWN.marks).toBeUndefined();
    expect(marksOf(HAND_DRAWN)).toEqual({ which: EYEBROW_MARKS, height: 56 });
  });

  it('hand-drawn’s frame is the handoff’s code-drawn one: a 5 px stroke, and the photo’s 40 px corners', () => {
    const { path, ...frame } = HAND_DRAWN.frame;
    expect(frame).toEqual({ viewBox: '0 0 960 200', stroke: 5, photoRadius: 40 });
    expect(path).toMatch(/^M46 9 C .* Z$/);
  });

  it('hand-drawn’s pill is the handoff’s: 20 px corners, -0.6°, its padding, a 14 px dot 18 px from the words', () => {
    expect(HAND_DRAWN.pill).toEqual({ radius: 20, tilt: -0.6, padding: '17px 38px 19px', gap: 18, dot: 14 });
  });

  it('src/flyer/fonts.css imports exactly the faces of the looks the app ships', () => {
    const imported = [...readFileSync(join(ROOT, 'src/flyer/fonts.css'), 'utf8').matchAll(/@import '([^']+)';/g)].map((m) => m[1]).sort();
    const faces = new Set(allLooks().flatMap((look) => look.faces.map((f) => `${fontPackage(f.family)}/${f.weight}.css`)));
    expect(imported).toEqual([...faces].sort());
  });

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
    expect(fresh.lookIds()).toEqual(['hand-drawn', 'sunset-vibes', 'extra']);
    expect(fresh.lookOf({ look: 'extra' })).toBe(extra);
    expect(() => fresh.registerLook({ ...HAND_DRAWN, id: 'late', name: 'Late' })).toThrow(/already read/);
    vi.resetModules();
  });
});

describe('the Sunset Vibes look (stage 1: the look as data, docs/prompts/sunset-vibes-look.md)', () => {
  it('is the second look, with the id and the name Artur kept (2026-10-30)', () => {
    expect(lookIds()).toEqual(['hand-drawn', 'sunset-vibes']);
    expect(allLooks()[1]).toBe(SUNSET_VIBES);
    expect(SUNSET_VIBES.name).toBe('Sunset Vibes');
    expect(lookOf({ look: 'sunset-vibes' })).toBe(SUNSET_VIBES);
  });

  it('prints Day on every flyer, whatever its stored colours: the handoff’s set (README §3.2) and its three new roles', () => {
    const day = {
      ground: '#FFFFFF',
      ink: '#0D6F82',
      accent: '#0D6F82',
      muted: '#35606E',
      surface: '#FFFFFF',
      highlight: '#FFFFFF',
      placeholder: '#CFE7F0',
      pillText: '#FFFFFF',
      pillDot: '#0D6F82',
      hot: '#EA580C',
      value: '#C2410C',
      line: '#0D6F82',
    };
    expect(SUNSET_VIBES.palette({ colors: DEFAULT_COLORS })).toEqual(day);
    expect(SUNSET_VIBES.palette({ colors: { bg: '#EEF3E2', ink: '#2B1D3A', accent: '#7A2E5C', mark: '#7FB800' } })).toEqual(day);
  });

  it('sets each line of copy as the handoff’s type table (README §4): its sizes, and no floor where a line is never shrunk', () => {
    const sizes = Object.fromEntries(Object.entries(SUNSET_VIBES.type).map(([line, t]) => [line, t.floor === undefined ? t.size : [t.size, t.floor]]));
    expect(sizes).toEqual({
      eyebrow: 24.3,
      headline1: [144.64, 0.6],
      headline2: [188.17, 0.6],
      spanish: [22, 0.8],
      chipLabel: 22,
      costGlyph: 24,
      chipBig: [24, 0.6],
      chipBigMarked: [24, 0.6],
      chipTime: [44, 0.6],
      chipSmall: 20,
      extras: [17, 0.8],
      askEn: 22,
      askEs: 19.5,
      pill: [22, 0.7],
      weekDay: 22,
      weekName: 26,
      weekTime: [34, 0.6],
      weekPrice: 20,
      weekPriceSub: 18,
    });
    // The headline words: Archivo Black and Caveat Brush, tilted later, held to 3:1 (§7.14); the rest Montserrat.
    expect(SUNSET_VIBES.type.headline1).toMatchObject({ font: "'Archivo Black', sans-serif", weight: 400, upper: true, minContrast: 3, ink: 'hot' });
    expect(SUNSET_VIBES.type.headline2).toMatchObject({ font: "'Caveat Brush', cursive", weight: 400, minContrast: 3, ink: 'accent' });
    expect(SUNSET_VIBES.type.headline1.rotate, 'the tilt comes with the staggered kind').toBeUndefined();
    for (const [line, t] of Object.entries(SUNSET_VIBES.type)) if (!line.startsWith('headline')) expect(t.font, line).toBe("'Montserrat', sans-serif");
    expect(SUNSET_VIBES.type.chipBig.ink).toBe('value');
    expect(SUNSET_VIBES.type.weekDay).toMatchObject({ ink: 'value', on: 'highlight' });
    expect(SUNSET_VIBES.faces).toEqual([
      { family: 'Archivo Black', weight: 400 },
      { family: 'Caveat Brush', weight: 400 },
      { family: 'Montserrat', weight: 400 },
      { family: 'Montserrat', weight: 500 },
      { family: 'Montserrat', weight: 600 },
      { family: 'Montserrat', weight: 700 },
    ]);
  });

  it('holds its copy to 4.5:1 and forbids no ink: the orange is its own (Artur, 2026-10-30)', () => {
    expect(SUNSET_VIBES.rules).toEqual({ minContrast: 4.5, forbiddenInks: [] });
  });

  it('draws its icons in the line colour and no rules, clock or highlighter; its wordmark in the text teal', () => {
    expect(SUNSET_VIBES.inline).toEqual({
      eyebrowIcon: null,
      eyebrowRule: null,
      photoRule: null,
      askRule: null,
      whenIcon: 'sunset-icon-clock-0d6f82',
      whereIcon: 'sunset-icon-pin-0d6f82',
      costIcon: 'sunset-icon-euro-0d6f82',
      askIcon: 'sunset-icon-pen-0d6f82',
      clock: null,
      highlighter: null,
    });
    expect(sunsetIconSlug('pen', '#0D6F82')).toBe('sunset-icon-pen-0d6f82');
    expect(SUNSET_VIBES.wordmark).toBe('assets/art/sunset-wordmark-0d6f82.png');
  });

  it('places the pieces today’s anchors can hang (the confetti, the top-right botanical, the band at full size on both canvases), the same on every flyer', () => {
    const art = SUNSET_VIBES.art({ doodles: DEFAULT_DOODLES });
    expect(art).toEqual([
      { slug: 'sunset-confetti-day', x: 182.39, y: 3.82, w: 804.03, rot: 0 },
      { slug: 'sunset-bot-tr', x: 806.9, y: 0, w: 269.28, rot: 0 },
      { slug: 'sunset-bot-band', anchor: 'bottomLeft', x: 0, y: -274.06, w: 1080, rot: 0 },
    ]);
    expect(SUNSET_VIBES.art({ doodles: [] })).toBe(art);
    // The design's boxes wait for the photo behind everything (stage 2): the shared table, and the band unshrunk on WhatsApp.
    expect(SUNSET_VIBES.geometry).toEqual({ whatsapp: { cornerScale: 1 } });
  });

  it('draws no frame, today’s pill with no corners and no tilt (its line kind comes later), and the marks as hand-drawn', () => {
    expect(SUNSET_VIBES.frame).toEqual({ path: 'M0 0 H 960 V 200 H 0 Z', viewBox: '0 0 960 200', stroke: 0, photoRadius: 0 });
    expect(SUNSET_VIBES.pill).toEqual({ radius: 0, tilt: 0, padding: '10px 24px 12px', gap: 18, dot: 8 });
    expect(SUNSET_VIBES.marks).toEqual({ which: 'both', height: 56 });
  });
});

describe('the looks a site offers, as the editor reads api/config', () => {
  // Read against two looks of the table's own (tests/fixtures/looks-settings.json): this release has one.
  const known = ['hand-drawn', 'second'];

  it('takes the site’s list whole, in its order: a new flyer starts in the first', () => {
    expect(siteLooks(['second', 'hand-drawn'], known)).toEqual(['second', 'hand-drawn']);
    expect(siteLooks(['hand-drawn'], known)).toEqual(['hand-drawn']);
    expect(siteLooks([FIRST_LOOK])).toEqual([FIRST_LOOK]);
  });

  it('reads an answer it cannot take whole as the first look alone: no switch, and new flyers hand-drawn', () => {
    // A backend from before looks answers none; a later one may name a look this client does not have.
    for (const answer of [undefined, null, 'second', [], ['second', 'another'], ['second', 'second'], [1], { 0: 'second' }]) {
      expect(siteLooks(answer, known), JSON.stringify(answer)).toEqual(['hand-drawn']);
    }
    expect(siteLooks(undefined)).toEqual([FIRST_LOOK]);
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
