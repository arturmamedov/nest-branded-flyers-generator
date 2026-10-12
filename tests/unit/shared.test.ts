import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { deriveChips, splitBigSub, splitDot } from '../../src/shared/chips.js';
import { MAX_EXCLAMATIONS, lintFlyer } from '../../src/shared/copyRules.js';
import {
  DEFAULT_DOODLES,
  DEFAULT_PHOTO_MODE,
  DEFAULT_TEXT,
  PROTOTYPE_DOODLES,
  SWAPPED_BLOBS,
  newFlyerData,
  resolveDoodles,
  sameDoodles,
  switchTemplate,
  withPhoto,
  type ArtPlacement,
} from '../../src/shared/defaults.js';
import {
  CANVASES,
  CANVAS_IDS,
  DEFAULT_CANVAS,
  DEFAULT_PILL_WIDTH,
  activityGroups,
  artAnchors,
  bodyOf,
  inside,
  isCanvasId,
  overlaps,
  photoFrame,
  pillBox,
  placeArt,
  safeBox,
  weekGroups,
  weekRowRect,
  type Body,
  type CanvasId,
  type PhotoMode,
} from '../../src/shared/layout.js';
import { DEFAULT_CROP, clampCrop, coverRect, panCrop, wholePhotoZoom, zoomCrop } from '../../src/shared/photo.js';
import { SAMPLE_FLYERS } from '../../src/shared/samples.js';
import { FlyerDataSchema, type Crop } from '../../src/shared/schema.js';
import { SHARE_MAX } from '../../src/shared/share.js';
import { TEXT_LIMITS } from '../../src/shared/text.js';
import { WEEK_ROWS_MAX } from '../../src/shared/week.js';

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

  it('splits a value into its big line and the rest, rejoined', () => {
    expect(splitBigSub('25€ with breakfast · 18€ without')).toEqual({ big: '25€ with breakfast', sub: '18€ without' });
    expect(splitBigSub('10€ · 8€ with a card · kids free')).toEqual({ big: '10€', sub: '8€ with a card · kids free' });
    expect(splitBigSub(' · ')).toEqual({ big: '', sub: '' });
  });

  it('derives the six design records exactly as the prototype does', () => {
    const got = SAMPLE_FLYERS.filter((s) => s.data.template === 'activity').map((s) =>
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

  // The owner's answer (2026-10-05). It is the screen's default alone: the export API's own stays the story.
  it('the canvas a viewer who never chose sees is WhatsApp', () => {
    expect(DEFAULT_CANVAS).toBe('whatsapp');
    expect(isCanvasId(DEFAULT_CANVAS)).toBe(true);
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
      pillEnd: { x: 832.5, y: 1544, scale: 1 },
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

    it(`${canvas}: the pill's box is the safe column, the one both templates draw it in, and the one it fits`, () => {
      const box = pillBox(canvas);
      const safeColumn = safeBox(canvas);
      expect([box.left, box.width], 'the safe column across').toEqual([safeColumn.left, safeColumn.width]);
      expect([box.top, box.height], 'where the stack puts it').toEqual([a.pill.top, a.pill.height]);
      for (const mode of MODES) expect(activityGroups(canvas, mode).pill).toEqual(box);
      expect(weekGroups(canvas).pill).toEqual(box);
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
      // text.ts's limits keep the unfitted lines (eyebrow, handle, tag) inside a 940 column.
      expect(safeBox(canvas).width).toBeGreaterThanOrEqual(940);
    });
  }

  it("the story's week is the handoff's §2: the title at 398/250, five 122 px rows 15 apart from 700 to 1370", () => {
    const inner = (top: number, height: number) => ({ left: 70, top, width: 940, height });
    expect(weekGroups('story')).toEqual({
      eyebrow: inner(250, 95),
      title: inner(398, 250),
      rows: inner(700, 670),
      ask: inner(1382, 150),
      pill: inner(1544, 72),
    });
    expect([0, 1, 2, 3, 4].map((slot) => weekRowRect('story', slot))).toEqual([
      inner(700, 122),
      inner(837, 122),
      inner(974, 122),
      inner(1111, 122),
      inner(1248, 122),
    ]);
    expect(photoFrame('story', 'week'), 'a week flyer has no photo frame').toBeNull();
  });

  it("WhatsApp's week, signed off 2026-09-29: the title at 162/250, five rows from 464 to 1134, 30 px above the ask", () => {
    const inner = (top: number, height: number) => ({ left: 40, top, width: 1000, height });
    expect(weekGroups('whatsapp')).toMatchObject({ title: inner(162, 250), rows: inner(464, 670), ask: inner(1164, 150) });
    expect(weekRowRect('whatsapp', 4)).toEqual(inner(1012, 122));
  });

  it("a flyer's body is its photo mode, or the week's rows whatever its photo mode says", () => {
    expect(bodyOf({ template: 'activity', photoMode: 'band' })).toBe('band');
    expect(bodyOf({ template: 'activity', photoMode: 'none' })).toBe('none');
    expect(bodyOf({ template: 'week', photoMode: 'bleed' })).toBe('week');
  });

  for (const canvas of CANVAS_IDS) {
    it(`${canvas} / week: groups never overlap and stay in the safe box, and five rows end at least 12 px above the ask`, () => {
      const groups = Object.entries(weekGroups(canvas));
      for (const [name, rect] of groups) expect(inside(rect!, safeBox(canvas)), name).toBe(true);
      for (let i = 0; i < groups.length; i++)
        for (let j = i + 1; j < groups.length; j++)
          expect(overlaps(groups[i][1]!, groups[j][1]!), `${groups[i][0]} × ${groups[j][0]}`).toBe(false);
      const { week: w, activity: a } = CANVASES[canvas];
      const last = weekRowRect(canvas, WEEK_ROWS_MAX - 1);
      expect(last.top + last.height, 'the rows box holds exactly five rows').toBe(w.rows.top + w.rows.height);
      expect(last.top + last.height + 12).toBeLessThanOrEqual(a.ask.top);
      expect(w.title.top, 'the title starts below the eyebrow').toBeGreaterThanOrEqual(a.eyebrow.top + a.eyebrow.height);
      for (let slot = 1; slot < WEEK_ROWS_MAX; slot++) {
        const [prev, next] = [weekRowRect(canvas, slot - 1), weekRowRect(canvas, slot)];
        expect(next.top - (prev.top + prev.height), `gap before row ${slot}`).toBe(15);
        expect(next.height).toBe(122);
      }
    });
  }
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

describe('a photo landing on a flyer', () => {
  /* withPhoto() is what a photo dropped in the editor does to the flyer, and what the AI page does when the picture
     an idea was read from becomes the flyer's photo (docs/prompts/ai-flyer-from-photo.md, stage 4): one function. */
  const moved: Crop = { x: 0.2, y: 0.8, zoom: 2 };

  it('on "No photo" it lands in the default mode, "In a frame", with the crop where a new photo starts', () => {
    const d = { ...newFlyerData(), photoMode: 'none' as const, photoCrop: moved };
    expect(withPhoto(d)).toEqual({ ...d, photoMode: DEFAULT_PHOTO_MODE, photoCrop: DEFAULT_CROP });
    expect(DEFAULT_PHOTO_MODE, 'the owner’s choice (2026-09-28)').toBe('band');
  });

  it('a mode already chosen stays, and the crop starts over: it was the photo’s before', () => {
    for (const photoMode of ['bleed', 'band'] as const) {
      const d = { ...newFlyerData(), photoMode, photoCrop: moved };
      expect(withPhoto(d), photoMode).toEqual({ ...d, photoCrop: DEFAULT_CROP });
    }
  });

  it('touches nothing else, and leaves the flyer it was given as it was', () => {
    const d = { ...newFlyerData(), photoMode: 'none' as const, photoCrop: moved, share: 'Hola' };
    const before = structuredClone(d);
    const { photoMode: _, photoCrop: __, ...rest } = withPhoto(d);
    const { photoMode: ___, photoCrop: ____, ...same } = before;
    expect(rest).toEqual(same);
    expect(d).toEqual(before);
    expect(FlyerDataSchema.safeParse(withPhoto(d)).success).toBe(true);
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
function inkPoints(d: ArtPlacement, canvas: CanvasId, mode: Body): [number, number][] {
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
function inkOnCanvas(d: ArtPlacement, canvas: CanvasId, mode: Body): number {
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
        // The stored piece but for where it hangs from, and for the blobs the ink they print in.
        expect({ ...d, anchor: undefined, x: stored.x, y: stored.y, slug: stored.slug }).toEqual({ ...stored, anchor: undefined });
      });
    }
  });

  it('only the untouched template set follows the canvas; any other art stays in canvas px', () => {
    expect(resolveDoodles(PROTOTYPE_DOODLES)).toBe(PROTOTYPE_DOODLES);
    const moved = DEFAULT_DOODLES.map((d, i) => (i === 2 ? { ...d, x: d.x + 1 } : d));
    expect(resolveDoodles(moved)).toBe(moved);
    expect(resolveDoodles(newFlyerData().doodles).map((d) => d.anchor)).toEqual(['photoLeft', 'photoRight', 'bottomLeft', 'bottomRight', 'pillEnd']);
  });

  it('the corner blobs print in each other’s ink, teal on the left and yellow on the right (Artur, 2026-10-12); stored art keeps its slugs', () => {
    expect(DEFAULT_DOODLES.map((d) => d.slug)).toEqual(['spark-teal', 'spark-yellow', 'blob-yellow', 'blob-teal', 'spark-teal']);
    expect(resolveDoodles(newFlyerData().doodles).map((d) => d.slug)).toEqual(['spark-teal', 'spark-yellow', 'blob-left-teal', 'blob-right-yellow', 'spark-teal']);
    // Each new file is one blob's drawing in the other's ink, and the two trade.
    expect(SWAPPED_BLOBS).toEqual({ 'blob-left-teal': { drawing: 'blob-yellow', ink: 'blob-teal' }, 'blob-right-yellow': { drawing: 'blob-teal', ink: 'blob-yellow' } });
    // Art someone arranged is drawn as stored, inks included.
    const moved = DEFAULT_DOODLES.map((d, i) => (i === 4 ? { ...d, x: d.x + 1 } : d));
    expect(resolveDoodles(moved).map((d) => d.slug)).toEqual(DEFAULT_DOODLES.map((d) => d.slug));
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

    it(`${canvas}: the last spark hangs from the pill's end, and where the default pill ends it is where the design pass put it`, () => {
      const spark = resolveDoodles(DEFAULT_DOODLES).at(-1)!;
      expect(spark.anchor).toBe('pillEnd');
      const { activity, width } = CANVASES[canvas];
      const end = artAnchors(canvas, 'band').pillEnd;
      // The anchor: the right end of the default pill, which is centred, at the top of the pill's row.
      expect(end).toEqual({ x: width / 2 + DEFAULT_PILL_WIDTH / 2, y: activity.pill.top, scale: 1 });
      // Its offsets from the pill are what the design pass set, on every canvas: 776, 1601.7 on the story.
      expect([spark.x, spark.y, spark.w]).toEqual([776 - 832.5, 1601.7 - 1544, 92]);
      const at = placeArt(spark, artAnchors(canvas, 'band'));
      expect(at.left - end.x).toBe(spark.x);
      expect(at.top - end.y).toBeCloseTo(spark.y, 9);
      expect(at.width, 'the pill does not shrink, so neither does its spark').toBe(spark.w);
    });

    it(`${canvas}: hung from the widest pill, the spark's ink is still on the canvas`, () => {
      const spark = resolveDoodles(DEFAULT_DOODLES).at(-1)!;
      const { width, height } = CANVASES[canvas];
      // The widest pill fills its column (Flyer.tsx holds it a pixel inside): its end is as far as the spark goes.
      const grow = (pillBox(canvas).width - DEFAULT_PILL_WIDTH) / 2;
      const off = inkPoints(spark, canvas, 'band').filter(([x, y]) => x + grow < 0 || x + grow >= width || y < 0 || y >= height);
      expect(off.length).toBe(0);
    });

    it(`${canvas}: the corner blobs keep off the ask's lines and the default pill's spark`, () => {
      // The ask's copy is at most 760 wide (Flyer.tsx), from the column's left edge.
      const { ask } = CANVASES[canvas].activity;
      const art = resolveDoodles(DEFAULT_DOODLES);
      const cells = (d: ArtPlacement) => new Set(inkPoints(d, canvas, 'band').map(([x, y]) => `${Math.floor(x / 2)},${Math.floor(y / 2)}`));
      // A longer pill carries its spark over the right-hand blob, on purpose: teal on yellow (Artur, 2026-10-12).
      const spark = cells(art.find((d) => d.anchor === 'pillEnd')!);
      for (const blob of art.filter((d) => d.anchor === 'bottomLeft' || d.anchor === 'bottomRight')) {
        const onAsk = inkPoints(blob, canvas, 'band').filter(([x, y]) => x >= ask.left && x < ask.left + 760 && y >= ask.top && y < ask.top + ask.height);
        expect(onAsk.length, `${blob.slug} ink on the ask's lines`).toBe(0);
        expect([...cells(blob)].filter((c) => spark.has(c)).length, `${blob.slug} ink on the pill's spark`).toBe(0);
      }
    });

    it(`${canvas}: on a week flyer the sparks' ink never enters the title box, whatever the title says, and stays on the canvas`, () => {
      const { title } = CANVASES[canvas].week;
      const sparks = resolveDoodles(DEFAULT_DOODLES).filter((d) => d.anchor === 'photoLeft' || d.anchor === 'photoRight');
      expect(sparks).toHaveLength(2);
      for (const d of sparks) {
        const inTitle = inkPoints(d, canvas, 'week').filter(([x, y]) => x >= title.left && x < title.left + title.width && y >= title.top && y < title.top + title.height);
        expect(inTitle.length, `${d.slug} ink in the title box`).toBe(0);
        expect(inkOnCanvas(d, canvas, 'week'), d.slug).toBe(1);
      }
    });

    it(`${canvas}: the template art keeps at least as much of its ink on canvas as on the story`, () => {
      for (const mode of MODES)
        resolveDoodles(DEFAULT_DOODLES).forEach((d) => {
          expect(inkOnCanvas(d, canvas, mode), `${d.slug} / ${mode}`).toBeGreaterThanOrEqual(inkOnCanvas(d, 'story', mode) - 0.01);
        });
    });
  }

  it("on a week flyer the photo-corner sparks hang from the first row's top corners, in as on the band and 7 px lower (signed off 2026-09-29); the rest of the art stays put", () => {
    expect(artAnchors('story', 'week')).toMatchObject({ photoLeft: { x: 70, y: 707, scale: 1 }, photoRight: { x: 1010, y: 707, scale: 1 } });
    expect(artAnchors('whatsapp', 'week')).toMatchObject({ photoLeft: { x: 54, y: 471, scale: 1 }, photoRight: { x: 1026, y: 471, scale: 1 } });
    for (const canvas of CANVAS_IDS) {
      const { photoLeft: _l, photoRight: _r, ...week } = artAnchors(canvas, 'week');
      const { photoLeft: _bl, photoRight: _br, ...band } = artAnchors(canvas, 'band');
      expect(week, canvas).toEqual(band);
    }
  });

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

  const marks = (n: number) => '!'.repeat(n);
  const warnsOfMarks = (d: ReturnType<typeof base>) => lintFlyer(d).some((l) => l.field === 'text');

  it("a clean flyer has no warnings (the pill's own ! is free)", () => {
    expect(lintFlyer(base())).toEqual([]);
  });

  it('the copy may spend MAX_EXCLAMATIONS marks; one more warns, pill or no pill', () => {
    for (const showPill of [true, false]) {
      const d = base();
      d.showPill = showPill;
      d.text.headline2 = `pool party${marks(MAX_EXCLAMATIONS)}`;
      expect(lintFlyer(d), `pill ${showPill}`).toEqual([]);
      d.text.askEn = 'Sign up at reception!';
      expect(warnsOfMarks(d), `pill ${showPill}`).toBe(true);
    }
  });

  it("only the tag's own marks are free: more typed into it count, and a tag without them frees none", () => {
    const d = base();
    d.text.tag = DEFAULT_TEXT.tag + '!';
    d.text.headline2 = `pool party${marks(MAX_EXCLAMATIONS - 1)}`;
    expect(warnsOfMarks(d)).toBe(false);
    d.text.headline2 = `pool party${marks(MAX_EXCLAMATIONS)}`;
    expect(warnsOfMarks(d)).toBe(true);

    d.text.tag = DEFAULT_TEXT.tag.replaceAll('!', '');
    d.text.headline2 = `pool party${marks(MAX_EXCLAMATIONS)}`;
    expect(warnsOfMarks(d)).toBe(false);
    d.text.askEn = 'Sign up at reception!';
    expect(warnsOfMarks(d)).toBe(true);
  });

  it('flags bullets, and never "Book now" or a slash: Artur found them no use (2026-10-10)', () => {
    const d = base();
    d.text.askEn = 'Book now at reception';
    d.extras = ['Towels • drinks', 'Beer/wine'];
    expect(lintFlyer(d).map((l) => l.field)).toEqual(['extras.0']);
  });

  it('flags an all-caps headline', () => {
    const d = base();
    d.text.headline2 = 'POOL PARTY.';
    expect(lintFlyer(d).map((l) => l.field)).toContain('headline2');
  });

  const week = () => {
    const d = newFlyerData('week');
    d.week = [
      { day: 'Fridays', name: 'Two hours of fun waves', time: '15:00', cost: '40€ a class' },
      { day: 'Saturday 19/9', name: 'A long name nobody reads', time: '15:00', cost: 'Free', shortName: 'Pool party' },
    ];
    // Kept for switching back to Activity, never printed here.
    d.chips[0].value = 'Mon/Tue · 15:00';
    d.extras = ['Towels • drinks'];
    return d;
  };

  it('a week flyer lints its title and rows, never the chips and extras it keeps for switching back', () => {
    expect(lintFlyer(week())).toEqual([]);
    const d = week();
    d.week[0].cost = '40€ • class';
    d.text.headline2 = 'THIS WEEK.';
    const lints = lintFlyer(d);
    expect(lints.map((l) => l.field).sort()).toEqual(['headline2', 'week.0.cost']);
    expect(lints.find((l) => l.field === 'week.0.cost')!.message, 'the warning names the row').toMatch(/^Row 1: /);
  });

  it('a row prints its short name when it has one, so that is what is linted', () => {
    const d = week();
    d.week[1].name = 'Pool • party, a long name';
    expect(lintFlyer(d)).toEqual([]);
    d.week[1].shortName = 'Pool • party';
    expect(lintFlyer(d).map((l) => l.field)).toEqual(['week.1.shortName']);
  });

  it('rows spend the same exclamation budget as the rest of the copy', () => {
    const d = week();
    d.week[0].name = `Two hours of fun waves${marks(MAX_EXCLAMATIONS)}`;
    expect(warnsOfMarks(d)).toBe(false);
    d.week[1].shortName = 'Pool party!';
    expect(warnsOfMarks(d)).toBe(true);
  });

  it('an all-caps event name is flagged like a headline', () => {
    const d = week();
    d.week[0].name = 'SURF LESSON';
    const lint = lintFlyer(d).find((l) => l.field === 'week.0.name');
    expect(lint?.message).toMatch(/^Row 1: Sentence case/);
  });

  it("a row's day and time are linted, and each warning names its row", () => {
    const d = week();
    d.week[0].day = 'Mon • Tue';
    d.week[1].time = '15:00 • 17:00';
    const lints = lintFlyer(d);
    expect(lints.map((l) => l.field)).toEqual(['week.0.day', 'week.1.time']);
    expect(lints[0].message).toMatch(/^Row 1: .*bullets/);
    expect(lints[1].message).toMatch(/^Row 2: .*bullets/);
  });

  it("marks in a row's day and time spend the flyer's exclamation budget", () => {
    const d = week();
    d.week[0].day = `Fridays${marks(MAX_EXCLAMATIONS)}`;
    expect(warnsOfMarks(d)).toBe(false);
    d.week[1].time = '15:00!';
    expect(warnsOfMarks(d)).toBe(true);
  });

  it('a day or a time in capitals is not held to sentence case: it is not a headline (the owner, 2026-09-30)', () => {
    const d = week();
    // More than three letters each, so the rule's short-label exemption can't be what lets them through.
    d.week[0].day = 'FRIDAYS';
    d.week[0].time = '15:00 TILL LATE';
    expect(lintFlyer(d)).toEqual([]);
  });

  it('an Activity flyer ignores the rows it keeps for switching back', () => {
    const d = base();
    d.week = [{ day: 'Mon/Tue', name: 'BOOK NOW', time: '', cost: '5€!!!!' }];
    expect(lintFlyer(d)).toEqual([]);
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

  it('gives a flyer saved before the share text none, and holds the text to its limit', () => {
    const { share: _, ...older } = newFlyerData();
    expect(FlyerDataSchema.parse(older).share).toBe('');
    expect(FlyerDataSchema.safeParse({ ...newFlyerData(), share: 'x'.repeat(SHARE_MAX) }).success).toBe(true);
    expect(FlyerDataSchema.safeParse({ ...newFlyerData(), share: 'x'.repeat(SHARE_MAX + 1) }).success).toBe(false);
  });

  it('holds each line of copy to its limit in TEXT_LIMITS, the Spanish line to 260', () => {
    expect(TEXT_LIMITS.headlineEs).toBe(260);
    for (const [field, max] of Object.entries(TEXT_LIMITS)) {
      const at = (n: number) => FlyerDataSchema.safeParse({ ...newFlyerData(), text: { ...newFlyerData().text, [field]: 'x'.repeat(n) } }).success;
      expect(at(max), `${field} at ${max}`).toBe(true);
      expect(at(max + 1), `${field} at ${max + 1}`).toBe(false);
    }
  });

  it('keeps the share text across a template switch', () => {
    const d = { ...newFlyerData(), share: '¡HOY tenemos plan! 🌅\n\n---\n\nTODAY we have a plan! 🌅' };
    expect(switchTemplate(d, 'week', 'Duque Nest').share).toBe(d.share);
    expect(switchTemplate(switchTemplate(d, 'week', null), 'activity', null)).toEqual(d);
  });
});
