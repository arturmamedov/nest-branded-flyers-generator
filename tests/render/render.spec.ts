import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import sharp from 'sharp';
import { apiError, type ApiErrorKey } from '../../src/shared/errors';
import { flyerFilename } from '../../src/shared/filename';
import { SAMPLE_FLYERS } from '../../src/shared/samples';
import type { FlyerListItem, FlyerPayload } from '../../src/shared/schema';

/* The automatable half of the handoff's export checklist (README §9), for
   every sample flyer — the stress test included — in all three photo modes. */

const SAFE = { left: 70, top: 250, right: 1010, bottom: 1620 };
const MODES = ['bleed', 'band', 'none'] as const;
const H = { 'X-Nest-Flyers': '1' };

const SAMPLE_TITLES = new Set(SAMPLE_FLYERS.map((s) => s.title));

/** The seeded samples only — other specs' flyers never leak in. */
async function samples(request: APIRequestContext): Promise<FlyerPayload[]> {
  const list = ((await (await request.get('/api/flyers')).json()) as FlyerListItem[]).filter((f) => SAMPLE_TITLES.has(f.title));
  return Promise.all(list.map(async (f) => (await (await request.get(`/api/flyers/${f.id}`)).json()) as FlyerPayload));
}

async function renderPayload(page: Page, payload: FlyerPayload) {
  await page.addInitScript((p) => ((window as unknown as { __FLYER_PAYLOAD: unknown }).__FLYER_PAYLOAD = p), payload);
  await page.goto('/render.html');
  await page.waitForFunction(() => {
    const w = window as unknown as { __FLYER_READY?: boolean; __FLYER_ERROR?: string };
    return w.__FLYER_READY || w.__FLYER_ERROR;
  });
  expect(await page.evaluate(() => (window as unknown as { __FLYER_ERROR?: string }).__FLYER_ERROR)).toBeUndefined();
}

test('every sample, every photo mode: inside the safe box, no overlaps, no clipped text, real fonts', async ({ page, request }) => {
  const all = await samples(request);
  expect(all.length).toBeGreaterThanOrEqual(6);
  const withPhoto = all.find((p) => p.photo)!;
  for (const base of all) {
    for (const mode of MODES) {
      const payload: FlyerPayload = structuredClone(base);
      payload.flyer.data.photoMode = mode;
      if (mode !== 'none' && !payload.photo) payload.photo = withPhoto.photo;
      const label = `${base.flyer.title} / ${mode}`;

      await test.step(label, async () => {
        await renderPayload(page, payload);
        const r = await page.evaluate(() => {
          const groups = [...document.querySelectorAll<HTMLElement>('[data-group]')].map((el) => {
            const b = el.getBoundingClientRect();
            return { name: el.dataset.group!, left: b.left, top: b.top, right: b.right, bottom: b.bottom };
          });
          const faces = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/"/g, '')} ${f.weight}`);
          const mark = document.querySelector('[data-group=chips] span[style*="mark-yellow"]');
          return {
            groups,
            faces,
            fit: (window as unknown as { __FLYER_FIT: { clippedBoxes: number; entries: { text: string; overflowX: boolean }[] } }).__FLYER_FIT,
            markBreak: mark ? getComputedStyle(mark).getPropertyValue('box-decoration-break') || getComputedStyle(mark).getPropertyValue('-webkit-box-decoration-break') : null,
            scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
          };
        });

        for (const g of r.groups) {
          const bleed = g.name === 'photo' && mode === 'bleed';
          if (!bleed) {
            expect(g.left, `${label}: ${g.name} left`).toBeGreaterThanOrEqual(SAFE.left - 0.5);
            expect(g.right, `${label}: ${g.name} right`).toBeLessThanOrEqual(SAFE.right + 0.5);
          }
          expect(g.top, `${label}: ${g.name} top`).toBeGreaterThanOrEqual(SAFE.top - 0.5);
          expect(g.bottom, `${label}: ${g.name} bottom`).toBeLessThanOrEqual(SAFE.bottom + 0.5);
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
        expect(r.scroll, `${label}: no scrollbars`).toEqual({ w: 1080, h: 1920 });
      });
    }
  }
});

test('export API returns exactly 1080×1920 PNG and JPG, cached until the flyer changes', async ({ request }) => {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
  const stress = list.find((f) => f.title === 'Long copy · stress test')!;

  for (const format of ['png', 'jpg'] as const) {
    const res = await request.post(`/api/render/${stress.id}`, { headers: H, data: { format } });
    expect(res.status()).toBe(200);
    const meta = await sharp(await res.body()).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual([format === 'png' ? 'png' : 'jpeg', 1080, 1920]);
    expect(res.headers()['content-disposition']).toContain(`filename="${flyerFilename(stress.title, stress.id, format)}"`);
  }

  const again = await request.post(`/api/render/${stress.id}`, { headers: H, data: { format: 'png' } });
  expect(again.headers()['x-render-cache']).toBe('hit');

  const payload = (await (await request.get(`/api/flyers/${stress.id}`)).json()) as FlyerPayload;
  const put = await request.put(`/api/flyers/${stress.id}`, {
    headers: H,
    data: { title: payload.flyer.title, hostel: payload.flyer.hostel, template: 'activity', data: payload.flyer.data, photoId: payload.flyer.photoId },
  });
  expect(put.status()).toBe(200);
  const after = await request.post(`/api/render/${stress.id}`, { headers: H, data: { format: 'png' } });
  expect(after.headers()['x-render-cache']).toBe('miss');
});

test('the export route checks the id, then the format, then the flyer (docs/api-contract.md)', async ({ request }) => {
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
  await fails(await post('/api/render/999999', { format: 'png' }), 'no_such_flyer');
});

test('the editor downloads through the server exporter when the backend has one', async ({ page, request }) => {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
  const flyer = list.find((f) => f.title === 'Pool party')!;
  const renders: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/render\/\d+$/.test(r.url())) renders.push(r.url());
  });
  await page.goto(`/#/flyers/${flyer.id}`);
  for (const [button, format] of [['Download PNG', 'png'], ['JPG', 'jpg']] as const) {
    const btn = page.getByRole('button', { name: button, exact: true });
    await expect(btn).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent('download'), btn.click()]);
    expect(download.suggestedFilename()).toBe(flyerFilename(flyer.title, flyer.id, format));
    const meta = await sharp(readFileSync(await download.path())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual([format === 'png' ? 'png' : 'jpeg', 1080, 1920]);
  }
  expect(renders, 'both downloads went through POST /api/render').toHaveLength(2);
});
