import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, apiCall, backToLibrary, filterLibrary, libraryCard as card, libraryFilter, librarySearch } from '../editor';
import { TEMPLATE_LABEL } from '../../src/editor/templates';
import { newFlyerData } from '../../src/shared/defaults';
import { FLYER_LABELS } from '../../src/shared/labels';
import { FlyerSavedSchema } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* The library's filters, its search and its view in its URL (src/editor/libraryUrl.ts; Artur's ask and answers,
   2026-10-15): a library link opens the same page for anyone, and becomes what that browser remembers. A filter, the
   view or Clear is a step in the history, so Back undoes it; typing rewrites the step on screen. A bare #/ is the
   library as remembered when it is opened, and every flyer when Back or Forward lands on it. */

test.use({ viewport: EDITOR_VIEWPORT });

const [LABEL] = FLYER_LABELS;
const HOSTEL = 'medano-nest';

const saved: number[] = [];
test.afterEach(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

/** A word no flyer of the seed holds: each test's own. */
const stampWord = () => `qx${Date.now().toString(36)}`;

/** A flyer of the test's own, with no photo: the newest, so among the library's first cards. */
async function save(request: APIRequestContext, title: string, labels: string[], hostel: string | null = null) {
  const data = { ...newFlyerData(), photoMode: 'none', labels };
  const res = await request.post('/api/flyers', { headers: WRITE_HEADERS, data: { title, hostel, template: 'activity', data, photoId: null } });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = FlyerSavedSchema.parse(await res.json());
  saved.push(id);
  return id;
}

const hashOf = (page: Page) => new URL(page.url()).hash;
const steps = (page: Page) => page.evaluate(() => history.length);
const titles = (page: Page) => page.locator('li.card .card-title').allTextContents();
const viewButton = (page: Page, name: 'List' | 'Grid') => page.getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true });
const remembered = (page: Page) =>
  page.evaluate(() => Object.fromEntries(['library.hostel', 'library.template', 'library.label', 'library.search', 'library.view'].map((key) => [key, localStorage.getItem(key)])));

/** The library's state on screen: the three selects, the box, and the view pressed. */
async function onScreen(page: Page, want: { hostel?: string; template?: string; label?: string; q?: string; view?: 'List' | 'Grid' }) {
  await expect(libraryFilter(page, 'Hostel')).toHaveValue(want.hostel ?? '');
  await expect(libraryFilter(page, 'Template')).toHaveValue(want.template ?? '');
  await expect(libraryFilter(page, 'Label')).toHaveValue(want.label ?? '');
  await expect(librarySearch(page)).toHaveValue(want.q ?? '');
  await expect(viewButton(page, want.view ?? 'List')).toHaveAttribute('aria-pressed', 'true');
}

/** Goes Back or Forward and waits for the list that step's filters ask for. */
async function step(page: Page, way: 'back' | 'forward', search: string) {
  await Promise.all([page.waitForResponse(apiCall('GET', 'flyers', search)), way === 'back' ? page.goBack() : page.goForward()]);
  await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);
}

/** A link opened in a fresh browser shows its state, and that state is what the browser remembers after. */
async function opensALink(page: Page, request: APIRequestContext) {
  const w = stampWord();
  const theOne = `${w} terrace`;
  await save(request, theOne, [LABEL.slug], HOSTEL);
  await save(request, `${w} other hostel`, [LABEL.slug]);
  await save(request, `${w} no label`, [], HOSTEL);
  const link = `#/?hostel=${HOSTEL}&label=${LABEL.slug}&q=${w}&view=grid`;

  await Promise.all([page.waitForResponse(apiCall('GET', 'flyers', `?hostel=${HOSTEL}&label=${LABEL.slug}`)), page.goto(`/${link}`)]);
  await onScreen(page, { hostel: HOSTEL, label: LABEL.slug, q: w, view: 'Grid' });
  await expect.poll(() => titles(page)).toEqual([theOne]);
  await expect(page.locator('ul.cards')).toHaveClass(/cards-grid/);
  expect(hashOf(page), 'the URL already says it').toBe(link);
  expect(await remembered(page)).toEqual({ 'library.hostel': HOSTEL, 'library.template': null, 'library.label': LABEL.slug, 'library.search': w, 'library.view': 'grid' });

  // The site opened with no hash is the library as remembered, and its URL says so by a replace.
  const before = await steps(page);
  await page.goto('/');
  await onScreen(page, { hostel: HOSTEL, label: LABEL.slug, q: w, view: 'Grid' });
  await expect.poll(() => hashOf(page)).toBe(link);
  await expect.poll(() => titles(page)).toEqual([theOne]);
  expect(await steps(page), 'the page loaded, and no step more').toBe(before + 1);
  return w;
}

test.describe('the library’s URL', () => {
  test('a link opens its filters, its box, its view and the list for them, and they are remembered after', async ({ page, request }) => {
    await opensALink(page, request);
  });

  test('choosing writes the URL; Back undoes the last choice and Forward redoes it', async ({ page, request }) => {
    const w = stampWord();
    const labelled = `${w} labelled`;
    await save(request, labelled, [LABEL.slug]);
    await Promise.all([page.waitForResponse(apiCall('GET', 'flyers')), page.goto('/')]);
    await expect.poll(() => hashOf(page), 'nothing chosen: the library’s own URL').toBe('#/');
    await expect(card(page, labelled)).toBeVisible();
    const all = (await titles(page)).length;

    await filterLibrary(page, 'Label', { value: LABEL.slug }, `?label=${LABEL.slug}`);
    expect(hashOf(page)).toBe(`#/?label=${LABEL.slug}`);
    await viewButton(page, 'Grid').click();
    await expect.poll(() => hashOf(page)).toBe(`#/?label=${LABEL.slug}&view=grid`);
    await filterLibrary(page, 'Template', { label: TEMPLATE_LABEL.week }, `?template=week&label=${LABEL.slug}`);
    expect(hashOf(page)).toBe(`#/?template=week&label=${LABEL.slug}&view=grid`);
    await expect(card(page, labelled)).toHaveCount(0);

    await step(page, 'back', `?label=${LABEL.slug}`);
    expect(hashOf(page)).toBe(`#/?label=${LABEL.slug}&view=grid`);
    await onScreen(page, { label: LABEL.slug, view: 'Grid' });
    await expect(card(page, labelled)).toBeVisible();
    expect((await remembered(page))['library.template'], 'Back is remembered as a choice is').toBe('');

    // The view is a step of its own: Back to the list asks the server for nothing.
    await page.goBack();
    await expect(viewButton(page, 'List')).toHaveAttribute('aria-pressed', 'true');
    expect(hashOf(page)).toBe(`#/?label=${LABEL.slug}`);
    await step(page, 'back', '');
    expect(hashOf(page)).toBe('#/');
    await onScreen(page, {});
    await expect.poll(async () => (await titles(page)).length).toBe(all);

    await step(page, 'forward', `?label=${LABEL.slug}`);
    await onScreen(page, { label: LABEL.slug });
    await page.goForward();
    await page.goForward();
    await expect(libraryFilter(page, 'Template')).toHaveValue('week');
    await onScreen(page, { template: 'week', label: LABEL.slug, view: 'Grid' });
    expect(await remembered(page)).toMatchObject({ 'library.template': 'week', 'library.label': LABEL.slug, 'library.view': 'grid' });
  });

  test('typing makes no step per letter; Clear is one step, and Forward redoes it', async ({ page }) => {
    await page.goto('/');
    await filterLibrary(page, 'Template', { label: TEMPLATE_LABEL.week }, '?template=week');
    const before = await steps(page);
    await librarySearch(page).pressSequentially('pool');
    await expect.poll(() => hashOf(page)).toBe('#/?template=week&q=pool');
    expect(await steps(page), 'four letters, no step').toBe(before);
    await librarySearch(page).press('Escape');
    await expect.poll(() => hashOf(page)).toBe('#/?template=week');
    await librarySearch(page).pressSequentially('pool');

    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect.poll(() => hashOf(page)).toBe('#/');
    expect(await steps(page), 'Clear is one step').toBe(before + 1);
    await onScreen(page, {});

    await step(page, 'back', '?template=week');
    expect(hashOf(page)).toBe('#/?template=week&q=pool');
    await onScreen(page, { template: 'week', q: 'pool' });
    // Forward lands on a bare #/ while the library is on screen: every flyer, as Clear left it.
    await step(page, 'forward', '');
    await onScreen(page, {});
    expect(hashOf(page)).toBe('#/');
    expect(await remembered(page)).toMatchObject({ 'library.template': '', 'library.search': '' });
  });

  test('a bare #/ opens the library as remembered, completed without a step: Back leaves the library', async ({ page }) => {
    await page.goto(`/#/?label=${LABEL.slug}&view=grid`);
    await onScreen(page, { label: LABEL.slug, view: 'Grid' });
    await page.goto('/#/new');
    await expect(backToLibrary(page)).toBeVisible();
    const before = await steps(page);

    await Promise.all([page.waitForResponse(apiCall('GET', 'flyers', `?label=${LABEL.slug}`)), backToLibrary(page).click()]);
    await onScreen(page, { label: LABEL.slug, view: 'Grid' });
    await expect.poll(() => hashOf(page)).toBe(`#/?label=${LABEL.slug}&view=grid`);
    expect(await steps(page), '← Library is one step, its completion none').toBe(before + 1);

    await page.goBack();
    await expect.poll(() => hashOf(page)).toBe('#/new');
    await expect(backToLibrary(page)).toBeVisible();
  });

  test('the bar’s Library, on the library, is every flyer: one step, which Back undoes', async ({ page }) => {
    await page.goto(`/#/?label=${LABEL.slug}`);
    await onScreen(page, { label: LABEL.slug });
    await Promise.all([page.waitForResponse(apiCall('GET', 'flyers')), page.locator('nest-nav').getByRole('link', { name: 'Library', exact: true }).click()]);
    expect(hashOf(page)).toBe('#/');
    await onScreen(page, {});
    await step(page, 'back', `?label=${LABEL.slug}`);
    await onScreen(page, { label: LABEL.slug });
  });

  test('a value off the list is ignored, and the URL is rewritten without it', async ({ page }) => {
    await page.goto('/');
    const before = await steps(page);
    await page.goto('/#/?hostel=nowhere-nest&template=poster&label=a-label-off-the-list&view=tiles&q=pool&utm_source=mail');
    await onScreen(page, { q: 'pool' });
    await expect.poll(() => hashOf(page)).toBe('#/?q=pool');
    expect(await steps(page)).toBe(before + 1);
    expect(await remembered(page)).toEqual({ 'library.hostel': null, 'library.template': null, 'library.label': null, 'library.search': 'pool', 'library.view': null });
  });

  test('into the editor and Back lands on the step it came from; "← Library" opens it as it was left', async ({ page, request }) => {
    const w = stampWord();
    const title = `${w} open me`;
    const id = await save(request, title, [LABEL.slug]);
    const link = `#/?label=${LABEL.slug}&q=${w}&view=grid`;
    await page.goto(`/${link}`);
    await expect.poll(() => titles(page)).toEqual([title]);

    await card(page, title).locator('a.card-main').click();
    await expect.poll(() => hashOf(page)).toBe(`#/flyers/${id}`);
    await expect(backToLibrary(page)).toBeVisible();
    await page.goBack();
    expect(hashOf(page)).toBe(link);
    await onScreen(page, { label: LABEL.slug, q: w, view: 'Grid' });
    await expect.poll(() => titles(page)).toEqual([title]);

    await card(page, title).locator('a.card-main').click();
    await expect(backToLibrary(page)).toBeVisible();
    await backToLibrary(page).click();
    await expect.poll(() => hashOf(page)).toBe(link);
    await onScreen(page, { label: LABEL.slug, q: w, view: 'Grid' });
    await expect.poll(() => titles(page)).toEqual([title]);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a link opens its state, and Back and Forward follow the choices', async ({ page, request }) => {
    const w = await opensALink(page, request);
    await filterLibrary(page, 'Hostel', { value: '' }, `?label=${LABEL.slug}`);
    expect(hashOf(page)).toBe(`#/?label=${LABEL.slug}&q=${w}&view=grid`);
    await step(page, 'back', `?hostel=${HOSTEL}&label=${LABEL.slug}`);
    await onScreen(page, { hostel: HOSTEL, label: LABEL.slug, q: w, view: 'Grid' });
    await step(page, 'forward', `?label=${LABEL.slug}`);
    await onScreen(page, { label: LABEL.slug, q: w, view: 'Grid' });
  });
});
