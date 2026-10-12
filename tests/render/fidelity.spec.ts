import { readFileSync } from 'node:fs';
import type { APIRequestContext, Download, Page } from '@playwright/test';
import { expect, test } from '../browser';
import { canvasButton, clientOnlyEditor, download as downloadFlyer } from '../editor';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { flyerFilename } from '../../src/shared/filename';
import { CANVASES, CANVAS_IDS, type Body, type CanvasId } from '../../src/shared/layout';
import { SAMPLE_FLYERS } from '../../src/shared/samples';
import type { FlyerListItem, FlyerPayload, FlyerSaved } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';
import { THRESHOLD, bodiesOf, compare, failures, groupsOf, highlighterWrapSample, jpegQuality, readRegions, type Regions } from './pixels';

/* The permanent export-fidelity check (brief Phase 2, from the approved spike):
   every Activity sample in every photo mode, and every This week sample once
   (it has no photo), is downloaded through the real editor with the in-browser
   ClientExporter, and held to the server's Playwright export of the same saved
   flyer, ≤ 0.5 % differing pixels outside the photo band and inside each
   feature's boxes, on every output canvas. DPR 1 covers every case; DPR 2 (a
   Retina laptop) four story cases and one per other canvas, or all with
   FIDELITY_FULL=1.

   Each case first checks that the golden drew its own template: exactly the
   blocks layout.ts gives it, and the photo (or the rule drawn when there is
   none) where its mode puts it. The pixel
   comparison alone can't tell: a renderer that drew every flyer as Activity
   would draw both exports alike, and they would agree. */

const RETINA = new Set([
  'story | Highlighter wrap / band',
  'story | Long copy · stress test / bleed',
  'story | Paragliding / none',
  'story | This week · stress test / week',
  ...CANVAS_IDS.filter((c) => c !== 'story').map((c) => `${c} | Long copy · stress test / bleed`),
]);
const FULL = !!process.env.FIDELITY_FULL;

interface Case {
  label: string;
  canvas: CanvasId;
  mode: Body;
  id: number;
  title: string;
  golden: PNG;
  regions: Regions;
}

const cases = new Map<string, Case>();

async function json<T>(req: Promise<{ ok(): boolean; status(): number; json(): Promise<unknown> }>): Promise<T> {
  const res = await req;
  expect(res.ok(), `HTTP ${res.status()}`).toBe(true);
  return (await res.json()) as T;
}

async function regionsOf(page: Page, id: number, canvas: CanvasId): Promise<Regions> {
  await page.setViewportSize({ width: CANVASES[canvas].width, height: CANVASES[canvas].height });
  await page.goto(`render.html?id=${id}&canvas=${canvas}`);
  await page.waitForFunction(() => {
    const w = window as { __FLYER_READY?: boolean; __FLYER_ERROR?: string };
    return w.__FLYER_READY || w.__FLYER_ERROR;
  });
  return page.evaluate(readRegions);
}

async function seed(request: APIRequestContext, page: Page) {
  const listed = await json<FlyerListItem[]>(request.get('api/flyers'));
  const payloads = new Map<string, FlyerPayload>();
  for (const s of SAMPLE_FLYERS) {
    const item = listed.find((f) => f.title === s.title);
    if (!item) throw new Error(`Sample "${s.title}" is not seeded`);
    payloads.set(s.title, await json<FlyerPayload>(request.get(`api/flyers/${item.id}`)));
  }
  // Samples without a photo borrow one in bleed and band, as the spike did.
  const borrowed = [...payloads.values()].find((p) => p.photo)!.photo!.id;

  for (const s of [...SAMPLE_FLYERS, highlighterWrapSample()]) {
    const source = payloads.get(s.title);
    for (const mode of bodiesOf(s.data)) {
      const label = `${s.title} / ${mode}`;
      const title = `fidelity-${label}`;
      const saved = await json<FlyerSaved>(
        request.post('api/flyers', {
          headers: WRITE_HEADERS,
          data: {
            title,
            hostel: s.hostel,
            template: s.data.template,
            data: mode === 'week' ? s.data : { ...s.data, photoMode: mode },
            photoId: mode === 'none' || mode === 'week' ? null : (source?.photo?.id ?? borrowed),
          },
        }),
      );
      // One saved flyer, a golden per canvas: the same data on every canvas, as in the editor.
      for (const canvas of CANVAS_IDS) {
        const render = await request.post(`api/render/${saved.id}`, { headers: WRITE_HEADERS, data: { format: 'png', canvas } });
        expect(render.status(), `golden ${canvas} ${label}`).toBe(200);
        const key = `${canvas} | ${label}`;
        cases.set(key, { label: key, canvas, mode, id: saved.id, title, golden: PNG.sync.read(await render.body()), regions: await regionsOf(page, saved.id, canvas) });
      }
    }
  }
}

test.beforeAll(async ({ request, browser }) => {
  // 24 flyers (7 Activity samples × 3 photo modes, 3 week samples), a server render and a region read per canvas.
  test.setTimeout(280_000 * CANVAS_IDS.length);
  const page = await browser.newPage();
  await seed(request, page);
  await page.close();
});

test.afterAll(async ({ request }) => {
  for (const id of new Set([...cases.values()].map((c) => c.id))) await request.delete(`api/flyers/${id}`, { headers: WRITE_HEADERS });
});

/** A download through the editor's toolbar, with the file it brought. */
async function download(page: Page, format: 'png' | 'jpg'): Promise<{ file: Buffer; download: Download }> {
  const download = await downloadFlyer(page, format); // it returns once the editor is idle again
  return { file: readFileSync(await download.path()), download };
}

const labels = CANVAS_IDS.flatMap((canvas) => [...SAMPLE_FLYERS, highlighterWrapSample()].flatMap((s) => bodiesOf(s.data).map((m) => `${canvas} | ${s.title} / ${m}`)));
for (const l of RETINA) if (!labels.includes(l)) throw new Error(`Retina case "${l}" is not a fidelity case`);
const runs = labels.flatMap((label) => [1, ...(FULL || RETINA.has(label) ? [2] : [])].map((dpr) => ({ label, dpr })));

for (const { label, dpr } of runs) {
  test(`client export matches the server export: ${label} @${dpr}x`, async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const c = cases.get(label)!;
    const want = groupsOf(c.canvas, c.mode);
    expect(c.regions.groups.map((g) => g.name).sort(), `${label}: the golden drew exactly its template's blocks`).toEqual(Object.keys(want).sort());
    // The photo, or the rule a flyer with no photo draws in its place. The story's bleed and band differ only in left
    // and width, so every edge is checked.
    const photo = c.regions.groups.find((g) => g.name === 'photo');
    if (photo) for (const edge of ['left', 'top', 'width', 'height'] as const) expect(Math.abs(photo[edge] - want.photo![edge]), `${label}: photo ${edge}`).toBeLessThanOrEqual(0.5);
    const { context, page, overridden } = await clientOnlyEditor(browser, baseURL, dpr);
    try {
      await page.goto(`./#/flyers/${c.id}`);
      await canvasButton(page, c.canvas).click();
      const png = await download(page, 'png');
      const jpg = await download(page, 'jpg');
      expect(overridden(), 'the editor read the client-only config').toBe(true);
      expect(png.download.suggestedFilename()).toBe(flyerFilename(c.title, c.id, 'png', c.canvas));
      expect(jpg.download.suggestedFilename()).toBe(flyerFilename(c.title, c.id, 'jpg', c.canvas));

      const { width: W, height: H } = CANVASES[c.canvas];
      const candidate = PNG.sync.read(png.file);
      expect([candidate.width, candidate.height]).toEqual([W, H]);
      const jpgMeta = await sharp(jpg.file).metadata();
      expect([jpgMeta.format, jpgMeta.width, jpgMeta.height]).toEqual(['jpeg', W, H]);
      expect(jpegQuality(jpg.file)).toBe(90);

      const metrics = compare(c.golden, candidate, c.canvas, c.mode, c.regions);
      expect(failures(metrics), JSON.stringify(metrics)).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('the check is not blind: a sliced highlighter fails it', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const c = cases.get('story | Highlighter wrap / band')!;
  expect(c.regions.markLines, 'the WHEN highlighter wraps onto a second line').toBeGreaterThanOrEqual(2);
  const { context, page } = await clientOnlyEditor(browser, baseURL, 1);
  try {
    await page.goto(`./#/flyers/${c.id}`);
    // The case's own canvas, as the test above chooses it: the golden is its size, whatever a fresh editor shows.
    await canvasButton(page, c.canvas).click();
    // Break the feature the handoff (§9) worried about, the way the renderer
    // writes it — an inline style — on every flyer mounted from now on,
    // including the exporter's offscreen one. (A stylesheet rule would not
    // reach the capture: it copies inline styles, hence CLAUDE.md's rule.)
    await page.evaluate(() => {
      const slice = () =>
        document.querySelectorAll<HTMLElement>('[data-flyer] span[style*="mark-yellow"]').forEach((el) => {
          if (el.style.boxDecorationBreak === 'slice') return;
          el.style.boxDecorationBreak = 'slice';
          el.style.setProperty('-webkit-box-decoration-break', 'slice');
        });
      new MutationObserver(slice).observe(document.body, { subtree: true, childList: true });
      slice();
    });
    const png = await download(page, 'png');
    const metrics = compare(c.golden, PNG.sync.read(png.file), c.canvas, c.mode, c.regions);
    expect(metrics.mark!, JSON.stringify(metrics)).toBeGreaterThan(THRESHOLD);
  } finally {
    await context.close();
  }
});
