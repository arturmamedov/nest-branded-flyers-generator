import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, apiCall, backToLibrary, cardMore, filterLibrary, libraryCard as card, newFlyerNoPhoto, pickWay, saveNew, searchLibrary } from '../editor';
import { RECENT_PREF } from '../../src/editor/recentFlyers';
import { newFlyerData } from '../../src/shared/defaults';
import { FLYER_LABELS } from '../../src/shared/labels';
import { FlyerSavedSchema } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* The flyers this browser opened last, first in the library (src/editor/recentFlyers.ts; Artur's ask and answers,
   2026-10-15): the last 5, the last opened on top, then the rest newest first, each of the 5 with its own line,
   "Opened 2 h ago". Opened is the editor, and a card's ways out that worked. The order is taken when the list loads:
   nothing moves under the staff member's hand. */

test.use({ viewport: EDITOR_VIEWPORT });

const [LABEL] = FLYER_LABELS;

const saved: number[] = [];
test.afterEach(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

/** A word no flyer of the seed holds: each test's own. */
const stampWord = () => `qx${Date.now().toString(36)}`;

/** Flyers of the test's own, with no photo, saved in this order: the last is the newest, the library's first card. */
async function save(request: APIRequestContext, ...flyers: { title: string; share?: string; labels?: string[] }[]) {
  const ids: number[] = [];
  for (const f of flyers) {
    const data = { ...newFlyerData(), photoMode: 'none', share: f.share ?? '', labels: f.labels ?? [] };
    const res = await request.post('/api/flyers', { headers: WRITE_HEADERS, data: { title: f.title, hostel: null, template: 'activity', data, photoId: null } });
    expect(res.status(), await res.text()).toBe(201);
    const { id } = FlyerSavedSchema.parse(await res.json());
    saved.push(id);
    ids.push(id);
  }
  return ids;
}

const titles = (page: Page) => page.locator('li.card .card-title').allTextContents();
const opened = (page: Page, title: string) => card(page, title).locator('.card-opened');
const stored = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]') as { id: number; at: number }[], RECENT_PREF);

/** The library, its list on screen. */
async function library(page: Page, url = '/') {
  await Promise.all([page.waitForResponse(apiCall('GET', 'flyers')), page.goto(url)]);
  await expect(page.locator('li.card').first()).toBeVisible();
}

/** Opens a flyer in the editor from its card, and waits until the form holds it. */
async function openInEditor(page: Page, title: string) {
  await card(page, title).locator('a.card-main').click();
  await expect(page.getByLabel('Library name')).toHaveValue(title);
}

test.describe('the flyers opened last', () => {
  test('a flyer opened in the editor goes first with its line; the rest stay newest first, with none', async ({ page, request }) => {
    const w = stampWord();
    const [oldest, middle, newest] = [`${w} oldest`, `${w} middle`, `${w} newest`];
    const [oldestId] = await save(request, { title: oldest }, { title: middle }, { title: newest });
    await library(page);
    expect((await titles(page)).slice(0, 3)).toEqual([newest, middle, oldest]);
    await expect(page.locator('.card-opened')).toHaveCount(0);

    await openInEditor(page, oldest);
    await Promise.all([page.waitForResponse(apiCall('GET', 'flyers')), backToLibrary(page).click()]);
    expect((await titles(page)).slice(0, 3)).toEqual([oldest, newest, middle]);
    await expect(opened(page, oldest)).toHaveText('Opened just now');
    await expect(page.locator('.card-opened')).toHaveCount(1);
    expect((await stored(page)).map((r) => r.id)).toEqual([oldestId]);
  });

  test('the last 5 go first, the last opened on top; opened again it moves up, and the 6th falls back into place', async ({ page, request }) => {
    const w = stampWord();
    const names = [1, 2, 3, 4, 5, 6].map((n) => `${w} ${n}`);
    const ids = await save(request, ...names.map((title) => ({ title })));
    // Opened in the order 1 to 6, an hour apart: 6 is the last, and 1 has fallen off.
    const now = Date.now();
    await page.addInitScript(
      ({ key, value }) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      },
      { key: RECENT_PREF, value: JSON.stringify(ids.slice(1).reverse().map((id, i) => ({ id, at: now - (i + 1) * 3_600_000 }))) },
    );
    await library(page);
    expect((await titles(page)).slice(0, 5)).toEqual([names[5], names[4], names[3], names[2], names[1]]);
    await expect(opened(page, names[5])).toHaveText(/^Opened (1 h ago|yesterday)$/);
    await expect(opened(page, names[1])).toHaveText(/^Opened (5 h ago|yesterday)$/);
    await expect(opened(page, names[0]), 'the 6th opened: in its own place, with no line').toHaveCount(0);

    await openInEditor(page, names[2]);
    await Promise.all([page.waitForResponse(apiCall('GET', 'flyers')), backToLibrary(page).click()]);
    expect((await titles(page)).slice(0, 5)).toEqual([names[2], names[5], names[4], names[3], names[1]]);
    await expect(opened(page, names[2])).toHaveText('Opened just now');
  });

  test('a new flyer counts once it is first saved', async ({ page }) => {
    const title = `${stampWord()} brand new`;
    await newFlyerNoPhoto(page, { title });
    await saveNew(page, (id) => saved.push(id));
    await Promise.all([page.waitForResponse(apiCall('GET', 'flyers')), backToLibrary(page).click()]);
    expect((await titles(page))[0]).toBe(title);
    await expect(opened(page, title)).toHaveText('Opened just now');
  });

  test('a picture downloaded from a card counts; the card stays where it is until the list loads again', async ({ page, request }) => {
    const w = stampWord();
    const [older, newer] = [`${w} older`, `${w} newer`];
    const [olderId] = await save(request, { title: older }, { title: newer });
    await library(page);
    expect((await titles(page)).slice(0, 2)).toEqual([newer, older]);

    const [file] = await Promise.all([page.waitForEvent('download'), pickWay(card(page, older), 'png')]);
    await file.path();
    await expect.poll(async () => (await stored(page)).map((r) => r.id)).toEqual([olderId]);
    expect((await titles(page)).slice(0, 2), 'nothing moved under the hand').toEqual([newer, older]);

    await library(page);
    expect((await titles(page)).slice(0, 2)).toEqual([older, newer]);
    await expect(opened(page, older)).toHaveText('Opened just now');
  });

  test('a flyer archived from the library is taken off the list', async ({ page, request }) => {
    const title = `${stampWord()} to archive`;
    const [id] = await save(request, { title });
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: RECENT_PREF, value: JSON.stringify([{ id, at: Date.now() }]) });
    await library(page);
    await expect(opened(page, title)).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await Promise.all([page.waitForResponse(apiCall('DELETE', `flyers/${id}`)), cardMore(card(page, title), 'Archive')]);
    await expect(card(page, title)).toHaveCount(0);
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), RECENT_PREF)).toBe('[]');
  });

  test('with a filter, the recent ones among what is left go first', async ({ page, request }) => {
    const w = stampWord();
    const [labelledOld, labelledNew, bare] = [`${w} labelled old`, `${w} labelled new`, `${w} bare`];
    const [oldId, , bareId] = await save(request, { title: labelledOld, labels: [LABEL.slug] }, { title: labelledNew, labels: [LABEL.slug] }, { title: bare });
    await page.addInitScript(
      ({ key, value }) => localStorage.setItem(key, value),
      { key: RECENT_PREF, value: JSON.stringify([{ id: bareId, at: Date.now() }, { id: oldId, at: Date.now() - 60_000 }]) },
    );
    await library(page);
    await filterLibrary(page, 'Label', { value: LABEL.slug }, `?label=${LABEL.slug}`);
    expect((await titles(page)).slice(0, 2)).toEqual([labelledOld, labelledNew]);
    await expect(opened(page, labelledOld)).toHaveText('Opened 1 min ago');
  });

  test('with a search, the search’s rank stands, and within a rank the recent ones come first', async ({ page, request }) => {
    const w = stampWord();
    const [byShare, nameOld, nameNew] = [`Shared ${[...w].reverse().join('')}`, `${w} name old`, `${w} name new`];
    const [shareId, oldId] = await save(request, { title: byShare, share: `Come along: ${w} tonight.` }, { title: nameOld }, { title: nameNew });
    await page.addInitScript(
      ({ key, value }) => localStorage.setItem(key, value),
      { key: RECENT_PREF, value: JSON.stringify([{ id: shareId, at: Date.now() }, { id: oldId, at: Date.now() - 60_000 }]) },
    );
    await library(page);
    await searchLibrary(page, `${w} `);
    // byShare's name does not hold the word: it is found by its share text alone, so it ranks after both names.
    await expect.poll(() => titles(page)).toEqual([nameOld, nameNew, byShare]);
    await expect(opened(page, byShare)).toHaveText('Opened just now');
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the line is under the meta line in the grid too', async ({ page, request }) => {
    const title = `${stampWord()} phone`;
    const [id] = await save(request, { title });
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: RECENT_PREF, value: JSON.stringify([{ id, at: Date.now() - 2 * 3_600_000 }]) });
    await library(page, '/#/?view=grid');
    expect((await titles(page))[0]).toBe(title);
    const line = opened(page, title);
    await expect(line).toHaveText(/^Opened (2 h ago|yesterday)$/);
    const [meta, mine] = [await card(page, title).locator('.card-meta').boundingBox(), await line.boundingBox()];
    expect(Math.abs(mine!.x - meta!.x), 'a line of its own: it starts where the meta line does').toBeLessThan(1);
    expect(mine!.y, 'under the meta line’s words').toBeGreaterThan(meta!.y + 10);
    expect(mine!.y + mine!.height, 'its last line').toBeLessThanOrEqual(meta!.y + meta!.height + 1);
    expect(mine!.height, 'one line').toBeLessThan(24);
  });
});
