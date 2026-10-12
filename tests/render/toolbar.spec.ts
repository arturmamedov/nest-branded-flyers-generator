import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import sharp from 'sharp';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, POOL_PARTY, apiRoute, download, downloadMenu, dropFile, exportEntry, hold, saveNew, status, type FilePayload } from '../editor';
import { DOWNLOAD, entryText } from '../../src/editor/exportActions';
import { PHOTO_MODE_LABEL } from '../../src/editor/photoModes';
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

/** A new flyer that can be taken out as it is: with no photo band, nothing is missing. */
async function newFlyer(page: Page) {
  await page.goto('/#/new');
  await page.getByRole('button', { name: PHOTO_MODE_LABEL.none, exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled();
}

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
  await expect(list(page).getByRole('menuitem')).toHaveText([entryText('png'), entryText('jpg')]);

  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(list(page)).toBeHidden();
});

test('the menu from the keyboard: the arrows open it and move through it, Escape hands the focus back, Tab leaves it', async ({ page }) => {
  await newFlyer(page);
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
  await page.keyboard.press('Tab');
  await expect(list(page), 'Tab leaves the menu, and closes it').toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.closest('.menu') === null), 'the focus has moved on').toBe(true);

  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(png, 'Enter opens it as a click does').toBeFocused();
});

test('a closed menu’s entries cannot be reached, and a click anywhere else closes an open one', async ({ page }) => {
  await newFlyer(page);
  const menu = downloadMenu(page);
  await menu.focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'Tab goes past the hidden entries').not.toBe('menuitem');

  await menu.click();
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
      expect(reached, 'a click there reaches the entry, not what is under it').toBe(entryText(action));
    }
  });
}
