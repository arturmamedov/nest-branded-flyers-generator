import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, apiCall, apiRoute, cardMore, libraryCard as card, openSection, saveNew, sectionHead, status } from '../editor';
import { FIELD } from '../../src/editor/fields';
import { newFlyerData } from '../../src/shared/defaults';
import { FLYER_LABELS, LABELS_MAX } from '../../src/shared/labels';
import { FIRST_LOOK } from '../../src/shared/looks';
import { FlyerSavedSchema } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* A flyer's labels in the editor (the flyers' labels, 2026-10-14): a row of buttons in the "Flyer" section, one a
   label, pressed for the ones the flyer carries. Never printed; saved with the flyer in the list's order. The
   library's side is library-labels.spec.ts. */

test.use({ viewport: EDITOR_VIEWPORT });

const [FIRST, SECOND, THIRD] = FLYER_LABELS;

const saved: number[] = [];
const keep = (id: number) => saved.push(id);
test.afterEach(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

/** A saved flyer of this spec's own with these labels, made through the API. */
async function savedFlyer(request: APIRequestContext, labels: string[]) {
  const title = `labels spec ${Date.now()}-${saved.length}`;
  const data = { ...newFlyerData(), photoMode: 'none', labels };
  const res = await request.post('/api/flyers', { headers: WRITE_HEADERS, data: { title, hostel: null, template: 'activity', data, photoId: null } });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = FlyerSavedSchema.parse(await res.json());
  keep(id);
  return { id, title };
}

const picker = (page: Page) => page.getByRole('group', { name: FIELD.labels, exact: true });
const pick = (page: Page, name: string) => picker(page).getByRole('button', { name, exact: true });
/** The names of the pressed labels, in the picker's order. */
const pressed = (page: Page) => picker(page).locator('button[aria-pressed="true"]').allTextContents();

/** Saves the open flyer and answers what was sent. */
async function save(page: Page): Promise<{ data: { labels: string[] } }> {
  const [res] = await Promise.all([page.waitForResponse(apiCall('PUT', `flyers/${new URL(page.url()).hash.split('/').pop()}`)), page.getByRole('button', { name: 'Save', exact: true }).click()]);
  expect(res.status(), await res.text()).toBe(200);
  await expect(status(page)).toHaveText('Saved');
  return res.request().postDataJSON() as { data: { labels: string[] } };
}

test('the Flyer section lists every label as a button; a pressed one is saved with the flyer, in the list’s order', async ({ page, request }) => {
  const { id } = await savedFlyer(request, []);
  await page.goto(`/#/flyers/${id}`);
  await openSection(page, FIELD.flyer);
  await expect(picker(page).getByRole('button')).toHaveText(FLYER_LABELS.map((l) => l.name));
  expect(await pressed(page)).toEqual([]);
  await expect(status(page)).toHaveText('Saved');

  // Picked in the other order than the list's.
  await pick(page, THIRD.name).click();
  await expect(pick(page, THIRD.name)).toHaveAttribute('aria-pressed', 'true');
  await expect(status(page)).toHaveText('Unsaved changes');
  await pick(page, FIRST.name).click();
  expect(await pressed(page)).toEqual([FIRST.name, THIRD.name]);
  expect((await save(page)).data.labels).toEqual([FIRST.slug, THIRD.slug]);

  // Kept: the flyer opens with them pressed (the section is open, as it was left), and closed it names them.
  await page.reload();
  await expect(sectionHead(page, FIELD.flyer)).toHaveAttribute('aria-expanded', 'true');
  expect(await pressed(page)).toEqual([FIRST.name, THIRD.name]);
  await expect(status(page)).toHaveText('Saved');
  await sectionHead(page, FIELD.flyer).click();
  await expect(sectionHead(page, FIELD.flyer).locator('.section-line')).toHaveText(`Activity · All hostels · ${FIRST.name}, ${THIRD.name}`);
});

test('a label pressed and pressed again is the flyer as it was: "Saved", nothing to lose on leaving', async ({ page, request }) => {
  const { id } = await savedFlyer(request, [SECOND.slug]);
  await page.goto(`/#/flyers/${id}`);
  await openSection(page, FIELD.flyer);
  expect(await pressed(page)).toEqual([SECOND.name]);
  for (const name of [FIRST.name, SECOND.name]) {
    await pick(page, name).click();
    await expect(status(page), `${name} pressed`).toHaveText('Unsaved changes');
    await pick(page, name).click();
    await expect(status(page), `${name} pressed again`).toHaveText('Saved');
  }
  expect(await pressed(page)).toEqual([SECOND.name]);
});

test('the labels are not printed: the flyer on the stage is the same with and without them', async ({ page, request }) => {
  const { id } = await savedFlyer(request, []);
  await page.goto(`/#/flyers/${id}`);
  await openSection(page, FIELD.flyer);
  const flyer = page.locator('.stage [data-flyer]').first();
  await expect(flyer).toBeVisible();
  const drawn = () => flyer.evaluate((el) => el.outerHTML);
  const before = await drawn();
  await pick(page, FIRST.name).click();
  await pick(page, SECOND.name).click();
  await expect(status(page)).toHaveText('Unsaved changes');
  expect(await drawn()).toBe(before);
});

test(`a flyer carries ${LABELS_MAX} labels at most: with that many pressed the others wait greyed`, async ({ page, request }) => {
  const most = FLYER_LABELS.slice(0, LABELS_MAX);
  expect(FLYER_LABELS.length, 'the list is longer than a flyer’s room, or this proves nothing').toBeGreaterThan(LABELS_MAX);
  const { id } = await savedFlyer(request, most.slice(0, -1).map((l) => l.slug));
  await page.goto(`/#/flyers/${id}`);
  await openSection(page, FIELD.flyer);
  const rest = FLYER_LABELS.slice(LABELS_MAX);
  await expect(pick(page, rest[0].name)).toBeEnabled();
  await pick(page, most.at(-1)!.name).click();
  for (const label of rest) await expect(pick(page, label.name), label.name).toBeDisabled();
  for (const label of most) await expect(pick(page, label.name), label.name).toBeEnabled();
  // The picker says why, in the line under it, which the group is described by.
  const help = page.locator('.label-picker + .help');
  await expect(help).toHaveText(`A flyer carries ${LABELS_MAX} labels at most: take one off to add another.`);
  await expect(picker(page)).toHaveAccessibleDescription(`A flyer carries ${LABELS_MAX} labels at most: take one off to add another.`);
  expect((await save(page)).data.labels).toEqual(most.map((l) => l.slug));
  // One taken off makes room again.
  await pick(page, most[0].name).click();
  for (const label of rest) await expect(pick(page, label.name), label.name).toBeEnabled();
  await expect(help).toHaveText('For the library’s filter — not printed');
});

// Found in review: a label that is no longer on the list is stored, so it takes one of the flyer's 8 places and
// the server counts it. The picker counted it too, and greyed its buttons at "seven pressed" with no word of why.
test('a label that is no longer on the list takes room too, and the picker says so', async ({ page, request }) => {
  const listed = FLYER_LABELS.slice(0, LABELS_MAX - 1);
  const { id } = await savedFlyer(request, [...listed.map((l) => l.slug), 'a-label-taken-off-the-list']);
  await page.goto(`/#/flyers/${id}`);
  await openSection(page, FIELD.flyer);
  expect(await pressed(page), 'seven show').toEqual(listed.map((l) => l.name));
  for (const label of FLYER_LABELS.slice(LABELS_MAX - 1)) await expect(pick(page, label.name), `${label.name}: the eighth place is taken`).toBeDisabled();
  await expect(page.locator('.label-picker + .help')).toHaveText(`A flyer carries ${LABELS_MAX} labels at most, and 1 of this one’s is no longer on the list: take one off to add another.`);
  // One of the seven taken off: there is room for one more, and a save keeps the hidden one.
  await pick(page, listed[0].name).click();
  const next = FLYER_LABELS[LABELS_MAX - 1];
  await pick(page, next.name).click();
  expect((await save(page)).data.labels).toEqual([...listed.slice(1).map((l) => l.slug), next.slug, 'a-label-taken-off-the-list']);
});

test('a label that is no longer on the list stays on its flyer through a save, and is on no screen', async ({ page, request }) => {
  const { id } = await savedFlyer(request, ['a-label-taken-off-the-list', SECOND.slug]);
  await page.goto(`/#/flyers/${id}`);
  await expect(sectionHead(page, FIELD.flyer).locator('.section-line')).toHaveText(`Activity · All hostels · ${SECOND.name}`);
  await openSection(page, FIELD.flyer);
  expect(await pressed(page)).toEqual([SECOND.name]);
  await expect(status(page), 'opening it changes nothing').toHaveText('Saved');
  await pick(page, FIRST.name).click();
  expect((await save(page)).data.labels).toEqual([FIRST.slug, SECOND.slug, 'a-label-taken-off-the-list']);
});

test('a backend from before labels and looks sends neither: the library still lists, and the editor opens with no label pressed, drawn hand-drawn', async ({ page, request }) => {
  // The page a browser kept, on a site that went back to an older release: no `labels` in the list's items, no
  // labels and no look in a flyer's data. Read strictly, the labels took the editor down; the look is read through
  // lookOf(), which draws a flyer that names none in the first look.
  const { id, title } = await savedFlyer(request, [FIRST.slug]);
  await page.route(apiRoute('flyers'), async (route) => {
    const res = await route.fetch();
    const list = (await res.json()) as Record<string, unknown>[];
    await route.fulfill({ response: res, json: list.map(({ labels: _, ...item }) => item) });
  });
  await page.route(apiRoute(`flyers/${id}`), async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const res = await route.fetch();
    const body = (await res.json()) as { flyer: { data: Record<string, unknown> } };
    delete body.flyer.data.labels;
    delete body.flyer.data.look;
    await route.fulfill({ response: res, json: body });
  });
  await page.goto('/');
  const c = card(page, title);
  await expect(c).toBeVisible();
  await expect(c.locator('.card-thumb-ready'), 'its picture is drawn from a flyer with no labels').toHaveCount(1);
  await expect(c.locator('.card-labels')).toHaveCount(0);
  await page.goto(`/#/flyers/${id}`);
  await openSection(page, FIELD.flyer);
  expect(await pressed(page)).toEqual([]);
  await expect(status(page)).toHaveText('Saved');
  await expect(sectionHead(page, FIELD.flyer)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.stage-canvas [data-flyer]')).toHaveAttribute('data-look', FIRST_LOOK);
});

test('a new flyer has no label until one is picked, and its first save carries the ones picked', async ({ page }) => {
  await page.goto('/#/new');
  await page.getByLabel('Library name').fill(`labels spec new ${Date.now()}`);
  expect(await pressed(page), 'a new flyer’s sections are open, and none is pressed').toEqual([]);
  await pick(page, SECOND.name).click();
  await pick(page, FIRST.name).click();
  const created = await saveNew(page, keep);
  expect(created.flyer.data.labels).toEqual([FIRST.slug, SECOND.slug]);
  expect(await pressed(page)).toEqual([FIRST.name, SECOND.name]);
});

test('a This week flyer has the same picker', async ({ page }) => {
  await page.goto('/#/new');
  await page.getByRole('group', { name: FIELD.template }).getByRole('button', { name: 'This week', exact: true }).click();
  await page.getByLabel('Library name').fill(`labels spec week ${Date.now()}`);
  await pick(page, THIRD.name).click();
  const created = await saveNew(page, keep);
  expect([created.flyer.template, created.flyer.data.labels]).toEqual(['week', [THIRD.slug]]);
});

test('Duplicate copies the labels', async ({ page, request }) => {
  const { title } = await savedFlyer(request, [FIRST.slug, THIRD.slug]);
  await page.goto('/');
  const c = card(page, title);
  await expect(c.locator('.card-thumb-ready')).toHaveCount(1);
  const [res] = await Promise.all([page.waitForResponse(apiCall('POST', 'flyers')), cardMore(c, 'Duplicate')]);
  const copy = FlyerSavedSchema.parse(await res.json());
  keep(copy.id);
  expect(copy.flyer.data.labels).toEqual([FIRST.slug, THIRD.slug]);
  await expect(page).toHaveURL(new RegExp(`#/flyers/${copy.id}$`));
  await openSection(page, FIELD.flyer);
  expect(await pressed(page)).toEqual([FIRST.name, THIRD.name]);
});

test('on a phone the buttons wrap inside the form, and nothing scrolls sideways', async ({ page, request }) => {
  const { id } = await savedFlyer(request, [FIRST.slug]);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`/#/flyers/${id}`);
  await openSection(page, FIELD.flyer);
  const group = (await picker(page).boundingBox())!;
  for (const button of await picker(page).getByRole('button').all()) {
    const b = (await button.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(group.x - 1);
    expect(b.x + b.width, 'inside the form').toBeLessThanOrEqual(group.x + group.width + 1);
    expect(b.x + b.width).toBeLessThanOrEqual(360);
  }
  expect(await page.locator('.panel-body').evaluate((el) => el.scrollWidth <= el.clientWidth), 'the form does not scroll sideways').toBe(true);
});
