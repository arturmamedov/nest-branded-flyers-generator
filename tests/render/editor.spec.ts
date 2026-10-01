import { readFileSync } from 'node:fs';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import sharp from 'sharp';
import { expect, test } from '../browser';
import {
  EDITOR_VIEWPORT,
  POOL_PARTY,
  apiCall,
  apiRoute,
  backToLibrary,
  cutOff,
  cutOffOn,
  dropFile,
  filterLibrary,
  libraryCard as card,
  rowField as row,
  saveNew,
  status,
  templateButton,
  type FilePayload,
} from '../editor';
import { LEAVE_PROMPT } from '../../src/editor/leaveGuard';
import { PHOTO_MODE_LABEL } from '../../src/editor/photoModes';
import { TEMPLATE_LABEL } from '../../src/editor/templates';
import { DEFAULT_PHOTO_MODE, marksFor } from '../../src/shared/defaults';
import { CANVASES, CANVAS_IDS, type CanvasId, type PhotoMode } from '../../src/shared/layout';
import { FlyerPayloadSchema, FlyerSavedSchema, type FlyerListItem } from '../../src/shared/schema';
import { WEEK_ROWS_MAX } from '../../src/shared/week';
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
const keep = (id: number) => saved.push(id);
test.afterEach(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

/** A saved copy of the seeded Pool party, its data and photo, made through the API (and archived afterwards). */
async function poolPartyCopy(request: APIRequestContext, title: string): Promise<number> {
  const list = (await (await request.get('/api/flyers?template=activity')).json()) as FlyerListItem[];
  const pool = FlyerPayloadSchema.parse(await (await request.get(`/api/flyers/${list.find((f) => f.title === 'Pool party')!.id}`)).json());
  const res = await request.post('/api/flyers', {
    headers: WRITE_HEADERS,
    data: { title: `${title} ${Date.now()}`, hostel: pool.flyer.hostel, template: 'activity', data: pool.flyer.data, photoId: pool.flyer.photoId },
  });
  const { id } = FlyerSavedSchema.parse(await res.json());
  keep(id);
  return id;
}

/** Holds a request the route predicate matches until the returned release() is called. */
async function hold(page: Page, url: (url: URL) => boolean, method = 'GET'): Promise<() => void> {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(url, async (route) => {
    if (route.request().method() === method) await held;
    await route.continue();
  });
  return release;
}

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

test('one action at a time: a photo dropped while a download is out is refused, and the photo button waits for it', async ({ page, request }) => {
  const id = await poolPartyCopy(request, 'editor spec busy');
  await page.goto(`/#/flyers/${id}`);
  await expect(status(page)).toHaveText('Saved');
  // A download saves first (a PUT), then asks the server to render: held, the download stays out.
  const release = await hold(page, apiRoute(`render/${id}`), 'POST');
  const uploads: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/photos$/.test(new URL(r.url()).pathname)) uploads.push(r.url());
  });
  const photoButton = page.getByRole('button', { name: 'Replace photo', exact: true });
  await expect(photoButton).toBeEnabled();

  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rendering…', exact: true }), 'the download is out').toBeDisabled();
  await dropFile(page, page.locator('.stage'), PHOTO);
  // Checked now: when the download ends, its own note takes the refusal's place.
  await expect(page.locator('.notes .note-error')).toHaveText('Still working on the last action — drop the photo again in a moment.');
  expect(uploads, 'nothing uploaded').toEqual([]);
  await expect(photoButton).toBeDisabled();

  release();
  await downloaded;
  await expect(page.locator('.notes .note-ok')).toContainText('Downloaded');
  await expect(photoButton).toBeEnabled();
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
  await saveNew(page, keep);
  await pressBack(page);
  expect(dialogs, 'no prompt').toEqual([]);
  await expect(library(page)).toBeVisible();
});

test('a first save that answers after the user has left keeps their URL', async ({ page }) => {
  await newFlyerFromLibrary(page);
  await page.getByLabel('Library name').fill(`editor spec ${Date.now()}`);
  await makeUnsaved(page);
  const release = await hold(page, apiRoute('flyers'), 'POST');
  const answered = page.waitForResponse(apiCall('POST', 'flyers'));
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await answerLeavePrompt(page, 'accept', () => backToLibrary(page).click()); // the save is still out
  await expect(library(page)).toBeVisible();
  release();
  saved.push(FlyerSavedSchema.parse(await (await answered).json()).id);
  await expect(library(page)).toBeVisible();
  expect(new URL(page.url()).hash, 'still the library').toBe('#/');
});

test('a first save returns once its URL reopens the flyer, however late the page takes the answer', async ({ page }) => {
  // The page takes the POST's answer a second after the network has it. page.route can't make that gap: it delays the
  // network and the page alike, and saveNew waits on the network.
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const res = await fetch(input, init);
      if (init?.method === 'POST' && new URL(String(input), location.href).pathname.endsWith('/api/flyers')) await new Promise((r) => setTimeout(r, 1_000));
      return res;
    };
  });
  await page.goto('/#/new');
  const title = `editor spec ${Date.now()}`;
  await page.getByLabel('Library name').fill(title);
  const { id } = await saveNew(page, keep);
  expect(new URL(page.url()).hash, 'a reload now reopens the flyer').toBe(`#/flyers/${id}`);
  await page.reload();
  await expect(page.getByLabel('Library name')).toHaveValue(title);
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

test('the hostel help says its badge prints at the top, when the setting prints badges', async ({ page }) => {
  await page.goto('/#/new');
  const help = page.getByText(/Prints in the WHERE block/);
  await expect(help, 'chain-wide: no badge').not.toContainText('badge');
  await hostelSelect(page).selectOption({ label: 'Duque Nest' });
  if (marksFor(true).includes('badge')) await expect(help).toContainText('Its badge prints at the top.');
  else await expect(help).not.toContainText('badge');
});

test('This week: an untitled week flyer is named for its hostel and the day of its first save', async ({ page }) => {
  // The day is frozen, so the name doesn't depend on when the suite runs; timers keep running.
  await page.clock.setFixedTime(new Date('2026-09-30T12:00:00'));
  await page.goto('/#/new');
  await templateButton(page, 'week').click();
  await hostelSelect(page).selectOption({ label: 'Duque Nest' });
  const name = page.getByLabel('Library name');
  await expect(name).toHaveAttribute('placeholder', 'This week · Duque Nest · 30 Sept');

  const { flyer } = await saveNew(page, keep);
  expect(flyer.title).toBe('This week · Duque Nest · 30 Sept');
  await expect(name).toHaveValue('This week · Duque Nest · 30 Sept');
});

test('This week: switching template with a hostel picked names it, and takes the lines away again', async ({ page }) => {
  const spanish = page.getByLabel('Spanish line');
  const lines = async () => [await page.getByLabel('Line 1').inputValue(), await page.getByLabel('Line 2').inputValue(), await spanish.inputValue()];
  await page.goto('/#/new');
  await hostelSelect(page).selectOption({ label: 'Duque Nest' });
  await templateButton(page, 'week').click();
  await expect(spanish, 'picked before the switch').toHaveValue('El plan de la semana en Duque Nest.');
  await templateButton(page, 'activity').click();
  await expect(spanish).toHaveValue('');
  expect(await lines(), 'the untouched title goes with the week').toEqual(['', '', '']);

  await hostelSelect(page).selectOption({ label: 'Los Amigos Nest' });
  await templateButton(page, 'week').click();
  await expect(spanish, 'picked on Activity').toHaveValue('El plan de la semana en Los Amigos Nest.');
  await hostelSelect(page).selectOption({ label: 'Duque Nest' });
  await expect(spanish, 'picked on the week').toHaveValue('El plan de la semana en Duque Nest.');
  await templateButton(page, 'activity').click();
  await expect(spanish).toHaveValue('');
  expect(await lines()).toEqual(['', '', '']);
});

const canvasButton = (page: Page, canvas: CanvasId) => button(page, CANVASES[canvas].label);
// Too wide at its floor on every canvas: render.spec's "cut at its column" test.
const LONG_TIME = 'Mon–Fri 10:00–13:00';

test('This week: a row edit, and a switch of template alone, refit the canvas offscreen as well as the one on screen', async ({ page }) => {
  await page.goto('/#/new');
  await expect(canvasButton(page, 'story')).toHaveAttribute('aria-pressed', 'true');
  await templateButton(page, 'week').click();
  await button(page, '+ Add row').click();
  await row(page, 1, 'day').fill('Fridays');
  await row(page, 1, 'event').fill('Surf');
  await row(page, 1, 'time').fill(LONG_TIME);
  await expect(cutOff(page)).toContainText(cutOffOn(...CANVAS_IDS));
  await row(page, 1, 'time').fill('15:00');
  await expect(cutOff(page)).toHaveCount(0);

  await row(page, 1, 'time').fill(LONG_TIME);
  await expect(cutOff(page)).toContainText(cutOffOn(...CANVAS_IDS));
  // Made our own, the eyebrow and title stay across a switch (switchTemplate): only the template changes in the fit.
  await page.getByLabel('Eyebrow').fill('OUR WEEK');
  await page.getByLabel('Line 1').fill('Our plans');
  await templateButton(page, 'activity').click();
  await expect(cutOff(page)).toHaveCount(0);
  await templateButton(page, 'week').click();
  await expect(cutOff(page)).toContainText(cutOffOn(...CANVAS_IDS));
});

test('This week: the cut-off note names only the canvas that clips', async ({ page }) => {
  await page.goto('/#/new');
  await canvasButton(page, 'whatsapp').click(); // the story is fitted offscreen
  await templateButton(page, 'week').click();
  await button(page, '+ Add row').click();
  await row(page, 1, 'day').fill('Fridays');
  await row(page, 1, 'time').fill('10:00 – 13:00'); // reaches the time's 250 px cap uncut
  // One word, lowercase (capitals would add a lint note): at the name's floor, wider than the room the story's row
  // leaves it (about 320 px), narrower than WhatsApp's (about 380).
  const word = 'electroencephalography';
  await row(page, 1, 'event').fill(word);
  const name = page.locator('.stage-canvas [data-row="0"] [data-cell=name]');
  const atFloor = await name.evaluate(async (el) => {
    await document.fonts.ready;
    const probe = el.cloneNode(true) as HTMLElement;
    Object.assign(probe.style, { fontSize: `${44 * 0.6}px`, whiteSpace: 'nowrap', position: 'absolute', visibility: 'hidden' });
    el.parentElement!.appendChild(probe);
    // Layout px: the preview is scaled by a transform, which getBoundingClientRect would count.
    const px = probe.offsetWidth;
    probe.remove();
    return px;
  });
  expect(atFloor, `"${word}" at the name's floor, in px`).toBeGreaterThanOrEqual(330);
  expect(atFloor, `"${word}" at the name's floor, in px`).toBeLessThanOrEqual(370);
  await expect(cutOff(page)).toContainText(cutOffOn('story'));
  await row(page, 1, 'event').fill('Surf');
  await expect(cutOff(page)).toHaveCount(0);
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
  await expect(page.locator('.notes .note-ok')).toHaveText('Added “Saturday is a pool party” from Pool party.');

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

  const { id } = await saveNew(page, keep);
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

/* A row taken from a saved flyer joins the rows as they are when it arrives. The picker empties itself as soon as a
   flyer is picked, so a row that can't join says so in the note, by name, with what to do. */

const picker = (page: Page) => page.getByLabel('Add from a saved flyer', { exact: true });
// The GET of the picked flyer only: anchored, so the list of saved flyers (?template=activity) is never held.
const pickedFlyer = (url: URL) => /\/api\/flyers\/\d+$/.test(url.pathname) && url.search === '';

test('This week: a row taken from a saved flyer is refused, by name, when the week filled while it was on its way', async ({ page }) => {
  await page.goto('/#/new');
  await templateButton(page, 'week').click();
  await expect(picker(page)).toBeEnabled();
  const release = await hold(page, pickedFlyer);
  const took = page.waitForResponse((r) => r.request().method() === 'GET' && pickedFlyer(new URL(r.url())));
  await picker(page).selectOption({ label: 'Pool party · Duque Nest' });
  for (let i = 0; i < WEEK_ROWS_MAX; i++) await button(page, '+ Add row').click();
  await expect(row(page, WEEK_ROWS_MAX, 'event')).toBeVisible();
  release();
  expect((await took).status()).toBe(200);

  await expect(page.locator('.notes .note-error')).toHaveText(
    `“Saturday is a pool party” was not added: a week holds ${WEEK_ROWS_MAX} rows. Remove one, then add it again.`,
  );
  await expect(page.locator('.notes .note-ok')).toHaveCount(0);
  await expect(page.locator('.week-row')).toHaveCount(WEEK_ROWS_MAX);
  for (let n = 1; n <= WEEK_ROWS_MAX; n++) await expect(row(page, n, 'event'), `row ${n}`).toHaveValue('');
});

test('This week: a row taken from a saved flyer is refused, by name, when the flyer turned Activity while it was on its way', async ({ page }) => {
  await page.goto('/#/new');
  await templateButton(page, 'week').click();
  await expect(picker(page)).toBeEnabled();
  const release = await hold(page, pickedFlyer);
  const took = page.waitForResponse((r) => r.request().method() === 'GET' && pickedFlyer(new URL(r.url())));
  await picker(page).selectOption({ label: 'Pool party · Duque Nest' });
  await templateButton(page, 'activity').click();
  release();
  expect((await took).status()).toBe(200);

  await expect(page.locator('.notes .note-error')).toHaveText(
    `“Saturday is a pool party” was not added: this is an ${TEMPLATE_LABEL.activity} flyer now. Switch back to ${TEMPLATE_LABEL.week}, then add it again.`,
  );
  await expect(page.locator('.notes .note-ok')).toHaveCount(0);
  await templateButton(page, 'week').click();
  await expect(picker(page)).toBeVisible();
  await expect(row(page, 1, 'event')).toHaveCount(0);
});

test('This week: saved flyers that could not be loaded say so, and Try again loads them', async ({ page }) => {
  let failing = true;
  await page.route(apiRoute('flyers', '?template=activity'), (route) => (failing ? route.abort() : route.continue()));
  await page.goto('/#/new');
  await templateButton(page, 'week').click();
  const first = picker(page).locator('option').first();
  const again = button(page, 'Try again');
  await expect(first).toHaveText('Could not load the saved flyers');
  await expect(picker(page)).toBeDisabled();
  await expect(again).toBeVisible();

  failing = false;
  await again.click();
  await expect(picker(page)).toBeEnabled();
  await expect(first).toHaveText('Add from a saved flyer…');
  await expect(again).toHaveCount(0);
  await picker(page).selectOption({ label: 'Pool party · Duque Nest' });
  await expect(row(page, 1, 'event')).toHaveValue('Saturday is a pool party');
});

test('This week: with no saved Activity flyers the picker says so, and offers nothing to try again', async ({ page }) => {
  await page.route(apiRoute('flyers', '?template=activity'), (route) => route.fulfill({ json: [] }));
  await page.goto('/#/new');
  await templateButton(page, 'week').click();
  await expect(picker(page).locator('option').first()).toHaveText(`No saved ${TEMPLATE_LABEL.activity} flyers yet`);
  await expect(picker(page)).toBeDisabled();
  await expect(button(page, 'Try again')).toHaveCount(0);
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
  const id = await poolPartyCopy(request, 'week spec switch');

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
  const { id } = await saveNew(page, keep);

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

test('the library filters by hostel and template together, and remembers both', async ({ page }) => {
  const both = '?hostel=duque-nest&template=week';
  // Each filter changes only once the list before it is in, so no answer can come back out of order here.
  await Promise.all([page.waitForResponse(apiCall('GET', 'flyers')), page.goto('/')]);
  await filterLibrary(page, 'Hostel', { label: 'Duque Nest' }, '?hostel=duque-nest');
  await filterLibrary(page, 'Template', { label: TEMPLATE_LABEL.week }, both);
  await expect(card(page, 'This week · Duque Nest')).toBeVisible();
  await expect(card(page, 'Pool party')).toHaveCount(0);
  await expect(card(page, 'This week · stress test')).toHaveCount(0);
  for (const meta of await page.locator('.card-meta').allTextContents()) expect(meta.startsWith(`Duque Nest · ${TEMPLATE_LABEL.week} · `), meta).toBe(true);

  const [again] = await Promise.all([page.waitForResponse(apiCall('GET', 'flyers', both)), page.reload()]);
  expect(again.status()).toBe(200);
  await expect(page.getByLabel('Hostel')).toHaveValue('duque-nest');
  await expect(page.getByLabel('Template')).toHaveValue('week');
});

test('the library shows the latest filter’s list, whatever order the answers come back in', async ({ page }) => {
  const release = await hold(page, apiRoute('flyers', '?hostel=duque-nest'));
  await Promise.all([page.waitForResponse(apiCall('GET', 'flyers')), page.goto('/')]);
  await page.getByLabel('Hostel').selectOption({ label: 'Duque Nest' });
  await page.getByLabel('Template').selectOption({ label: TEMPLATE_LABEL.week });
  await expect(card(page, 'This week · Duque Nest')).toBeVisible();

  // The earlier filter's answer lands last. An idle callback alone can run before it is back.
  const late = page.waitForResponse(apiCall('GET', 'flyers', '?hostel=duque-nest'));
  release();
  await (await late).finished();
  await page.evaluate(() => new Promise((resolve) => requestIdleCallback(resolve)));
  await expect(card(page, 'Pool party')).toHaveCount(0);
  await expect(card(page, 'This week · Duque Nest')).toBeVisible();
});

test('the share text: saved with the flyer, shown under the preview, copied as typed, and never printed', async ({ page }) => {
  test.setTimeout(120_000);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const share = '🐱‍🏍¡HOY tenemos plan al atardecer! 🧘‍♀️✨\n\n🕖 19:00 h\n📍 Zona de la piscina\n\n---\n\n🌅 TODAY we have a sunset plan!';
  const card = page.locator('.share');
  await page.goto('/#/new');
  await page.getByLabel('Library name').fill(`share spec ${Date.now()}`);
  await line1(page).fill('Stretching +');
  await modeButton(page, 'none').click();
  await expect(card, 'no caption, no box').toHaveCount(0);

  await page.getByLabel('Caption').fill(share);
  await expect(card.locator('.share-text')).toHaveText(share, { useInnerText: true });
  await button(page, 'Copy text').click();
  await expect(card.getByRole('status')).toHaveText('Copied');
  // On Windows the clipboard holds the platform's line breaks (CRLF), which is what a paste there expects.
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(share);

  const { id } = await saveNew(page, keep);
  expect(FlyerPayloadSchema.parse(await (await page.request.get(`/api/flyers/${id}`)).json()).flyer.data.share).toBe(share);

  // The same flyer with and without its caption prints the same pixels: it never reaches <Flyer>.
  const png = async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), button(page, 'Download PNG').click()]);
    return readFileSync(await download.path());
  };
  const withShare = await png();
  await page.getByLabel('Caption').fill('');
  await expect(card).toHaveCount(0);
  expect((await png()).equals(withShare), 'the export is the same without the caption').toBe(true);
});
