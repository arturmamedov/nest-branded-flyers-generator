import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import sharp from 'sharp';
import { expect, test } from '../browser';
import {
  EDITOR_VIEWPORT,
  POOL_PARTY,
  apiCall,
  apiRoute,
  barActions,
  copyImage,
  copyOfSample,
  download,
  downloadMenu,
  dropFile,
  exportEntry,
  grantClipboard,
  hold,
  newFlyerNoPhoto as newFlyer,
  saveNew,
  status,
  toast,
  type FilePayload,
} from '../editor';
import { DOWNLOAD } from '../../src/editor/exportActions';
import { FlyerSavedSchema } from '../../src/shared/schema';
import { CANVASES, DEFAULT_CANVAS } from '../../src/shared/layout';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* The toolbar's ways to take the flyer out of the editor as a picture (the editor's UX round, Part 3; the owner's
   "create a dropdown from Download PNG, JPG, adding copy to clipboard", 2026-10-07). The menu is the editor's own
   (src/editor/Menu.tsx): this spec holds what a menu owes the keyboard and the pointer. What is copied and shared is
   clipboard.spec.ts's. */

test.use({ viewport: EDITOR_VIEWPORT });

const PHOTO: FilePayload = { name: 'pool-party.png', mimeType: 'image/png', buffer: readFileSync(POOL_PARTY) };

const saved: number[] = [];
const keep = (id: number) => saved.push(id);
test.afterEach(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

/** The menu's list, by its place: hidden until the button opens it, and a hidden list has no role to find it by. */
const list = (page: Page) => page.locator('.toolbar .menu [role="menu"]');
const box = async (l: Locator) => (await l.boundingBox())!;

/** What the list's entries read, in their order, on a desktop whose browser has no share sheet (the test browser). */
const ENTRIES = { png: 'PNG · sharpest', jpg: 'JPG · smaller file' } as const;

test('Download is a menu that holds PNG and JPG: the two download buttons are gone', async ({ page }) => {
  await newFlyer(page);
  const menu = downloadMenu(page);
  await expect(menu).toHaveText(DOWNLOAD);
  await expect(menu).toHaveAttribute('aria-haspopup', 'menu');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(list(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Download PNG' })).toHaveCount(0);
  await expect(page.locator('.toolbar').getByRole('button', { name: 'JPG', exact: true })).toHaveCount(0);

  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(list(page)).toBeVisible();
  expect(await menu.getAttribute('aria-controls'), 'the button names the list it opens').toBe(await list(page).getAttribute('id'));
  await expect(list(page).getByRole('menuitem')).toHaveText([ENTRIES.png, ENTRIES.jpg]);

  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(list(page)).toBeHidden();
});

test('on a desktop the bar reads [Copy image] [Download ▾]: Copy image is the main button, and Download stands beside it', async ({ page }) => {
  // The owner's "Copy beside Download" (2026-10-07).
  await newFlyer(page);
  await expect(barActions(page)).toHaveText(['Save', 'Copy image', 'Download']);
  await expect(copyImage(page)).toHaveClass(/btn-accent/);
  await expect(downloadMenu(page)).toHaveClass(/btn-dark/);
});

test('the menu from the keyboard: the arrows open it and move through it, Escape hands the focus back, Tab leaves it', async ({ page }) => {
  // With a caption, the pill on the stage is the next control after the menu: where Tab has to land.
  await newFlyer(page, { caption: 'TODAY we have a plan!' });
  const menu = downloadMenu(page);
  const [png, jpg] = [exportEntry(page, 'png'), exportEntry(page, 'jpg')];

  await menu.focus();
  await page.keyboard.press('ArrowDown');
  await expect(png, 'opened downwards: the first entry').toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(jpg).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(png, 'round to the first').toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(jpg, 'and back round to the last').toBeFocused();
  await page.keyboard.press('Home');
  await expect(png).toBeFocused();
  await page.keyboard.press('End');
  await expect(jpg).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(list(page)).toBeHidden();
  await expect(menu, 'Escape hands the focus back to the button').toBeFocused();

  await page.keyboard.press('ArrowUp');
  await expect(jpg, 'opened upwards: the last entry').toBeFocused();
  // Tab moves on from the entry it is on, to the control after the menu, and the list closes behind it. (Found in
  // review, 2026-10-12: the list was hidden at the key itself, so the focus set out from an element that was no
  // longer there, which only some browsers follow; and this test then accepted the focus anywhere, the page too.)
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Copy the share text', exact: true }), 'the next control after the menu').toBeFocused();
  await expect(list(page), 'and the list closed behind it').toBeHidden();

  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(png, 'Enter opens it as a click does').toBeFocused();
  // Shift+Tab leaves the list the other way: back to the button, and the list closes behind it too.
  await page.keyboard.press('Shift+Tab');
  await expect(menu).toBeFocused();
  await expect(list(page)).toBeHidden();
});

test('a closed menu’s entries are there for no one, and a click anywhere else closes an open one', async ({ page }) => {
  await newFlyer(page);
  const menu = downloadMenu(page);
  // Hidden, not just out of sight: no role finds an entry, so no screen reader does, and no pointer reaches one.
  await expect(page.locator('.toolbar .menu').getByRole('menuitem')).toHaveCount(0);
  await expect(page.locator('.toolbar .menu [role="menuitem"]').first()).toBeHidden();

  await menu.click();
  await expect(page.locator('.toolbar .menu').getByRole('menuitem')).toHaveCount(2);
  await expect(list(page)).toBeVisible();
  await page.locator('.stage').click({ position: { x: 20, y: 20 } });
  await expect(list(page)).toBeHidden();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});

test('an entry downloads the canvas on screen at its exact size, by mouse and by keyboard, and the button has the focus back', async ({ page }) => {
  await newFlyer(page);
  await page.getByLabel('Library name').fill(`toolbar spec ${Date.now()}`);
  await saveNew(page, keep);
  const { width, height } = CANVASES[DEFAULT_CANVAS];
  const sizeOf = async (path: string) => {
    const meta = await sharp(readFileSync(path)).metadata();
    return [meta.format, meta.width, meta.height];
  };

  const png = await download(page, 'png');
  expect(await sizeOf(await png.path())).toEqual(['png', width, height]);
  await expect(list(page), 'a choice closes the list').toBeHidden();
  // The button is greyed while the download is made, and a greyed button drops the focus: it has it back.
  await expect(downloadMenu(page)).toBeFocused();

  await page.keyboard.press('ArrowUp');
  await expect(exportEntry(page, 'jpg')).toBeFocused();
  const [jpg] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(await sizeOf(await jpg.path())).toEqual(['jpeg', width, height]);
  await expect(downloadMenu(page)).toBeFocused();
  await expect(list(page)).toBeHidden();
});

test('the menu is greyed, and stays closed, while a frame has no photo', async ({ page }) => {
  await page.goto('/#/new');
  await expect(downloadMenu(page)).toBeDisabled();
  await expect(list(page)).toBeHidden();
});

test('a photo dropped with the list open closes it: one action at a time', async ({ page }) => {
  await newFlyer(page);
  const release = await hold(page, apiRoute('photos'), 'POST');
  await downloadMenu(page).click();
  await expect(list(page)).toBeVisible();
  // A dropped file is no click outside the menu: only the action it starts closes the list.
  await dropFile(page, page.locator('.stage'), PHOTO);
  await expect(downloadMenu(page)).toBeDisabled();
  await expect(list(page), 'an entry must not start a second action').toBeHidden();
  release();
  await expect(downloadMenu(page)).toBeEnabled();
  await expect(list(page), 'and it does not open again by itself').toBeHidden();
});

test('a button an action greyed has the focus back when the action is done; a field the action never greyed is left alone', async ({ page }) => {
  await grantClipboard(page);
  await newFlyer(page, { title: `toolbar spec focus ${Date.now()}` });
  // Copy image is greyed while it works, and a greyed button drops the focus.
  const [created] = await Promise.all([page.waitForResponse(apiCall('POST', 'flyers')), copyImage(page).click()]);
  keep(FlyerSavedSchema.parse(await created.json()).id);
  await expect(toast(page, 'ok')).toContainText('Image copied');
  await expect(copyImage(page)).toBeFocused();

  // A dropped photo starts from no control. The caret was in a field, and the staff member clicked the stage while
  // the photo went up: the focus is theirs to have put there. (Found in review, 2026-10-12: whatever had the focus
  // when an action started was taken for the control that started it, and got the focus back.)
  const release = await hold(page, apiRoute('photos'), 'POST');
  await page.getByLabel('Line 1').focus();
  await dropFile(page, page.locator('.stage'), PHOTO);
  await expect(downloadMenu(page)).toBeDisabled();
  await page.locator('.stage').click({ position: { x: 20, y: 20 } });
  expect(await page.evaluate(() => document.activeElement === document.body), 'the click took the focus off the field').toBe(true);
  release();
  await expect(downloadMenu(page)).toBeEnabled();
  expect(await page.evaluate(() => document.activeElement?.tagName), 'and it is not pulled back in').toBe('BODY');
});

test('a saved flyer’s bar is one row at 1280 px wide with the form open, as it was with the two download buttons', async ({ page, request }) => {
  // Seen in the look (2026-10-12): "Copy image" and "Download ▾" are wider than "Download PNG" and "JPG" were, the
  // bar broke into two rows, and the flyer under it was 491 px wide where it had been 524.
  await page.setViewportSize({ width: 1280, height: 800 });
  const id = await copyOfSample(request, 'Pool party', 'toolbar spec row');
  keep(id);
  await page.goto(`/#/flyers/${id}`);
  await expect(status(page)).toHaveText('Saved');
  await expect(copyImage(page)).toBeEnabled();
  // One row: the bar is as tall as one, and its last button stands level with its first control.
  const middle = async (l: Locator) => {
    const b = await box(l);
    return b.y + b.height / 2;
  };
  const row = async () => ({
    height: Math.round((await box(page.locator('.toolbar'))).height),
    level: Math.abs((await middle(page.getByRole('group', { name: 'Canvas' }))) - (await middle(downloadMenu(page)))) < 2,
  });
  await expect.poll(row).toEqual({ height: 54, level: true });
  await expect.poll(async () => Math.round((await box(page.locator('.stage-canvas'))).width), 'the flyer keeps the size it had').toBe(524);
});

for (const viewport of [EDITOR_VIEWPORT, { width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 360, height: 800 }]) {
  test(`at ${viewport.width} px with unsaved changes, Download ends the bar at its right, and its list opens inside the window, over the flyer`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await newFlyer(page);
    await expect(status(page)).toHaveText('Unsaved changes');
    const menu = downloadMenu(page);
    await menu.scrollIntoViewIfNeeded();
    const [bar, button] = [await box(page.locator('.toolbar')), await box(menu)];
    // The bar's own padding: the last button never drops alone to the left of a second row.
    expect(Math.round(bar.x + bar.width - (button.x + button.width)), 'from the bar’s right edge').toBe(16);

    await menu.click();
    const opened = await box(list(page));
    expect(opened.x, 'inside the window, on the left').toBeGreaterThanOrEqual(bar.x);
    expect(opened.x + opened.width, 'and on the right').toBeLessThanOrEqual(viewport.width);
    for (const action of ['png', 'jpg'] as const) {
      const entry = await box(exportEntry(page, action));
      const reached = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[role="menuitem"]')?.textContent, [entry.x + entry.width / 2, entry.y + entry.height / 2]);
      expect(reached, 'a click there reaches the entry, not what is under it').toBe(ENTRIES[action]);
    }
  });
}
