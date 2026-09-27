import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Locator, type Page, type Response as PwResponse } from '@playwright/test';
import sharp from 'sharp';
import { apiError } from '../../src/shared/errors';
import { flyerFilename } from '../../src/shared/filename';
import { CANVASES, CANVAS_IDS } from '../../src/shared/layout';
import { MAX_PHOTO_EDGE } from '../../src/shared/limits';
import {
  ApiConfigSchema,
  FlyerPayloadSchema,
  FlyerSavedSchema,
  HostelSchema,
  PhotoInfoSchema,
  type ApiConfig,
  type FlyerPayload,
  type PhotoInfo,
} from '../../src/shared/schema';

/* The PHP smoke test (playwright.php.config.ts): one staff session through the
   real editor against the PHP backend — create, upload in every photo mode,
   crop, the big-photo and refused-format paths, reopen, the library (filter,
   duplicate, archive), and PNG + JPG downloads through the in-browser exporter.
   The API is only used to check what the UI saved, and to clean up.
   Every URL is relative to baseURL, so the same spec runs against `php -S` and
   a subfolder deploy (CONTRACT_BASE_URL). Expectations that depend on the host
   (upload limit, long edge) come from api/config, never from constants here. */

type Limits = ApiConfig['limits'];

interface FilePayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

const WRITE = { 'X-Nest-Flyers': '1' };
const POOL_PARTY = join(import.meta.dirname, '../../fixtures/photos/flyer-pool-party.png');
/** Below this the host's upload limit is shared-hosting sized (serve.ts runs with 2M), so the big photo is made to be
    over it and only the editor's shrink-before-upload can get it through. */
const SMALL_LIMIT = 5 * 1024 * 1024;
const COPY = {
  headline1: 'Smoke test is a',
  headline2: 'pool party.',
  when: 'Saturday 19/9 · 15:00',
  where: 'The terrace',
  cost: 'Free · food & drinks',
  extra: 'Everyone welcome',
};

/** Flyers this run created and has not archived yet: archived even when a step fails, so a deploy isn't littered. */
const leftovers = new Set<number>();

test.afterEach(async ({ request }) => {
  for (const id of leftovers) await request.delete(`api/flyers/${id}`, { headers: WRITE }).catch(() => undefined);
  leftovers.clear();
});

/** Matches the editor's own API call by method, path and exact query, whatever folder the app is installed in. */
const apiCall =
  (method: string, path: string, search = '') =>
  (res: PwResponse) => {
    if (res.request().method() !== method) return false;
    const url = new URL(res.url());
    return url.pathname.endsWith(`/api/${path}`) && url.search === search;
  };

const exactly = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

const status = (page: Page) => page.locator('.toolbar .status');
const errorNote = (page: Page) => page.locator('.notes .note-error');
const fileInput = (page: Page) => page.locator('input[type=file]');
/** A library card by its exact title, so "smoke 1" never matches "smoke 1 (copy)". */
const card = (page: Page, title: string) =>
  page.locator('li.card').filter({ has: page.locator('.card-title', { hasText: exactly(title) }) });

async function payload(request: APIRequestContext, id: number): Promise<FlyerPayload> {
  const res = await request.get(`api/flyers/${id}`);
  expect(res.status(), `GET api/flyers/${id}: ${await res.text()}`).toBe(200);
  return FlyerPayloadSchema.parse(await res.json());
}

/** Clicks Save and waits until the PUT is answered and the editor reports the draft as saved. */
async function save(page: Page, id: number) {
  const button = page.getByRole('button', { name: 'Save', exact: true });
  await expect(button).toBeEnabled();
  const [res] = await Promise.all([page.waitForResponse(apiCall('PUT', `flyers/${id}`)), button.click()]);
  expect(res.status(), await res.text()).toBe(200);
  await expect(status(page)).toHaveText('Saved');
}

/** Picks a file the way the "Choose photo" button does, and returns the upload's answer. */
async function choosePhoto(page: Page, file: string | FilePayload): Promise<PwResponse> {
  const [res] = await Promise.all([page.waitForResponse(apiCall('POST', 'photos')), fileInput(page).setInputFiles(file)]);
  return res;
}

/** Drops a file on the preview the way the OS does: a drop event carrying a DataTransfer with the file in it. */
async function dropFile(page: Page, target: Locator, file: FilePayload) {
  const dataTransfer = await page.evaluateHandle(
    ({ name, mimeType, base64 }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], name, { type: mimeType }));
      return dt;
    },
    { name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64') },
  );
  await target.dispatchEvent('dragover', { dataTransfer });
  await target.dispatchEvent('drop', { dataTransfer });
}

/** The stored file is served from its app-relative url and is what the API says it is. */
async function checkStoredPhoto(request: APIRequestContext, photo: PhotoInfo, limits: Limits) {
  expect(Math.max(photo.width, photo.height), 'stored long edge').toBeLessThanOrEqual(limits.maxPhotoEdge);
  const res = await request.get(photo.url);
  expect(res.status(), `GET ${photo.url}`).toBe(200);
  expect(res.headers()['content-type'] ?? '').toMatch(/^image\/(jpeg|png|webp)\b/);
  const meta = await sharp(await res.body()).metadata();
  expect([meta.width, meta.height], 'the served file has the size the API reports').toEqual([photo.width, photo.height]);
}

/** Step 5's photo. On a small limit: noise, which JPEG can't compress, so the file is over the limit although its long
    edge is not over maxPhotoEdge; only the editor's step-down re-encode gets it under. On a roomy limit: an ordinary
    photo past maxPhotoEdge, which the editor scales down before the upload. */
async function bigPhoto(limits: Limits): Promise<FilePayload> {
  if (limits.maxUploadBytes < SMALL_LIMIT) {
    const width = Math.min(MAX_PHOTO_EDGE, limits.maxPhotoEdge);
    const height = Math.round((width * 2) / 3);
    const raw = randomBytes(width * height * 3);
    const buffer = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    return { name: 'noisy-party.jpg', mimeType: 'image/jpeg', buffer };
  }
  const buffer = await sharp(POOL_PARTY).resize(4000, 2500, { fit: 'fill' }).jpeg({ quality: 90 }).toBuffer();
  return { name: 'big-party.jpg', mimeType: 'image/jpeg', buffer };
}

/** Sets the library's hostel filter and waits until the list for exactly that query is on screen. */
async function filterLibrary(page: Page, option: { value: string } | { label: string }, search: string) {
  const [res] = await Promise.all([page.waitForResponse(apiCall('GET', 'flyers', search)), page.getByLabel('Hostel').selectOption(option)]);
  expect(res.status(), `GET api/flyers${search}`).toBe(200);
  await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);
}

test('the editor on the PHP backend: create, photos, crop, reopen, library, download', async ({ page, request }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const limits = await test.step('read the backend and its limits from api/config', async () => {
    const res = await request.get('api/config');
    expect(res.status(), await res.text()).toBe(200);
    const config = ApiConfigSchema.parse(await res.json());
    expect(config.backend, 'this smoke test is for the PHP backend').toBe('php');
    // PHP has no server renderer, so the downloads below go through the in-browser exporter.
    expect(config.exporters).toEqual(['client']);
    test.info().annotations.push({ type: 'limits', description: JSON.stringify({ ...config.limits, server: config.server }) });
    return config.limits;
  });

  const hostels = HostelSchema.array().parse(await (await request.get('api/hostels')).json());
  expect(hostels.length, 'the seed has at least one hostel').toBeGreaterThan(0);
  const hostel = hostels[0];
  const title = `smoke ${Date.now()}`;

  const id = await test.step('1. create a flyer on #/new', async () => {
    await page.goto('./#/new');
    await page.getByLabel('Hostel').selectOption(hostel.slug);
    await page.getByLabel('Library name').fill(title);
    await page.getByLabel('Line 1').fill(COPY.headline1);
    await page.getByLabel('Line 2').fill(COPY.headline2);
    await page.getByLabel('When', { exact: true }).fill(COPY.when);
    await page.getByLabel('Where', { exact: true }).fill(COPY.where);
    await page.getByLabel('Cost', { exact: true }).fill(COPY.cost);
    await page.getByRole('button', { name: '+ Add item' }).click();
    await page.getByLabel('Nice to know 1', { exact: true }).fill(COPY.extra);
    await expect(status(page)).toHaveText('Unsaved changes');

    const [res] = await Promise.all([
      page.waitForResponse(apiCall('POST', 'flyers')),
      page.getByRole('button', { name: 'Save', exact: true }).click(),
    ]);
    expect(res.status(), await res.text()).toBe(201);
    const saved = FlyerSavedSchema.parse(await res.json());
    leftovers.add(saved.id);
    await expect(page).toHaveURL(new RegExp(`#/flyers/${saved.id}$`));
    await expect(status(page)).toHaveText('Saved');

    const p = await payload(request, saved.id);
    expect(p.flyer).toMatchObject({ title, hostel: hostel.slug, template: 'activity', photoId: null });
    expect(p.hostel?.slug).toBe(hostel.slug);
    expect(p.flyer.data.text).toMatchObject({ headline1: COPY.headline1, headline2: COPY.headline2 });
    expect(p.flyer.data.chips.map((c) => [c.key, c.value])).toEqual([
      ['when', COPY.when],
      ['where', COPY.where],
      ['cost', COPY.cost],
    ]);
    expect(p.flyer.data.extras).toEqual([COPY.extra]);
    return saved.id;
  });

  const firstPhoto = await test.step('2. upload a photo in Full bleed', async () => {
    await page.getByRole('button', { name: 'Full bleed', exact: true }).click();
    const res = await choosePhoto(page, POOL_PARTY);
    expect(res.status(), await res.text()).toBe(201);
    const photo = PhotoInfoSchema.parse(await res.json());
    await expect(page.getByRole('button', { name: 'Replace photo' })).toBeVisible();
    await save(page, id);

    const p = await payload(request, id);
    expect(p.flyer.photoId).toBe(photo.id);
    expect(p.flyer.data.photoMode).toBe('bleed');
    expect(p.photo).toEqual(photo);
    await checkStoredPhoto(request, photo, limits);
    return photo;
  });

  await test.step('3. switch the photo mode, saving each one', async () => {
    const modes = [
      ['In a frame', 'band'],
      ['No photo', 'none'],
      ['Full bleed', 'bleed'],
    ] as const;
    for (const [label, mode] of modes) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await save(page, id);
      const p = await payload(request, id);
      expect(p.flyer.data.photoMode, label).toBe(mode);
      // "No photo" hides the photo, it doesn't drop it: switching back must not need a new upload.
      expect(p.flyer.photoId, `${label} keeps the photo`).toBe(firstPhoto.id);
    }
  });

  await test.step('4. crop: the zoom slider and a drag on the preview', async () => {
    const zoomLabel = page.getByText(/^Zoom \d+\.\d\d×$/);
    await expect(zoomLabel).toHaveText('Zoom 1.00×');
    // A real key press: the browser moves the range natively and fires an input event React sees (a scripted
    // value= would be swallowed by React's value tracking). PageUp is a tenth of the range (zoom 4^0.2 ≈ 1.32); arrow
    // steps would each land in the sticky "fills the frame" middle and snap back to 1.
    await page.locator('input[type=range]').press('PageUp');
    await expect(zoomLabel).not.toHaveText('Zoom 1.00×');

    // Up and left by a fifth and a tenth of the frame: far enough from the centre and edges that the snap can't undo it.
    const box = await page.locator('.photo-handle.has-photo').boundingBox();
    if (!box) throw new Error('The photo handle is not on the preview');
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x - box.width * 0.1, from.y - box.height * 0.2, { steps: 8 });
    await page.mouse.up();
    await save(page, id);

    const crop = (await payload(request, id)).flyer.data.photoCrop;
    expect(crop.zoom, 'the slider zoomed in').toBeGreaterThan(1);
    expect([crop.x, crop.y], 'the drag moved the photo').not.toEqual([0.5, 0.5]);
    await expect(zoomLabel).toHaveText(`Zoom ${crop.zoom.toFixed(2)}×`);
  });

  const bigPhotoId = await test.step('5. upload a big photo: the editor makes it fit the host', async () => {
    const big = await bigPhoto(limits);
    if (limits.maxUploadBytes < SMALL_LIMIT) {
      expect(big.buffer.length, 'the noisy photo starts over the upload limit').toBeGreaterThan(limits.maxUploadBytes);
    }
    const res = await choosePhoto(page, big);
    expect(res.status(), await res.text()).toBe(201);
    const photo = PhotoInfoSchema.parse(await res.json());
    await expect(errorNote(page)).toHaveCount(0);
    await save(page, id);

    const p = await payload(request, id);
    expect(p.flyer.photoId).toBe(photo.id);
    await checkStoredPhoto(request, photo, limits);
    return photo.id;
  });

  await test.step('6. refuse a dropped GIF and a big HEIC with the catalogue messages', async () => {
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#f00' } }).gif().toBuffer();
    const [res] = await Promise.all([
      page.waitForResponse(apiCall('POST', 'photos')),
      dropFile(page, page.locator('.photo-handle'), { name: 'party.gif', mimeType: 'image/gif', buffer: gif }),
    ]);
    expect(res.status(), await res.text()).toBe(415);
    await expect(errorNote(page)).toHaveText(apiError('unsupported_format', { format: 'GIF' }).message);

    // Over the limit, so the server would refuse it unread (too_large): the editor has to say "HEIC" itself.
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(limits.maxUploadBytes)]);
    await fileInput(page).setInputFiles({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: heic });
    await expect(errorNote(page)).toHaveText(apiError('heic').message);

    // Neither refusal touched the draft or the saved flyer.
    await expect(status(page)).toHaveText('Saved');
    expect((await payload(request, id)).flyer.photoId).toBe(bigPhotoId);
  });

  await test.step('7. reopen: a reload shows the saved flyer in the form', async () => {
    await page.reload();
    await expect(page.getByLabel('Line 1')).toHaveValue(COPY.headline1);
    await expect(page.getByLabel('Line 2')).toHaveValue(COPY.headline2);
    await expect(page.getByLabel('Library name')).toHaveValue(title);
    await expect(page.getByLabel('Hostel')).toHaveValue(hostel.slug);
    await expect(page.getByLabel('When', { exact: true })).toHaveValue(COPY.when);
    await expect(page.locator('.photo-handle.has-photo')).toBeVisible();
    await expect(status(page)).toHaveText('Saved');
  });

  await test.step('8. library: filter, duplicate, archive the copy', async () => {
    await page.getByRole('link', { name: 'Library', exact: true }).click();
    const mine = card(page, title);
    await expect(mine).toBeVisible();
    await expect(mine.locator('.card-meta')).toContainText(hostel.name);

    await filterLibrary(page, { value: hostel.slug }, `?hostel=${encodeURIComponent(hostel.slug)}`);
    await expect(mine).toBeVisible();
    await filterLibrary(page, { label: 'Chain-wide only' }, '?hostel=none');
    await expect(mine).toHaveCount(0);
    // Back to everything: the library remembers its filter, and the copy is looked for below.
    await filterLibrary(page, { label: 'All flyers' }, '');
    await expect(mine).toBeVisible();

    const original = await payload(request, id);
    const [created] = await Promise.all([
      page.waitForResponse(apiCall('POST', 'flyers')),
      mine.getByRole('button', { name: 'Duplicate', exact: true }).click(),
    ]);
    expect(created.status(), await created.text()).toBe(201);
    const copyId = FlyerSavedSchema.parse(await created.json()).id;
    leftovers.add(copyId);
    expect(copyId).not.toBe(id);
    const copyTitle = `${title} (copy)`;
    await expect(page).toHaveURL(new RegExp(`#/flyers/${copyId}$`));
    await expect(page.getByLabel('Library name')).toHaveValue(copyTitle);
    const copy = await payload(request, copyId);
    expect(copy.flyer).toMatchObject({ title: copyTitle, hostel: hostel.slug, photoId: original.flyer.photoId });
    expect(copy.flyer.data).toEqual(original.flyer.data);

    await page.getByRole('link', { name: 'Library', exact: true }).click();
    const copyCard = card(page, copyTitle);
    await expect(copyCard).toBeVisible();
    let asked = '';
    page.once('dialog', (dialog) => {
      asked = `${dialog.type()}: ${dialog.message()}`;
      void dialog.accept();
    });
    const [archived] = await Promise.all([
      page.waitForResponse(apiCall('DELETE', `flyers/${copyId}`)),
      copyCard.getByRole('button', { name: 'Archive', exact: true }).click(),
    ]);
    // Status only: the library reloads right after, and a navigated-away response has no readable body.
    expect(archived.status()).toBe(204);
    expect(asked).toMatch(/^confirm: /);
    expect(asked).toContain(copyTitle);
    await expect(copyCard).toHaveCount(0);
    await expect(mine).toBeVisible();
    expect((await request.get(`api/flyers/${copyId}`)).status(), 'an archived flyer is gone from the API').toBe(404);
    leftovers.delete(copyId);
  });

  await test.step('9. download PNG and JPG of every canvas through the editor, each at its exact size', async () => {
    await card(page, title).getByRole('link', { name: 'Open', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/flyers/${id}$`));
    await expect(page.getByLabel('Line 1')).toHaveValue(COPY.headline1);

    const downloads = [
      ['Download PNG', 'png', 'png'],
      ['JPG', 'jpg', 'jpeg'],
    ] as const;
    for (const canvas of CANVAS_IDS) {
      const { label: canvasLabel, width, height } = CANVASES[canvas];
      await page.getByRole('button', { name: canvasLabel, exact: true }).click();
      await expect(page.locator('.stage-canvas [data-flyer]')).toHaveAttribute('data-canvas', canvas);
      for (const [label, format, sharpFormat] of downloads) {
        const button = page.getByRole('button', { name: label, exact: true });
        await expect(button).toBeEnabled();
        const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
        const name = flyerFilename(title, id, format, canvas);
        expect(download.suggestedFilename()).toBe(name);
        const file = test.info().outputPath(name);
        await download.saveAs(file);
        const meta = await sharp(file).metadata();
        expect([meta.format, meta.width, meta.height], name).toEqual([sharpFormat, width, height]);
        await expect(page.locator('.notes .note-ok')).toContainText(`${name} (${width} × ${height})`);
        await expect(button).toBeEnabled(); // the editor is idle again
      }
    }
    expect(pageErrors, 'uncaught errors in the editor').toEqual([]);
  });

  await test.step('10. clean up: archive the flyer through the API', async () => {
    const res = await request.delete(`api/flyers/${id}`, { headers: WRITE });
    expect(res.status(), await res.text()).toBe(204);
    leftovers.delete(id);
    expect((await request.get(`api/flyers/${id}`)).status()).toBe(404);
  });
});
