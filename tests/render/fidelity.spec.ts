import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Browser, type Download, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { flyerFilename } from '../../src/shared/filename';
import type { PhotoMode } from '../../src/shared/layout';
import { SAMPLE_FLYERS } from '../../src/shared/samples';
import type { FlyerListItem, FlyerPayload, FlyerSaved } from '../../src/shared/schema';
import { H, W, THRESHOLD, compare, failures, highlighterWrapSample, jpegQuality, readRegions, type Regions } from './pixels';

/* The permanent export-fidelity check (brief Phase 2, from the approved spike):
   every sample in every photo mode is downloaded through the real editor with
   the in-browser ClientExporter, and held to the server's Playwright export of
   the same saved flyer, ≤ 0.5 % differing pixels outside the photo band and
   inside each feature's boxes. DPR 1 covers every case; DPR 2 (a Retina
   laptop) three of them, or all with FIDELITY_FULL=1. */

const HDR = { 'X-Nest-Flyers': '1' };
const MODES: PhotoMode[] = ['bleed', 'band', 'none'];
const RETINA = new Set(['Highlighter wrap / band', 'Long copy · stress test / bleed', 'Paragliding / none']);
const FULL = !!process.env.FIDELITY_FULL;

interface Case {
  label: string;
  mode: PhotoMode;
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

async function regionsOf(page: Page, id: number): Promise<Regions> {
  await page.goto(`render.html?id=${id}`);
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
    for (const mode of MODES) {
      const label = `${s.title} / ${mode}`;
      const title = `fidelity-${label}`;
      const saved = await json<FlyerSaved>(
        request.post('api/flyers', {
          headers: HDR,
          data: {
            title,
            hostel: s.hostel,
            template: 'activity',
            data: { ...s.data, photoMode: mode },
            photoId: mode === 'none' ? null : (source?.photo?.id ?? borrowed),
          },
        }),
      );
      const render = await request.post(`api/render/${saved.id}`, { headers: HDR, data: { format: 'png' } });
      expect(render.status(), `golden ${label}`).toBe(200);
      cases.set(label, { label, mode, id: saved.id, title, golden: PNG.sync.read(await render.body()), regions: await regionsOf(page, saved.id) });
    }
  }
}

test.beforeAll(async ({ request, browser }) => {
  test.setTimeout(240_000);
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await seed(request, page);
  await page.close();
});

test.afterAll(async ({ request }) => {
  for (const c of cases.values()) await request.delete(`api/flyers/${c.id}`, { headers: HDR });
});

/** The editor with only the in-browser exporter: Node has both, PHP only this one.
    Any request to the server renderer is aborted, so a wrong exporter fails loudly. */
async function clientOnlyEditor(browser: Browser, baseURL: string | undefined, dpr: number) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  let configs = 0;
  await page.route('**/api/config', async (route) => {
    configs++;
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), exporters: ['client'] } });
  });
  await page.route('**/api/render/**', (route) => route.abort());
  return { context, page, overridden: () => configs > 0 };
}

async function download(page: Page, button: string): Promise<{ file: Buffer; download: Download }> {
  const btn = page.getByRole('button', { name: button, exact: true });
  await expect(btn).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), btn.click()]);
  const path = await download.path();
  await expect(btn).toBeEnabled(); // the editor is idle again
  return { file: readFileSync(path), download };
}

const labels = [...SAMPLE_FLYERS, highlighterWrapSample()].flatMap((s) => MODES.map((m) => `${s.title} / ${m}`));
for (const l of RETINA) if (!labels.includes(l)) throw new Error(`Retina case "${l}" is not a fidelity case`);
const runs = labels.flatMap((label) => [1, ...(FULL || RETINA.has(label) ? [2] : [])].map((dpr) => ({ label, dpr })));

for (const { label, dpr } of runs) {
  test(`client export matches the server export: ${label} @${dpr}x`, async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const c = cases.get(label)!;
    const { context, page, overridden } = await clientOnlyEditor(browser, baseURL, dpr);
    try {
      await page.goto(`./#/flyers/${c.id}`);
      const png = await download(page, 'Download PNG');
      const jpg = await download(page, 'JPG');
      expect(overridden(), 'the editor read the client-only config').toBe(true);
      expect(png.download.suggestedFilename()).toBe(flyerFilename(c.title, c.id, 'png'));
      expect(jpg.download.suggestedFilename()).toBe(flyerFilename(c.title, c.id, 'jpg'));

      const candidate = PNG.sync.read(png.file);
      expect([candidate.width, candidate.height]).toEqual([W, H]);
      const jpgMeta = await sharp(jpg.file).metadata();
      expect([jpgMeta.format, jpgMeta.width, jpgMeta.height]).toEqual(['jpeg', W, H]);
      expect(jpegQuality(jpg.file)).toBe(90);

      const metrics = compare(c.golden, candidate, c.mode, c.regions);
      expect(failures(metrics), JSON.stringify(metrics)).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('the check is not blind: a sliced highlighter fails it', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const c = cases.get('Highlighter wrap / band')!;
  expect(c.regions.markLines, 'the WHEN highlighter wraps onto a second line').toBeGreaterThanOrEqual(2);
  const { context, page } = await clientOnlyEditor(browser, baseURL, 1);
  try {
    await page.goto(`./#/flyers/${c.id}`);
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
    const png = await download(page, 'Download PNG');
    const metrics = compare(c.golden, PNG.sync.read(png.file), c.mode, c.regions);
    expect(metrics.mark!, JSON.stringify(metrics)).toBeGreaterThan(THRESHOLD);
  } finally {
    await context.close();
  }
});
