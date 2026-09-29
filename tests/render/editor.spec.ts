import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, POOL_PARTY, WRITE, apiCall, backToLibrary, dropFile, status, type FilePayload } from '../editor';
import { LEAVE_PROMPT } from '../../src/editor/leaveGuard';
import { PHOTO_MODE_LABEL } from '../../src/editor/photoModes';
import { DEFAULT_PHOTO_MODE } from '../../src/shared/defaults';
import type { PhotoMode } from '../../src/shared/layout';
import { FlyerSavedSchema } from '../../src/shared/schema';

/* The editor is a focus page (App.tsx, Editor.tsx): the whole window, no shared bar, one way
   back at the top of its form, and every way out with unsaved work asks first (leaveGuard.ts,
   route.ts). Each flow is its own test, so it starts from a fresh history. The bar itself is
   chrome.spec.ts's. */

test.use({ viewport: EDITOR_VIEWPORT });

const PHOTO: FilePayload = { name: 'pool-party.png', mimeType: 'image/png', buffer: readFileSync(POOL_PARTY) };

const panel = (page: Page) => page.locator('.panel');
const line1 = (page: Page) => page.getByLabel('Line 1');
const library = (page: Page) => page.getByRole('heading', { name: 'Flyer library' });
const modeButton = (page: Page, mode: PhotoMode) => page.getByRole('button', { name: PHOTO_MODE_LABEL[mode], exact: true });

/** Flyers a test saved: archived afterwards, so the specs after this one find the library as seeded. */
const saved: number[] = [];
test.afterEach(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE });
});

/** Opens a new flyer from the library, so the history holds the library entry behind it. */
async function newFlyerFromLibrary(page: Page) {
  await page.goto('/');
  await expect(library(page)).toBeVisible();
  await page.getByRole('link', { name: 'New flyer' }).click();
  await expect(line1(page)).toBeVisible();
}

/** A real click first: Chromium shows beforeunload only to a page the user has touched. */
async function makeUnsaved(page: Page) {
  await line1(page).click();
  await line1(page).fill('Unsaved is a');
  await expect(status(page)).toHaveText('Unsaved changes');
}

/** The browser's Back button. A move the page cancels never commits, and page.goBack() waits for
    a commit: so it waits briefly, and the checks after it say where the tab is. */
const pressBack = (page: Page) => page.goBack({ timeout: 2_000 }).catch(() => null);

/** Jumps several entries at once from the Back button's menu: a move the browser starts, as the
    user's is (a script's history.go() right after a cancelled one is dropped by Chromium). */
async function jump(page: Page, delta: number) {
  const cdp = await page.context().newCDPSession(page);
  const { entries, currentIndex } = await cdp.send('Page.getNavigationHistory');
  await cdp.send('Page.navigateToHistoryEntry', { entryId: entries[currentIndex + delta].id });
}

/** Runs `action`, which must open the editor's leave prompt, and answers it. The answer is given
    in the event itself: an action such as a click can wait on the page, and an open dialog
    holds the page. */
async function answerLeavePrompt(page: Page, answer: 'accept' | 'dismiss', action: () => Promise<unknown>) {
  const asked = new Promise<string[]>((resolve) =>
    page.once('dialog', (d) => {
      resolve([d.type(), d.message()]);
      void d[answer]();
    }),
  );
  await action();
  expect(await asked).toEqual(['confirm', LEAVE_PROMPT]);
}

test('the editor has the whole window, and its way back stays at the top of the form', async ({ page }) => {
  await page.goto('/#/new');
  await expect(backToLibrary(page)).toBeVisible();
  expect((await page.locator('.toolbar').boundingBox())!.y, 'no bar above the toolbar').toBe(0);

  const form = panel(page);
  expect(await form.evaluate((el) => el.scrollHeight - el.clientHeight), 'the form scrolls').toBeGreaterThan(200);
  await form.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  expect(await form.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(backToLibrary(page)).toBeInViewport({ ratio: 1 });
  expect((await page.locator('.panel-head').boundingBox())!.y, 'the head sits flush with the panel top').toBe((await form.boundingBox())!.y);
});

test('a new flyer starts in the default photo mode, and a photo dropped on No photo lands in it', async ({ page }) => {
  await page.goto('/#/new');
  await expect(modeButton(page, DEFAULT_PHOTO_MODE)).toHaveClass('on');
  await modeButton(page, 'none').click();
  await expect(modeButton(page, 'none')).toHaveClass('on');
  const [res] = await Promise.all([page.waitForResponse(apiCall('POST', 'photos')), dropFile(page, page.locator('.stage'), PHOTO)]);
  expect(res.status(), await res.text()).toBe(201);
  await expect(modeButton(page, DEFAULT_PHOTO_MODE)).toHaveClass('on');
});

test('a photo dropped beside the preview is refused, never opened in the tab', async ({ page }) => {
  await page.goto('/#/new');
  await expect(backToLibrary(page)).toBeVisible();
  const prevented = await panel(page).evaluate((el) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(['x'], 'party.png', { type: 'image/png' }));
    return ['dragover', 'drop'].map((type) => {
      const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    });
  });
  expect(prevented, 'dragover and drop both refused').toEqual([true, true]);
});

test('unsaved work: the Library link asks; staying keeps the draft and leaves no entry behind', async ({ page }) => {
  await newFlyerFromLibrary(page);
  await makeUnsaved(page);

  await answerLeavePrompt(page, 'dismiss', () => backToLibrary(page).click());
  await expect(page).toHaveURL(/#\/new$/);
  await expect(line1(page)).toHaveValue('Unsaved is a');
  expect(await page.evaluate(() => navigation.entries().length), 'the refused link made no entry').toBe(2);

  await answerLeavePrompt(page, 'accept', () => pressBack(page));
  await expect(library(page)).toBeVisible();
});

test('unsaved work: the browser Back button asks; staying keeps the draft, and the next Back still asks', async ({ page }) => {
  await newFlyerFromLibrary(page);
  await makeUnsaved(page);

  await answerLeavePrompt(page, 'dismiss', () => pressBack(page));
  await expect(page).toHaveURL(/#\/new$/);
  await expect(line1(page)).toHaveValue('Unsaved is a');

  // The refused Back never happened: the library is still the entry behind the editor.
  await answerLeavePrompt(page, 'accept', () => pressBack(page));
  await expect(library(page)).toBeVisible();
});

test('a clean editor, and one just saved, leave without asking', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });

  await newFlyerFromLibrary(page);
  await backToLibrary(page).click();
  await expect(library(page)).toBeVisible();

  await page.getByRole('link', { name: 'New flyer' }).click();
  await page.getByLabel('Library name').fill(`editor spec ${Date.now()}`);
  await makeUnsaved(page);
  const [res] = await Promise.all([page.waitForResponse(apiCall('POST', 'flyers')), page.getByRole('button', { name: 'Save', exact: true }).click()]);
  expect(res.status(), await res.text()).toBe(201);
  saved.push(FlyerSavedSchema.parse(await res.json()).id);
  await expect(status(page)).toHaveText('Saved');
  await pressBack(page);
  expect(dialogs, 'no prompt').toEqual([]);
  await expect(library(page)).toBeVisible();
});

test('a first save that answers after the user has left keeps their URL', async ({ page }) => {
  await newFlyerFromLibrary(page);
  await page.getByLabel('Library name').fill(`editor spec ${Date.now()}`);
  await makeUnsaved(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/flyers', async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue();
  });
  const answered = page.waitForResponse(apiCall('POST', 'flyers'));
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await answerLeavePrompt(page, 'accept', () => backToLibrary(page).click()); // the save is still out
  await expect(library(page)).toBeVisible();
  release();
  saved.push(FlyerSavedSchema.parse(await (await answered).json()).id);
  await expect(library(page)).toBeVisible();
  expect(new URL(page.url()).hash, 'still the library').toBe('#/');
});

test('closing the tab with unsaved work asks the browser to confirm', async ({ page }) => {
  await page.goto('/#/new');
  await makeUnsaved(page);
  const dialog = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const d = await dialog;
  // The browser words it; Chromium hands the page no message.
  expect(d.type()).toBe('beforeunload');
  await d.dismiss();
  expect(page.isClosed()).toBe(false);
  await expect(line1(page)).toHaveValue('Unsaved is a');
});

test('a jump over several entries, from the Back button menu, is refused as a whole, or lands where it was sent', async ({ page }) => {
  await page.goto('/#/');
  await expect(library(page)).toBeVisible();
  await page.getByRole('link', { name: 'New flyer' }).click();
  await backToLibrary(page).click();
  await page.getByRole('link', { name: 'New flyer' }).click();
  await makeUnsaved(page);
  const place = () => page.evaluate(() => navigation.currentEntry!.index);
  expect(await place()).toBe(3);

  await answerLeavePrompt(page, 'dismiss', () => jump(page, -3));
  await expect(line1(page)).toHaveValue('Unsaved is a');
  expect(await place(), 'nothing moved').toBe(3);

  await answerLeavePrompt(page, 'accept', () => jump(page, -3));
  await expect(library(page)).toBeVisible();
  expect(await place()).toBe(0);
});
