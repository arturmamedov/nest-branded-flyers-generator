import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import { expect, test } from '../browser';
import {
  EDITOR_VIEWPORT,
  apiCall,
  canvasButton,
  clientOnlyEditor,
  clipboardPng,
  clipboardText,
  closeToast,
  copyImage,
  copyOfSample,
  download,
  downloadMenu,
  grantClipboard,
  noClipboard,
  status,
  stopClock,
  toast,
} from '../editor';
import { COPY_FAILED } from '../../src/editor/clipboard';
import { PHOTO_MODE_LABEL } from '../../src/editor/photoModes';
import { OUTCOME_MS } from '../../src/editor/toastFolds';
import { CANVASES, CANVAS_IDS, type CanvasId } from '../../src/shared/layout';
import { FlyerSavedSchema } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';
import { THRESHOLD } from './pixels';

/* One clipboard for the share text and the flyer's picture (src/editor/clipboard.ts; the editor's UX round, Part 3):
   each says "copied" or that it could not, and why. The owner's phone said nothing at "Copy text" (2026-10-07): it
   reached the editor over plain http, where a browser gives a page no clipboard at all. And his ask of the same day:
   "instead of download the photo just copy it to clipboard". */

test.use({ viewport: EDITOR_VIEWPORT });

const saved: number[] = [];
const keep = (id: number) => saved.push(id);
test.afterEach(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

const CAPTION = 'TODAY we have a sunset plan! 🌅\n🕖 19:00 h';

/** A clipboard that says no to text, as a browser does with no tap close enough behind the call. */
const refusingText = (page: Page) =>
  page.addInitScript(() => {
    Clipboard.prototype.writeText = () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'));
  });

/** A clipboard that says no to a picture. */
const refusingPicture = (page: Page) =>
  page.addInitScript(() => {
    Clipboard.prototype.write = () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'));
  });

const panelCopy = (page: Page) => page.getByRole('button', { name: 'Copy text', exact: true });
const panelStatus = (page: Page) => page.locator('.share-copy').getByRole('status');
const pill = (page: Page) => page.getByRole('button', { name: 'Copy the share text', exact: true });
/** The step a toast offers after a picture is copied. */
const copyTheCaption = (page: Page) => toast(page, 'ok').getByRole('button', { name: 'Copy the caption', exact: true });
const imageCopied = (canvas: CanvasId) => `Image copied (${CANVASES[canvas].width} × ${CANVASES[canvas].height}).`;

/** Everything thrown on the page from here on, an unheard promise among it. */
function thrown(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** A new flyer with nothing missing (no photo band), named, and with a caption or none. Its first save is the
    caller's action. */
async function newFlyer(page: Page, caption = '') {
  await page.goto('/#/new');
  await page.getByRole('button', { name: PHOTO_MODE_LABEL.none, exact: true }).click();
  await page.getByLabel('Library name').fill(`clipboard spec ${Date.now()}`);
  if (caption) await page.getByLabel('Caption').fill(caption);
  await expect(downloadMenu(page)).toBeEnabled();
}

/** Presses Copy image on a new flyer: the copy saves it first, and the flyer is archived after the test. */
async function copyNew(page: Page): Promise<number> {
  const [created] = await Promise.all([page.waitForResponse(apiCall('POST', 'flyers')), copyImage(page).click()]);
  const { id } = FlyerSavedSchema.parse(await created.json());
  keep(id);
  return id;
}

/** A picture's pixels, whatever wrote the file: a browser writes a copied PNG anew, so two files of one picture are
    never the same bytes. */
const pixels = (png: Buffer) => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

for (const [why, arrange] of [
  ['unavailable', noClipboard],
  ['refused', refusingText],
] as const) {
  test(`“Copy text” that could not copy says so, and why (${why}): under the caption, and in a toast for the pill`, async ({ page }) => {
    await arrange(page);
    const errors = thrown(page);
    await page.goto('/#/new');
    await page.getByLabel('Caption').fill(CAPTION);

    await panelCopy(page).click();
    await expect(panelStatus(page)).toHaveText(COPY_FAILED.text[why]);

    // The pill has room for one word: its reason is a toast, which stays until it is closed.
    await pill(page).click();
    await expect(pill(page)).toHaveText('Couldn’t copy');
    await expect(toast(page, 'error')).toHaveText(COPY_FAILED.text[why]);
    expect(errors, 'nothing thrown on the page').toEqual([]);
  });
}

test('Copy image puts the canvas on screen on the clipboard at its exact size: pixel for pixel the picture the server made for it', async ({ page, request }) => {
  test.setTimeout(120_000);
  await grantClipboard(page);
  const id = await copyOfSample(request, 'Pool party', 'clipboard spec');
  keep(id);
  await page.goto(`/#/flyers/${id}`);
  await expect(status(page)).toHaveText('Saved');

  for (const canvas of CANVAS_IDS) {
    const { width, height } = CANVASES[canvas];
    await canvasButton(page, canvas).click();
    await expect(page.locator('.stage-canvas [data-flyer]')).toHaveAttribute('data-canvas', canvas);
    // The same export a download asks for (POST api/render), with the canvas on screen.
    const [render] = await Promise.all([page.waitForResponse(apiCall('POST', `render/${id}`)), copyImage(page).click()]);
    expect(JSON.parse(render.request().postData()!)).toEqual({ format: 'png', canvas });
    await expect(toast(page, 'ok')).toContainText(imageCopied(canvas));

    // Held to the picture the server made for that copy, asked for again from its cache. Not to a download made
    // afterwards: every way out saves first, a save empties that cache, and a second render is a second raster,
    // which can differ by a few pixels (seen once in three runs while this test was written).
    const made = await request.post(`/api/render/${id}`, { headers: WRITE_HEADERS, data: { format: 'png', canvas } });
    expect(made.headers()['x-render-cache'], 'the copy’s own picture, not a second render').toBe('hit');
    const [copied, exported] = [await pixels(await clipboardPng(page)), await pixels(await made.body())];
    expect([copied.info.width, copied.info.height], `${canvas}: the copied picture’s size`).toEqual([width, height]);
    expect(copied.data.equals(exported.data), `${canvas}: what is on the clipboard is what was made`).toBe(true);
  }
});

test('with the browser’s own exporter (the PHP backend’s), the copied picture is the canvas at its exact size too', async ({ browser, baseURL, request }) => {
  test.setTimeout(120_000);
  const id = await copyOfSample(request, 'Pool party', 'clipboard spec client');
  keep(id);
  const { context, page, overridden } = await clientOnlyEditor(browser, baseURL);
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`./#/flyers/${id}`);
    await expect(status(page)).toHaveText('Saved');
    for (const canvas of CANVAS_IDS) {
      const { width, height } = CANVASES[canvas];
      await canvasButton(page, canvas).click();
      await expect(page.locator('.stage-canvas [data-flyer]')).toHaveAttribute('data-canvas', canvas);
      await copyImage(page).click();
      await expect(toast(page, 'ok')).toContainText(imageCopied(canvas));
      const copied = await pixels(await clipboardPng(page));
      expect([copied.info.width, copied.info.height], `${canvas}: the copied picture’s size`).toEqual([width, height]);

      // The download is a second capture, and a second capture is a second raster: held to the limit the owner
      // agreed for an export (fidelity.spec.ts), not to the last pixel.
      const downloaded = await pixels(readFileSync(await (await download(page, 'png')).path()));
      const differing = pixelmatch(copied.data, downloaded.data, undefined, width, height, { threshold: 0.1 });
      expect((100 * differing) / (width * height), `${canvas}: % of pixels that differ from the download`).toBeLessThanOrEqual(THRESHOLD);
    }
    expect(overridden(), 'the editor read the client-only config').toBe(true);
  } finally {
    await context.close();
  }
});

test('the clipboard is asked inside the tap, before the flyer is saved or its picture made; the copy saves first, as a download does', async ({ page }) => {
  // A browser lets a page write to the clipboard only close to the tap that asked (the spike, 2026-10-12: Chrome
  // refuses a write started 6 s after it; Safari one started after anything was awaited). `window.event` is the
  // click while its handler runs, and nothing once the handler has waited for anything.
  await page.addInitScript(() => {
    const write = Clipboard.prototype.write;
    const asked: unknown[] = [];
    Object.assign(window, { asked });
    Clipboard.prototype.write = function (items) {
      asked.push({ during: window.event?.type ?? null, tapCounts: navigator.userActivation.isActive });
      return write.call(this, items);
    };
  });
  await grantClipboard(page);
  await newFlyer(page);
  await expect(status(page)).toHaveText('Unsaved changes');

  const id = await copyNew(page);
  await expect(toast(page, 'ok')).toHaveText(imageCopied('whatsapp'));
  expect(await page.evaluate(() => (window as unknown as { asked: unknown[] }).asked)).toEqual([{ during: 'click', tapCounts: true }]);
  // It saved first: a new flyer has its URL, nothing is unsaved, and the picture is of the saved flyer.
  await expect(page).toHaveURL(new RegExp(`#/flyers/${id}$`));
  await expect(status(page)).toHaveText('Saved');
  const copied = await sharp(await clipboardPng(page)).metadata();
  expect([copied.width, copied.height]).toEqual([CANVASES.whatsapp.width, CANVASES.whatsapp.height]);
});

test('after a picture is copied the toast offers the caption as the next step, and stays until the step is taken', async ({ page }) => {
  await grantClipboard(page);
  await newFlyer(page, CAPTION);
  await stopClock(page);
  await copyNew(page);
  const done = toast(page, 'ok');
  await expect(done).toContainText(imageCopied('whatsapp'));
  await expect(copyTheCaption(page)).toBeVisible();

  // Someone pastes the picture elsewhere first, and comes back for the caption: a plain success would be long gone.
  await page.mouse.move(5, 5);
  await page.clock.fastForward(OUTCOME_MS * 3);
  await expect(copyTheCaption(page), 'the step waits').toBeVisible();

  await copyTheCaption(page).click();
  await expect(done).toHaveText('Caption copied.');
  expect(await clipboardText(page)).toBe(CAPTION);
  await expect(copyTheCaption(page), 'the step is taken once').toHaveCount(0);

  // Its answer is a plain success: it waits under the pointer that pressed the step, then leaves by itself.
  await page.clock.fastForward(OUTCOME_MS * 2);
  await expect(done, 'the pointer is still on it').toBeVisible();
  await page.mouse.move(5, 5);
  await page.clock.fastForward(OUTCOME_MS + 100);
  await expect(done).toHaveCount(0);
});

test('the step taken from the keyboard hands the focus on, and its answer leaves once the focus has moved away', async ({ page }) => {
  await grantClipboard(page);
  await newFlyer(page, CAPTION);
  await stopClock(page);
  await copyNew(page);
  await expect(copyTheCaption(page)).toBeVisible();

  await copyTheCaption(page).focus();
  await page.keyboard.press('Enter');
  const done = toast(page, 'ok');
  await expect(done).toHaveText('Caption copied.');
  // The pressed button is gone, and the focus with it would fall to the page.
  await expect(closeToast(done)).toBeFocused();
  await page.clock.fastForward(OUTCOME_MS * 2);
  await expect(done, 'it waits while the focus is on it').toBeVisible();
  await page.getByLabel('Line 1').focus();
  await page.clock.fastForward(OUTCOME_MS + 100);
  await expect(done, 'and leaves once the focus has moved on').toHaveCount(0);
});

test('a flyer with no caption offers no step, and its toast leaves by itself; a caption emptied takes the step away', async ({ page }) => {
  await grantClipboard(page);
  await newFlyer(page);
  await stopClock(page);
  await copyNew(page);
  const done = toast(page, 'ok');
  await expect(done).toHaveText(imageCopied('whatsapp'));
  await expect(copyTheCaption(page)).toHaveCount(0);
  await page.mouse.move(5, 5);
  await page.clock.fastForward(OUTCOME_MS + 100);
  await expect(done).toHaveCount(0);

  // With a caption the step is there; emptied, there is nothing left to copy, and the toast is a plain success.
  await page.getByLabel('Caption').fill(CAPTION);
  await copyImage(page).click();
  await expect(copyTheCaption(page)).toBeVisible();
  await page.getByLabel('Caption').fill('');
  await expect(copyTheCaption(page)).toHaveCount(0);
  await expect(done).toHaveText(imageCopied('whatsapp'));
  await page.clock.fastForward(OUTCOME_MS + 100);
  await expect(done).toHaveCount(0);
});

test('a refused copy says so, and why, and the flyer is saved all the same', async ({ page }) => {
  await refusingPicture(page);
  const errors = thrown(page);
  await newFlyer(page, CAPTION);
  await copyNew(page);
  await expect(toast(page, 'error')).toHaveText(COPY_FAILED.image.refused);
  await expect(toast(page, 'ok')).toHaveCount(0);
  await expect(status(page)).toHaveText('Saved');
  await expect(copyImage(page), 'the editor is idle again').toBeEnabled();
  expect(errors, 'nothing thrown on the page').toEqual([]);
});

test('a picture that could not be made says the render’s own reason, not the clipboard’s', async ({ page }) => {
  await grantClipboard(page);
  const errors = thrown(page);
  await page.route(
    (url) => /\/api\/render\/\d+$/.test(url.pathname),
    (route) => route.fulfill({ status: 500, json: { error: { key: 'render_failed', message: 'The renderer is down.' } } }),
  );
  await newFlyer(page);
  await copyNew(page);
  await expect(toast(page, 'error')).toHaveText('The renderer is down.');
  await expect(copyImage(page), 'the editor is idle again').toBeEnabled();
  expect(errors, 'the picture’s failure is heard once, by the editor').toEqual([]);
});

test('with no clipboard there is no “Copy image” at all: Download stands alone, and is the bar’s main button', async ({ page }) => {
  await noClipboard(page);
  await newFlyer(page);
  await expect(page.locator('.toolbar').getByRole('button', { name: /copy/i })).toHaveCount(0);
  await expect(downloadMenu(page)).toHaveClass(/btn-accent/);
});

test('Copy image is greyed with Download while a frame has no photo', async ({ page }) => {
  await page.goto('/#/new');
  await expect(downloadMenu(page)).toBeDisabled();
  await expect(copyImage(page)).toBeDisabled();
});
