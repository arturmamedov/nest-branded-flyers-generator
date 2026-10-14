import type { Locator, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { expect, test } from '../browser';
import { DEFAULT_DOODLES, resolveDoodles } from '../../src/shared/defaults';
import { CANVASES, CANVAS_IDS, artAnchors, bodyOf, placeArt } from '../../src/shared/layout';
import type { FlyerText } from '../../src/shared/schema';
import { WEEK_ROWS_MAX } from '../../src/shared/week';
import { HANDLE_18, TAG_24, drawPayload, newPayload } from './drawn';

/* The art that follows the copy, and the blobs' inks (Artur, 2026-10-12, from the proof sheets of the fitted pill):
   - the spark off the tag pill's end hangs from the end of the pill, whatever its copy makes its width, and a flyer
     that prints no pill prints no such spark (2026-10-13);
   - the pencil by the ask hangs from the end of the ask's copy, a little higher than it was;
   - the corner blobs print in each other's ink: teal on the left, yellow on the right, where a long pill carries
     its teal spark;
   - the two sparks on the photo's corners print in each other's ink too (2026-10-13): yellow on the left, teal on
     the right, so the inks cross from the flyer's top to its bottom.
   None of it is stored: a flyer's doodles are the numbers every flyer has always carried. */

/** Pills from the narrowest staff can make to the widest the column takes. */
const PILLS: [string, Partial<FlyerText>][] = [
  ['the handle alone', { tag: '' }],
  ['the default pill', {}],
  ['a tag of 24', { tag: TAG_24 }],
  ['a handle of 18 with a tag of 24', { handle: HANDLE_18, tag: TAG_24 }],
  ['the widest letters, cut at the column', { handle: '@' + 'W'.repeat(17), tag: 'W'.repeat(24) }],
];

/** Runs in the page: the art drawn with the pill and the art drawn on the flyer itself. A turned piece keeps its
    centre, so a piece is read by where its centre is. */
const readSpark = () => {
  const root = document.querySelector<HTMLElement>('[data-flyer]')!;
  const centre = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: el.offsetWidth, height: el.offsetHeight, file: new URL((el as HTMLImageElement).src).pathname.split('/').pop()! };
  };
  const pill = root.querySelector<HTMLElement>('[data-group=pill]');
  const holder = pill?.parentElement ?? null;
  const from = holder?.getBoundingClientRect();
  return {
    onFlyer: [...root.querySelectorAll<HTMLElement>(':scope > img[data-art]')].map(centre),
    withPill: holder ? [...holder.querySelectorAll<HTMLElement>(':scope > img[data-art]')].map(centre) : [],
    // The box the art hangs from is the pill's own, before its tilt: as wide as the pill, on the pill's row.
    pill: pill && from ? { width: pill.offsetWidth, holderWidth: from.width, left: from.left, right: from.right, top: from.top } : null,
  };
};

test.describe('the spark off the pill’s end hangs from the pill', () => {
  for (const canvas of CANVAS_IDS) {
    for (const template of ['activity', 'week'] as const) {
      test(`${canvas} / ${template}: at every width of the pill it is the same distance from the pill's end`, async ({ page }) => {
        const ends: number[] = [];
        for (const [name, text] of PILLS) {
          const payload = newPayload(template, text);
          const spark = resolveDoodles(payload.flyer.data.doodles).find((d) => d.anchor === 'pillEnd')!;
          await drawPayload(page, payload, canvas);
          const r = await page.evaluate(readSpark);
          expect(r.pill, `${name}: the pill is drawn`).not.toBeNull();
          const pill = r.pill!;
          expect(Math.abs(pill.holderWidth - pill.width), `${name}: the art hangs from a box as wide as the pill`).toBeLessThanOrEqual(1);
          expect(Math.abs((pill.left + pill.right) / 2 - CANVASES[canvas].width / 2), `${name}: the pill is centred, as before`).toBeLessThanOrEqual(1);
          expect(Math.abs(pill.top - CANVASES[canvas].activity.pill.top), `${name}: on the pill's row`).toBeLessThanOrEqual(0.5);

          expect(r.withPill.map((a) => a.file), `${name}: one spark, drawn with the pill`).toEqual(['spark-teal.png']);
          expect(r.onFlyer.map((a) => a.file), `${name}: and not a second time on the flyer`).toEqual(['spark-left-yellow.png', 'spark-right-teal.png', 'blob-left-teal.png', 'blob-right-yellow.png']);
          const [drawn] = r.withPill;
          expect(drawn.width, `${name}: its size`).toBe(spark.w);
          expect(Math.abs(drawn.x - drawn.width / 2 - pill.right - spark.x), `${name}: from the pill's end`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(drawn.y - drawn.height / 2 - pill.top - spark.y), `${name}: from the top of the pill's row`).toBeLessThanOrEqual(0.5);
          ends.push(pill.right);
          await page.goto('about:blank');
        }
        // The cases do move the pill's end: from left of the default pill's to the column's edge.
        expect(ends[0]).toBeLessThan(ends[1] - 50);
        expect(ends.at(-1)!).toBeGreaterThan(ends[1] + 80);
      });
    }

    test(`${canvas}: beside the default pill the spark is where the design pass put it`, async ({ page }) => {
      const payload = newPayload('activity');
      const spark = resolveDoodles(payload.flyer.data.doodles).find((d) => d.anchor === 'pillEnd')!;
      const at = placeArt(spark, artAnchors(canvas, bodyOf(payload.flyer.data)));
      await drawPayload(page, payload, canvas);
      const [drawn] = (await page.evaluate(readSpark)).withPill;
      // The default pill is 585 px to within a pixel (pill.spec.ts), so its end is the registry's point to half of one.
      expect(Math.abs(drawn.x - drawn.width / 2 - at.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(drawn.y - drawn.height / 2 - at.top)).toBeLessThanOrEqual(1);
    });

    // Artur, 2026-10-13: "The toggle show pill should also remove the sparks under it or it look wired". It was kept
    // where the default pill would end, off the end of nothing.
    test(`${canvas}: a flyer that prints no pill prints no spark for it either`, async ({ page }) => {
      const hide = (data: { showPill: boolean }) => {
        data.showPill = false;
      };
      const NO_PILL = [
        ['the switch off', newPayload('activity', {}, hide)],
        ['the switch off, a pill of 18 and 24 waiting', newPayload('activity', { handle: HANDLE_18, tag: TAG_24 }, hide)],
        ['the switch on, and no copy for it', newPayload('activity', { handle: '', tag: '' })],
        ['a week flyer, the switch off', newPayload('week', {}, hide)],
      ] as const;
      for (const [name, payload] of NO_PILL) {
        // The untouched set still names the piece: it is the renderer that leaves it out.
        expect(resolveDoodles(payload.flyer.data.doodles).filter((d) => d.anchor === 'pillEnd'), name).toHaveLength(1);
        await drawPayload(page, payload, canvas);
        const r = await page.evaluate(readSpark);
        expect(r.pill, name).toBeNull();
        expect(r.onFlyer.map((a) => a.file), `${name}: the photo's two sparks and the two blobs`).toEqual(['spark-left-yellow.png', 'spark-right-teal.png', 'blob-left-teal.png', 'blob-right-yellow.png']);
        // And it is nowhere else: with the pencil by the ask, that is all the art there is.
        expect(await page.locator('[data-flyer] img[data-art]').count(), name).toBe(5);
        await page.goto('about:blank');
      }
    });
  }
});

/** The ink at a canvas point of the picture on screen. */
async function inkAt(page: Page, x: number, y: number): Promise<number[]> {
  const png = PNG.sync.read(await page.screenshot({ clip: { x, y, width: 1, height: 1 } }));
  return [...png.data.subarray(0, 3)];
}

test.describe('the corner blobs print in each other’s ink', () => {
  for (const canvas of CANVAS_IDS) {
    test(`${canvas}: teal in the left corner, yellow in the right`, async ({ page }) => {
      const { width: W, height: H } = CANVASES[canvas];
      await drawPayload(page, newPayload('activity', { handle: HANDLE_18, tag: TAG_24 }), canvas);
      // Well inside each blob: 12 px in from its corner of the canvas.
      expect(await inkAt(page, 12, H - 12), 'the left corner').toEqual([10, 120, 143]);
      expect(await inkAt(page, W - 12, H - 12), 'the right corner').toEqual([250, 194, 19]);
    });
  }

  test('whatsapp: a long pill carries its spark onto the right-hand blob, and its teal shows on the yellow', async ({ page }) => {
    const { width: W, height: H } = CANVASES.whatsapp;
    await drawPayload(page, newPayload('activity', { handle: HANDLE_18, tag: TAG_24 }), 'whatsapp');
    // The spark's own box, from just under the pill down: what is drawn there is the spark's ink and its ground.
    const clip = await page.evaluate(
      ([w, h]) => {
        const pill = document.querySelector<HTMLElement>('[data-group=pill]')!;
        const spark = pill.parentElement!.querySelector<HTMLElement>(':scope > img[data-art]')!.getBoundingClientRect();
        const top = Math.ceil(pill.getBoundingClientRect().bottom) + 2;
        const left = Math.floor(spark.left);
        return { x: left, y: top, width: Math.floor(Math.min(spark.right, w)) - left, height: Math.floor(Math.min(spark.bottom, h)) - top };
      },
      [W, H],
    );
    const png = PNG.sync.read(await page.screenshot({ clip }));
    let teal = 0;
    let yellow = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      const [r, g, b] = png.data.subarray(i, i + 3);
      if (r > 230 && g > 170 && b < 70) yellow++;
      else if (r < 60 && g > 90 && g < 140 && b > 110 && b < 165) teal++;
    }
    // On the teal blob, as the inks were, this box held no yellow at all and the spark could not be told from it.
    expect(yellow, `the ground under the spark is the yellow blob (${JSON.stringify(clip)})`).toBeGreaterThan((clip.width * clip.height) / 2);
    expect(teal, 'the spark’s rays, teal on it').toBeGreaterThan(300);
  });
});

/** What a piece of art inks on the flyer: the picture with it, less the picture without. Counted by ink, so what
    lies under the piece (a photo's ground, a row's highlighter) is no part of the count. */
async function inkOfPiece(page: Page, piece: Locator): Promise<{ teal: number; yellow: number }> {
  const { width: W, height: H } = page.viewportSize()!;
  const box = (await piece.boundingBox())!;
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const clip = { x, y, width: Math.min(W, Math.ceil(box.x + box.width)) - x, height: Math.min(H, Math.ceil(box.y + box.height)) - y };
  const shoot = async () => PNG.sync.read(await page.screenshot({ clip })).data;
  const drawn = await shoot();
  await piece.evaluate((el: HTMLElement) => (el.style.visibility = 'hidden'));
  const without = await shoot();
  await piece.evaluate((el: HTMLElement) => (el.style.visibility = ''));
  let teal = 0;
  let yellow = 0;
  for (let i = 0; i < drawn.length; i += 4) {
    const [r, g, b] = drawn.subarray(i, i + 3);
    if (Math.abs(r - without[i]) <= 40 && Math.abs(g - without[i + 1]) <= 40 && Math.abs(b - without[i + 2]) <= 40) continue;
    if (r > 230 && g > 170 && b < 70) yellow++;
    else if (r < 60 && g > 90 && g < 140 && b > 110 && b < 165) teal++;
  }
  return { teal, yellow };
}

test.describe('the sparks on the photo’s corners print in each other’s ink', () => {
  const BODIES = [
    ['in a frame', newPayload('activity')],
    ['full bleed', newPayload('activity', {}, (data) => void (data.photoMode = 'bleed'))],
    ['no photo', newPayload('activity', {}, (data) => void (data.photoMode = 'none'))],
    ['a week flyer', newPayload('week')],
  ] as const;
  for (const canvas of CANVAS_IDS) {
    test(`${canvas}: yellow on the left and teal on the right, wherever they hang; the spark off the pill keeps its teal`, async ({ page }) => {
      for (const [name, payload] of BODIES) {
        await drawPayload(page, payload, canvas);
        const onFlyer = page.locator('[data-flyer] > img[data-art]');
        const left = await inkOfPiece(page, onFlyer.nth(0));
        const right = await inkOfPiece(page, onFlyer.nth(1));
        // A spark is over a thousand pixels of ink at its size; its soft edge is neither colour.
        expect(left.yellow, `${name}: the left spark's yellow`).toBeGreaterThan(700);
        expect(left.teal, `${name}: no teal in the left spark`).toBe(0);
        expect(right.teal, `${name}: the right spark's teal`).toBeGreaterThan(700);
        expect(right.yellow, `${name}: no yellow in the right spark`).toBe(0);
        const pill = await inkOfPiece(page, page.locator('[data-group=pill]').locator('xpath=..').locator(':scope > img[data-art]'));
        expect(pill.teal, `${name}: the pill's spark is teal`).toBeGreaterThan(500);
        expect(pill.yellow, `${name}: and has no yellow`).toBe(0);
        await page.goto('about:blank');
      }
    });
  }
});

test.describe('art someone arranged is drawn as stored', () => {
  for (const canvas of CANVAS_IDS) {
    test(`${canvas}: a set that is not the template's keeps every piece on the flyer, at its stored place, in its stored ink`, async ({ page }) => {
      // The template's own set with its last piece moved by a pixel: no longer the untouched set, so nothing of the
      // template's rules applies to it. The spark stays in canvas px (on WhatsApp that is below the canvas), the
      // blobs keep their corners of the story and their first inks, and nothing is drawn with the pill.
      const arranged = DEFAULT_DOODLES.map((d, i) => (i === DEFAULT_DOODLES.length - 1 ? { ...d, x: d.x + 1 } : { ...d }));
      const payload = newPayload('activity', { handle: HANDLE_18, tag: TAG_24 }, (data) => {
        data.doodles = arranged;
      });
      await drawPayload(page, payload, canvas);
      const drawn = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('[data-flyer]')!;
        const pill = root.querySelector<HTMLElement>('[data-group=pill]')!;
        return {
          withPill: pill.parentElement!.querySelectorAll(':scope > img[data-art]').length,
          onFlyer: [...root.querySelectorAll<HTMLImageElement>(':scope > img[data-art]')].map((el) => ({
            file: new URL(el.src).pathname.split('/').pop(),
            left: parseFloat(el.style.left),
            top: parseFloat(el.style.top),
            width: parseFloat(el.style.width),
          })),
        };
      });
      expect(drawn.withPill).toBe(0);
      const anchors = artAnchors(canvas, bodyOf(payload.flyer.data));
      expect(drawn.onFlyer.map((a) => a.file)).toEqual(['spark-teal.png', 'spark-yellow.png', 'blob-yellow.png', 'blob-teal.png', 'spark-teal.png']);
      drawn.onFlyer.forEach((a, i) => {
        const want = placeArt(arranged[i], anchors);
        for (const key of ['left', 'top', 'width'] as const) expect(a[key], `piece ${i} ${key}`).toBeCloseTo(want[key], 1);
      });
      // The pieces with no anchor of their own are in canvas px, whatever the canvas.
      expect([drawn.onFlyer[2].left, drawn.onFlyer[3].left, drawn.onFlyer[4].left]).toEqual([-26, 818, 777]);
    });
  }
});

/** Runs in the page: the ask's block of copy, its lines as printed, and the pencil. */
const readAsk = () => {
  const ask = document.querySelector<HTMLElement>('[data-group=ask]');
  if (!ask) return null;
  const pencil = ask.querySelector<HTMLElement>('img[data-art]')!;
  const block = pencil.parentElement!;
  const box = (r: DOMRect) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
  const at = pencil.getBoundingClientRect();
  const fit = (window as unknown as { __FLYER_FIT: { entries: { text: string; overflowX: boolean }[] } }).__FLYER_FIT;
  return {
    blockInAsk: block.parentElement === ask,
    block: box(block.getBoundingClientRect()),
    pencil: { ...box(at), x: at.left + at.width / 2, y: at.top + at.height / 2, width: pencil.offsetWidth, height: pencil.offsetHeight },
    lines: [...ask.querySelectorAll<HTMLElement>('[data-fit]')].map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return { ...box(range.getBoundingClientRect()), text: el.textContent ?? '', px: parseFloat(getComputedStyle(el).fontSize) };
    }),
    cut: fit.entries.filter((e) => e.overflowX).map((e) => e.text),
  };
};

/** How far after the end of the copy the pencil starts, and how far above the block's top (Artur's pick of two, 2026-10-12). */
const PENCIL = { after: 14, above: 10, width: 104 };

const ASKS: [string, Partial<FlyerText>, { enPx?: 'full' | 'shrunk' }][] = [
  ['the default ask', {}, { enPx: 'full' }],
  ['a short English line over a longer Spanish one', { askEn: 'Join us!', askEs: 'Apúntate en recepción antes de las 18:00.' }, { enPx: 'full' }],
  ['an English line that shrank', { askEn: 'Sign up at reception before 18:00.' }, { enPx: 'shrunk' }],
  ['the English line alone', { askEs: '' }, { enPx: 'full' }],
  ['the Spanish line alone', { askEn: '' }, {}],
];

test.describe('the pencil hangs from the end of the ask', () => {
  for (const canvas of CANVAS_IDS) {
    for (const template of ['activity', 'week'] as const) {
      test(`${canvas} / ${template}: after the end of the copy and a little above it, whatever the lines say`, async ({ page }) => {
        const { width: W, height: H, activity } = CANVASES[canvas];
        const ends: number[] = [];
        for (const [name, text, { enPx }] of ASKS) {
          await drawPayload(page, newPayload(template, text), canvas);
          const r = (await page.evaluate(readAsk))!;
          expect(r, `${name}: the ask is drawn`).not.toBeNull();
          expect(r.blockInAsk, `${name}: the pencil is part of the ask's block of copy`).toBe(true);
          expect(r.cut, `${name}: nothing is cut off`).toEqual([]);
          if (enPx === 'full') expect(r.lines[0].px, `${name}: the pencil takes no room from the English line`).toBe(62);
          if (enPx === 'shrunk') expect(r.lines[0].px, `${name}: the English line shrank`).toBeLessThan(62);

          // The block is as wide as its longer line, so its end is the end of the copy (and of the underline).
          const copyEnd = Math.max(...r.lines.map((l) => l.right));
          expect(Math.abs(r.block.right - copyEnd), `${name}: the block ends where its longer line does`).toBeLessThanOrEqual(1.5);
          if (text.askEn === 'Join us!') expect(r.lines[1].right, `${name}: here the longer line is the Spanish one`).toBeGreaterThan(r.lines[0].right + 100);
          expect(Math.abs(r.block.top - activity.ask.top), `${name}: the block starts at the ask's top`).toBeLessThanOrEqual(0.5);

          expect(r.pencil.width, `${name}: the pencil's size`).toBe(PENCIL.width);
          expect(Math.abs(r.pencil.x - r.pencil.width / 2 - r.block.right - PENCIL.after), `${name}: after the end of the copy`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(r.pencil.y - r.pencil.height / 2 - r.block.top + PENCIL.above), `${name}: above the block's top`).toBeLessThanOrEqual(0.5);

          // It lands on none of the ask's own lines, and stays on the canvas.
          for (const line of r.lines) {
            const over = r.pencil.left < line.right && line.left < r.pencil.right && r.pencil.top < line.bottom && line.top < r.pencil.bottom;
            expect(over, `${name}: the pencil over "${line.text}"`).toBe(false);
          }
          expect(r.pencil.left).toBeGreaterThanOrEqual(0);
          expect(r.pencil.right).toBeLessThanOrEqual(W);
          expect(r.pencil.bottom).toBeLessThanOrEqual(H);
          ends.push(r.block.right);
          await page.goto('about:blank');
        }
        // The cases do move the end of the copy: under the short English line it is the Spanish line's, past the
        // default's; the shrunk line's is further right still; the Spanish line alone ends well left of them all.
        expect(ends[1]).toBeGreaterThan(ends[0] + 30);
        expect(ends[2]).toBeGreaterThan(ends[0] + 30);
        expect(ends[4]).toBeLessThan(ends[0] - 30);
      });
    }

    for (const template of ['activity', 'week'] as const) {
      test(`${canvas} / ${template}: the pencil paints nothing on the block above the ask, at its fullest`, async ({ page }) => {
        // What sits right above the ask: an Activity flyer's row of extras, a week's five rows (on the story their
        // last frame ends 12 px above the ask, and the pencil starts 10 px above it, tilted). The pencil's box
        // may reach up beside them: its ink must not touch them. So the block is shot with the pencil and without.
        const payload = newPayload(template, {}, (data) => {
          data.extras = ['Everyone welcome', 'Bring a towel', 'Comfy clothes', 'Free drinks'];
          data.week = Array.from({ length: WEEK_ROWS_MAX }, (_, i) => ({ day: 'Fridays', name: `Event number ${i + 1}`, time: '15:00', cost: '5€' }));
        });
        await drawPayload(page, payload, canvas);
        const block = page.locator(`[data-group=${template === 'week' ? 'rows' : 'extras'}]`);
        // Two pixels round the block's box: a row's hand-drawn frame is stroked a little past it.
        const clip = await block.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: Math.floor(r.left) - 2, y: Math.floor(r.top) - 2, width: Math.ceil(r.width) + 4, height: Math.ceil(r.height) + 4 };
        });
        const pencil = await page.locator('[data-group=ask] img[data-art]').evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top };
        });
        // The case is a real one: the pencil's box is under the block, sideways, and reaches near its bottom edge.
        expect(pencil.left).toBeGreaterThan(clip.x);
        expect(pencil.right).toBeLessThan(clip.x + clip.width);
        const withPencil = PNG.sync.read(await page.screenshot({ clip })).data;
        await page.addStyleTag({ content: '[data-group=ask] img[data-art] { visibility: hidden !important; }' });
        const without = PNG.sync.read(await page.screenshot({ clip })).data;
        // Ink, not the scan's haze: the drawing's first rows are a few faint pixels that move a colour by 27 of 255
        // at most, and its ink starts under them. On the story's week that is 4 px below the fifth row's frame.
        let inked = 0;
        for (let i = 0; i < withPencil.length; i += 4) {
          if (Math.max(Math.abs(withPencil[i] - without[i]), Math.abs(withPencil[i + 1] - without[i + 1]), Math.abs(withPencil[i + 2] - without[i + 2])) > 40) inked++;
        }
        expect(inked, `pixels of the block the pencil inks (its box starts at y ${pencil.top.toFixed(1)}, the block ends at ${clip.y + clip.height - 2})`).toBe(0);
      });
    }

    test(`${canvas}: a flyer with no ask draws no pencil`, async ({ page }) => {
      await drawPayload(page, newPayload('activity', { askEn: '', askEs: '' }), canvas);
      expect(await page.evaluate(readAsk)).toBeNull();
      expect(await page.locator('img[data-anchor=askEnd]').count()).toBe(0);
    });
  }
});
