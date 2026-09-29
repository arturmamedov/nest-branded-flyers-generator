import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import sharp from 'sharp';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, POOL_PARTY, apiCall, backToLibrary, dropFile, rowField as row, status, templateButton, type FilePayload } from '../editor';
import { LEAVE_PROMPT } from '../../src/editor/leaveGuard';
import { PHOTO_MODE_LABEL } from '../../src/editor/photoModes';
import { TEMPLATE_LABEL } from '../../src/editor/templates';
import { DEFAULT_PHOTO_MODE } from '../../src/shared/defaults';
import { CANVASES, CANVAS_IDS, type PhotoMode } from '../../src/shared/layout';
import { FlyerPayloadSchema, FlyerSavedSchema, type FlyerListItem } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

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
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
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

/* ---- This week (handoff step 8): the template toggle, the rows, and what a week flyer refuses ---- */

// The chain-wide Spanish line reads "…Nests Hostels.", so the hostel select is found by its own name only.
const hostelSelect = (page: Page) => page.getByLabel('Hostel', { exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function saveNew(page: Page): Promise<number> {
  const [res] = await Promise.all([page.waitForResponse(apiCall('POST', 'flyers')), button(page, 'Save').click()]);
  expect(res.status(), await res.text()).toBe(201);
  const { id } = FlyerSavedSchema.parse(await res.json());
  saved.push(id);
  return id;
}

test('This week: a new flyer switches to the week prefilled, and switching back leaves nothing unsaved', async ({ page }) => {
  await page.goto('/#/new');
  await expect(templateButton(page, 'activity')).toHaveAttribute('aria-pressed', 'true');
  await expect(status(page)).toHaveText('');

  await templateButton(page, 'week').click();
  await expect(templateButton(page, 'week')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Eyebrow')).toHaveValue('THIS WEEK');
  await expect(page.getByLabel('Line 1')).toHaveValue('What’s on');
  await expect(page.getByLabel('Line 2')).toHaveValue('this week.');
  await expect(page.getByLabel('Spanish line')).toHaveValue('El plan de la semana en Nests Hostels.');
  // What a week flyer never prints has no controls.
  await expect(modeButton(page, 'band')).toHaveCount(0);
  await expect(page.getByLabel('When', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ Add item' })).toHaveCount(0);
  await expect(status(page)).toHaveText('Unsaved changes');

  // The untouched defaults go back with the template: the draft is new again.
  await templateButton(page, 'activity').click();
  await expect(page.getByLabel('Eyebrow')).toHaveValue('NEXT ACTIVITY');
  await expect(page.getByLabel('Line 1')).toHaveValue('');
  await expect(status(page)).toHaveText('');
});

test('This week: the Spanish line names the hostel picked, until someone edits it', async ({ page }) => {
  await page.goto('/#/new');
  await templateButton(page, 'week').click();
  await hostelSelect(page).selectOption({ label: 'Duque Nest' });
  await expect(page.getByLabel('Spanish line')).toHaveValue('El plan de la semana en Duque Nest.');
  await page.getByLabel('Spanish line').fill('Nuestra semana.');
  await hostelSelect(page).selectOption({ label: 'Los Amigos Nest' });
  await expect(page.getByLabel('Spanish line')).toHaveValue('Nuestra semana.');
});

test('This week: rows typed, taken from a saved flyer, reordered and removed are what the flyer saves', async ({ page }) => {
  await page.goto('/#/new');
  await templateButton(page, 'week').click();
  await page.getByLabel('Library name').fill(`week spec ${Date.now()}`);
  await button(page, '+ Add row').click();
  await row(page, 1, 'day').fill('Fridays');
  await row(page, 1, 'event').fill('Two hours of fun waves');
  await row(page, 1, 'time').fill('15:00');
  await row(page, 1, 'cost').fill('40€ a class');

  // Taken from the saved Pool party: a copy of its WHEN, whole name and first price.
  const took = page.waitForResponse((r) => r.request().method() === 'GET' && /\/api\/flyers\/\d+$/.test(new URL(r.url()).pathname));
  await page.getByLabel('Add from a saved flyer', { exact: true }).selectOption({ label: 'Pool party · Duque Nest' });
  expect((await took).status()).toBe(200);
  await expect(row(page, 2, 'event')).toHaveValue('Saturday is a pool party');
  await expect(row(page, 2, 'day')).toHaveValue('Saturday 19/9');
  await expect(row(page, 2, 'time')).toHaveValue('15:00');
  await expect(row(page, 2, 'cost')).toHaveValue('Free');

  await button(page, '+ Add row').click();
  await row(page, 3, 'event').fill('Open mic night');
  // Moved up twice, focus follows the row; at the top its own "up" is off, so "down" has it.
  await button(page, 'Move row 3 up').click();
  await expect(button(page, 'Move row 2 up')).toBeFocused();
  await button(page, 'Move row 2 up').click();
  await expect(button(page, 'Move row 1 up')).toBeDisabled();
  await expect(button(page, 'Move row 1 down')).toBeFocused();
  await expect(row(page, 1, 'event')).toHaveValue('Open mic night');
  // Removed, the next row slides into its place and keeps the focus there.
  await button(page, 'Remove row 2').click();
  await expect(button(page, 'Remove row 2')).toBeFocused();

  const id = await saveNew(page);
  const stored = FlyerPayloadSchema.parse(await (await page.request.get(`/api/flyers/${id}`)).json());
  expect(stored.flyer.template).toBe('week');
  expect(stored.flyer.data.week).toEqual([
    { day: '', name: 'Open mic night', time: '', cost: '' },
    { day: 'Saturday 19/9', name: 'Saturday is a pool party', time: '15:00', cost: 'Free' },
  ]);

  // A short name prints instead of the name; cleared, it leaves no key, so the flyer reads as saved again.
  const short = row(page, 1, 'short name');
  await short.fill('Open mic');
  await expect(row(page, 1, 'event')).toHaveValue('Open mic night');
  await expect(page.locator('.stage-canvas [data-row="0"] [data-cell=name]')).toHaveText('Open mic');
  await expect(status(page)).toHaveText('Unsaved changes');
  await short.fill('');
  await expect(status(page), 'a cleared short name leaves no key').toHaveText('Saved');
  await short.fill('Open mic');
  const [put] = await Promise.all([page.waitForResponse(apiCall('PUT', `flyers/${id}`)), button(page, 'Save').click()]);
  expect(put.status()).toBe(200);
  const again = FlyerPayloadSchema.parse(await (await page.request.get(`/api/flyers/${id}`)).json());
  expect(again.flyer.data.week[0]).toEqual({ day: '', name: 'Open mic night', time: '', cost: '', shortName: 'Open mic' });

  // Five rows at most: both ways of adding one go, and come back when a row goes.
  for (let i = 0; i < 3; i++) await button(page, '+ Add row').click();
  await expect(row(page, 5, 'event')).toBeVisible();
  await expect(button(page, '+ Add row')).toHaveCount(0);
  await expect(page.getByLabel('Add from a saved flyer', { exact: true })).toBeDisabled();
  await button(page, 'Remove row 5').click();
  await expect(button(page, '+ Add row')).toBeVisible();
  await expect(page.getByLabel('Add from a saved flyer', { exact: true })).toBeEnabled();
});

test('This week: the · button never pushes a price past its limit, where Save would refuse it', async ({ page }) => {
  await page.goto('/#/new');
  await templateButton(page, 'week').click();
  await button(page, '+ Add row').click();
  const cost = row(page, 1, 'cost');
  const full = '25€ with breakfast 18€ without';
  expect(full.length, 'exactly the 30 characters a price may have').toBe(30);
  await cost.fill(full);
  await cost.evaluate((el: HTMLInputElement) => el.setSelectionRange(18, 18));
  await cost.locator('xpath=..').getByRole('button', { name: '·', exact: true }).click();
  await expect(cost).toHaveValue(full);
  // With room, it goes in where the caret was.
  await cost.fill('25€ 18€ without breakfast');
  await cost.evaluate((el: HTMLInputElement) => el.setSelectionRange(3, 3));
  await cost.locator('xpath=..').getByRole('button', { name: '·', exact: true }).click();
  await expect(cost).toHaveValue('25€ · 18€ without breakfast');
});

test('This week: a dropped photo is refused with a reason, and an Activity flyer switched to the week and back is as it was saved', async ({ page, request }) => {
  const list = (await (await request.get('/api/flyers?template=activity')).json()) as FlyerListItem[];
  const pool = FlyerPayloadSchema.parse(await (await request.get(`/api/flyers/${list.find((f) => f.title === 'Pool party')!.id}`)).json());
  const res = await request.post('/api/flyers', {
    headers: WRITE_HEADERS,
    data: { title: `week spec switch ${Date.now()}`, hostel: pool.flyer.hostel, template: 'activity', data: pool.flyer.data, photoId: pool.flyer.photoId },
  });
  const { id } = FlyerSavedSchema.parse(await res.json());
  saved.push(id);

  await page.goto(`/#/flyers/${id}`);
  await expect(status(page)).toHaveText('Saved');
  await templateButton(page, 'week').click();
  // One set of headline lines: the Activity headline becomes the week's title.
  await expect(page.getByLabel('Line 1')).toHaveValue('Saturday is a');
  await expect(page.getByLabel('Eyebrow')).toHaveValue('THIS WEEK');

  const uploads: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/photos$/.test(new URL(r.url()).pathname)) uploads.push(r.url());
  });
  await dropFile(page, page.locator('.stage'), PHOTO);
  await expect(page.locator('.notes .note-error')).toContainText(`${TEMPLATE_LABEL.week} flyer has no photo`);
  expect(uploads, 'nothing uploaded').toEqual([]);

  await templateButton(page, 'activity').click();
  await expect(page.getByLabel('Eyebrow')).toHaveValue('NEXT ACTIVITY');
  await expect(modeButton(page, 'bleed')).toHaveClass('on');
  await expect(status(page), 'the photo, chips and extras waited: nothing changed').toHaveText('Saved');
});

test('This week: reopened and saved again it is still a week flyer, and it downloads at every canvas size', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#/new');
  await templateButton(page, 'week').click();
  await page.getByLabel('Library name').fill(`week spec ${Date.now()}`);
  await button(page, '+ Add row').click();
  await row(page, 1, 'day').fill('Fridays');
  await row(page, 1, 'event').fill('Two hours of fun waves');
  const id = await saveNew(page);

  await page.reload();
  await expect(templateButton(page, 'week')).toHaveAttribute('aria-pressed', 'true');
  await row(page, 1, 'time').fill('15:00'); // an edit, so there is something to save
  const [put] = await Promise.all([page.waitForResponse(apiCall('PUT', `flyers/${id}`)), button(page, 'Save').click()]);
  expect(put.status()).toBe(200);
  expect(JSON.parse(put.request().postData()!).template).toBe('week');
  const again = FlyerPayloadSchema.parse(await (await page.request.get(`/api/flyers/${id}`)).json());
  expect([again.flyer.template, again.flyer.data.template]).toEqual(['week', 'week']);

  for (const canvas of CANVAS_IDS) {
    await button(page, CANVASES[canvas].label).click();
    for (const [name, format] of [
      ['Download PNG', 'png'],
      ['JPG', 'jpg'],
    ] as const) {
      await expect(button(page, name)).toBeEnabled();
      const [download] = await Promise.all([page.waitForEvent('download'), button(page, name).click()]);
      const meta = await sharp(readFileSync(await download.path())).metadata();
      expect([meta.format, meta.width, meta.height], `${canvas} ${format}`).toEqual([format === 'png' ? 'png' : 'jpeg', CANVASES[canvas].width, CANVASES[canvas].height]);
    }
  }
});

test('English and Spanish fields carry a drawn flag (Windows shows no emoji flags), and every field keeps its name', async ({ page }) => {
  await page.goto('/#/new');
  const ask = page.locator('section', { has: page.getByRole('heading', { name: 'The ask', exact: true }) });
  const flagOf = (field: Locator) =>
    field.evaluate((el) => {
      const label = el.closest('label')!;
      const flags = [...label.querySelectorAll('svg.flag')];
      return {
        flags: flags.length,
        lang: flags[0]?.getAttribute('data-lang'),
        hidden: flags[0]?.getAttribute('aria-hidden'),
        emoji: /[\u{1F1E6}-\u{1F1FF}]/u.test(label.textContent ?? ''),
      };
    });
  for (const template of ['activity', 'week'] as const) {
    await templateButton(page, template).click();
    for (const [field, lang] of [
      [page.getByLabel('Line 1'), 'en'],
      [page.getByLabel('Line 2'), 'en'],
      [page.getByLabel('Spanish line'), 'es'],
      [ask.getByLabel('English'), 'en'],
      [ask.getByLabel('Spanish'), 'es'],
    ] as const) {
      await expect(field, template).toHaveCount(1);
      expect(await flagOf(field), `${template}: ${lang}`).toEqual({ flags: 1, lang, hidden: 'true', emoji: false });
    }
  }
});

test('the library filters by template, labels each card, and remembers the choice', async ({ page }) => {
  await page.goto('/');
  await expect(library(page)).toBeVisible();
  const [res] = await Promise.all([
    page.waitForResponse(apiCall('GET', 'flyers', '?template=week')),
    page.getByLabel('Template').selectOption({ label: TEMPLATE_LABEL.week }),
  ]);
  expect(res.status()).toBe(200);
  const metas = page.locator('.card-meta');
  await expect(metas.first()).toBeVisible();
  for (const meta of await metas.allTextContents()) expect(meta).toContain(` · ${TEMPLATE_LABEL.week} · `);
  await page.reload();
  await expect(page.getByLabel('Template')).toHaveValue('week');
});
