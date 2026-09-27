import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import sharp from 'sharp';
import { apiError, type ApiErrorKey } from '../../src/shared/errors';
import { flyerFilename } from '../../src/shared/filename';
import { resolveDoodles } from '../../src/shared/defaults';
import { CANVASES, CANVAS_IDS, activityGroups, artAnchors, placeArt, safeBox, type CanvasId } from '../../src/shared/layout';
import { SAMPLE_FLYERS } from '../../src/shared/samples';
import type { FlyerListItem, FlyerPayload } from '../../src/shared/schema';

/* The automatable half of the handoff's export checklist (README §9), for
   every sample flyer — the stress test included — in all three photo modes,
   on every output canvas. */

const MODES = ['bleed', 'band', 'none'] as const;
const H = { 'X-Nest-Flyers': '1' };

const SAMPLE_TITLES = new Set(SAMPLE_FLYERS.map((s) => s.title));

/** The seeded samples only — other specs' flyers never leak in. */
async function samples(request: APIRequestContext): Promise<FlyerPayload[]> {
  const list = ((await (await request.get('/api/flyers')).json()) as FlyerListItem[]).filter((f) => SAMPLE_TITLES.has(f.title));
  return Promise.all(list.map(async (f) => (await (await request.get(`/api/flyers/${f.id}`)).json()) as FlyerPayload));
}

async function renderPayload(page: Page, payload: FlyerPayload, canvas: CanvasId) {
  await page.setViewportSize({ width: CANVASES[canvas].width, height: CANVASES[canvas].height });
  await page.addInitScript((p) => ((window as unknown as { __FLYER_PAYLOAD: unknown }).__FLYER_PAYLOAD = p), payload);
  await page.goto(`/render.html?canvas=${canvas}`);
  await page.waitForFunction(() => {
    const w = window as unknown as { __FLYER_READY?: boolean; __FLYER_ERROR?: string };
    return w.__FLYER_READY || w.__FLYER_ERROR;
  });
  expect(await page.evaluate(() => (window as unknown as { __FLYER_ERROR?: string }).__FLYER_ERROR)).toBeUndefined();
}

for (const canvas of CANVAS_IDS) {
  test(`${canvas}: every sample, every photo mode: where layout.ts says, in the safe box, no overlaps, no clipped text, real fonts`, async ({ page, request }) => {
    const all = await samples(request);
    expect(all.length).toBeGreaterThanOrEqual(6);
    const withPhoto = all.find((p) => p.photo)!;
    const { width: W, height: HT } = CANVASES[canvas];
    const safe = safeBox(canvas);
    for (const base of all) {
      for (const mode of MODES) {
        const payload: FlyerPayload = structuredClone(base);
        payload.flyer.data.photoMode = mode;
        if (mode !== 'none' && !payload.photo) payload.photo = withPhoto.photo;
        const label = `${canvas} / ${base.flyer.title} / ${mode}`;

        await test.step(label, async () => {
          await renderPayload(page, payload, canvas);
          const r = await page.evaluate(() => {
            const groups = [...document.querySelectorAll<HTMLElement>('[data-group]')].map((el) => {
              const b = el.getBoundingClientRect();
              return { name: el.dataset.group!, left: b.left, top: b.top, right: b.right, bottom: b.bottom };
            });
            const faces = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/"/g, '')} ${f.weight}`);
            const mark = document.querySelector('[data-group=chips] span[style*="mark-yellow"]');
            // The eyebrow row's children don't shrink: the logo's right edge is where it really ends.
            const logo = document.querySelector('[data-group=eyebrow] img[alt="Nests Hostels"]')!.getBoundingClientRect();
            // The flyer's own art (the pencil in the ask box is part of the block, not a doodle).
            const art = [...document.querySelectorAll<HTMLElement>('[data-flyer] > img[data-art]')].map((el) => ({
              left: parseFloat(el.style.left),
              top: parseFloat(el.style.top),
              width: parseFloat(el.style.width),
            }));
            return {
              art,
              drawn: document.querySelector<HTMLElement>('[data-flyer]')!.dataset.canvas,
              groups,
              logoRight: logo.right,
              faces,
              fit: (window as unknown as { __FLYER_FIT: { clippedBoxes: number; entries: { text: string; overflowX: boolean }[] } }).__FLYER_FIT,
              markBreak: mark ? getComputedStyle(mark).getPropertyValue('box-decoration-break') || getComputedStyle(mark).getPropertyValue('-webkit-box-decoration-break') : null,
              scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
            };
          });

          expect(r.drawn, `${label}: the page drew this canvas`).toBe(canvas);
          // Every block where the registry puts it: a leftover story number would pass the safe box, not this.
          const table = activityGroups(canvas, mode);
          for (const g of r.groups) {
            const want = table[g.name as keyof typeof table]!;
            if (g.name === 'pill') {
              // Centred, as wide as its copy, tilted -0.6°: the tilt lifts a corner by half its width × sin 0.6°.
              const tilt = ((g.right - g.left) / 2) * Math.sin((0.6 * Math.PI) / 180);
              expect(Math.abs(g.top - want.top), `${label}: pill top`).toBeLessThanOrEqual(tilt + 0.5);
              expect(Math.abs((g.left + g.right) / 2 - W / 2), `${label}: pill centre`).toBeLessThanOrEqual(1);
              continue;
            }
            for (const [edge, value] of [
              ['left', want.left],
              ['top', want.top],
              ['right', want.left + want.width],
              ['bottom', want.top + want.height],
            ] as const)
              expect(Math.abs(g[edge] - value), `${label}: ${g.name} ${edge}`).toBeLessThanOrEqual(0.5);
          }
          expect(r.logoRight, `${label}: the eyebrow row ends inside the safe box`).toBeLessThanOrEqual(safe.left + safe.width + 0.5);

          // The art where the registry hangs it, from data that went through the store: the template set
          // is recognised and follows the canvas (the blobs to its corners, the spark to the pill).
          const want = resolveDoodles(payload.flyer.data.doodles).map((d) => placeArt(d, artAnchors(canvas, mode)));
          expect(r.art.length, `${label}: art pieces`).toBe(want.length);
          // The style reads back rounded to two decimals, so to the nearest 0.05 px.
          r.art.forEach((a, i) => {
            for (const key of ['left', 'top', 'width'] as const) expect(a[key], `${label}: art ${i} ${key}`).toBeCloseTo(want[i][key], 1);
          });

          for (const g of r.groups) {
            const bleed = g.name === 'photo' && mode === 'bleed';
            if (!bleed) {
              expect(g.left, `${label}: ${g.name} left`).toBeGreaterThanOrEqual(safe.left - 0.5);
              expect(g.right, `${label}: ${g.name} right`).toBeLessThanOrEqual(safe.left + safe.width + 0.5);
            }
            expect(g.top, `${label}: ${g.name} top`).toBeGreaterThanOrEqual(safe.top - 0.5);
            expect(g.bottom, `${label}: ${g.name} bottom`).toBeLessThanOrEqual(safe.top + safe.height + 0.5);
          }
          for (let i = 0; i < r.groups.length; i++)
            for (let j = i + 1; j < r.groups.length; j++) {
              const a = r.groups[i];
              const b = r.groups[j];
              const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
              expect(overlap, `${label}: ${a.name} overlaps ${b.name}`).toBe(false);
            }

          expect(r.fit.clippedBoxes, `${label}: clipped boxes`).toBe(0);
          expect(r.fit.entries.filter((e) => e.overflowX).map((e) => e.text), `${label}: overflowing lines`).toEqual([]);
          for (const face of ['Shantell Sans 700', 'Shantell Sans 800', 'Montserrat 600', 'Montserrat 700']) {
            expect(r.faces, `${label}: ${face}`).toContain(face);
          }
          if (r.markBreak !== null) expect(r.markBreak, `${label}: highlighter clone`).toBe('clone');
          expect(r.scroll, `${label}: no scrollbars`).toEqual({ w: W, h: HT });
        });
      }
    }
  });
}

test('export API returns every canvas at its exact size as PNG and JPG, each cached until the flyer changes', async ({ request }) => {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
  const stress = list.find((f) => f.title === 'Long copy · stress test')!;
  const post = (canvas: CanvasId, format: 'png' | 'jpg') => request.post(`/api/render/${stress.id}`, { headers: H, data: { format, canvas } });
  const payload = (await (await request.get(`/api/flyers/${stress.id}`)).json()) as FlyerPayload;
  // Saving empties the flyer's render cache, whatever other tests asked for.
  const save = async () => {
    const put = await request.put(`/api/flyers/${stress.id}`, {
      headers: H,
      data: { title: payload.flyer.title, hostel: payload.flyer.hostel, template: 'activity', data: payload.flyer.data, photoId: payload.flyer.photoId },
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
  const legacy = await request.post(`/api/render/${stress.id}`, { headers: H, data: { format: 'png' } });
  expect(legacy.headers()['x-render-cache']).toBe('hit');
  expect((await sharp(await legacy.body()).metadata()).height).toBe(CANVASES.story.height);

  await save();
  for (const canvas of CANVAS_IDS) expect((await post(canvas, 'png')).headers()['x-render-cache'], `${canvas} after a save`).toBe('miss');
});

test('the export route checks the id, then the format, then the canvas, then the flyer (docs/api-contract.md)', async ({ request }) => {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
  const id = list.find((f) => SAMPLE_TITLES.has(f.title))!.id;
  const post = (path: string, data: unknown, headers: Record<string, string> = H) => request.post(path, { headers, data });
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

/** The fitted font sizes of one flyer, in document order. */
const fitted = (selector: string) =>
  [...document.querySelectorAll<HTMLElement>(`${selector} [data-fit]`)].map((el) => el.style.fontSize);

/** What the render page (the export) fits for a flyer on a canvas. */
async function exportFit(page: Page, id: number, canvas: CanvasId): Promise<string[]> {
  const other = await page.context().newPage();
  await other.setViewportSize({ width: CANVASES[canvas].width, height: CANVASES[canvas].height });
  await other.goto(`/render.html?id=${id}&canvas=${canvas}`);
  await other.waitForFunction(() => (window as unknown as { __FLYER_READY?: boolean }).__FLYER_READY);
  const sizes = await other.evaluate(fitted, '[data-flyer]');
  await other.close();
  return sizes;
}

test('the editor previews, fits and downloads every canvas, through the server exporter', async ({ page, request }) => {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
  const flyer = list.find((f) => f.title === 'Long copy · stress test')!;
  const renders: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/render\/\d+$/.test(r.url())) renders.push(r.postData() ?? '');
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/#/flyers/${flyer.id}`);
  await expect.poll(async () => page.evaluate(() => document.fonts.status)).toBe('loaded');
  const preview = page.locator('.stage-canvas [data-flyer]');
  const toggle = (canvas: CanvasId) => page.getByRole('button', { name: CANVASES[canvas].label, exact: true });

  // With the story on screen, WhatsApp is fitted offscreen, as its export will be. The stress copy
  // fits differently on the two canvases, so neither comparison can pass by accident.
  await expect(toggle('story')).toHaveAttribute('aria-pressed', 'true');
  const want = { story: await exportFit(page, flyer.id, 'story'), whatsapp: await exportFit(page, flyer.id, 'whatsapp') };
  expect(want.story, 'the stress copy fits differently per canvas').not.toEqual(want.whatsapp);
  await expect.poll(() => page.evaluate(fitted, '[aria-hidden="true"] [data-flyer][data-canvas="whatsapp"]'), { message: 'offscreen WhatsApp fit' }).toEqual(want.whatsapp);

  for (const canvas of CANVAS_IDS) {
    await toggle(canvas).click();
    await expect(toggle(canvas)).toHaveAttribute('aria-pressed', 'true');
    await expect(preview).toHaveAttribute('data-canvas', canvas);
    // Preview = export: the render page's fitted sizes for this canvas (a stale fit would keep the other canvas's).
    expect(await page.evaluate(fitted, '.stage-canvas'), `${canvas}: preview fit`).toEqual(want[canvas]);

    for (const [button, format] of [['Download PNG', 'png'], ['JPG', 'jpg']] as const) {
      const btn = page.getByRole('button', { name: button, exact: true });
      await expect(btn).toBeEnabled();
      const [download] = await Promise.all([page.waitForEvent('download'), btn.click()]);
      expect(download.suggestedFilename()).toBe(flyerFilename(flyer.title, flyer.id, format, canvas));
      const meta = await sharp(readFileSync(await download.path())).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual([format === 'png' ? 'png' : 'jpeg', CANVASES[canvas].width, CANVASES[canvas].height]);
      await expect(page.getByText(`(${CANVASES[canvas].width} × ${CANVASES[canvas].height})`)).toBeVisible();
    }
  }
  expect(renders.map((b) => JSON.parse(b).canvas), 'every download went through POST /api/render with its canvas').toEqual(
    CANVAS_IDS.flatMap((c) => [c, c]),
  );

  // The last canvas chosen is remembered for this viewer; a value no canvas has is ignored.
  const last = CANVAS_IDS.at(-1)!;
  await page.reload();
  await expect(toggle(last)).toHaveAttribute('aria-pressed', 'true');
  await expect(preview).toHaveAttribute('data-canvas', last);
  await page.evaluate(() => localStorage.setItem('editor.canvas', '__proto__'));
  await page.reload();
  await expect(toggle('story')).toHaveAttribute('aria-pressed', 'true');

  // Copy that is cut off says so, naming every canvas it is cut off on, and the warning goes when it fits again.
  const line2 = page.getByLabel('Line 2');
  const before = await line2.inputValue();
  await line2.fill('W'.repeat(40));
  const warning = page.locator('.note-warn', { hasText: 'is being cut off' });
  await expect(warning).toContainText(`cut off on ${CANVAS_IDS.map((c) => CANVASES[c].label).join(' and ')}`);
  await line2.fill(before);
  await expect(warning).toHaveCount(0);
});
