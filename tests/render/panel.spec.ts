import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, apiRoute, backToLibrary, openSection, rowField, saveNew, sectionHead, status, templateButton } from '../editor';
import { FIELD } from '../../src/editor/fields';
import { SECTIONS_PREF } from '../../src/editor/sectionFolds';
import type { FlyerListItem } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* The editor's form folds (the editor's UX round, Part 2; src/editor/sectionFolds.ts has the rule, panel.tsx draws
   it): each section opens and closes by its header. A new flyer and an AI-made one start fully open; a saved one as
   the sections were left last time, and before any last time with When · Where · Cost open, or the week's rows (the
   owner's answers, 2026-10-07). Folding is how a viewer looks at the form, never flyer data. The AI-made flyer is
   ai.spec.ts's. */

test.use({ viewport: EDITOR_VIEWPORT });

const FACTS = 'When · Where · Cost';
const ACTIVITY = ['Flyer', FIELD.headline, FACTS, FIELD.extras, FIELD.ask, 'Photo', 'Top and tag pill', FIELD.share];
const WEEK = ['Flyer', 'Title', FIELD.weekRows, FIELD.ask, 'Top and tag pill', FIELD.share];

/** Flyers a test saved: archived afterwards, so the specs after this one find the library as seeded. */
const saved: number[] = [];
const keep = (id: number) => saved.push(id);
test.afterEach(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

/** A seeded sample flyer's id. These tests open it and save nothing. */
async function sample(request: APIRequestContext, title: string): Promise<number> {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
  return list.find((f) => f.title === title)!.id;
}

/** Every section on screen, in order, with whether it is open. */
const sections = (page: Page) =>
  page.locator('.panel .section-head').evaluateAll((heads) => heads.map((h) => [h.querySelector('.section-title')!.textContent, h.getAttribute('aria-expanded') === 'true'] as [string, boolean]));
const allOf = (titles: string[], open: string[]) => titles.map((title) => [title, open.includes(title)]);
const remembered = (page: Page) => page.evaluate((key) => localStorage.getItem(key), SECTIONS_PREF);

async function openFlyer(page: Page, id: number) {
  await page.goto(`/#/flyers/${id}`);
  await expect(status(page)).toHaveText('Saved');
}

test('a new flyer starts with every section open, on both templates', async ({ page }) => {
  await page.goto('/#/new');
  await expect.poll(() => sections(page)).toEqual(allOf(ACTIVITY, ACTIVITY));
  await templateButton(page, 'week').click();
  await expect.poll(() => sections(page)).toEqual(allOf(WEEK, WEEK));
});

test('a saved flyer, the first time, opens When · Where · Cost alone, and a This week flyer its rows', async ({ page, request }) => {
  await openFlyer(page, await sample(request, 'Pool party'));
  expect(await sections(page)).toEqual(allOf(ACTIVITY, [FACTS]));
  await expect(page.getByLabel('When', { exact: true })).toBeVisible();
  // A closed section's fields are there, with what the flyer says, and out of reach.
  await expect(page.getByLabel('Line 1')).toBeHidden();
  await expect(page.getByLabel('Line 1')).toHaveValue('Saturday is a');
  expect(await remembered(page), 'opening a flyer is no "last time"').toBeNull();

  await openFlyer(page, await sample(request, 'This week · Duque Nest'));
  expect(await sections(page)).toEqual(allOf(WEEK, [FIELD.weekRows]));
  await expect(rowField(page, 1, 'day')).toBeVisible();
});

test('a saved flyer opens as the sections were left last time: after a reload, and on another flyer', async ({ page, request }) => {
  await openFlyer(page, await sample(request, 'Pool party'));
  await sectionHead(page, FIELD.headline).click();
  await sectionHead(page, FACTS).click();
  expect(await sections(page)).toEqual(allOf(ACTIVITY, [FIELD.headline]));
  await expect(page.getByLabel('Line 1')).toBeVisible();
  await expect(page.getByLabel('When', { exact: true })).toBeHidden();
  // The rows were open and nobody closed them: they are still part of how the sections were left.
  expect(await remembered(page)).toBe('["headline","rows"]');

  await page.reload();
  await expect(status(page)).toHaveText('Saved');
  expect(await sections(page)).toEqual(allOf(ACTIVITY, [FIELD.headline]));

  // One memory for every saved flyer: a week flyer's title is the headline's section.
  await openFlyer(page, await sample(request, 'This week · Duque Nest'));
  expect(await sections(page)).toEqual(allOf(WEEK, ['Title', FIELD.weekRows]));

  // A new flyer starts fully open all the same, and what is folded there is not remembered.
  await page.goto('/#/new');
  await expect.poll(() => sections(page)).toEqual(allOf(ACTIVITY, ACTIVITY));
  await sectionHead(page, 'Photo').click();
  await expect(sectionHead(page, 'Photo')).toHaveAttribute('aria-expanded', 'false');
  expect(await remembered(page)).toBe('["headline","rows"]');
});

test('a stored value that is no list of sections is no last time', async ({ page, request }) => {
  const id = await sample(request, 'Pool party');
  await page.addInitScript((key) => localStorage.setItem(key, '{"__proto__":["flyer"]}'), SECTIONS_PREF);
  await openFlyer(page, id);
  expect(await sections(page)).toEqual(allOf(ACTIVITY, [FACTS]));
});

test('a new flyer’s first save folds nothing, and what is folded on it afterwards is still not remembered', async ({ page }) => {
  await page.goto('/#/new');
  await sectionHead(page, 'Photo').click();
  const left = ACTIVITY.filter((title) => title !== 'Photo');
  await page.getByLabel('Library name').fill(`panel spec ${Date.now()}`);
  await saveNew(page, keep);
  expect(await sections(page), 'as they were when Save was pressed').toEqual(allOf(ACTIVITY, left));
  await sectionHead(page, FIELD.share).click();
  expect(await remembered(page)).toBeNull();
});

test('opening and closing sections changes nothing of the flyer: nothing is sent, nothing is unsaved, and leaving asks nothing', async ({ page, request }) => {
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await openFlyer(page, await sample(request, 'Pool party'));
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET') writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  for (const title of ACTIVITY) await sectionHead(page, title).click();
  expect(await sections(page)).toEqual(allOf(ACTIVITY, ACTIVITY.filter((title) => title !== FACTS)));
  for (const title of ACTIVITY) await sectionHead(page, title).click();
  await expect(status(page)).toHaveText('Saved');
  expect(writes, 'no request but reads').toEqual([]);
  await backToLibrary(page).click();
  await expect(page.getByRole('heading', { name: 'Flyer library' })).toBeVisible();
  expect(dialogs, 'no question on leaving').toEqual([]);
});

test('what was typed stays in a section that is closed and opened again, and the header works from the keyboard', async ({ page, request }) => {
  await openFlyer(page, await sample(request, 'Pool party'));
  await openSection(page, FIELD.headline);
  await page.getByLabel('Line 1').fill('Sunday is a');
  await expect(status(page)).toHaveText('Unsaved changes');

  const head = sectionHead(page, FIELD.headline);
  await head.focus();
  await page.keyboard.press('Enter');
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await expect(head, 'the header keeps the focus').toBeFocused();
  await expect(page.getByLabel('Line 1')).toBeHidden();
  await expect(status(page)).toHaveText('Unsaved changes');
  // Tab goes past the closed section's fields, to the next header.
  await page.keyboard.press('Tab');
  await expect(sectionHead(page, FACTS)).toBeFocused();

  await head.focus();
  await page.keyboard.press('Space');
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Line 1')).toHaveValue('Sunday is a');
  // The header names what it opens and closes.
  const body = page.locator(`[id="${await head.getAttribute('aria-controls')}"]`);
  await expect(body.getByLabel('Line 1')).toBeVisible();
});

test('a closed section keeps its content: the rows’ saved flyers are asked for once, and the photo’s file input stays', async ({ page, request }) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (apiRoute('flyers', '?template=activity')(url)) asked.push(url.search);
  });
  await openFlyer(page, await sample(request, 'This week · Duque Nest'));
  const picker = page.getByLabel('Add from a saved flyer');
  await expect(picker.locator('option')).not.toHaveCount(1);
  const options = await picker.locator('option').count();
  for (let i = 0; i < 4; i++) await sectionHead(page, FIELD.weekRows).click();
  await expect(picker).toBeVisible();
  await expect(picker.locator('option')).toHaveCount(options);
  expect(asked, 'asked when the rows were first shown, and never again').toHaveLength(1);

  await openFlyer(page, await sample(request, 'Pool party'));
  await expect(sectionHead(page, 'Photo')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.panel input[type=file]')).toHaveCount(1);
});
