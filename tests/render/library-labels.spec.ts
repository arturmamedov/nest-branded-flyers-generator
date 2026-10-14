import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, apiCall, apiRoute, filterLibrary, hold, libraryCard as card, libraryFilter } from '../editor';
import { LABEL_FILTER_OPTIONS, LABEL_PREF } from '../../src/editor/libraryLabel';
import { VIEW_PREF } from '../../src/editor/libraryView';
import { newFlyerData } from '../../src/shared/defaults';
import { FLYER_LABELS, NO_LABEL } from '../../src/shared/labels';
import { FlyerSavedSchema } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* A flyer's labels in the library (the owner's ask, 2026-10-13: "one filter more in the flyers", and his picks from
   pictures on 2026-10-14): a third filter, "Label", which the server answers; each card's labels as pills under its
   line; and a top that fits three filters, two to a row on a phone. No grouping: he saw it drawn and did not want it. */

test.use({ viewport: EDITOR_VIEWPORT });

const [FIRST, SECOND] = FLYER_LABELS;

const saved: number[] = [];
test.afterEach(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

/** A flyer of this spec's own with these labels, saved through the API: the newest, so among the library's first cards. */
async function save(request: APIRequestContext, name: string, labels: string[], hostel: string | null = null) {
  const title = `${name} ${Date.now()}-${saved.length}`;
  const data = { ...newFlyerData(), photoMode: 'none', labels };
  const res = await request.post('/api/flyers', { headers: WRITE_HEADERS, data: { title, hostel, template: 'activity', data, photoId: null } });
  expect(res.status(), await res.text()).toBe(201);
  saved.push(FlyerSavedSchema.parse(await res.json()).id);
  return title;
}

const labelFilter = (page: Page) => libraryFilter(page, 'Label');
const pills = (c: Locator) => c.locator('.card-labels .card-label');
const box = async (l: Locator) => (await l.boundingBox())!;

test.describe('the filter by label', () => {
  test('it lists one label’s flyers, or the ones with none: the server is asked, and the choice is remembered', async ({ page, request }) => {
    const both = await save(request, 'both labels', [FIRST.slug, SECOND.slug]);
    const one = await save(request, 'one label', [SECOND.slug]);
    const bare = await save(request, 'no label', []);
    await Promise.all([page.waitForResponse(apiCall('GET', 'flyers')), page.goto('/')]);
    await expect(labelFilter(page)).toHaveValue('');

    await filterLibrary(page, 'Label', { label: SECOND.name }, `?label=${SECOND.slug}`);
    await expect(card(page, both)).toBeVisible();
    await expect(card(page, one)).toBeVisible();
    await expect(card(page, bare)).toHaveCount(0);
    await expect(card(page, 'Pool party'), 'no seeded flyer has it').toHaveCount(0);

    await filterLibrary(page, 'Label', { label: FIRST.name }, `?label=${FIRST.slug}`);
    await expect(card(page, both)).toBeVisible();
    await expect(card(page, one)).toHaveCount(0);

    await filterLibrary(page, 'Label', { label: 'No label' }, `?label=${NO_LABEL}`);
    await expect(card(page, bare)).toBeVisible();
    await expect(card(page, 'Pool party')).toBeVisible();
    await expect(card(page, both)).toHaveCount(0);

    // Remembered, next to the other two filters.
    const [again] = await Promise.all([page.waitForResponse(apiCall('GET', 'flyers', `?label=${NO_LABEL}`)), page.reload()]);
    expect(again.status()).toBe(200);
    await expect(labelFilter(page)).toHaveValue(NO_LABEL);
    await filterLibrary(page, 'Label', { label: 'All labels' }, '');
    await expect(card(page, both)).toBeVisible();
    await expect(card(page, bare)).toBeVisible();
  });

  test('it works with the other two filters at once', async ({ page, request }) => {
    const here = await save(request, 'duque labelled', [FIRST.slug], 'duque-nest');
    const chain = await save(request, 'chain labelled', [FIRST.slug]);
    await Promise.all([page.waitForResponse(apiCall('GET', 'flyers')), page.goto('/')]);
    await filterLibrary(page, 'Hostel', { label: 'Duque Nest' }, '?hostel=duque-nest');
    await filterLibrary(page, 'Label', { label: FIRST.name }, `?hostel=duque-nest&label=${FIRST.slug}`);
    await expect(card(page, here)).toBeVisible();
    await expect(card(page, chain)).toHaveCount(0);
    await filterLibrary(page, 'Template', { value: 'week' }, `?hostel=duque-nest&template=week&label=${FIRST.slug}`);
    await expect(page.getByText('No flyers here yet.')).toBeVisible();
  });

  test('it offers every flyer, the ones with no label, then each label by its name', async ({ page }) => {
    await page.goto('/');
    expect(await labelFilter(page).locator('option').evaluateAll((options) => options.map((o) => ({ value: (o as HTMLOptionElement).value, text: o.textContent })))).toEqual(LABEL_FILTER_OPTIONS);
  });

  test('a remembered label that is no longer on the list is ignored: every flyer is listed', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, 'a-label-taken-off-the-list'), LABEL_PREF);
    const [res] = await Promise.all([page.waitForResponse(apiCall('GET', 'flyers')), page.goto('/')]);
    expect(res.status()).toBe(200);
    await expect(labelFilter(page)).toHaveValue('');
    await expect(card(page, 'Pool party')).toBeVisible();
  });

  test('it shows the latest choice’s list, whatever order the answers come back in', async ({ page, request }) => {
    const one = await save(request, 'late answer', [FIRST.slug]);
    const release = await hold(page, apiRoute('flyers', `?label=${FIRST.slug}`));
    await Promise.all([page.waitForResponse(apiCall('GET', 'flyers')), page.goto('/')]);
    await labelFilter(page).selectOption({ label: FIRST.name });
    await labelFilter(page).selectOption({ label: 'No label' });
    await expect(card(page, 'Pool party')).toBeVisible();
    const late = page.waitForResponse(apiCall('GET', 'flyers', `?label=${FIRST.slug}`));
    release();
    await (await late).finished();
    await page.evaluate(() => new Promise((resolve) => requestIdleCallback(resolve)));
    await expect(card(page, one)).toHaveCount(0);
    await expect(card(page, 'Pool party')).toBeVisible();
  });
});

test.describe('the top of the library', () => {
  test('on a desktop the name and List / Grid share a row, and the three filters the next, in their order', async ({ page }) => {
    await page.goto('/');
    await expect(card(page, 'Pool party')).toBeVisible();
    const [title, views, hostel, template, label] = await Promise.all([
      box(page.getByRole('heading', { name: 'Flyer library' })),
      box(page.getByRole('group', { name: 'View' })),
      box(libraryFilter(page, 'Hostel')),
      box(libraryFilter(page, 'Template')),
      box(labelFilter(page)),
    ]);
    const middle = (b: { y: number; height: number }) => b.y + b.height / 2;
    expect(Math.abs(middle(title) - middle(views)), 'the name and the switch on one row').toBeLessThan(8);
    expect(views.x, 'the switch at the right').toBeGreaterThan(title.x + title.width);
    for (const select of [template, label]) expect(Math.abs(middle(select) - middle(hostel)), 'the filters on one row').toBeLessThan(4);
    expect(hostel.y, 'under the name').toBeGreaterThan(title.y + title.height);
    expect(hostel.x).toBeLessThan(template.x);
    expect(template.x).toBeLessThan(label.x);
    // Each keeps its word beside it.
    for (const word of ['Hostel', 'Template', 'Label']) await expect(page.locator('.library-filters .filter > span', { hasText: new RegExp(`^${word}$`) })).toBeVisible();
  });

  test('on a phone the filters are two to a row, each named by its first choice, and the cards start where they did', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');
    const first = page.locator('li.card').first();
    await expect(first).toBeVisible();
    const [hostel, template, label] = await Promise.all([box(libraryFilter(page, 'Hostel')), box(libraryFilter(page, 'Template')), box(labelFilter(page))]);
    expect(Math.abs(hostel.y - template.y), 'Hostel and Template share a row').toBeLessThan(2);
    expect(template.x).toBeGreaterThan(hostel.x + hostel.width - 1);
    expect(label.y, 'Label on the next').toBeGreaterThan(hostel.y + hostel.height - 1);
    expect(Math.abs(label.x - hostel.x)).toBeLessThan(2);
    for (const select of [hostel, template, label]) {
      expect(select.x).toBeGreaterThanOrEqual(0);
      expect(select.x + select.width, 'inside the screen').toBeLessThanOrEqual(360);
    }
    // The words are not drawn there, and are still each select's name: asked of the accessibility tree, since a
    // word hidden the wrong way (display or visibility) would take the name with it (found in review).
    for (const word of ['Hostel', 'Template', 'Label']) {
      const span = page.locator('.library-filters .filter > span', { hasText: new RegExp(`^${word}$`) });
      expect((await box(span)).width, `${word} takes no room`).toBeLessThanOrEqual(1);
      await expect(page.getByRole('combobox', { name: word, exact: true }), `a select named ${word}`).toHaveCount(1);
    }
    expect(await libraryFilter(page, 'Hostel').locator('option').first().textContent()).toBe('All hostels');
    expect(await libraryFilter(page, 'Template').locator('option').first().textContent()).toBe('All templates');
    expect(await labelFilter(page).locator('option').first().textContent()).toBe('All labels');
    // Four rows over the cards, as before the third filter: the name, the switch, and two rows of filters.
    expect((await box(first)).y, 'the first card is no lower than it was').toBeLessThanOrEqual(290);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'nothing scrolls sideways').toBe(true);
    expect(await page.locator('.library').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
});

test.describe('a card’s labels', () => {
  test('are pills under its line, the listed ones in the list’s order; a flyer with none has no pills', async ({ page, request }) => {
    const both = await save(request, 'two pills', [SECOND.slug, FIRST.slug]);
    const hidden = await save(request, 'one hidden', ['a-label-taken-off-the-list', SECOND.slug]);
    const bare = await save(request, 'no pills', []);
    await page.goto('/');
    await expect(pills(card(page, both))).toHaveText([FIRST.name, SECOND.name]);
    // A label off the list is stored, and on no screen.
    await expect(pills(card(page, hidden))).toHaveText([SECOND.name]);
    await expect(card(page, bare).locator('.card-labels')).toHaveCount(0);
    // Under the card's line, and no part of it: the line still reads hostel · template · date.
    const c = card(page, both);
    expect((await box(c.locator('.card-labels'))).y).toBeGreaterThanOrEqual((await box(c.locator('.card-meta'))).y + (await box(c.locator('.card-meta'))).height - 1);
    expect(await c.locator('.card-meta').textContent()).toMatch(/^All hostels · Activity · /);
    expect(await c.locator('.card-meta').textContent()).not.toContain(FIRST.name);
  });

  test('come with the list, before the card’s own flyer: the card’s box does not change when its picture lands', async ({ page, request }) => {
    const title = await save(request, 'pills first', [FIRST.slug, SECOND.slug]);
    const id = saved.at(-1)!;
    const release = await hold(page, apiRoute(`flyers/${id}`));
    await page.goto('/');
    const c = card(page, title);
    await expect(pills(c)).toHaveText([FIRST.name, SECOND.name]);
    await expect(c.locator('.card-thumb-ready')).toHaveCount(0);
    const before = await box(c);
    release();
    await expect(c.locator('.card-thumb-ready')).toHaveCount(1);
    expect(await box(c)).toEqual(before);
  });

  test('wrap inside the card in the grid, on a desktop and on a phone, and nothing scrolls sideways', async ({ page, request }) => {
    const title = await save(request, 'grid pills', FLYER_LABELS.slice(0, 5).map((l) => l.slug));
    await page.addInitScript((key) => localStorage.setItem(key, 'grid'), VIEW_PREF);
    for (const width of [EDITOR_VIEWPORT.width, 360]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      const c = card(page, title);
      await expect(pills(c)).toHaveCount(5);
      const inside = await box(c);
      for (const pill of await pills(c).all()) {
        const p = await box(pill);
        expect(p.x, `${width}: a pill starts inside its card`).toBeGreaterThanOrEqual(inside.x);
        expect(p.x + p.width, `${width}: and ends inside it`).toBeLessThanOrEqual(inside.x + inside.width);
      }
      expect(await page.locator('.library').evaluate((el) => el.scrollWidth <= el.clientWidth), `${width}: nothing scrolls sideways`).toBe(true);
    }
  });
});
