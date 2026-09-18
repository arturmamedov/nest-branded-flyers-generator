import { describe, expect, it } from 'vitest';
import { deriveChips, splitDot } from '../../src/shared/chips.js';
import { lintFlyer } from '../../src/shared/copyRules.js';
import { DEFAULT_DOODLES, PROTOTYPE_DOODLES, newFlyerData, sameDoodles } from '../../src/shared/defaults.js';
import { ACTIVITY, SAFE_BOX, WEEK, activityGroups, inside, overlaps, photoAnchors } from '../../src/shared/layout.js';
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

describe('layout', () => {
  for (const mode of ['bleed', 'band', 'none'] as const) {
    it(`${mode}: groups never overlap and stay in the safe box`, () => {
      const groups = Object.entries(activityGroups(mode));
      for (const [name, rect] of groups) {
        if (name === 'photo' && mode === 'bleed') continue; // bleed is the one sanctioned exception, horizontally
        expect(inside(rect!, SAFE_BOX), name).toBe(true);
      }
      for (let i = 0; i < groups.length; i++)
        for (let j = i + 1; j < groups.length; j++)
          expect(overlaps(groups[i][1]!, groups[j][1]!), `${groups[i][0]} × ${groups[j][0]}`).toBe(false);
    });
  }

  it('the bottom stack is allocated upward from the 1620 floor', () => {
    expect(ACTIVITY.pill.top + ACTIVITY.pill.height).toBeLessThanOrEqual(1620);
    expect(ACTIVITY.ask.top + ACTIVITY.ask.height).toBeLessThanOrEqual(ACTIVITY.pill.top);
    expect(ACTIVITY.extras.top + ACTIVITY.extras.height).toBeLessThanOrEqual(ACTIVITY.ask.top);
    expect(ACTIVITY.chips.top + ACTIVITY.chips.height).toBeLessThanOrEqual(ACTIVITY.extras.top);
  });

  it('five week rows end before the ask block', () => {
    const { top, rowHeight, gap, max } = WEEK.rows;
    expect(top + max * rowHeight + (max - 1) * gap).toBe(1370);
    expect(1370).toBeLessThan(ACTIVITY.ask.top);
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

  it('a zoomed-out photo round-trips through the schema', () => {
    const d = newFlyerData();
    d.photoCrop = panCrop({ x: 0.5, y: 0.5, zoom: 0.25 }, -10_000, 0, { width: 1066, height: 1600 }, { width: 1080, height: 380 });
    expect(FlyerDataSchema.safeParse(d).success).toBe(true);
  });
});

describe('template art', () => {
  it('the photo-corner sparks land exactly where the design pass put them (band and bleed)', () => {
    for (const mode of ['band', 'bleed'] as const) {
      const a = photoAnchors(mode);
      const [teal, yellow] = DEFAULT_DOODLES;
      expect([a[teal.anchor as 'photoLeft'].x + teal.x, a[teal.anchor as 'photoLeft'].y + teal.y]).toEqual([24, 657]);
      expect([a[yellow.anchor as 'photoRight'].x + yellow.x, a[yellow.anchor as 'photoRight'].y + yellow.y]).toEqual([975, 658]);
    }
  });

  it('with no photo the sparks follow the brush rule instead of sitting on the headline', () => {
    const a = photoAnchors('none');
    expect(a.photoLeft.y - 55).toBeGreaterThan(ACTIVITY.photoBleed.top); // below where the photo would be
    expect(a.photoLeft.x).toBe(ACTIVITY.noPhotoRule.left);
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
