import type { APIRequestContext, Page } from '@playwright/test';
import sharp from 'sharp';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, apiRoute, clientOnlyEditor, clipboardPng, clipboardText, copyOfSample, grantClipboard, hold, libraryCard as card, lightbox, moreMenu, noClipboard, pickWay, stopClock, toast, waysMenu, zoomButton } from '../editor';
import { COPY_FAILED } from '../../src/editor/clipboard';
import { EXPORT_ACTION, NO_PHOTO } from '../../src/editor/exportActions';
import { CANVAS_PREF } from '../../src/editor/prefs';
import { OUTCOME_MS } from '../../src/editor/toastFolds';
import { newFlyerData } from '../../src/shared/defaults';
import { FlyerSavedSchema } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* The editor's ways out on every flyer of the library (the library's views, 2026-10-13; the owner's ask: "the most
   important buttons on the library view itself: Copy image, Copy text, Share, Download", so staff post a flyer
   without opening it). They are the editor's own (src/editor/pictureActions.ts), with the editor's words and toasts:
   clipboard.spec.ts, share.spec.ts and toolbar.spec.ts hold the rules; this holds that the library has them. */

test.use({ viewport: EDITOR_VIEWPORT });

const saved: number[] = [];
test.afterEach(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

const CAPTION = 'TODAY we have a sunset plan! 🌅\n🕖 19:00 h';

/** A flyer of this spec's own, saved through the API: the newest, so the library's first card. With no photo frame
    unless `frame`, which leaves the default frame empty. */
async function save(request: APIRequestContext, { caption = '', frame = false }: { caption?: string; frame?: boolean } = {}) {
  const title = `library actions ${Date.now()}-${saved.length}`;
  const data = { ...newFlyerData(), ...(frame ? {} : { photoMode: 'none' }), share: caption };
  const res = await request.post('/api/flyers', { headers: WRITE_HEADERS, data: { title, hostel: null, template: 'activity', data, photoId: null } });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = FlyerSavedSchema.parse(await res.json());
  saved.push(id);
  return { id, title };
}

const copyText = (page: Page, title: string) => card(page, title).getByRole('button', { name: 'Copy text', exact: true });
const copyImage = (page: Page, title: string) => card(page, title).getByRole('button', { name: EXPORT_ACTION.copy.label, exact: true });

/** A device with a share sheet, which notes what it is handed and says it shared. */
const withSheet = (page: Page) =>
  page.addInitScript(() => {
    const handed: unknown[] = [];
    Object.assign(window, { handed });
    Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, value: (data?: ShareData) => !!data?.files?.length });
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      async value(data: ShareData) {
        const [file] = data.files ?? [];
        const picture = await createImageBitmap(file);
        handed.push({ name: file.name, type: file.type, width: picture.width, height: picture.height, text: data.text ?? null });
      },
    });
  });

test('a card offers the editor’s ways out: Copy image first on a desktop, Copy text, Download with PNG and JPG, and More', async ({ page, request }) => {
  const { title } = await save(request, { caption: CAPTION });
  await page.goto('/');
  const c = card(page, title);
  await expect(waysMenu(c)).toBeEnabled();
  expect(await c.locator('.card-actions').getByRole('button').evaluateAll((buttons) => buttons.filter((b) => !b.closest('[role=menu]')).map((b) => b.textContent))).toEqual(['Copy image', 'Copy text', 'Download', 'More']);
  await waysMenu(c).click();
  await expect(c.locator('.card-actions > .menu').first().getByRole('menuitem')).toHaveText(['PNG · sharpest', 'JPG · smaller file']);
  await page.keyboard.press('Escape');
  await moreMenu(c).click();
  await expect(c.locator('.card-actions > .menu').last().getByRole('menuitem')).toHaveText(['Open', 'Duplicate', 'Archive']);
  // "Open" opens the flyer, as the card's own click does.
  await c.getByRole('menuitem', { name: 'Open', exact: true }).click();
  await expect(page).toHaveURL(/#\/flyers\/\d+$/);
});

test('Copy image puts the flyer on the clipboard at its canvas’s size, asked inside the tap, without opening it; then the caption is one more press', async ({ page, request }) => {
  // The write must start in the click itself (clipboard.ts says why): noted here by the event in hand at the call.
  await page.addInitScript(() => {
    const write = Clipboard.prototype.write;
    const asked: unknown[] = [];
    Object.assign(window, { asked });
    Clipboard.prototype.write = function (items) {
      asked.push(window.event?.type ?? null);
      return write.call(this, items);
    };
  });
  await grantClipboard(page);
  const { id, title } = await save(request, { caption: CAPTION });
  const puts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT') puts.push(r.url());
  });
  await page.goto('/');
  await expect(copyImage(page, title)).toBeEnabled();
  // The picture is kept back: the clipboard is asked while it is still on its way.
  const release = await hold(page, apiRoute(`render/${id}`), 'POST');
  await copyImage(page, title).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { asked: unknown[] }).asked)).toEqual(['click']);
  // One action at a time: every card's ways out wait, and this one says what it is doing.
  await expect(card(page, title).getByRole('button', { name: EXPORT_ACTION.copy.busy, exact: true })).toBeDisabled();
  const other = page.locator('li.card').nth(1);
  await expect(waysMenu(other)).toBeDisabled();
  await expect(moreMenu(other)).toBeDisabled();
  await expect(zoomButton(other), 'no lightbox opens over an action in hand').toBeDisabled();
  release();

  await expect(toast(page, 'ok')).toContainText('Image copied (1080 × 1440).');
  await expect(page, 'still the library').not.toHaveURL(/#\/flyers\//);
  const png = await sharp(await clipboardPng(page)).metadata();
  expect([png.format, png.width, png.height]).toEqual(['png', 1080, 1440]);
  expect(puts, 'a library flyer is saved already: nothing is written').toEqual([]);
  // The button that was greyed has the focus back.
  await expect(copyImage(page, title)).toBeFocused();

  // The toast's step: the caption, for a second paste.
  await toast(page, 'ok').getByRole('button', { name: 'Copy the caption', exact: true }).click();
  await expect(toast(page, 'ok')).toHaveText('Caption copied.');
  expect(await clipboardText(page)).toBe(CAPTION);
});

test('Copy text copies the caption at the tap; a flyer with none has the button greyed', async ({ page, request }) => {
  // In the click itself, as the picture's write (clipboard.ts says why).
  await page.addInitScript(() => {
    const writeText = Clipboard.prototype.writeText;
    const asked: unknown[] = [];
    Object.assign(window, { asked });
    Clipboard.prototype.writeText = function (text) {
      asked.push(window.event?.type ?? null);
      return writeText.call(this, text);
    };
  });
  await grantClipboard(page);
  const none = await save(request);
  const { title } = await save(request, { caption: CAPTION });
  await stopClock(page);
  await page.goto('/');
  await expect(copyText(page, none.title)).toBeDisabled();
  await expect(waysMenu(card(page, none.title)), 'its picture can still be taken').toBeEnabled();
  await copyText(page, title).click();
  await expect(toast(page, 'ok')).toHaveText('Caption copied.');
  expect(await page.evaluate(() => (window as unknown as { asked: unknown[] }).asked)).toEqual(['click']);
  expect(await clipboardText(page)).toBe(CAPTION);
  // The editor's toast: a success leaves by itself.
  await page.clock.fastForward(OUTCOME_MS + 100);
  await expect(toast(page, 'ok')).toHaveCount(0);
});

test('with no clipboard, as over plain http, Copy text says so and why, and no Copy image is offered', async ({ page, request }) => {
  await noClipboard(page);
  const { title } = await save(request, { caption: CAPTION });
  await page.goto('/');
  await expect(waysMenu(card(page, title))).toBeEnabled();
  await expect(copyImage(page, title)).toHaveCount(0);
  await copyText(page, title).click();
  await expect(toast(page, 'error')).toHaveText(COPY_FAILED.text.unavailable);
  // An error stays, and is said at once.
  await expect(page.locator('.toasts [role=alert]')).toContainText(COPY_FAILED.text.unavailable);
});

test('Download gives the file at its canvas’s size: the canvas the viewer last chose in the editor, else WhatsApp', async ({ page, request }) => {
  const { title } = await save(request);
  for (const [canvas, size] of [
    [null, [1080, 1440]],
    ['story', [1080, 1920]],
  ] as const) {
    await page.goto('/');
    await page.evaluate(([key, value]) => (value ? localStorage.setItem(key, value) : localStorage.removeItem(key)), [CANVAS_PREF, canvas] as const);
    await page.reload();
    const c = card(page, title);
    for (const format of ['png', 'jpg'] as const) {
      const [file] = await Promise.all([page.waitForEvent('download'), pickWay(c, format)]);
      const meta = await sharp(await file.path()).metadata();
      expect([meta.format, meta.width, meta.height], `${canvas ?? 'default'} ${format}`).toEqual([format === 'jpg' ? 'jpeg' : 'png', ...size]);
      // The story's file has no suffix, as the editor's (filename.ts).
      if (!canvas) expect(file.suggestedFilename()).toContain('whatsapp');
      await expect(toast(page, 'ok')).toContainText(`Downloaded ${file.suggestedFilename()} (${size[0]} × ${size[1]}).`);
      // The menu's button has the focus back once the download is done.
      await expect(waysMenu(c)).toBeFocused();
    }
  }
});

test('on a phone Share… is the first button: the sheet gets the picture and the caption, and the caption is on the clipboard', async ({ browser, baseURL, request }) => {
  const { title } = await save(request, { caption: CAPTION });
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await context.route('**/kit/nest-nav.js', (route) => route.abort());
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  await withSheet(page);
  await page.goto('/');
  const c = card(page, title);
  await expect(waysMenu(c)).toBeEnabled();
  expect(await c.locator('.card-actions > button').first().textContent(), 'the first button').toBe(EXPORT_ACTION.share.label);
  await c.getByRole('button', { name: EXPORT_ACTION.share.label, exact: true }).click();
  await expect(toast(page, 'ok')).toHaveText('Shared. The caption is on the clipboard too: paste it if the app left it out.');
  expect(await page.evaluate(() => (window as unknown as { handed: unknown[] }).handed)).toEqual([{ name: expect.stringContaining('whatsapp'), type: 'image/png', width: 1080, height: 1440, text: CAPTION }]);
  expect(await clipboardText(page)).toBe(CAPTION);
  // Copy image is behind Download there.
  await waysMenu(c).click();
  await expect(c.locator('.card-actions > .menu').first().getByRole('menuitem')).toHaveText(['PNG · sharpest', 'JPG · smaller file', 'Copy image']);
  await context.close();
});

test('a frame with no photo is not made into a picture: the editor’s rule, said on the card and in the lightbox', async ({ page, request }) => {
  const { title } = await save(request, { caption: CAPTION, frame: true });
  await page.goto('/');
  const c = card(page, title);
  await expect(c.locator('.card-thumb.card-thumb-ready')).toBeVisible();
  await expect(c.locator('.card-note')).toHaveText(NO_PHOTO);
  await expect(copyImage(page, title)).toBeDisabled();
  await expect(waysMenu(c)).toBeDisabled();
  // Its caption is no picture.
  await expect(copyText(page, title)).toBeEnabled();
  await zoomButton(c).click();
  const dialog = lightbox(page);
  await expect(dialog.locator('.lightbox-note')).toHaveText(NO_PHOTO);
  await expect(waysMenu(dialog)).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Copy text', exact: true })).toBeEnabled();
});

test('the lightbox has the same ways out, and says what they came to inside itself', async ({ page, request }) => {
  await grantClipboard(page);
  const id = await copyOfSample(request, 'Pool party', 'library lightbox');
  saved.push(id);
  await page.goto('/');
  const c = page.locator('li.card').first();
  await zoomButton(c).click();
  const dialog = lightbox(page);
  await expect(dialog.locator('.card-thumb.card-thumb-ready')).toBeVisible();
  // Its photo is drawn.
  expect(await dialog.locator('.card-thumb img').evaluateAll((imgs) => imgs.filter((img) => (img as HTMLImageElement).src.includes('/uploads/')).map((img) => (img as HTMLImageElement).naturalWidth > 0))).toEqual([true]);

  await dialog.getByRole('button', { name: EXPORT_ACTION.copy.label, exact: true }).click();
  const said = dialog.locator('.toasts .toast-ok .toast-body');
  await expect(said).toContainText('Image copied (1080 × 1440).');
  const png = await sharp(await clipboardPng(page)).metadata();
  expect([png.width, png.height]).toEqual([1080, 1440]);
  // The toast is inside the dialog, on the screen, and clear of the bar's buttons.
  const [t, bar] = [(await said.boundingBox())!, (await dialog.locator('.lightbox-actions').boundingBox())!];
  expect(t.y + t.height).toBeLessThan(bar.y);

  // The menu opens upwards, inside the window.
  const [file] = await Promise.all([page.waitForEvent('download'), pickWay(dialog, 'png')]);
  expect((await sharp(await file.path()).metadata()).width).toBe(1080);
  await waysMenu(dialog).click();
  const [list, button] = [(await dialog.locator('.menu-list').boundingBox())!, (await waysMenu(dialog).boundingBox())!];
  expect(list.y).toBeGreaterThanOrEqual(0);
  expect(list.y + list.height, 'above its button').toBeLessThanOrEqual(button.y);
});

test('Duplicate and Archive are in More, and a failure is the library’s toast', async ({ page, request }) => {
  const { id, title } = await save(request);
  await page.goto('/');
  const c = card(page, title);
  await page.route(apiRoute(`flyers/${id}`), (route) => (route.request().method() === 'DELETE' ? route.fulfill({ status: 500, json: { error: { code: 'server_error', message: 'Something went wrong on the server.' } } }) : route.continue()));
  page.once('dialog', (d) => void d.accept());
  await moreMenu(c).click();
  await c.getByRole('menuitem', { name: 'Archive', exact: true }).click();
  await expect(toast(page, 'error')).toHaveText('Something went wrong on the server.');
  await expect(c, 'still there').toBeVisible();
  await page.unroute(apiRoute(`flyers/${id}`));

  await moreMenu(c).click();
  await c.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  await expect(page).toHaveURL(/#\/flyers\/\d+$/);
  const copy = Number(/(\d+)$/.exec(page.url())![1]);
  expect(copy).not.toBe(id);
  saved.push(copy);
  await expect(page.getByLabel('Library name')).toHaveValue(`${title} (copy)`);
});

// Found in review (2026-10-13): the flyer a toast is about was noted when an action started, so another card's
// "Copy text" pressed meanwhile took the step over.
test('a toast’s next step is its own flyer’s, whatever was pressed on another card meanwhile, and no toast follows into another flyer’s lightbox', async ({ page, request }) => {
  await grantClipboard(page);
  const a = await save(request, { caption: 'The caption of A' });
  const b = await save(request, { caption: 'The caption of B' });
  await page.goto('/');
  await expect(copyImage(page, a.title)).toBeEnabled();
  const release = await hold(page, apiRoute(`render/${a.id}`), 'POST');
  await copyImage(page, a.title).click();
  // While A's picture is being made, B's caption is copied.
  await copyText(page, b.title).click();
  await expect(toast(page, 'ok')).toHaveText('Caption copied.');
  expect(await clipboardText(page)).toBe('The caption of B');
  release();
  await expect(toast(page, 'ok')).toContainText('Image copied');
  await toast(page, 'ok').getByRole('button', { name: 'Copy the caption', exact: true }).click();
  await expect(toast(page, 'ok')).toHaveText('Caption copied.');
  expect(await clipboardText(page), 'the caption of the flyer whose picture was copied').toBe('The caption of A');

  // A toast with a step stands; another flyer's lightbox opens without it.
  await copyImage(page, a.title).click();
  await expect(toast(page, 'ok')).toContainText('Image copied');
  await zoomButton(card(page, b.title)).click();
  await expect(lightbox(page)).toBeVisible();
  await expect(page.locator('.toasts .toast')).toHaveCount(0);
});

test('on a phone the lightbox’s toast leaves the close button free, and a grid card’s menus open inside the screen', async ({ page, request }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await noClipboard(page);
  await save(request, { caption: CAPTION });
  await save(request, { caption: CAPTION });
  await page.addInitScript(() => localStorage.setItem('library.view', 'grid'));
  await page.goto('/');
  // Both columns: the left card's lists must not run off the left edge, nor the right card's off the right.
  for (const n of [0, 1]) {
    const c = page.locator('li.card').nth(n);
    await expect(waysMenu(c)).toBeEnabled();
    for (const menu of [waysMenu(c), moreMenu(c)]) {
      await menu.click();
      const list = (await c.locator('.menu-list:visible').boundingBox())!;
      expect(list.x, `card ${n + 1}: inside the screen, left`).toBeGreaterThanOrEqual(0);
      expect(list.x + list.width, `card ${n + 1}: inside the screen, right`).toBeLessThanOrEqual(360);
      await page.keyboard.press('Escape');
    }
  }

  const c = page.locator('li.card').first();
  await zoomButton(c).click();
  const dialog = lightbox(page);
  // An error stays until it is closed: it must not lie over the way out.
  await dialog.getByRole('button', { name: 'Copy text', exact: true }).click();
  const said = dialog.locator('.toasts .toast-error');
  await expect(said).toContainText(COPY_FAILED.text.unavailable);
  const [t, close, bar] = [(await said.boundingBox())!, (await dialog.getByRole('button', { name: 'Close', exact: true }).boundingBox())!, (await dialog.locator('.lightbox-actions').boundingBox())!];
  expect(t.x + t.width, 'clear of the close button').toBeLessThanOrEqual(close.x);
  expect(t.y + t.height, 'clear of the bar').toBeLessThanOrEqual(bar.y);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

// The PHP backend has no renderer: the browser makes the picture (src/editor/export/), from the library as from the
// editor.
test('where the backend has no renderer the library makes the picture in the browser: a copy and a download at the canvas’s size', async ({ browser, baseURL, request }) => {
  const id = await copyOfSample(request, 'Pool party', 'library client export');
  saved.push(id);
  const { context, page, overridden } = await clientOnlyEditor(browser, baseURL);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const c = page.locator('li.card').first();
  await c.getByRole('button', { name: EXPORT_ACTION.copy.label, exact: true }).click();
  await expect(toast(page, 'ok')).toContainText('Image copied (1080 × 1440).');
  expect(overridden(), 'the page read the changed config').toBe(true);
  const png = await sharp(await clipboardPng(page)).metadata();
  expect([png.width, png.height]).toEqual([1080, 1440]);
  const [file] = await Promise.all([page.waitForEvent('download'), pickWay(c, 'jpg')]);
  const jpg = await sharp(await file.path()).metadata();
  expect([jpg.format, jpg.width, jpg.height]).toEqual(['jpeg', 1080, 1440]);
  await context.close();
});
