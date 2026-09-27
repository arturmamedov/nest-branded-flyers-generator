import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { deriveChips, splitDot } from '../../src/shared/chips.js';
import { lintFlyer } from '../../src/shared/copyRules.js';
import { DEFAULT_DOODLES, PROTOTYPE_DOODLES, newFlyerData, resolveDoodles, sameDoodles, type ArtPlacement } from '../../src/shared/defaults.js';
import {
  CANVASES,
  CANVAS_IDS,
  WEEK,
  activityGroups,
  artAnchors,
  inside,
  isCanvasId,
  overlaps,
  photoFrame,
  placeArt,
  safeBox,
  type CanvasId,
  type PhotoMode,
} from '../../src/shared/layout.js';
import { clampCrop, coverRect, panCrop, wholePhotoZoom, zoomCrop } from '../../src/shared/photo.js';
import { SAMPLE_FLYERS } from '../../src/shared/samples.js';
import { FlyerDataSchema } from '../../src/shared/schema.js';

const HOSTELS: Record<string, string> = {
  'duque-nest': 'Duque Nest',
  'los-amigos-nest': 'Los Amigos Nest',
};

describe('the · convention', () => {
  it('splits big from sub and drops empties', () => {
    expect(splitDot('Saturday 19/9 · 15:00')).toEqual(['Saturday 19/9', '15:00']);
    expect(splitDot(' · 15:00 · ')).toEqual(['15:00']);
    expect(splitDot('')).toEqual([]);
  });

  it('derives the six design records exactly as the prototype does', () => {
    const got = SAMPLE_FLYERS.map((s) =>
      deriveChips(s.data.chips, s.hostel ? HOSTELS[s.hostel] : null).map((c) => [c.key, c.big, c.sub]),
    );
    expect(got).toEqual([
      [['when', 'Saturday 19/9', '15:00'], ['where', 'Duque Nest', 'The pool'], ['cost', 'Free', 'food & drinks']],
      [['when', 'Tonight', '20:30'], ['where', 'Duque Nest', 'The terrace'], ['cost', '8€ with a drink', '']],
      [['when', 'Fridays', '15:00'], ['where', 'Pick-up', '14:30'], ['cost', '40€ a class', '']],
      [
        ['when', 'Saturday 27/9', '05:30'],
        ['where', 'Los Amigos Nest', 'Playa de las Américas · Av. Rafael Puig 12'],
        ['cost', '25€ with breakfast', '18€ without'],
      ],
      [['when', 'Most mornings', ''], ['where', 'Duque Nest', 'Meet at reception'], ['cost', '90€', '']],
      [['when', 'Fridays', '20:30'], ['where', 'Duque Nest', 'The terrace'], ['cost', '8€ with a drink', '']],
    ]);
  });

  it('prints WHEN · WHERE · COST whatever the stored order', () => {
    const chips = [
      { key: 'cost' as const, label: 'Cost', value: '5€' },
      { key: 'when' as const, label: 'When', value: 'Today' },
      { key: 'where' as const, label: 'Where', value: 'Bar' },
    ];
    expect(deriveChips(chips, null).map((c) => c.key)).toEqual(['when', 'where', 'cost']);
  });

  it('collapses a chip with nothing to say, but WHERE still shows the hostel', () => {
    const chips = [
      { key: 'when' as const, label: 'When', value: '' },
      { key: 'where' as const, label: 'Where', value: '' },
      { key: 'cost' as const, label: 'Cost', value: ' · ' },
    ];
    expect(deriveChips(chips, null)).toEqual([]);
    expect(deriveChips(chips, 'Duque Nest').map((c) => c.big)).toEqual(['Duque Nest']);
  });
});

const MODES: PhotoMode[] = ['bleed', 'band', 'none'];

describe('canvases', () => {
  it('the registry: story 9:16 and WhatsApp exactly 3:4, ids checked as own keys', () => {
    expect(CANVAS_IDS).toEqual(['story', 'whatsapp']);
    expect([CANVASES.story.width, CANVASES.story.height]).toEqual([1080, 1920]);
    expect([CANVASES.whatsapp.width, CANVASES.whatsapp.height]).toEqual([1080, 1440]);
    expect(CANVASES.whatsapp.width * 4).toBe(CANVASES.whatsapp.height * 3);
    expect(CANVAS_IDS.every(isCanvasId)).toBe(true);
    for (const bad of ['__proto__', 'toString', 'constructor', '', 'STORY', null, undefined, 1, {}]) expect(isCanvasId(bad), String(bad)).toBe(false);
  });

  it('the story is exactly the handoff\'s: 250 top, 300 bottom, 70 sides, the design pass\'s boxes', () => {
    expect(safeBox('story')).toEqual({ left: 70, top: 250, width: 940, height: 1370 });
    const inner = (top: number, height: number) => ({ left: 70, top, width: 940, height });
    expect(activityGroups('story', 'bleed')).toEqual({
      eyebrow: inner(250, 95),
      headline: inner(345, 300),
      chips: inner(1110, 206),
      extras: inner(1318, 40),
      ask: inner(1382, 150),
      pill: inner(1544, 72),
      photo: { left: 0, top: 712, width: 1080, height: 380 },
    });
    expect(activityGroups('story', 'band').photo).toEqual(inner(712, 380));
    expect(activityGroups('story', 'none')).toMatchObject({ headline: inner(398, 460), photo: { left: 240, top: 900, width: 600, height: 32 } });
    expect([photoFrame('story', 'bleed'), photoFrame('story', 'band'), photoFrame('story', 'none')]).toEqual([
      { width: 1080, height: 380 },
      { width: 940, height: 380 },
      null,
    ]);
    expect(artAnchors('story', 'bleed')).toEqual({
      canvas: { x: 0, y: 0, scale: 1 },
      photoLeft: { x: 70, y: 712, scale: 1 },
      photoRight: { x: 1010, y: 712, scale: 1 },
      bottomLeft: { x: 0, y: 1920, scale: 1 },
      bottomRight: { x: 1080, y: 1920, scale: 1 },
      floor: { x: 540, y: 1620, scale: 1 },
    });
    expect(artAnchors('story', 'band')).toEqual(artAnchors('story', 'bleed'));
    expect(artAnchors('story', 'none')).toMatchObject({ photoLeft: { x: 240, y: 900, scale: 1 }, photoRight: { x: 840, y: 900, scale: 1 } });
  });

  for (const canvas of CANVAS_IDS) {
    const { height, safe, activity: a } = CANVASES[canvas];
    for (const mode of MODES) {
      it(`${canvas} / ${mode}: groups never overlap and stay in the safe box`, () => {
        const groups = Object.entries(activityGroups(canvas, mode));
        for (const [name, rect] of groups) {
          if (name === 'photo' && mode === 'bleed') {
            // The one sanctioned exception, horizontally: edge to edge, and inside vertically.
            expect([rect!.left, rect!.width], name).toEqual([0, CANVASES[canvas].width]);
            expect(inside({ ...rect!, left: safe.side, width: 1 }, safeBox(canvas)), name).toBe(true);
            continue;
          }
          expect(inside(rect!, safeBox(canvas)), name).toBe(true);
        }
        for (let i = 0; i < groups.length; i++)
          for (let j = i + 1; j < groups.length; j++)
            expect(overlaps(groups[i][1]!, groups[j][1]!), `${groups[i][0]} × ${groups[j][0]}`).toBe(false);
      });
    }

    it(`${canvas}: the bottom stack is allocated upward from its floor`, () => {
      const floor = height - safe.bottom;
      // The pill is tilted -0.6°: 4 px under it keep its corners off the floor.
      expect(a.pill.top + a.pill.height + 4).toBeLessThanOrEqual(floor);
      expect(a.ask.top + a.ask.height).toBeLessThanOrEqual(a.pill.top);
      expect(a.extras.top + a.extras.height).toBeLessThanOrEqual(a.ask.top);
      expect(a.chips.top + a.chips.height).toBeLessThanOrEqual(a.extras.top);
      expect(a.photoBand.top + a.photoBand.height).toBeLessThanOrEqual(a.chips.top);
      expect(a.photoBleed.top + a.photoBleed.height, 'bleed and band end together: the blocks below are shared').toBe(a.photoBand.top + a.photoBand.height);
      expect(a.eyebrow.height, 'the eyebrow row is 62 px of icon and text').toBeGreaterThanOrEqual(62);
      expect(a.headline.top).toBeGreaterThanOrEqual(a.eyebrow.top + a.eyebrow.height);
    });

    it(`${canvas}: every photo frame has the story's aspect, so one crop shows the same picture`, () => {
      for (const mode of ['bleed', 'band'] as const) {
        const f = photoFrame(canvas, mode)!;
        const s = photoFrame('story', mode)!;
        // Within half a pixel of the exact height at this width.
        expect(Math.abs(f.height - (f.width * s.height) / s.width), mode).toBeLessThanOrEqual(0.5);
      }
    });

    it(`${canvas}: fitted boxes at least the story's size, and a column of at least 940`, () => {
      // Not a proof that copy fitting the story fits here (a wider line shrinks less, then needs
      // more height): that is why the editor fits every canvas. It keeps clipping here rare.
      const story = CANVASES.story.activity;
      for (const box of ['headline', 'headlineNoPhoto', 'chips', 'extras', 'ask'] as const) {
        expect(a[box].width, box).toBeGreaterThanOrEqual(story[box].width);
        expect(a[box].height, box).toBeGreaterThanOrEqual(story[box].height);
      }
      // schema.ts's max lengths keep the unfitted lines (eyebrow, handle, tag) inside a 940 column.
      expect(safeBox(canvas).width).toBeGreaterThanOrEqual(940);
    });
  }

  it('five week rows end before the ask block (the week template is story only until step 8)', () => {
    const { top, rowHeight, gap, max } = WEEK.rows;
    expect(top + max * rowHeight + (max - 1) * gap).toBe(1370);
    expect(1370).toBeLessThan(CANVASES.story.activity.ask.top);
  });
});

describe('photo crop', () => {
  const img = { width: 2000, height: 1000 };
  const frame = { width: 1080, height: 380 };

  it('covers the frame, centred, at zoom 1', () => {
    const r = coverRect(img, frame, { x: 0.5, y: 0.5, zoom: 1 });
    expect(r.width).toBeCloseTo(1080);
    expect(r.height).toBeCloseTo(540);
    expect(r.left).toBeCloseTo(0);
    expect(r.top).toBeCloseTo(-80);
  });

  it('pans on both axes, even when the photo exactly fills one of them', () => {
    // 2000×1000 fills the 1080 width exactly: the old cover clamp allowed no X movement.
    const moved = panCrop({ x: 0.5, y: 0.5, zoom: 1 }, 100, 40, img, frame);
    const r = coverRect(img, frame, moved);
    expect(r.left).toBeCloseTo(100);
    expect(r.top).toBeCloseTo(-40);
  });

  it('never loses the photo: its centre stays inside the frame', () => {
    const far = coverRect(img, frame, panCrop({ x: 0.5, y: 0.5, zoom: 1 }, 10_000, -10_000, img, frame));
    expect(far.left + far.width / 2).toBeCloseTo(frame.width); // centre on the right edge
    expect(far.top + far.height / 2).toBeCloseTo(0); // centre on the top edge
  });

  it('a big photo can still be pushed flush to an edge, and edges are sticky', () => {
    const big = { width: 4000, height: 1000 }; // 1520 wide at cover: centred at left -220
    const flush = coverRect(big, frame, panCrop({ x: 0.5, y: 0.5, zoom: 1 }, 220 - 6, 0, big, frame));
    expect(flush.left).toBeCloseTo(0); // 6px short of flush snaps flush
    const nudged = coverRect(big, frame, panCrop({ x: 0.5, y: 0.5, zoom: 1 }, 220 - 6, 0, big, frame, false));
    expect(nudged.left).toBeCloseTo(-6); // keyboard nudges don't snap
  });

  it('zooms out below "fills the frame", down to a quarter, centred', () => {
    const r = coverRect(img, frame, zoomCrop({ x: 0.5, y: 0.5, zoom: 1 }, 0.5, img, frame));
    expect([r.width, r.height]).toEqual([540, 270]);
    expect(r.left).toBeCloseTo(270);
    expect(r.top).toBeCloseTo(55);
    expect(clampCrop({ x: 0.5, y: 0.5, zoom: 0.01 }, img, frame).zoom).toBe(0.25);
    expect(clampCrop({ x: 0.5, y: 0.5, zoom: 99 }, img, frame).zoom).toBe(4);
  });

  it('"whole photo" fits the entire image inside the frame', () => {
    const portrait = { width: 1066, height: 1600 };
    const band = { width: 940, height: 380 };
    const r = coverRect(portrait, band, { x: 0.5, y: 0.5, zoom: wholePhotoZoom(portrait, band) });
    expect(r.height).toBeCloseTo(380);
    expect(r.width).toBeLessThanOrEqual(940);
    expect(wholePhotoZoom(img, frame)).toBeCloseTo((380 / 1000) / (1080 / 2000));
  });

  it('one crop, two frames of the same aspect: the same picture, scaled', () => {
    const photos = [
      { width: 1080, height: 1350 },
      { width: 896, height: 370 },
      { width: 1600, height: 1200 },
      { width: 1066, height: 1600 },
      // Wider than the band's 47:19, so its height binds: where 404 instead of 404.26 shows.
      { width: 3000, height: 1000 },
    ];
    const crops = [
      { x: 0.5, y: 0.5, zoom: 1 },
      { x: 0.2, y: 0.9, zoom: 0.4 },
      { x: 0.8, y: 0.1, zoom: 2.5 },
      { x: -0.4, y: 1.6, zoom: 0.25 },
      { x: 0.5, y: 0.3, zoom: 4 },
    ];
    for (const canvas of CANVAS_IDS)
      for (const mode of ['bleed', 'band'] as const) {
        const f = photoFrame(canvas, mode)!;
        const s = photoFrame('story', mode)!;
        const k = f.width / s.width;
        for (const photo of photos)
          for (const crop of crops) {
            const a = coverRect(photo, f, crop);
            const b = coverRect(photo, s, crop);
            // Same picture: every edge within 0.1 % of the photo's size (0.2 px at least) of the story's, scaled.
            const tolerance = Math.max(0.2, 0.001 * Math.max(a.width, a.height));
            for (const key of ['left', 'top', 'width', 'height'] as const) expect(Math.abs(a[key] - b[key] * k), `${canvas} ${mode} ${key}`).toBeLessThan(tolerance);
          }
      }
  });

  it('a zoomed-out photo round-trips through the schema', () => {
    const d = newFlyerData();
    d.photoCrop = panCrop({ x: 0.5, y: 0.5, zoom: 0.25 }, -10_000, 0, { width: 1066, height: 1600 }, { width: 1080, height: 380 });
    expect(FlyerDataSchema.safeParse(d).success).toBe(true);
  });
});

/** The art's PNGs: size and the opaque (alpha ≥ 128) pixels, for ink checks. Test-only geometry. */
const ink = new Map<string, { width: number; height: number; px: [number, number][] }>();
function artInk(slug: string) {
  if (!ink.has(slug)) {
    const png = PNG.sync.read(readFileSync(new URL(`../../assets/art/${slug}.png`, import.meta.url)));
    const px: [number, number][] = [];
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) if (png.data[(y * png.width + x) * 4 + 3] >= 128) px.push([x, y]);
    ink.set(slug, { width: png.width, height: png.height, px });
  }
  return ink.get(slug)!;
}

/** Where a piece's ink lands, as canvas points, placed as Flyer.tsx places it (rotate, then flip, about the centre). */
function inkPoints(d: ArtPlacement, canvas: CanvasId, mode: PhotoMode): [number, number][] {
  const art = artInk(d.slug);
  const { left, top, width: w } = placeArt(d, artAnchors(canvas, mode));
  const h = (w * art.height) / art.width;
  const t = ((d.rot ?? 0) * Math.PI) / 180;
  return art.px.map(([sx, sy]) => {
    const ex = ((sx + 0.5) * w) / art.width - w / 2;
    const ey = ((sy + 0.5) * h) / art.height - h / 2;
    const rx = ex * Math.cos(t) - ey * Math.sin(t);
    const ry = ex * Math.sin(t) + ey * Math.cos(t);
    return [left + w / 2 + (d.flipX ? -rx : rx), top + h / 2 + ry];
  });
}

/** Share of a piece's ink that lands on the canvas. */
function inkOnCanvas(d: ArtPlacement, canvas: CanvasId, mode: PhotoMode): number {
  const { width, height } = CANVASES[canvas];
  const ink = inkPoints(d, canvas, mode);
  return ink.filter(([x, y]) => x >= 0 && x < width && y >= 0 && y < height).length / ink.length;
}

describe('template art', () => {
  it('on the story the template art lands exactly where DEFAULT_DOODLES stores it', () => {
    for (const mode of MODES) {
      const resolved = resolveDoodles(DEFAULT_DOODLES);
      const anchors = artAnchors('story', mode);
      resolved.forEach((d, i) => {
        const stored = DEFAULT_DOODLES[i];
        if (stored.anchor) return expect(d).toBe(stored);
        const at = placeArt(d, anchors);
        // toBe, not toBeCloseTo: the story must not move by a float's last bit.
        expect(at.left, `${d.slug} x`).toBe(stored.x);
        expect(at.top, `${d.slug} y`).toBe(stored.y);
        expect(at.width, `${d.slug} w`).toBe(stored.w);
        expect({ ...d, anchor: undefined, x: stored.x, y: stored.y }).toEqual({ ...stored, anchor: undefined });
      });
    }
  });

  it('only the untouched template set follows the canvas; any other art stays in canvas px', () => {
    expect(resolveDoodles(PROTOTYPE_DOODLES)).toBe(PROTOTYPE_DOODLES);
    const moved = DEFAULT_DOODLES.map((d, i) => (i === 2 ? { ...d, x: d.x + 1 } : d));
    expect(resolveDoodles(moved)).toBe(moved);
    expect(resolveDoodles(newFlyerData().doodles).map((d) => d.anchor)).toEqual(['photoLeft', 'photoRight', 'bottomLeft', 'bottomRight', 'floor']);
  });

  it('the photo-corner sparks land exactly where the design pass put them on the story (band and bleed)', () => {
    for (const mode of ['band', 'bleed'] as const) {
      const a = artAnchors('story', mode);
      const [teal, yellow] = DEFAULT_DOODLES;
      expect([a[teal.anchor!].x + teal.x, a[teal.anchor!].y + teal.y]).toEqual([24, 657]);
      expect([a[yellow.anchor!].x + yellow.x, a[yellow.anchor!].y + yellow.y]).toEqual([975, 658]);
    }
  });

  for (const canvas of CANVAS_IDS) {
    it(`${canvas}: the sparks on the photo's corners clear the headline, and with no photo follow the brush rule`, () => {
      const [teal, yellow] = DEFAULT_DOODLES;
      const { activity } = CANVASES[canvas];
      for (const mode of ['band', 'bleed'] as const) {
        const a = artAnchors(canvas, mode);
        expect(a.photoLeft.y + teal.y, mode).toBeGreaterThanOrEqual(activity.headline.top + activity.headline.height);
        expect(a.photoRight.y + yellow.y, mode).toBeGreaterThanOrEqual(activity.headline.top + activity.headline.height);
      }
      const none = artAnchors(canvas, 'none');
      expect(none.photoLeft).toMatchObject({ x: activity.noPhotoRule.left, y: activity.noPhotoRule.top });
      expect(none.photoRight.x).toBe(activity.noPhotoRule.left + activity.noPhotoRule.width);
    });

    it(`${canvas}: the last spark keeps the story's place at the pill's end`, () => {
      const spark = resolveDoodles(DEFAULT_DOODLES).at(-1)!;
      expect(spark.anchor).toBe('floor');
      const pillBottom = (c: CanvasId) => CANVASES[c].activity.pill.top + CANVASES[c].activity.pill.height;
      const at = (c: CanvasId) => placeArt(spark, artAnchors(c, 'band'));
      // Its offset from the pill, not from the canvas edge, is what the design pass set: 776, 1601.7 on the story.
      expect(at(canvas).top - pillBottom(canvas)).toBeCloseTo(at('story').top - pillBottom('story'), 9);
      expect(at(canvas).left - CANVASES[canvas].width / 2).toBe(at('story').left - CANVASES.story.width / 2);
      expect(at(canvas).width, 'the pill does not shrink, so neither does its spark').toBe(spark.w);
    });

    it(`${canvas}: the corner blobs keep off the ask's lines and the pill's spark`, () => {
      // The ask's copy is at most 760 wide (Flyer.tsx), from the column's left edge.
      const { ask } = CANVASES[canvas].activity;
      const art = resolveDoodles(DEFAULT_DOODLES);
      const cells = (d: ArtPlacement) => new Set(inkPoints(d, canvas, 'band').map(([x, y]) => `${Math.floor(x / 2)},${Math.floor(y / 2)}`));
      const spark = cells(art.find((d) => d.anchor === 'floor')!);
      for (const blob of art.filter((d) => d.anchor === 'bottomLeft' || d.anchor === 'bottomRight')) {
        const onAsk = inkPoints(blob, canvas, 'band').filter(([x, y]) => x >= ask.left && x < ask.left + 760 && y >= ask.top && y < ask.top + ask.height);
        expect(onAsk.length, `${blob.slug} ink on the ask's lines`).toBe(0);
        expect([...cells(blob)].filter((c) => spark.has(c)).length, `${blob.slug} ink on the pill's spark`).toBe(0);
      }
    });

    it(`${canvas}: the template art keeps at least as much of its ink on canvas as on the story`, () => {
      for (const mode of MODES)
        resolveDoodles(DEFAULT_DOODLES).forEach((d) => {
          expect(inkOnCanvas(d, canvas, mode), `${d.slug} / ${mode}`).toBeGreaterThanOrEqual(inkOnCanvas(d, 'story', mode) - 0.01);
        });
    });
  }

  it('the clock is gone and the bottom spark sits off the pill', () => {
    expect(DEFAULT_DOODLES.map((d) => d.slug)).not.toContain('icon-clock');
    expect(DEFAULT_DOODLES.at(-1)).toMatchObject({ slug: 'spark-teal', x: 776, y: 1601.7, w: 92, rot: -137, flipX: true });
  });

  it('recognises the untouched prototype set regardless of key order', () => {
    const reordered = PROTOTYPE_DOODLES.map(({ slug, w, x, y, rot, flipX, opacity }) => ({ w, slug, y, x, rot, flipX, opacity }));
    expect(sameDoodles(reordered, PROTOTYPE_DOODLES)).toBe(true);
    expect(sameDoodles(DEFAULT_DOODLES, PROTOTYPE_DOODLES)).toBe(false);
  });
});

describe('copy rules', () => {
  const base = () => {
    const d = newFlyerData();
    d.text.headline1 = 'Saturday is a';
    d.text.headline2 = 'pool party.';
    d.chips[0].value = 'Saturday 19/9 · 15:00';
    return d;
  };

  it('a clean flyer has no warnings (the pill spends the one !)', () => {
    expect(lintFlyer(base())).toEqual([]);
  });

  it('a second exclamation mark warns; hiding the pill frees one', () => {
    const d = base();
    d.text.headline2 = 'pool party!';
    expect(lintFlyer(d).map((l) => l.field)).toContain('text');
    d.showPill = false;
    expect(lintFlyer(d)).toEqual([]);
  });

  it('flags book now, bullets and separator slashes, but not dates', () => {
    const d = base();
    d.text.askEn = 'Book now at reception';
    d.extras = ['Towels • drinks', 'Beer/wine'];
    const fields = lintFlyer(d).map((l) => l.field);
    expect(fields).toEqual(expect.arrayContaining(['askEn', 'extras.0', 'extras.1']));
    expect(fields).not.toContain('chip.when');
  });

  it('flags an all-caps headline', () => {
    const d = base();
    d.text.headline2 = 'POOL PARTY.';
    expect(lintFlyer(d).map((l) => l.field)).toContain('headline2');
  });
});

describe('schema', () => {
  it('accepts every sample and a new flyer', () => {
    for (const s of SAMPLE_FLYERS) expect(FlyerDataSchema.safeParse(s.data).success, s.title).toBe(true);
    expect(FlyerDataSchema.safeParse(newFlyerData()).success).toBe(true);
  });

  it('rejects a fifth extra', () => {
    const d = newFlyerData();
    d.extras = ['a', 'b', 'c', 'd', 'e'];
    expect(FlyerDataSchema.safeParse(d).success).toBe(false);
  });
});
