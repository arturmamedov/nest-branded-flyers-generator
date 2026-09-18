import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import sharp from 'sharp';
import type { FlyerListItem, FlyerPayload } from '../../src/shared/schema';

/* The automatable half of the handoff's export checklist (README §9), for
   every sample flyer — the stress test included — in all three photo modes. */

const SAFE = { left: 70, top: 250, right: 1010, bottom: 1620 };
const MODES = ['bleed', 'band', 'none'] as const;
const H = { 'X-Nest-Flyers': '1' };

async function samples(request: APIRequestContext): Promise<FlyerPayload[]> {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
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
  const stress = list.find((f) => f.title.includes('stress'))!;

  for (const format of ['png', 'jpg'] as const) {
    const res = await request.post(`/api/render/${stress.id}`, { headers: H, data: { format } });
    expect(res.status()).toBe(200);
    const meta = await sharp(await res.body()).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual([format === 'png' ? 'png' : 'jpeg', 1080, 1920]);
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
