import type { Page } from '@playwright/test';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, apiCall, backToLibrary, copyImage, download, downloadMenu, exportEntry, grantClipboard, hold, pickExport, status, stopClock, toast } from '../editor';
import { entryText } from '../../src/editor/exportActions';
import { PHOTO_MODE_LABEL } from '../../src/editor/photoModes';
import { OUTCOME_MS } from '../../src/editor/toastFolds';
import { flyerFilename } from '../../src/shared/filename';
import { CANVASES } from '../../src/shared/layout';
import { FlyerSavedSchema } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* "Share…": the system's share sheet with the flyer's picture and its caption (src/editor/shareSheet.ts; the editor's
   UX round, Part 3; the owner's "Yes, with copy image" to a share entry for phones, 2026-10-07). The test browser has
   no sheet, so a stand-in takes its place: it notes what it was handed and answers as the test tells it. What a real
   sheet and the apps behind it do is the owner's to try on a phone. */

const saved: number[] = [];
const keep = (id: number) => saved.push(id);
test.afterEach(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

const PHONE = { width: 390, height: 844 };
const CAPTION = 'TODAY we have a sunset plan! 🌅';
const SHARED = 'Shared.';
const SHARED_WITH_CAPTION = 'Shared. The caption is on the clipboard too: paste it if the app left it out.';

type Answer = 'shared' | 'closed' | 'blocked' | 'held';

interface Handed {
  name: string;
  type: string;
  files: number;
  width: number;
  height: number;
  text: string | null;
  /** The clipboard's text at the moment the sheet was asked. */
  clipboard: string;
}

/** A device with a share sheet, before the page loads. Each call of the sheet takes the next answer: `shared`,
    `closed` (the staff member closed it), `blocked` (no tap close enough behind the call), or `held`, which stays
    open until the page's `sheetAnswers()` is called. */
const withSheet = (page: Page, ...answers: Answer[]) =>
  page.addInitScript((answers: Answer[]) => {
    const handed: unknown[] = [];
    let release = () => {};
    Object.assign(window, { handed, sheetAnswers: () => release() });
    Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, value: (data?: ShareData) => !!data?.files?.length });
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      async value(data: ShareData) {
        const [file] = data.files ?? [];
        const picture = await createImageBitmap(file);
        const clipboard = await navigator.clipboard.readText().catch(() => 'unreadable');
        handed.push({ name: file.name, type: file.type, files: data.files?.length, width: picture.width, height: picture.height, text: data.text ?? null, clipboard });
        const answer = answers.shift() ?? 'shared';
        if (answer === 'closed') throw new DOMException('Share canceled', 'AbortError');
        if (answer === 'blocked') throw new DOMException('Must be handling a user gesture to perform a share request.', 'NotAllowedError');
        if (answer === 'held') await new Promise<void>((resolve) => (release = resolve));
      },
    });
  }, answers);

const handed = (page: Page) => page.evaluate(() => (window as unknown as { handed: Handed[] }).handed);
const share = (page: Page) => page.locator('.toolbar').getByRole('button', { name: 'Share…', exact: true });
const shareNow = (page: Page) => toast(page, 'ok').getByRole('button', { name: 'Share now', exact: true });
/** The flyer's own actions, in the order the bar shows them. */
const actions = (page: Page) => page.locator('.toolbar-actions > button, .toolbar-actions > .menu > button');

/** A new flyer with nothing missing (no photo band), named, and with a caption or none. Its first save is the
    caller's action; the name it is saved under comes back. */
async function newFlyer(page: Page, caption = ''): Promise<string> {
  const title = `share spec ${Date.now()}`;
  await page.goto('/#/new');
  await page.getByRole('button', { name: PHOTO_MODE_LABEL.none, exact: true }).click();
  await page.getByLabel('Library name').fill(title);
  if (caption) await page.getByLabel('Caption').fill(caption);
  await expect(downloadMenu(page)).toBeEnabled();
  return title;
}

/** Presses Share… on a new flyer: the share saves it first, and the flyer is archived after the test. */
async function shareNew(page: Page): Promise<number> {
  const [created] = await Promise.all([page.waitForResponse(apiCall('POST', 'flyers')), share(page).click()]);
  const { id } = FlyerSavedSchema.parse(await created.json());
  keep(id);
  return id;
}

test.describe('on a phone: a finger as the main pointer', () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test('Share… is the first button, the bar’s main one, and Copy image is behind Download with the two formats', async ({ page }) => {
    await withSheet(page);
    await newFlyer(page);
    await expect(actions(page)).toHaveText(['Save', 'Share…', 'Download']);
    await expect(share(page)).toHaveClass(/btn-accent/);
    await downloadMenu(page).click();
    await expect(page.locator('.toolbar .menu').getByRole('menuitem')).toHaveText([entryText('png'), entryText('jpg'), entryText('copy')]);
  });

  test('Share… hands the sheet the picture of the canvas on screen and the caption, with the caption already on the clipboard', async ({ page }) => {
    // The caption's copy, like the picture's, starts inside the tap (clipboard.spec.ts says why).
    await page.addInitScript(() => {
      const writeText = Clipboard.prototype.writeText;
      const asked: unknown[] = [];
      Object.assign(window, { asked });
      Clipboard.prototype.writeText = function (text) {
        asked.push(window.event?.type ?? null);
        return writeText.call(this, text);
      };
    });
    await withSheet(page);
    await grantClipboard(page);
    const title = await newFlyer(page, CAPTION);

    const id = await shareNew(page);
    await expect(toast(page, 'ok')).toHaveText(SHARED_WITH_CAPTION);
    const { width, height } = CANVASES.whatsapp;
    expect(await handed(page)).toEqual([{ name: flyerFilename(title, id, 'png', 'whatsapp'), type: 'image/png', files: 1, width, height, text: CAPTION, clipboard: CAPTION }]);
    expect(await page.evaluate(() => (window as unknown as { asked: unknown[] }).asked), 'the caption was copied while the tap was being handled').toEqual(['click']);
    // It saved first, as a download does: the new flyer has its URL and nothing is unsaved.
    await expect(page).toHaveURL(new RegExp(`#/flyers/${id}$`));
    await expect(status(page)).toHaveText('Saved');
    await expect(share(page), 'the editor is idle again').toBeEnabled();
  });

  test('a flyer with no caption: the sheet gets the picture alone, and the toast says only that it was shared', async ({ page }) => {
    await withSheet(page);
    await grantClipboard(page);
    await newFlyer(page);
    await shareNew(page);
    await expect(toast(page, 'ok')).toHaveText(SHARED);
    expect((await handed(page)).map((h) => [h.files, h.text])).toEqual([[1, null]]);
  });

  test('a sheet closed without sharing says nothing, and the editor is idle again', async ({ page }) => {
    await withSheet(page, 'closed');
    await grantClipboard(page);
    await newFlyer(page, CAPTION);
    await shareNew(page);
    await expect.poll(async () => (await handed(page)).length).toBe(1);
    await expect(share(page)).toBeEnabled();
    await expect(page.locator('.toasts .toast-ok, .toasts .toast-error')).toHaveCount(0);
  });

  test('a picture that took longer than its tap allows: the toast stays and offers “Share now”, which opens the sheet with the same picture', async ({ page }) => {
    await withSheet(page, 'blocked', 'shared');
    await grantClipboard(page);
    await newFlyer(page, CAPTION);
    const renders: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/api\/render\/\d+$/.test(new URL(r.url()).pathname)) renders.push(r.url());
    });
    await stopClock(page);
    await shareNew(page);

    const ready = toast(page, 'ok');
    await expect(ready).toContainText('The picture is ready.');
    await expect(shareNow(page)).toBeVisible();
    // The picture is made and waits for its second tap: it must not leave with a toast's six seconds.
    await page.clock.fastForward(OUTCOME_MS * 3);
    await expect(shareNow(page)).toBeVisible();

    await shareNow(page).click();
    await expect(ready).toHaveText(SHARED_WITH_CAPTION);
    const sheets = await handed(page);
    expect(sheets).toHaveLength(2);
    expect(sheets[1], 'the same picture and caption, handed over again').toEqual(sheets[0]);
    expect(renders, 'the picture was made once').toHaveLength(1);
  });

  test('“Share now” after the flyer changed makes the picture again, of the flyer as it is', async ({ page }) => {
    await withSheet(page, 'blocked', 'shared');
    await grantClipboard(page);
    await newFlyer(page, CAPTION);
    const id = await shareNew(page);
    await expect(shareNow(page)).toBeVisible();

    await page.getByLabel('Caption').fill(`${CAPTION} Bring a towel.`);
    await expect(status(page)).toHaveText('Unsaved changes');
    const [put, render] = await Promise.all([page.waitForResponse(apiCall('PUT', `flyers/${id}`)), page.waitForResponse(apiCall('POST', `render/${id}`)), shareNow(page).click()]);
    expect([put.status(), render.status()]).toEqual([200, 200]);
    await expect(toast(page, 'ok')).toHaveText(SHARED_WITH_CAPTION);
    expect((await handed(page)).map((h) => h.text)).toEqual([CAPTION, `${CAPTION} Bring a towel.`]);
    await expect(status(page)).toHaveText('Saved');
  });

  test('a second tap the device refuses too is an error, with what to do instead', async ({ page }) => {
    await withSheet(page, 'blocked', 'blocked');
    await grantClipboard(page);
    await newFlyer(page);
    await shareNew(page);
    await shareNow(page).click();
    await expect(toast(page, 'error')).toHaveText('Couldn’t open the share sheet. Download the picture instead.');
    await expect(toast(page, 'ok')).toHaveCount(0);
  });

  test('the editor does not wait for the sheet, and its answer says nothing once another action has started', async ({ page }) => {
    await withSheet(page, 'held');
    await grantClipboard(page);
    await newFlyer(page, CAPTION);
    await shareNew(page);
    await expect.poll(async () => (await handed(page)).length).toBe(1);
    // The sheet is still open, and the editor is not greyed behind it.
    await expect(share(page)).toBeEnabled();
    await expect(downloadMenu(page)).toBeEnabled();

    const file = await download(page, 'png');
    await expect(toast(page, 'ok')).toContainText(`Downloaded ${file.suggestedFilename()}`);
    await page.evaluate(() => (window as unknown as { sheetAnswers: () => void }).sheetAnswers());
    // The sheet's promise is answered: a "Shared." would have taken the download's place by now.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(toast(page, 'ok')).toContainText(`Downloaded ${file.suggestedFilename()}`);
  });

  test('no sheet opens over another page: the staff member left while the picture was being made', async ({ page }) => {
    await withSheet(page);
    await grantClipboard(page);
    await newFlyer(page, CAPTION);
    const release = await hold(page, (url) => /\/api\/render\/\d+$/.test(url.pathname), 'POST');
    await shareNew(page);
    await expect(status(page)).toHaveText('Saved');
    // Saved, so nothing asks before leaving.
    await backToLibrary(page).click();
    await expect(page.getByRole('heading', { name: 'Flyer library' })).toBeVisible();
    const rendered = page.waitForResponse((res) => /\/api\/render\/\d+$/.test(new URL(res.url()).pathname));
    release();
    await (await rendered).finished();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await handed(page), 'the sheet was never asked').toEqual([]);
  });

  test('Share… is greyed with Download while a frame has no photo', async ({ page }) => {
    await withSheet(page);
    await page.goto('/#/new');
    await expect(downloadMenu(page)).toBeDisabled();
    await expect(share(page)).toBeDisabled();
  });

  test('a phone whose browser has no share sheet gets Copy image as its first button', async ({ page }) => {
    await newFlyer(page);
    await expect(actions(page)).toHaveText(['Save', 'Copy image', 'Download']);
    await downloadMenu(page).click();
    await expect(page.locator('.toolbar .menu').getByRole('menuitem')).toHaveText([entryText('png'), entryText('jpg')]);
  });
});

test.describe('on a desktop whose browser can share a file (Chrome and Edge on Windows can)', () => {
  test.use({ viewport: EDITOR_VIEWPORT });

  test('Copy image stays the first button, and Share… is the menu’s last entry: picked there, it opens the sheet', async ({ page }) => {
    await withSheet(page);
    await grantClipboard(page);
    const title = await newFlyer(page, CAPTION);
    await expect(actions(page)).toHaveText(['Save', 'Copy image', 'Download']);
    await expect(copyImage(page)).toHaveClass(/btn-accent/);
    await downloadMenu(page).click();
    await expect(page.locator('.toolbar .menu').getByRole('menuitem')).toHaveText([entryText('png'), entryText('jpg'), entryText('share')]);

    const [created] = await Promise.all([page.waitForResponse(apiCall('POST', 'flyers')), exportEntry(page, 'share').click()]);
    const { id } = FlyerSavedSchema.parse(await created.json());
    keep(id);
    await expect(toast(page, 'ok')).toHaveText(SHARED_WITH_CAPTION);
    expect((await handed(page)).map((h) => [h.name, h.text])).toEqual([[flyerFilename(title, id, 'png', 'whatsapp'), CAPTION]]);
  });

  test('while the picture for the sheet is made, Download reads what its entry is doing', async ({ page }) => {
    await withSheet(page);
    await grantClipboard(page);
    await newFlyer(page);
    const release = await hold(page, (url) => /\/api\/render\/\d+$/.test(url.pathname), 'POST');
    const created = page.waitForResponse(apiCall('POST', 'flyers'));
    await pickExport(page, 'share');
    keep(FlyerSavedSchema.parse(await (await created).json()).id);
    await expect(downloadMenu(page)).toHaveText('Preparing…');
    await expect(downloadMenu(page)).toBeDisabled();
    release();
    await expect(toast(page, 'ok')).toHaveText(SHARED);
    await expect(downloadMenu(page)).toHaveText('Download');
  });
});
