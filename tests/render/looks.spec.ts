import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRequestContext, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, canvasButton, clientOnlyEditor, download, exportFit, libraryCard, openSection, status } from '../editor';
import { FIELD } from '../../src/editor/fields';
import { checkDrawn, drawnSamples, samples } from './drawnChecks';
import { drawPayload } from './drawn';
import { compare, failures, regionsOf } from './pixels';
import { filesNaming } from '../../scripts/build-php';
import { APP_ROOT } from '../../server/paths';
import { PROOF_LOOK_ID } from '../proof/id';
import { PROOF_LOOK } from '../proof/look';
import { CANVASES, CANVAS_IDS, DEFAULT_CANVAS, type Body, type CanvasId } from '../../src/shared/layout';
import { FIRST_LOOK } from '../../src/shared/looks';
import { DEFAULT_COLORS } from '../../src/shared/looks/handDrawn';
import type { FlyerPayload, FlyerSaved } from '../../src/shared/schema';
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
test.afterAll(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

/** The payload as the proof look draws it. */
const inProof = (payload: FlyerPayload): FlyerPayload => ({ ...payload, flyer: { ...payload.flyer, data: { ...payload.flyer.data, look: PROOF_LOOK_ID } } });

/** A seeded sample saved again in the proof look, under a title of its own, in a photo mode (or its rows). */
async function proofCopy(request: APIRequestContext, sample: string, body: Body): Promise<{ id: number; title: string }> {
  const all = await samples(request);
  const source = all.find((p) => p.flyer.title === sample)!;
  const photo = body === 'none' || body === 'week' ? null : (source.photo ?? all.find((p) => p.photo)!.photo)!.id;
  const data = { ...source.flyer.data, look: PROOF_LOOK_ID, ...(body === 'week' ? {} : { photoMode: body }) };
  const title = `proof · ${sample} / ${body}`;
  const res = await request.post('/api/flyers', { headers: WRITE_HEADERS, data: { title, hostel: source.flyer.hostel, template: data.template, data, photoId: photo } });
  expect(res.status(), await res.text()).toBe(201);
  // Read as it came: this process's schema has one look, the server's two.
  const { id } = (await res.json()) as FlyerSaved;
  saved.push(id);
  return { id, title };
}

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
    const { id } = await proofCopy(request, sample, body);
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
  const { id, title } = await proofCopy(request, 'Long copy · stress test', 'band');
  const want = await exportFit(page, id, DEFAULT_CANVAS);
  await page.goto('/');
  const card = libraryCard(page, title);
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.card-thumb.card-thumb-ready')).toBeVisible();
  const flyer = card.locator('.card-thumb [data-flyer]');
  await expect(flyer).toHaveAttribute('data-look', PROOF_LOOK_ID);
  expect(await flyer.evaluate((root) => [...root.querySelectorAll<HTMLElement>('[data-fit]')].map((el) => el.style.fontSize)), 'card = export').toEqual(want);
});

/** api/config, answered as a site that names only these looks. */
async function siteNames(page: Page, looks: string[]) {
  await page.route('**/api/config', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), looks } });
  });
}

test('M2: a flyer in a look the site does not name still opens in it, saves, and prints in it', async ({ page, request }) => {
  await page.setViewportSize(EDITOR_VIEWPORT);
  const { id } = await proofCopy(request, 'Pool party', 'band');
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
