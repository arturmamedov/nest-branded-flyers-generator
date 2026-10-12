import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { expect, test } from '../browser';
import { newFlyerData } from '../../src/shared/defaults';
import { CANVASES, CANVAS_IDS, safeBox, type CanvasId } from '../../src/shared/layout';
import type { FlyerPayload, FlyerText, Template } from '../../src/shared/schema';

/* The tag pill is a fitted line (the editor's UX round, Part 4): the handle and the tag shrink together, down to
   their floor, when they are wider than the safe column. A pill that fits is drawn exactly as it always was.

   The render page takes any payload and never validates it, so these specs draw copy past the limits the API holds
   today: they prove the drawing, whatever the limit is. The cases are in the editor's own terms: capitals, which are
   what staff type into the pill, and the widest letter (W) for the worst case. */

const FLOOR = 0.7;
const BASE_PX = 34;

const HANDLE_18 = '@NESTSHOSTELSADEJE';
const TAG_24 = '¡COME JOIN US TONIGHT!!!';
/** The widest letter the face has, at the widest length the pill will ever take. */
const WIDEST = { handle: '@' + 'W'.repeat(17), tag: 'W'.repeat(24) };

const payload = (template: Template, text: Partial<FlyerText>, showPill = true): FlyerPayload => {
  const data = newFlyerData(template);
  Object.assign(data.text, text);
  data.showPill = showPill;
  const stamp = '2026-10-12T00:00:00.000Z';
  return { flyer: { id: 1, hostel: null, template, title: 'Pill', data, photoId: null, createdAt: stamp, updatedAt: stamp }, hostel: null, photo: null };
};

async function draw(page: Page, p: FlyerPayload, canvas: CanvasId) {
  await page.setViewportSize({ width: CANVASES[canvas].width, height: CANVASES[canvas].height });
  await page.addInitScript((value) => ((window as unknown as { __FLYER_PAYLOAD: unknown }).__FLYER_PAYLOAD = value), p);
  await page.goto(`/render.html?canvas=${canvas}`);
  await page.waitForFunction(() => {
    const w = window as unknown as { __FLYER_READY?: boolean; __FLYER_ERROR?: string };
    return w.__FLYER_READY || w.__FLYER_ERROR;
  });
  expect(await page.evaluate(() => (window as unknown as { __FLYER_ERROR?: string }).__FLYER_ERROR)).toBeUndefined();
}

interface PillRead {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** The pill's own width, before the tilt. */
  width: number;
  /** Each line of copy in it: its words and the size it ended at. */
  letters: { text: string; px: number }[];
  dots: number;
  /** The fitted lines of the whole flyer that the width pass reports as cut off. */
  cut: string[];
}

/** Runs in the page: what the pill drew, or null when it drew none. */
const readPill = () => {
  const pill = document.querySelector<HTMLElement>('[data-group=pill]');
  if (!pill) return null;
  const b = pill.getBoundingClientRect();
  const spans = [...pill.querySelectorAll<HTMLElement>('span')];
  const fit = (window as unknown as { __FLYER_FIT: { entries: { text: string; overflowX: boolean }[] } }).__FLYER_FIT;
  return {
    left: b.left,
    right: b.right,
    top: b.top,
    bottom: b.bottom,
    width: pill.offsetWidth,
    letters: spans.filter((s) => s.textContent!.trim()).map((s) => ({ text: s.textContent!, px: parseFloat(getComputedStyle(s).fontSize) })),
    dots: spans.filter((s) => !s.textContent!.trim()).length,
    cut: fit.entries.filter((e) => e.overflowX).map((e) => e.text),
  };
};

async function pillOf(page: Page, p: FlyerPayload, canvas: CanvasId): Promise<PillRead> {
  await draw(page, p, canvas);
  const read = await page.evaluate(readPill);
  expect(read, 'the pill is drawn').not.toBeNull();
  return read!;
}

test.describe('a pill that fits is drawn as it always was', () => {
  for (const canvas of CANVAS_IDS) {
    test(`${canvas}: the default pill, and a 24-character tag with the default handle, keep their 34 px letters`, async ({ page }) => {
      const standard = await pillOf(page, payload('activity', {}), canvas);
      // The brief's estimate was 583: measured, the default pill is 585 px (handle 304 + tag 155 + 126 of padding, gaps and dot).
      expect(standard.width).toBeGreaterThan(584);
      expect(standard.width).toBeLessThan(586);
      expect(standard.letters.map((l) => l.px)).toEqual([BASE_PX, BASE_PX]);

      // Capitals are what staff type: 934 px, inside the 940 column, so nothing shrinks.
      const long = await pillOf(page, payload('activity', { tag: TAG_24 }), canvas);
      expect(long.width).toBeLessThan(safeBox(canvas).width);
      expect(long.letters.map((l) => l.px)).toEqual([BASE_PX, BASE_PX]);
      expect(long.cut).toEqual([]);
    });
  }
});

test.describe('a pill wider than the safe column shrinks its letters to fit it', () => {
  for (const canvas of CANVAS_IDS) {
    for (const template of ['activity', 'week'] as const) {
      test(`${canvas} / ${template}: an 18-character handle with a 24-character tag, both in capitals`, async ({ page }) => {
        const p = await pillOf(page, payload(template, { handle: HANDLE_18, tag: TAG_24 }), canvas);
        const box = safeBox(canvas);
        expect(p.left, 'inside the safe column, left').toBeGreaterThanOrEqual(box.left);
        expect(p.right, 'inside the safe column, right').toBeLessThanOrEqual(box.left + box.width);
        const [handle, tag] = p.letters.map((l) => l.px);
        expect(handle, 'the letters of the handle and of the tag shrink together').toBe(tag);
        expect(handle).toBeLessThan(BASE_PX);
        expect(handle).toBeGreaterThanOrEqual(BASE_PX * FLOOR - 0.005);
        expect(p.cut, 'it fits, so the editor has nothing to say').toEqual([]);
        // Centred on the canvas, as before.
        expect(Math.abs((p.left + p.right) / 2 - CANVASES[canvas].width / 2)).toBeLessThanOrEqual(1);
      });
    }
  }

  test('the dot and the padding keep their size at every length: only the letters shrink', async ({ page }) => {
    // Swept over lengths, because a dot allowed to shrink gives way only while the fit's last step is within its
    // 14 px of the edge: at one length it can go unseen.
    const sizes: { n: number; dot: number; padding: string; px: number }[] = [];
    for (let n = 14; n <= TAG_24.length; n++) {
      const p = await pillOf(page, payload('activity', { handle: HANDLE_18, tag: TAG_24.slice(0, n) }), 'story');
      const [dot, padding] = await page.evaluate(() => {
        const pill = document.querySelector<HTMLElement>('[data-group=pill]')!;
        const dotEl = [...pill.querySelectorAll<HTMLElement>('span')].find((s) => !s.textContent!.trim())!;
        return [dotEl.getBoundingClientRect().width, getComputedStyle(pill).paddingLeft] as const;
      });
      sizes.push({ n, dot, padding, px: p.letters[0].px });
    }
    expect(Math.min(...sizes.map((s) => s.px)), 'the sweep reaches lengths that shrink').toBeLessThan(BASE_PX);
    for (const s of sizes) {
      expect(s.dot, `the dot at ${s.n} characters`).toBeCloseTo(14, 0);
      expect(s.padding, `the padding at ${s.n} characters`).toBe('38px');
    }
  });
});

test.describe('a pill still too wide at its floor', () => {
  for (const canvas of CANVAS_IDS) {
    test(`${canvas}: stops at its floor, is reported as cut off, and paints nothing outside the safe column`, async ({ page }) => {
      const p = await pillOf(page, payload('activity', WIDEST), canvas);
      const box = safeBox(canvas);
      for (const letters of p.letters) expect(letters.px).toBeCloseTo(BASE_PX * FLOOR, 1);
      expect(p.cut.length, 'the width pass reports the pill, so the editor warns that copy is cut off').toBeGreaterThan(0);
      expect(p.left).toBeGreaterThanOrEqual(box.left);
      expect(p.right).toBeLessThanOrEqual(box.left + box.width);

      // Outside the column, over the pill's own rows, the flyer is what it is with no pill at all (2 px clear of the
      // column's edge, for the anti-aliasing of the tilt).
      const { width: W } = CANVASES[canvas];
      const band = { y: Math.floor(p.top) - 4, height: Math.ceil(p.bottom - p.top) + 8 };
      const strips = [
        { x: 0, y: band.y, width: box.left - 2, height: band.height },
        { x: box.left + box.width + 2, y: band.y, width: W - (box.left + box.width + 2), height: band.height },
      ];
      const shoot = async () => Promise.all(strips.map(async (clip) => PNG.sync.read(await page.screenshot({ clip })).data));
      const withPill = await shoot();
      await page.goto('about:blank');
      await draw(page, payload('activity', WIDEST, false), canvas);
      const withoutPill = await shoot();
      withPill.forEach((data, i) => expect(Buffer.compare(data, withoutPill[i]), `strip ${i} is the flyer without its pill`).toBe(0));
    });
  }
});

test.describe('what the pill collapses to', () => {
  test('a handle alone, a tag alone and neither draw no dot and no empty box', async ({ page }) => {
    const handleOnly = await pillOf(page, payload('activity', { tag: '' }), 'story');
    expect(handleOnly.letters.map((l) => l.text)).toEqual(['@NESTSHOSTELS']);
    expect(handleOnly.dots).toBe(0);

    const tagOnly = await pillOf(page, payload('activity', { handle: '' }), 'story');
    expect(tagOnly.letters.map((l) => l.text)).toEqual(['¡TAG US!']);
    expect(tagOnly.dots).toBe(0);

    await draw(page, payload('activity', { handle: '', tag: '' }), 'story');
    expect(await page.evaluate(readPill), 'no copy, no pill').toBeNull();

    await page.goto('about:blank');
    await draw(page, payload('activity', {}, false), 'story');
    expect(await page.evaluate(readPill), 'shown off, no pill').toBeNull();
  });
});
