import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { expect, test } from '../browser';
import { resolveDoodles } from '../../src/shared/defaults';
import { CANVASES, CANVAS_IDS, artAnchors, bodyOf, placeArt } from '../../src/shared/layout';
import type { FlyerText } from '../../src/shared/schema';
import { drawPayload, newPayload } from './drawn';

/* The art that follows the copy, and the blobs' inks (Artur, 2026-10-12, from the proof sheets of the fitted pill):
   - the spark off the tag pill's end hangs from the end of the pill, whatever its copy makes its width;
   - the pencil by the ask hangs from the end of the ask's copy, a little higher than it was;
   - the corner blobs print in each other's ink: teal on the left, yellow on the right, where a long pill carries
     its teal spark.
   None of it is stored: a flyer's doodles are the numbers every flyer has always carried. */

const HANDLE_18 = '@NESTSHOSTELSADEJE';
const TAG_24 = '¡COME JOIN US TONIGHT!!!';

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
          expect(r.onFlyer.map((a) => a.file), `${name}: and not a second time on the flyer`).toEqual(['spark-teal.png', 'spark-yellow.png', 'blob-left-teal.png', 'blob-right-yellow.png']);
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

    test(`${canvas}: a flyer that prints no pill keeps the spark where the default pill would end`, async ({ page }) => {
      const hidden = newPayload('activity', {}, (data) => {
        data.showPill = false;
      });
      for (const payload of [hidden, newPayload('activity', { handle: '', tag: '' })]) {
        const spark = resolveDoodles(payload.flyer.data.doodles).find((d) => d.anchor === 'pillEnd')!;
        const at = placeArt(spark, artAnchors(canvas, bodyOf(payload.flyer.data)));
        await drawPayload(page, payload, canvas);
        const r = await page.evaluate(readSpark);
        expect(r.pill).toBeNull();
        expect(r.onFlyer.map((a) => a.file)).toEqual(['spark-teal.png', 'spark-yellow.png', 'blob-left-teal.png', 'blob-right-yellow.png', 'spark-teal.png']);
        const drawn = r.onFlyer.at(-1)!;
        expect(Math.abs(drawn.x - drawn.width / 2 - at.left)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(drawn.y - drawn.height / 2 - at.top)).toBeLessThanOrEqual(0.5);
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
    test(`${canvas}: teal in the left corner, yellow in the right, and a long pill's spark shows on the yellow`, async ({ page }) => {
      const { width: W, height: H } = CANVASES[canvas];
      await drawPayload(page, newPayload('activity', { handle: HANDLE_18, tag: TAG_24 }), canvas);
      // Well inside each blob: 12 px in from its corner of the canvas.
      expect(await inkAt(page, 12, H - 12), 'the left corner').toEqual([10, 120, 143]);
      expect(await inkAt(page, W - 12, H - 12), 'the right corner').toEqual([250, 194, 19]);
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

          // It lands on none of the ask's own lines, stays below the row above the ask, and on the canvas.
          for (const line of r.lines) {
            const over = r.pencil.left < line.right && line.left < r.pencil.right && r.pencil.top < line.bottom && line.top < r.pencil.bottom;
            expect(over, `${name}: the pencil over "${line.text}"`).toBe(false);
          }
          expect(r.pencil.top, `${name}: below the extras' row`).toBeGreaterThanOrEqual(activity.extras.top + activity.extras.height);
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

    test(`${canvas}: a flyer with no ask draws no pencil`, async ({ page }) => {
      await drawPayload(page, newPayload('activity', { askEn: '', askEs: '' }), canvas);
      expect(await page.evaluate(readAsk)).toBeNull();
      expect(await page.locator('img[src*="doodle-pencil"]').count()).toBe(0);
    });
  }
});
