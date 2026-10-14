import { readFileSync } from 'node:fs';
import type { APIResponse } from '@playwright/test';
import { PNG } from 'pngjs';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, canvasButton, cutOff, cutOffOn, download, exportFit, fitted, openSection } from '../editor';
import { drawPayload as renderPayload } from './drawn';
import { SAMPLE_TITLES, checkDrawn, drawnSamples, samples } from './drawnChecks';
import sharp from 'sharp';
import { apiError, type ApiErrorKey } from '../../src/shared/errors';
import { flyerFilename } from '../../src/shared/filename';
import { marksFor } from '../../src/shared/defaults';
import { CANVASES, CANVAS_IDS, DEFAULT_CANVAS, SHARED_GEOMETRY, boxesOf, safeBox, weekRowRect, type CanvasId } from '../../src/shared/layout';
import type { FlyerListItem, FlyerPayload } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* The automatable half of the handoff's export checklist (README §9), for
   every sample flyer — both stress tests included — on every output canvas:
   an Activity sample in all three photo modes, a This week sample once, as
   its rows (it has no photo, whatever its photo mode says). */


/** Runs in the page: the eyebrow's marks, left to right, and where its text (the calendar and the words) ends. */
function readMarks() {
  const eyebrow = document.querySelector('[data-group=eyebrow]')!;
  return {
    textRight: eyebrow.firstElementChild!.getBoundingClientRect().right,
    marks: [...eyebrow.querySelectorAll<HTMLImageElement>('img[data-logo]')].map((img) => {
      const r = img.getBoundingClientRect();
      return { logo: img.dataset.logo, path: new URL(img.src).pathname, alt: img.alt, drawn: img.complete && img.naturalWidth > 0, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    }),
  };
}

for (const canvas of CANVAS_IDS) {
  test(`${canvas}: every sample, every photo mode: where layout.ts says, in the safe box, no overlaps, no clipped text, real fonts`, async ({ page, request }) => {
    for (const { title, body, payload } of await drawnSamples(request)) {
      const label = `${canvas} / ${title} / ${body}`;
      // At their floors the stress copy's address takes three lines, and on the story its WHERE chip reaches 2 px
      // into its own bottom padding: the chip counts as clipped and the editor says so. Accepted by the owner
      // (2026-09-30) rather than shortening the sample's copy or lowering the floor.
      const stressWhere = canvas === 'story' && ['Long copy · stress test', 'Highlighter wrap'].includes(title);
      await test.step(label, () => checkDrawn(page, payload, canvas, label, stressWhere ? ['WHERE'] : []));
    }
  });
}

for (const canvas of CANVAS_IDS) {
  test(`${canvas}: a week row with nothing to print is left out, and the rows below close up`, async ({ page, request }) => {
    const sparse = (await samples(request)).find((p) => p.flyer.title === 'This week · sparse')!;
    const payload: FlyerPayload = structuredClone(sparse);
    const [first, second] = payload.flyer.data.week;
    payload.flyer.data.week = [first, { day: '', name: '', time: '', cost: '' }, { day: ' · ', name: '  ', time: '·', cost: ' · ', shortName: ' ' }, second];
    await renderPayload(page, payload, canvas);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-row]')].map((el) => ({
        slot: el.dataset.row,
        name: el.querySelector('[data-cell=name]')?.textContent,
        top: Math.round(el.getBoundingClientRect().top),
      })),
    );
    expect(rows).toEqual([
      { slot: '0', name: first.name, top: weekRowRect(canvas, 0, SHARED_GEOMETRY).top },
      { slot: '1', name: second.name, top: weekRowRect(canvas, 1, SHARED_GEOMETRY).top },
    ]);
  });
}

for (const canvas of CANVAS_IDS) {
  test(`${canvas}: a week flyer prints its own title, and a word too long for its row shrinks inside its box`, async ({ page, request }) => {
    const sparse = (await samples(request)).find((p) => p.flyer.title === 'This week · sparse')!;
    const payload: FlyerPayload = structuredClone(sparse);
    // Edited title lines, the Spanish one emptied; a price at the cap, so the name has its least room.
    payload.flyer.data.text = { ...payload.flyer.data.text, headline1: 'Our week', headline2: 'this week.', headlineEs: '' };
    payload.flyer.data.week = [{ day: 'Fridays', name: 'Strandvolleyball', time: '', cost: '18€ without breakfast' }];
    await renderPayload(page, payload, canvas);
    const r = await page.evaluate(() => {
      const edges = (el: Element) => {
        const b = el.getBoundingClientRect();
        return { left: b.left, right: b.right };
      };
      const row = document.querySelector('[data-row="0"]')!;
      const fit = (window as unknown as { __FLYER_FIT: { entries: { text: string; finalPx: number; overflowX: boolean }[] } }).__FLYER_FIT;
      return {
        title: [...document.querySelectorAll('[data-group=title] [data-fit]')].map((el) => el.textContent),
        nameBox: edges(row.querySelector('[data-fit-box=name]')!),
        name: edges(row.querySelector('[data-cell=name]')!),
        word: fit.entries.find((e) => e.text === 'Strandvolleyball')!,
      };
    });
    expect(r.title).toEqual(['Our week', 'this week.']);
    // The word is wider than the column at 44 px: it shrinks, whole, inside its box, and is not cut off.
    expect(r.word.finalPx).toBeLessThan(44);
    expect(r.word.overflowX).toBe(false);
    expect(r.name.left).toBeGreaterThanOrEqual(r.nameBox.left - 0.5);
    expect(r.name.right).toBeLessThanOrEqual(r.nameBox.right + 0.5);
  });

  test(`${canvas}: a time or price still too long at its floor is cut at its column, never drawn across the row's frame`, async ({ page, request }) => {
    const sparse = (await samples(request)).find((p) => p.flyer.title === 'This week · sparse')!;
    const payload: FlyerPayload = structuredClone(sparse);
    payload.flyer.data.week = [{ day: 'Fridays', name: 'Surf', time: 'Mon–Fri 10:00–13:00', cost: 'Donation, any amount welcome' }];
    await renderPayload(page, payload, canvas);
    const { strip, cut } = await page.evaluate(() => {
      const right = document.querySelector('[data-row="0"] [data-cell=right]')!.getBoundingClientRect();
      const row = document.querySelector('[data-row="0"]')!.getBoundingClientRect();
      const fit = (window as unknown as { __FLYER_FIT: { entries: { text: string; overflowX: boolean }[] } }).__FLYER_FIT;
      // Between the column's right edge and the frame's stroke, over the row's middle (clear of the frame's rounded
      // corners, whose stroke curves in within ~30 px of the row's top and bottom): row fill only.
      const x = Math.ceil(right.right) + 1;
      return {
        strip: { x, y: Math.round(row.top) + 32, width: Math.floor(row.right) - 14 - x, height: Math.round(row.height) - 64 },
        cut: fit.entries.filter((e) => e.overflowX).map((e) => e.text),
      };
    });
    // Past their floor, both lines still say so: the editor warns that copy is cut off.
    expect(cut).toEqual(expect.arrayContaining(['Mon–Fri 10:00–13:00', 'Donation, any amount welcome']));
    const shot = PNG.sync.read(await page.screenshot({ clip: strip }));
    let inked = 0;
    for (let i = 0; i < shot.data.length; i += 4) if (Math.min(shot.data[i], shot.data[i + 1], shot.data[i + 2]) < 235) inked++;
    expect(inked, `ink between the column and the frame (${JSON.stringify(strip)})`).toBe(0);
  });

  test(`${canvas}: a day too long for three lines shrinks inside its row, even the fifth, and is not cut off`, async ({ page, request }) => {
    const sparse = (await samples(request)).find((p) => p.flyer.title === 'This week · sparse')!;
    const payload: FlyerPayload = structuredClone(sparse);
    // 28 of the day's 30 characters, four lines at 34 px: they spilled 14 px above and below a 122 px row, and from the
    // story's fifth row 2 px into the ask's box.
    const day = 'Tuesday Friday Monday Sunday';
    const [a, b] = payload.flyer.data.week;
    payload.flyer.data.week = [a, b, a, b, { day, name: 'Surf', time: '10:00', cost: '40€' }];
    await renderPayload(page, payload, canvas);
    const r = await page.evaluate((text) => {
      const edges = (b: DOMRect) => ({ top: b.top, bottom: b.bottom, right: b.right });
      const fit = (window as unknown as { __FLYER_FIT: { clippedBoxes: number; entries: { text: string; finalPx: number; overflowX: boolean }[] } }).__FLYER_FIT;
      return {
        row: edges(document.querySelector('[data-row="4"]')!.getBoundingClientRect()),
        column: edges(document.querySelector('[data-row="4"] [data-cell=day]')!.getBoundingClientRect()),
        // The highlighter's line boxes: the day's ink, padding included.
        lines: [...document.querySelector('[data-row="4"] [data-cell=day] > span')!.getClientRects()].map(edges),
        day: fit.entries.find((e) => e.text === text)!,
        clipped: fit.clippedBoxes,
        cut: fit.entries.filter((e) => e.overflowX).map((e) => e.text),
      };
    }, day);
    expect(r.lines.length, 'the day drew its highlighter').toBeGreaterThan(0);
    for (const line of r.lines) {
      expect(line.top >= r.row.top - 0.5 && line.bottom <= r.row.bottom + 0.5, `a line of the day ${JSON.stringify(line)} inside its row ${JSON.stringify(r.row)}`).toBe(true);
      // Shrunk, the day wraps again, and a line's highlighter can end up to its own 10 px padding past the column, in
      // the gap before the name: fit.ts then reports the day as overflowing, and the editor calls it cut off. Accepted
      // by the owner (2026-09-30) rather than changing the fit or where every day wraps.
      expect(line.right, 'at most the highlighter’s padding past the column').toBeLessThanOrEqual(r.column.right + 10.5);
    }
    expect(r.day.finalPx, 'the day shrank').toBeLessThan(34);
    expect(r.clipped, 'no box reported clipped').toBe(0);
    expect(r.cut.filter((t) => t !== day), 'nothing else cut sideways').toEqual([]);
  });

  test(`${canvas}: a WHEN chip too full for its lines' floors stops them there, clips, and says so`, async ({ page, request }) => {
    const paragliding = (await samples(request)).find((p) => p.flyer.title === 'Paragliding')!;
    const payload: FlyerPayload = structuredClone(paragliding);
    // A day that wraps, and a time: at their floors (27.6 and 28 px) the two lines need about 107 px, and 74 are free.
    payload.flyer.data.chips = payload.flyer.data.chips.map((c) => (c.key === 'when' ? { ...c, value: 'Saturdays and Sundays, mornings and evenings · 05:30' } : c));
    await renderPayload(page, payload, canvas);
    const r = await page.evaluate(() => {
      const over = [...document.querySelectorAll<HTMLElement>('[data-fit-box]')].filter((b) => b.scrollHeight > b.clientHeight + 1);
      return {
        clipped: (window as unknown as { __FLYER_FIT: { clippedBoxes: number } }).__FLYER_FIT.clippedBoxes,
        over: over.map((b) => (b.dataset.chip === 'when' ? 'WHEN' : (b.textContent ?? '').slice(0, 40))),
        lines: over.flatMap((b) =>
          [...b.querySelectorAll<HTMLElement>('[data-fit]')].map((el) => ({
            text: (el.textContent ?? '').trim(),
            px: parseFloat(el.style.fontSize),
            floor: parseFloat(el.dataset.fit!) * parseFloat(el.dataset.fitMin!),
          })),
        ),
      };
    });
    expect(r.over, 'the box still too tall').toEqual(['WHEN']);
    expect(r.clipped, 'counted, so the editor says so').toBe(1);
    expect(r.lines.map((l) => l.text)).toEqual(['Saturdays and Sundays, mornings and evenings', '05:30']);
    for (const line of r.lines) expect(line.px, `${line.text}: at its floor`).toBeCloseTo(line.floor, 2);
  });

  test(`${canvas}: the WHEN chip's time stays on one line and shrinks by itself, never breaking inside a range`, async ({ page, request }) => {
    const surf = (await samples(request)).find((p) => p.flyer.title === 'Surf lesson')!;
    const read = async (time: string) => {
      const payload: FlyerPayload = structuredClone(surf);
      payload.flyer.data.chips = payload.flyer.data.chips.map((c) => (c.key === 'when' ? { ...c, value: `Every day · ${time}` } : c));
      await renderPayload(page, payload, canvas);
      return page.evaluate(() => {
        const chip = document.querySelector<HTMLElement>('[data-chip=when]')!;
        const [day, line] = [...chip.querySelectorAll<HTMLElement>('[data-fit]')];
        const range = document.createRange();
        range.selectNodeContents(line);
        return {
          text: line.textContent,
          dayPx: parseFloat(day.style.fontSize),
          px: parseFloat(line.style.fontSize),
          lines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size,
          cut: line.scrollWidth > line.clientWidth + 1,
          clipped: (window as unknown as { __FLYER_FIT: { clippedBoxes: number } }).__FLYER_FIT.clippedBoxes,
        };
      });
    };
    const short = await read('15:00');
    // Artur's flyer (2026-10-09): his browser broke the range after its hyphen, "09:15-" over "14:00", and the chip
    // clipped the second line. Where a break may fall is each browser's own (this Chromium keeps "09:15-14:00" whole,
    // breaks the spaced one, and the height pass then shrinks the whole chip until it is one line again), so the
    // proof is the day line: a time too wide shrinks itself alone, and the day keeps the size a short time leaves it.
    for (const time of ['09:15-14:00', '09:15 - 14:00']) {
      const r = await read(time);
      const label = `${canvas} / ${time}`;
      expect(r.text, label).toBe(time);
      expect(r.lines, `${label}: one line`).toBe(1);
      expect(r.cut, `${label}: not cut at the side`).toBe(false);
      expect(r.px, `${label}: shrunk, no further than its floor`).toBeLessThan(40);
      expect(r.px, `${label}: shrunk, no further than its floor`).toBeGreaterThanOrEqual(40 * 0.7 - 0.01);
      expect(r.dayPx, `${label}: the day line keeps its size`).toBe(short.dayPx);
      expect(r.clipped, `${label}: no box reported clipped`).toBe(0);
    }
  });

  test(`${canvas}: a flyer at a hostel with a badge prints the marks as set, in the eyebrow and the safe box, a long eyebrow too`, async ({ page, request }) => {
    const pool = (await samples(request)).find((p) => p.flyer.title === 'Pool party')!;
    const eyebrow = boxesOf(canvas, SHARED_GEOMETRY).activity.eyebrow;
    const safe = safeBox(canvas);
    const want = marksFor(true).map((m) => (m === 'badge' ? 'hostel' : 'nests'));
    // The default eyebrow, then 18 of the widest letters, which leave the marks less room than they need: they give
    // way, rather than leave the box.
    for (const text of ['NEXT ACTIVITY', 'M'.repeat(18)]) {
      const payload: FlyerPayload = structuredClone(pool);
      payload.hostel = { ...payload.hostel!, logoPath: 'assets/logos/duque-nest.png' };
      payload.flyer.data.text.eyebrow = text;
      await renderPayload(page, payload, canvas);
      const r = await page.evaluate(readMarks);
      const label = `${canvas} / ${text}`;
      expect(r.marks.map((m) => m.logo), `${label}: the marks`).toEqual(want);
      for (const m of r.marks) {
        expect(m.drawn, `${label}: ${m.logo} drawn`).toBe(true);
        expect(m.top >= eyebrow.top - 0.5 && m.bottom <= eyebrow.top + eyebrow.height + 0.5, `${label}: ${m.logo} inside the eyebrow box`).toBe(true);
        expect(m.right, `${label}: ${m.logo} inside the eyebrow and the safe box`).toBeLessThanOrEqual(Math.min(safe.left + safe.width, eyebrow.left + eyebrow.width) + 0.5);
      }
      expect(r.marks[0].left - r.textRight, `${label}: the text keeps its 24 px from the marks`).toBeGreaterThanOrEqual(23.5);
      for (let i = 1; i < r.marks.length; i++) expect(r.marks[i].left, `${label}: the marks side by side`).toBeGreaterThanOrEqual(r.marks[i - 1].right);
      if (text !== 'NEXT ACTIVITY') continue;
      // With room, each mark keeps its size: 56 px tall, the badge square.
      for (const m of r.marks) expect(m.height, `${label}: ${m.logo} 56 px tall`).toBeCloseTo(56, 0);
      const badge = r.marks.find((m) => m.logo === 'hostel');
      if (badge) expect([badge.path, badge.alt, Math.round(badge.width)], `${label}: the badge`).toEqual(['/assets/logos/duque-nest.png', 'Duque Nest', 56]);
      const nests = r.marks.find((m) => m.logo === 'nests');
      if (nests) expect([nests.path, nests.alt], `${label}: the wordmark`).toEqual(['/assets/nest-logo-teal.png', 'Nests Hostels']);
    }
  });
}

test('a badge that fails to load leaves the Nests wordmark in its place, drawn by the time the page is ready', async ({ browser, baseURL, request }) => {
  const payload: FlyerPayload = structuredClone((await samples(request)).find((p) => p.flyer.title === 'Pool party')!);
  // A path with no file behind it: /assets answers 404 (it never falls through).
  payload.hostel = { ...payload.hostel!, logoPath: 'assets/logos/missing.png' };
  const context = await browser.newContext({ baseURL, viewport: { width: CANVASES.story.width, height: CANVASES.story.height } });
  try {
    let delayed = 0;
    // The badge fails late, once the page is already waiting for its images (the fonts load first), and the wordmark
    // that takes its place arrives later still. When the badge prints alone ('hostel'), a page that stopped waiting
    // when the badge failed is caught out here; at 'both' the wordmark is in the page from the start, so there is
    // nothing to wait for, and the test holds the fallback alone.
    await context.route('**/assets/logos/missing.png', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });
    await context.route('**/assets/nest-logo-teal.png', async (route) => {
      delayed++;
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    const page = await context.newPage();
    // Records the eyebrow's images (all but its calendar icon) at the very moment the page reports ready.
    await page.addInitScript((p) => {
      const w = window as unknown as Record<string, unknown>;
      w.__FLYER_PAYLOAD = p;
      let ready: unknown;
      Object.defineProperty(window, '__FLYER_READY', {
        configurable: true,
        get: () => ready,
        set: (value) => {
          w.__MARKS_AT_READY = [...document.querySelectorAll<HTMLImageElement>('[data-group=eyebrow] img:not([data-deco])')].map((img) => ({ logo: img.dataset.logo ?? null, path: new URL(img.src).pathname, drawn: img.complete && img.naturalWidth > 0 }));
          ready = value;
        },
      });
    }, payload);
    await page.goto('/render.html?canvas=story');
    await page.waitForFunction(() => {
      const w = window as unknown as { __FLYER_READY?: boolean; __FLYER_ERROR?: string };
      return w.__FLYER_READY || w.__FLYER_ERROR;
    });
    expect(delayed, 'the wordmark was asked for, and held back').toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as unknown as { __MARKS_AT_READY: unknown }).__MARKS_AT_READY)).toEqual([
      { logo: 'nests', path: '/assets/nest-logo-teal.png', drawn: true },
    ]);
  } finally {
    await context.close();
  }
});

test('the export waits for every image a week flyer draws: a slow clock is decoded when the page says it is ready', async ({ browser, baseURL, request }) => {
  const stress = (await samples(request)).find((p) => p.flyer.title === 'This week · stress test')!;
  const context = await browser.newContext({ baseURL, viewport: { width: CANVASES.story.width, height: CANVASES.story.height } });
  try {
    let delayed = 0;
    await context.route('**/assets/art/icon-clock.png', async (route) => {
      delayed++;
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    const page = await context.newPage();
    // Records the flyer's images at the very moment the page reports ready, not after.
    await page.addInitScript((p) => {
      const w = window as unknown as Record<string, unknown>;
      w.__FLYER_PAYLOAD = p;
      let ready: unknown;
      Object.defineProperty(window, '__FLYER_READY', {
        configurable: true,
        get: () => ready,
        set: (value) => {
          w.__IMAGES_AT_READY = [...document.querySelectorAll<HTMLImageElement>('[data-flyer] img')].map((img) => ({
            src: img.src,
            decoded: img.complete && img.naturalWidth > 0,
          }));
          ready = value;
        },
      });
    }, stress);
    await page.goto('/render.html?canvas=story');
    await page.waitForFunction(() => {
      const w = window as unknown as { __FLYER_READY?: boolean; __FLYER_ERROR?: string };
      return w.__FLYER_READY || w.__FLYER_ERROR;
    });
    const images = (await page.evaluate(() => (window as unknown as { __IMAGES_AT_READY: { src: string; decoded: boolean }[] }).__IMAGES_AT_READY)) ?? [];
    expect(delayed, 'the clock was requested, and held back').toBeGreaterThan(0);
    expect(images.filter((i) => i.src.includes('icon-clock')).length, 'the rows draw their clocks').toBeGreaterThan(0);
    expect(images.filter((i) => !i.decoded)).toEqual([]);
  } finally {
    await context.close();
  }
});

test('export API returns every canvas at its exact size as PNG and JPG, each cached until the flyer changes', async ({ request }) => {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
  const stress = list.find((f) => f.title === 'Long copy · stress test')!;
  const post = (canvas: CanvasId, format: 'png' | 'jpg') => request.post(`/api/render/${stress.id}`, { headers: WRITE_HEADERS, data: { format, canvas } });
  const payload = (await (await request.get(`/api/flyers/${stress.id}`)).json()) as FlyerPayload;
  // Saving empties the flyer's render cache, whatever other tests asked for.
  const save = async () => {
    const put = await request.put(`/api/flyers/${stress.id}`, {
      headers: WRITE_HEADERS,
      data: { title: payload.flyer.title, hostel: payload.flyer.hostel, template: payload.flyer.template, data: payload.flyer.data, photoId: payload.flyer.photoId },
    });
    expect(put.status()).toBe(200);
  };
  await save();

  // Story first: a cache that ignored the canvas would hand WhatsApp the story's file, at the wrong size.
  for (const canvas of CANVAS_IDS) {
    for (const format of ['png', 'jpg'] as const) {
      const res = await post(canvas, format);
      expect(res.status()).toBe(200);
      expect(res.headers()['x-render-cache'], `${canvas} ${format} first time`).toBe('miss');
      const meta = await sharp(await res.body()).metadata();
      expect([meta.format, meta.width, meta.height], `${canvas} ${format}`).toEqual([format === 'png' ? 'png' : 'jpeg', CANVASES[canvas].width, CANVASES[canvas].height]);
      expect(res.headers()['content-disposition']).toContain(`filename="${flyerFilename(stress.title, stress.id, format, canvas)}"`);
    }
  }

  for (const canvas of CANVAS_IDS) expect((await post(canvas, 'png')).headers()['x-render-cache'], canvas).toBe('hit');
  // No canvas at all (an editor from before canvases) is the story, from the same cache.
  const legacy = await request.post(`/api/render/${stress.id}`, { headers: WRITE_HEADERS, data: { format: 'png' } });
  expect(legacy.headers()['x-render-cache']).toBe('hit');
  expect((await sharp(await legacy.body()).metadata()).height).toBe(CANVASES.story.height);

  await save();
  for (const canvas of CANVAS_IDS) expect((await post(canvas, 'png')).headers()['x-render-cache'], `${canvas} after a save`).toBe('miss');
});

test('the export route checks the id, then the format, then the canvas, then the flyer (docs/api-contract.md)', async ({ request }) => {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
  const id = list.find((f) => SAMPLE_TITLES.has(f.title))!.id;
  const post = (path: string, data: unknown, headers: Record<string, string> = WRITE_HEADERS) => request.post(path, { headers, data });
  const fails = async (res: APIResponse, key: ApiErrorKey) => {
    const spec = apiError(key);
    const { error } = (await res.json()) as { error: { code: string; message: string } };
    expect([res.status(), error.code, error.message]).toEqual([spec.status, spec.code, spec.message]);
  };

  await fails(await post(`/api/render/${id}`, { format: 'png' }, {}), 'forbidden');
  await fails(await post('/api/render/abc', { format: 'gif' }), 'no_such_flyer');
  await fails(await post(`/api/render/${id}`, { format: 'gif' }), 'bad_format');
  await fails(await post('/api/render/999999', { format: 'gif' }), 'bad_format');
  await fails(await post(`/api/render/${id}`, { format: 'gif', canvas: 'square' }), 'bad_format');
  for (const canvas of ['square', '', 'STORY', '__proto__', 'toString', 5, true, ['story'], { id: 'story' }])
    await fails(await post(`/api/render/${id}`, { format: 'png', canvas }), 'bad_canvas');
  await fails(await post('/api/render/999999', { format: 'png', canvas: 'square' }), 'bad_canvas');
  await fails(await post('/api/render/999999', { format: 'png', canvas: 'whatsapp' }), 'no_such_flyer');
  await fails(await post('/api/render/999999', { format: 'png' }), 'no_such_flyer');
  // null is absent, as it is for format.
  expect((await post(`/api/render/${id}`, { format: 'png', canvas: null })).status()).toBe(200);
});

test('the render page refuses an unknown canvas instead of drawing the story', async ({ page, request }) => {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
  const id = list.find((f) => SAMPLE_TITLES.has(f.title))!.id;
  await page.goto(`/render.html?id=${id}&canvas=square`);
  await page.waitForFunction(() => (window as unknown as { __FLYER_ERROR?: string }).__FLYER_ERROR);
  expect(await page.evaluate(() => (window as unknown as { __FLYER_ERROR?: string }).__FLYER_ERROR)).toContain('square');
  expect(await page.locator('[data-flyer]').count()).toBe(0);
});

test('the editor previews, fits and downloads every canvas, through the server exporter', async ({ page, request }) => {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
  const flyer = list.find((f) => f.title === 'Long copy · stress test')!;
  const renders: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/render\/\d+$/.test(r.url())) renders.push(r.postData() ?? '');
  });
  await page.setViewportSize(EDITOR_VIEWPORT);
  await page.goto(`/#/flyers/${flyer.id}`);
  await expect.poll(async () => page.evaluate(() => document.fonts.status)).toBe('loaded');
  const preview = page.locator('.stage-canvas [data-flyer]');
  const toggle = (canvas: CanvasId) => canvasButton(page, canvas);

  // The default canvas is on screen and every other one is fitted offscreen, as its export will be. The stress copy
  // fits differently on the two canvases, so neither comparison can pass by accident.
  await expect(toggle(DEFAULT_CANVAS)).toHaveAttribute('aria-pressed', 'true');
  const want: Record<CanvasId, string[]> = { story: await exportFit(page, flyer.id, 'story'), whatsapp: await exportFit(page, flyer.id, 'whatsapp') };
  expect(want.story, 'the stress copy fits differently per canvas').not.toEqual(want.whatsapp);
  for (const hidden of CANVAS_IDS.filter((c) => c !== DEFAULT_CANVAS)) {
    await expect.poll(() => page.evaluate(fitted, `[aria-hidden="true"] [data-flyer][data-canvas="${hidden}"]`), { message: `offscreen ${hidden} fit` }).toEqual(want[hidden]);
  }

  for (const canvas of CANVAS_IDS) {
    await toggle(canvas).click();
    await expect(toggle(canvas)).toHaveAttribute('aria-pressed', 'true');
    await expect(preview).toHaveAttribute('data-canvas', canvas);
    // Preview = export: the render page's fitted sizes for this canvas (a stale fit would keep the other canvas's).
    expect(await page.evaluate(fitted, '.stage-canvas'), `${canvas}: preview fit`).toEqual(want[canvas]);

    for (const format of ['png', 'jpg'] as const) {
      const file = await download(page, format);
      expect(file.suggestedFilename()).toBe(flyerFilename(flyer.title, flyer.id, format, canvas));
      const meta = await sharp(readFileSync(await file.path())).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual([format === 'png' ? 'png' : 'jpeg', CANVASES[canvas].width, CANVASES[canvas].height]);
      await expect(page.getByText(`(${CANVASES[canvas].width} × ${CANVASES[canvas].height})`)).toBeVisible();
    }
  }
  expect(renders.map((b) => JSON.parse(b).canvas), 'every download went through POST /api/render with its canvas').toEqual(
    CANVAS_IDS.flatMap((c) => [c, c]),
  );

  // The canvas chosen is remembered for this viewer; a value no canvas has is ignored. The one remembered here is
  // not the default, so the reload proves the memory, and the bad value proves the default.
  const chosen = CANVAS_IDS.find((c) => c !== DEFAULT_CANVAS)!;
  await toggle(chosen).click();
  await page.reload();
  await expect(toggle(chosen)).toHaveAttribute('aria-pressed', 'true');
  await expect(preview).toHaveAttribute('data-canvas', chosen);
  await page.evaluate(() => localStorage.setItem('editor.canvas', '__proto__'));
  await page.reload();
  await expect(toggle(DEFAULT_CANVAS)).toHaveAttribute('aria-pressed', 'true');
  await expect(preview).toHaveAttribute('data-canvas', DEFAULT_CANVAS);

  // Copy that is cut off says so, naming every canvas it is cut off on, and the warning shrinks when it fits again: to
  // the story alone, whose WHERE chip this copy fills 2 px past its padding at its floors (accepted, 2026-09-30).
  await openSection(page, 'Headline'); // closed on a saved flyer
  const line2 = page.getByLabel('Line 2');
  const before = await line2.inputValue();
  const warning = cutOff(page);
  await expect(warning).toContainText(cutOffOn('story'));
  await line2.fill('W'.repeat(40));
  await expect(warning).toContainText(cutOffOn(...CANVAS_IDS));
  await line2.fill(before);
  await expect(warning).toContainText(cutOffOn('story'));
});
