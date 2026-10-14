import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, apiRoute, filterLibrary, libraryCard as card, libraryFilter, librarySearch, searchLibrary } from '../editor';
import { TEMPLATE_LABEL } from '../../src/editor/templates';
import { newFlyerData } from '../../src/shared/defaults';
import { FlyerPayloadSchema, FlyerSavedSchema, type FlyerData, type FlyerListItem } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* The library's search box (src/editor/librarySearch.ts, libraryFlyers.ts): it narrows the list the filters gave and
   orders it by where the words are (the name, a label, the share text, the rest), reading each flyer's own answer
   once, the cards' and the search's together. The server is the render suite's, seeded with the sample flyers; each
   test saves flyers of its own, found by a word no other flyer holds. */

test.use({ viewport: EDITOR_VIEWPORT });

const saved: number[] = [];
test.afterEach(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

/** A word no flyer of the seed holds: each test's own. */
const stampWord = () => `qx${Date.now().toString(36)}`;

interface Own {
  title: string;
  labels?: string[];
  share?: string;
  headlineEs?: string;
  template?: 'activity' | 'week';
  week?: FlyerData['week'];
}

/** A flyer of the test's own, with no photo: the newest, so the library's first card. */
async function save(request: APIRequestContext, own: Own): Promise<number> {
  const template = own.template ?? 'activity';
  const blank = newFlyerData(template);
  const data = { ...blank, photoMode: 'none', share: own.share ?? '', labels: own.labels ?? [], week: own.week ?? blank.week, text: { ...blank.text, headlineEs: own.headlineEs ?? blank.text.headlineEs } };
  const res = await request.post('/api/flyers', { headers: WRITE_HEADERS, data: { title: own.title, hostel: null, template, data, photoId: null } });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = FlyerSavedSchema.parse(await res.json());
  saved.push(id);
  return id;
}

const flyers = async (page: Page) => (await (await page.request.get('/api/flyers')).json()) as FlyerListItem[];
const titles = (page: Page) => page.locator('li.card .card-title').allTextContents();
/** The polite line that says how many flyers the search found. */
const count = (page: Page) => page.locator('.library-count[role="status"]');
const reading = (page: Page) => page.getByText(/^Reading the flyers…/);

/** The flyers' answers the page asks for, by id, from now on. */
function askedFor(page: Page): number[] {
  const asked: number[] = [];
  page.on('request', (r) => {
    const id = /\/api\/flyers\/(\d+)$/.exec(new URL(r.url()).pathname);
    if (id && r.method() === 'GET') asked.push(Number(id[1]));
  });
  return asked;
}

test.describe('the search box', () => {
  test('narrows the list and orders it: the name, then a label, then the share text, then the rest', async ({ page, request }) => {
    const w = stampWord();
    // Saved in the opposite order: the newest is first in the library, the search puts it last.
    await save(request, { title: `${w} in the name`, share: 'dinners' });
    await save(request, { title: 'Found by a label', labels: ['dinners'], headlineEs: w });
    await save(request, { title: 'Found by the share text', share: `${w} and dinners` });
    await save(request, { title: 'Found by the copy', headlineEs: `${w} dinners` });
    const all = await flyers(page);
    await page.goto('/');
    await expect(page.locator('li.card')).toHaveCount(all.length);
    const lists: string[] = [];
    page.on('request', (r) => r.method() === 'GET' && new URL(r.url()).pathname.endsWith('/api/flyers') && lists.push(r.url()));
    await searchLibrary(page, `${w} dinners`);
    await expect.poll(() => titles(page)).toEqual([`${w} in the name`, 'Found by a label', 'Found by the share text', 'Found by the copy']);
    await expect(count(page)).toHaveText(`4 of ${all.length} flyers`);
    await expect(reading(page)).toHaveCount(0);
    expect(lists, 'the list is never asked for again').toEqual([]);

    // Case and accents: the same flyers.
    await searchLibrary(page, `${w.toUpperCase()} DÍNNERS`);
    await expect.poll(() => titles(page)).toEqual([`${w} in the name`, 'Found by a label', 'Found by the share text', 'Found by the copy']);
  });

  test('searches from three characters: fewer leaves the list as it is', async ({ page }) => {
    const all = await flyers(page);
    await page.goto('/');
    await expect(page.locator('li.card')).toHaveCount(all.length);
    await librarySearch(page).fill('Po');
    await expect(page.locator('li.card')).toHaveCount(all.length);
    await expect(count(page)).toHaveText('');
    await librarySearch(page).fill('Poo');
    // The name first; the week flyer's "Saturday is a pool party" row after it.
    await expect.poll(async () => (await titles(page))[0]).toBe('Pool party');
    await expect.poll(async () => (await titles(page)).length).toBeLessThan(all.length);
  });

  test('is cleared by Escape, and Clear empties it and sets the filters back to all', async ({ page, request }) => {
    const w = stampWord();
    await save(request, { title: `${w} night` });
    const all = await flyers(page);
    await page.goto('/');
    const clear = page.getByRole('button', { name: 'Clear', exact: true });
    await expect(clear, 'nothing to clear').toBeHidden();

    await searchLibrary(page, w);
    await expect.poll(() => titles(page)).toEqual([`${w} night`]);
    await librarySearch(page).press('Escape');
    await expect(librarySearch(page)).toHaveValue('');
    await expect(page.locator('li.card')).toHaveCount(all.length);

    await filterLibrary(page, 'Template', { label: TEMPLATE_LABEL.activity }, '?template=activity');
    await expect(clear, 'a filter is set').toBeVisible();
    await searchLibrary(page, w);
    await clear.click();
    await expect(librarySearch(page)).toHaveValue('');
    await expect(libraryFilter(page, 'Template')).toHaveValue('');
    await expect(page.locator('li.card')).toHaveCount(all.length);
    await expect(clear).toBeHidden();
  });

  test('is remembered, like the filters', async ({ page, request }) => {
    const w = stampWord();
    await save(request, { title: `${w} remembered` });
    await page.goto('/');
    await searchLibrary(page, w);
    await page.reload();
    await expect(librarySearch(page)).toHaveValue(w);
    await expect.poll(() => titles(page)).toEqual([`${w} remembered`]);
  });

  test('says when no flyer matches, and that the filters are on; its button clears them', async ({ page, request }) => {
    const w = stampWord();
    await save(request, { title: `${w} pool` });
    const all = await flyers(page);
    await page.goto('/');
    await searchLibrary(page, `${w} nothing`);
    await expect(page.getByText(`No flyer matches “${w} nothing”.`, { exact: true })).toBeVisible();
    await expect(page.locator('li.card')).toHaveCount(0);
    await expect(count(page)).toHaveText(`0 of ${all.length} flyers`);
    await page.getByRole('button', { name: 'Clear the search', exact: true }).click();
    await expect(page.locator('li.card')).toHaveCount(all.length);

    await filterLibrary(page, 'Template', { label: TEMPLATE_LABEL.week }, '?template=week');
    await searchLibrary(page, w);
    await expect(page.getByText(`No flyer matches “${w}” with these filters.`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Clear the search and filters', exact: true }).click();
    await expect(libraryFilter(page, 'Template')).toHaveValue('');
    await expect(page.locator('li.card')).toHaveCount(all.length);
  });
});

test.describe('the flyers the search reads', () => {
  test('are each asked for once in a visit, the cards’ and the search’s together', async ({ page }) => {
    const all = await flyers(page);
    const asked = askedFor(page);
    await page.goto('/');
    await expect(page.locator('li.card .card-thumb-ready').first()).toBeVisible();
    await searchLibrary(page, 'reception');
    await expect(reading(page)).toHaveCount(0);
    await expect.poll(() => new Set(asked).size).toBe(all.length);
    // Every card brought to the screen, the search's answers drawn.
    await librarySearch(page).fill('');
    for (const f of all) await card(page, f.title).scrollIntoViewIfNeeded();
    await expect(page.locator('li.card .card-thumb-ready')).toHaveCount(all.length);
    expect(asked.length, 'no flyer asked for twice').toBe(all.length);
  });

  test('come in while the line says how many are read, and the matches join as they come', async ({ page, request }) => {
    const w = stampWord();
    const id = await save(request, { title: 'Read late', share: `found by ${w}` });
    const all = await flyers(page);
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(apiRoute(`flyers/${id}`), async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/');
    await searchLibrary(page, w);
    await expect(reading(page)).toHaveText(new RegExp(`^Reading the flyers… \\d+ of ${all.length}$`));
    await expect(page.locator('li.card')).toHaveCount(0);
    await expect(page.getByText(/^No flyer matches/), 'not until every flyer is read').toHaveCount(0);
    release();
    await expect.poll(() => titles(page)).toEqual(['Read late']);
    await expect(reading(page)).toHaveCount(0);
  });

  test('a flyer saved since is read again', async ({ page, request }) => {
    const [w, later] = [stampWord(), `${stampWord()}z`];
    const id = await save(request, { title: `${w} before`, share: 'first words' });
    const asked = askedFor(page);
    await page.goto('/');
    await searchLibrary(page, w);
    await expect.poll(() => titles(page)).toEqual([`${w} before`]);
    await expect(reading(page)).toHaveCount(0);

    const { flyer } = FlyerPayloadSchema.parse(await (await request.get(`/api/flyers/${id}`)).json());
    const put = await request.put(`/api/flyers/${id}`, { headers: WRITE_HEADERS, data: { title: flyer.title, hostel: flyer.hostel, template: flyer.template, data: { ...flyer.data, share: `now ${later}` }, photoId: flyer.photoId } });
    expect(put.status(), await put.text()).toBe(200);
    // The list is loaded again, as a filter does.
    await filterLibrary(page, 'Template', { label: TEMPLATE_LABEL.activity }, '?template=activity');
    await searchLibrary(page, later);
    await expect.poll(() => titles(page)).toEqual([`${w} before`]);
    expect(asked.filter((a) => a === id).length, 'asked for again once it was saved').toBe(2);
  });

  test('a flyer that cannot load is searched by its list fields alone', async ({ page, request }) => {
    const w = stampWord();
    const id = await save(request, { title: `${w} broken`, share: `${w}share` });
    await page.route(apiRoute(`flyers/${id}`), (route) => route.fulfill({ status: 500, body: '{"error":"server_error"}' }));
    await page.goto('/');
    await searchLibrary(page, `${w}share`);
    await expect(page.getByText(`No flyer matches “${w}share”.`, { exact: true })).toBeVisible();
    await searchLibrary(page, `${w} broken`);
    await expect.poll(() => titles(page)).toEqual([`${w} broken`]);
  });

  test('cards far down still draw only when scrolled to', async ({ page }) => {
    const all = await flyers(page);
    expect(all.length, 'enough cards to scroll past the screen').toBeGreaterThanOrEqual(8);
    await page.goto('/');
    // Every flyer is found by the line every new flyer's ask holds.
    await searchLibrary(page, 'reception');
    await expect(reading(page)).toHaveCount(0);
    const cards = page.locator('li.card');
    const last = cards.last();
    await expect(last.locator('[data-flyer]'), 'read, not drawn').toHaveCount(0);
    await last.scrollIntoViewIfNeeded();
    await expect(last.locator('.card-thumb-ready')).toBeVisible();
  });
});

test.describe('on a phone', () => {
  for (const width of [390, 360]) {
    test(`at ${width} px the box is a row of its own above the filters, and nothing scrolls sideways`, async ({ page, request }) => {
      await page.setViewportSize({ width, height: 800 });
      const w = stampWord();
      await save(request, { title: 'Found on a phone', share: `A long caption that runs on and on, past the card's edge, with ${w} in it and more after that.` });
      await page.goto('/');
      await searchLibrary(page, w);
      await expect.poll(() => titles(page)).toEqual(['Found on a phone']);
      const box = (await librarySearch(page).boundingBox())!;
      const hostel = (await libraryFilter(page, 'Hostel').boundingBox())!;
      expect(box.y + box.height, 'above the filters').toBeLessThanOrEqual(hostel.y);
      expect(box.width, 'most of the row').toBeGreaterThan(width * 0.6);
      expect(await page.locator('.library').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      const c = card(page, 'Found on a phone');
      const why = c.locator('.card-why');
      await expect(why).toBeVisible();
      const [line, cardBox] = [(await why.boundingBox())!, (await c.boundingBox())!];
      expect(line.height, 'one line').toBeLessThan(24);
      expect(line.x + line.width, 'inside the card').toBeLessThanOrEqual(cardBox.x + cardBox.width);
    });
  }
});

/** The text of a card's marks, in order. */
const marks = (within: Locator) => within.locator('mark').allTextContents();

test.describe('the marks and the “why” line', () => {
  test('mark the words in the name, the labels and the meta line; the names of the link and the zoom button stay', async ({ page, request }) => {
    const w = stampWord();
    await save(request, { title: `Dinner ${w}`, labels: ['dinners', 'beach'] });
    await page.goto('/');
    await searchLibrary(page, `${w} dinner`);
    const c = card(page, `Dinner ${w}`);
    await expect.poll(() => marks(c.locator('.card-title'))).toEqual(['Dinner', w]);
    expect(await marks(c.locator('.card-labels'))).toEqual(['Dinner']);
    await expect(c.locator('.card-label')).toHaveText(['Dinners', 'Beach']);
    await expect(c.locator('.card-why')).toHaveCount(0);
    await expect(c.getByRole('link')).toHaveAccessibleName(new RegExp(`^Dinner ${w} `));
    await expect(c.getByRole('button', { name: `Zoom in on Dinner ${w}`, exact: true })).toHaveCount(1);

    await searchLibrary(page, `${w} all hostels`);
    await expect.poll(() => marks(c.locator('.card-meta'))).toEqual(['All', 'hostels']);
    await expect(c.locator('.card-why')).toHaveCount(0);
  });

  test('says why a flyer is there when its card shows none of the words, in the editor’s words', async ({ page, request }) => {
    const w = stampWord();
    await save(request, { title: 'Stargazing', share: `Join us on Saturday for a slow walk up the old trail, a ${w} over the clouds, and a long dinner at the hut.` });
    await save(request, { title: 'Our week', template: 'week', week: [{ day: 'Saturdays', name: `Catamaran ${w}`, time: '18:30', cost: '55€' }] });
    await page.goto('/');
    await searchLibrary(page, w);
    await expect.poll(() => titles(page)).toEqual(['Stargazing', 'Our week']);
    const share = card(page, 'Stargazing').locator('.card-why');
    await expect(share.locator('.card-why-field')).toHaveText('Share text:');
    await expect(share).toContainText(`…old trail, a ${w} over`);
    expect(await marks(share)).toEqual([w]);
    const rows = card(page, 'Our week').locator('.card-why');
    await expect(rows.locator('.card-why-field')).toHaveText('This week’s rows:');
    await expect(rows).toContainText(`…Catamaran ${w} · 18:30 · 55€`);
  });
});
