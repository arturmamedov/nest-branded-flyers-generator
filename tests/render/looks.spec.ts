import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { PNG } from 'pngjs';
import { expect, test } from '../browser';
import sharp from 'sharp';
import type { Download } from '@playwright/test';
import { EDITOR_VIEWPORT, canvasButton, clientOnlyEditor, clipboardPng, copyImage, download, exportFit, grantClipboard, libraryCard, lightbox, openSection, pickWay, status, zoomButton } from '../editor';
import { FIELD } from '../../src/editor/fields';
import { checkDrawn, drawnSamples, samples } from './drawnChecks';
import { inProof, sampleCopy, siteNames } from './proofFlyers';
import { drawPayload } from './drawn';
import { compare, failures, regionsOf } from './pixels';
import { filesNaming } from '../../scripts/build-php';
import { APP_ROOT } from '../../server/paths';
import { PROOF_LOOK_ID } from '../proof/id';
import { PROOF_LOOK } from '../proof/look';
import { CANVASES, CANVAS_IDS, DEFAULT_CANVAS, type Body, type CanvasId } from '../../src/shared/layout';
import { FIRST_LOOK } from '../../src/shared/looks';
import { DEFAULT_COLORS } from '../../src/shared/looks/handDrawn';
import type { FlyerPayload } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* The proof look, in the tests' own build (dist-proof/, served by tests/proof/server.ts on a site that names both
   looks): a second look that differs from hand-drawn in every token, drawn by the one renderer everywhere a flyer is
   drawn. It holds what docs/prompts/looks-seam.md asks of every look in the browser: the samples print where its
   boxes are, inside the safe zone and fitted; nothing of hand-drawn's is left on it; the client export matches the
   server's; the library card fits as the export does; and a flyer in a look the site does not name still saves and
   prints (M2).

   This process never registers the proof look: Playwright loads every project's specs in one process to list them,
   so the registry is read before this file loads. The page's build has it; the checks are handed PROOF_LOOK. */

/** Flyers a test saved: archived afterwards, so the specs after this one find the library as seeded. */
const saved: number[] = [];
const keep = (id: number) => saved.push(id);
test.afterAll(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

test('no trace: no file of the release’s build names the proof look, and the tests’ build does', () => {
  // Both are built before this suite runs (npm run test:render): dist/ is what build:php ships.
  expect(filesNaming(join(APP_ROOT, 'dist'), PROOF_LOOK_ID), 'dist/').toEqual([]);
  expect(filesNaming(join(APP_ROOT, 'dist-proof'), PROOF_LOOK_ID).length, 'dist-proof/').toBeGreaterThan(0);
});

for (const canvas of CANVAS_IDS) {
  test(`${canvas}: every sample, every photo mode, in the proof look: where its boxes are, in the safe box, fitted, its faces`, async ({ page, request }) => {
    for (const { title, body, payload } of await drawnSamples(request)) {
      const label = `${canvas} / ${title} / ${body} / proof`;
      await test.step(label, () => checkDrawn(page, inProof(payload), canvas, label, [], PROOF_LOOK));
    }
  });
}

/** Runs in the page: every paint the flyer draws with, by what it is (a colour, a font, a file), the photo aside. */
function paints() {
  const file = (url: string) => url.split('/').pop()!.split('?')[0];
  const out: string[] = [];
  const root = document.querySelector<HTMLElement>('[data-flyer]')!;
  for (const el of [root, ...root.querySelectorAll<HTMLElement | SVGElement>('*')]) {
    if (el.closest('[data-group=photo] img') || (el.tagName === 'IMG' && el.closest('[data-group=photo]'))) continue;
    const s = getComputedStyle(el);
    for (const prop of ['color', 'background-color', 'border-top-color', 'stroke', 'fill'] as const) {
      const v = s.getPropertyValue(prop);
      if (v && v !== 'none' && v !== 'rgba(0, 0, 0, 0)' && !(prop === 'fill' && el.tagName !== 'path') && !(prop === 'stroke' && el.tagName !== 'path')) out.push(`colour ${v}`);
    }
    out.push(`font ${s.fontFamily}`);
    for (const m of s.backgroundImage.matchAll(/url\("?([^")]+)"?\)/g)) out.push(`file ${file(m[1])}`);
    if (el.tagName === 'IMG') out.push(`file ${file((el as HTMLImageElement).src)}`);
  }
  return [...new Set(out)];
}

test('the canary: nothing the proof look draws is one of hand-drawn’s colours, fonts or files, on any canvas or body', async ({ page, request }) => {
  const all = await samples(request);
  // No hostel: its badge is every look's (EYEBROW_MARKS). No photo: the photo is the flyer's own.
  const activity = { ...all.find((p) => p.flyer.title === 'Pool party')!, photo: null, hostel: null };
  const week = { ...all.find((p) => p.flyer.title === 'This week · Duque Nest')!, hostel: null };
  for (const canvas of CANVAS_IDS) {
    for (const [base, body] of [[activity, 'band'], [activity, 'none'], [week, 'week']] as const) {
      const payload: FlyerPayload = structuredClone(base);
      payload.flyer.hostel = null;
      if (body !== 'week') payload.flyer.data.photoMode = body;
      payload.flyer.data.colors = DEFAULT_COLORS;
      await drawPayload(page, { ...payload, flyer: { ...payload.flyer, data: { ...payload.flyer.data, look: FIRST_LOOK } } }, canvas);
      const theirs = await page.evaluate(paints);
      await drawPayload(page, inProof(payload), canvas);
      await expect(page.locator('[data-flyer]')).toHaveAttribute('data-look', PROOF_LOOK_ID);
      const mine = await page.evaluate(paints);
      expect(mine.length, `${canvas} / ${body}: what the proof look paints`).toBeGreaterThan(10);
      expect(mine.filter((p) => theirs.includes(p)), `${canvas} / ${body}: hand-drawn's, left in the proof look`).toEqual([]);
    }
  }
});

/** A server export of a saved flyer, as a PNG. */
async function serverPng(request: APIRequestContext, id: number, canvas: CanvasId): Promise<PNG> {
  const res = await request.post(`/api/render/${id}`, { headers: WRITE_HEADERS, data: { format: 'png', canvas } });
  expect(res.status(), `server export ${canvas}`).toBe(200);
  return PNG.sync.read(await res.body());
}

/** A pixel of a PNG, as #rrggbb. */
const pixel = (png: PNG, x: number, y: number) =>
  `#${[0, 1, 2].map((c) => png.data[(y * png.width + x) * 4 + c].toString(16).padStart(2, '0')).join('')}`.toUpperCase();

for (const [sample, body] of [['Pool party', 'band'], ['Pool party', 'bleed'], ['Paragliding', 'none'], ['This week · stress test', 'week']] as const) {
  test(`the client export matches the server's in the proof look: ${sample} / ${body}, on every canvas`, async ({ browser, baseURL, page, request }) => {
    test.setTimeout(180_000);
    const { id } = await sampleCopy(request, sample, body, keep);
    const { context, page: editor, overridden } = await clientOnlyEditor(browser, baseURL);
    try {
      await editor.goto(`./#/flyers/${id}`);
      for (const canvas of CANVAS_IDS) {
        const golden = await serverPng(request, id, canvas);
        const regions = await regionsOf(page, id, canvas);
        expect(pixel(golden, 2, 2), `${canvas}: the server drew the proof look's ground`).toBe(PROOF_LOOK.palette({ colors: DEFAULT_COLORS }).ground.toUpperCase());
        await canvasButton(editor, canvas).click();
        const candidate = PNG.sync.read(readFileSync(await (await download(editor, 'png')).path()));
        expect([candidate.width, candidate.height]).toEqual([CANVASES[canvas].width, CANVASES[canvas].height]);
        const metrics = compare(golden, candidate, canvas, body, regions);
        expect(failures(metrics), `${canvas}: ${JSON.stringify(metrics)}`).toEqual([]);
      }
      expect(overridden(), 'the editor read the client-only config').toBe(true);
    } finally {
      await context.close();
    }
  });
}

test('a library card shows its flyer in the proof look, fitted as the export fits it', async ({ page, request }) => {
  await page.setViewportSize(EDITOR_VIEWPORT);
  const { id, title } = await sampleCopy(request, 'Long copy · stress test', 'band', keep);
  const want = await exportFit(page, id, DEFAULT_CANVAS);
  await page.goto('/');
  const card = libraryCard(page, title);
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.card-thumb.card-thumb-ready')).toBeVisible();
  const flyer = card.locator('.card-thumb [data-flyer]');
  await expect(flyer).toHaveAttribute('data-look', PROOF_LOOK_ID);
  expect(await flyer.evaluate((root) => [...root.querySelectorAll<HTMLElement>('[data-fit]')].map((el) => el.style.fontSize)), 'card = export').toEqual(want);
});

test('M2: a flyer in a look the site does not name still opens in it, saves, and prints in it', async ({ page, request }) => {
  await page.setViewportSize(EDITOR_VIEWPORT);
  const { id } = await sampleCopy(request, 'Pool party', 'band', keep);
  await siteNames(page, [FIRST_LOOK]);
  await page.goto(`/#/flyers/${id}`);
  await expect(page.locator('.stage-canvas [data-flyer]')).toHaveAttribute('data-look', PROOF_LOOK_ID);
  await openSection(page, FIELD.flyer);
  await page.getByLabel(FIELD.title).fill('proof · saved on a site that names hand-drawn alone');
  await expect(status(page)).toHaveText('Unsaved changes');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(status(page)).toHaveText('Saved');
  // Read as it came: this process's schema has one look, the server's two.
  const { flyer } = (await (await request.get(`/api/flyers/${id}`)).json()) as FlyerPayload;
  expect(flyer.data.look).toBe(PROOF_LOOK_ID);
  expect(pixel(await serverPng(request, id, 'story'), 2, 2)).toBe(PROOF_LOOK.palette({ colors: DEFAULT_COLORS }).ground.toUpperCase());
});

/** The colour of a picture's top-left corner, where nothing but the ground is drawn, as #rrggbb. */
async function corner(file: Buffer): Promise<string> {
  const { data } = await sharp(file).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return `#${[0, 1, 2].map((c) => data[c].toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
const near = (a: string, b: string) => [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 6);
const PROOF_GROUND = PROOF_LOOK.palette({ colors: DEFAULT_COLORS }).ground.toUpperCase();
const fileOf = async (d: Download) => readFileSync(await d.path());

test('every way out of a proof flyer is the proof look: the editor’s downloads and copy, a card’s download, the lightbox', async ({ page, request }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(EDITOR_VIEWPORT);
  const { id, title } = await sampleCopy(request, 'Pool party', 'band', keep);
  await page.goto(`/#/flyers/${id}`);
  for (const canvas of CANVAS_IDS) {
    await canvasButton(page, canvas).click();
    for (const format of ['png', 'jpg'] as const) {
      const ground = await corner(await fileOf(await download(page, format)));
      expect(near(ground, PROOF_GROUND), `the editor's ${format} on ${canvas}: ${ground}`).toBe(true);
    }
  }
  await grantClipboard(page);
  await copyImage(page).click();
  await expect(copyImage(page)).toBeEnabled();
  expect(await corner(await clipboardPng(page)), 'the copied picture').toBe(PROOF_GROUND);

  await page.goto('/');
  const card = libraryCard(page, title);
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.card-thumb [data-flyer]')).toHaveAttribute('data-look', PROOF_LOOK_ID);
  const [fromCard] = await Promise.all([page.waitForEvent('download'), pickWay(card, 'png')]);
  expect(await corner(await fileOf(fromCard)), 'a card’s download').toBe(PROOF_GROUND);
  await zoomButton(card).click();
  await expect(lightbox(page).locator('[data-flyer]')).toHaveAttribute('data-look', PROOF_LOOK_ID);
  const [fromLightbox] = await Promise.all([page.waitForEvent('download'), pickWay(lightbox(page), 'png')]);
  expect(await corner(await fileOf(fromLightbox)), 'the lightbox’s download').toBe(PROOF_GROUND);
});
