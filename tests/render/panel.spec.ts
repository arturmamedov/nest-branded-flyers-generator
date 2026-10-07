import { readFileSync } from 'node:fs';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '../browser';
import {
  EDITOR_VIEWPORT,
  POOL_PARTY,
  apiCall,
  apiRoute,
  backToLibrary,
  canvasButton,
  dropFile,
  hold,
  openSection,
  panelFold,
  rowField,
  saveNew,
  sectionHead,
  status,
  templateButton,
  toast,
  type FilePayload,
} from '../editor';
import { FIELD } from '../../src/editor/fields';
import { LEAVE_PROMPT } from '../../src/editor/leaveGuard';
import { SECTIONS, SECTIONS_PREF } from '../../src/editor/sectionFolds';
import { newFlyerData } from '../../src/shared/defaults';
import { CANVAS_IDS } from '../../src/shared/layout';
import { FlyerSavedSchema, type FlyerListItem } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* The editor's form folds (the editor's UX round, Part 2; src/editor/sectionFolds.ts has the rule, panel.tsx draws
   it): each section opens and closes by its header. A new flyer and an AI-made one start fully open; a saved one as
   the sections were left last time, and before any last time with When · Where · Cost open, or the week's rows (the
   owner's answers, 2026-10-07). Folding is how a viewer looks at the form, never flyer data. The AI-made flyer is
   ai.spec.ts's. */

test.use({ viewport: EDITOR_VIEWPORT });

const PHOTO: FilePayload = { name: 'pool-party.png', mimeType: 'image/png', buffer: readFileSync(POOL_PARTY) };
const FACTS = FIELD.facts;
const ACTIVITY = [FIELD.flyer, FIELD.headline, FACTS, FIELD.extras, FIELD.ask, FIELD.photo, FIELD.top, FIELD.share];
const WEEK = [FIELD.flyer, FIELD.weekTitle, FIELD.weekRows, FIELD.ask, FIELD.top, FIELD.share];

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

/** A saved Activity flyer of this spec's own, for a test that saves: made through the API, archived afterwards. */
async function savedActivity(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/flyers', {
    headers: WRITE_HEADERS,
    data: { title: `panel spec ${Date.now()}`, hostel: null, template: 'activity', data: newFlyerData('activity'), photoId: null },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = FlyerSavedSchema.parse(await res.json());
  keep(id);
  return id;
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

/** What a closed section says of itself beside its name, and the dot of one with something to see to. */
const lineOf = (page: Page, title: string) => sectionHead(page, title).locator('.section-line');
const dotOf = (page: Page, title: string) => sectionHead(page, title).locator('.section-dot');

test('a closed section says in one line what is inside, and the line follows what is typed', async ({ page, request }) => {
  await openFlyer(page, await sample(request, 'This week · Duque Nest'));
  await expect(lineOf(page, 'Flyer')).toHaveText('This week · Duque Nest');
  await expect(lineOf(page, 'Title')).toHaveText('What’s on this week.');
  await sectionHead(page, FIELD.weekRows).click();
  await expect(lineOf(page, FIELD.weekRows)).toHaveText('4 rows · Fridays, Saturday 19/9, Most mornings');

  await openFlyer(page, await sample(request, 'Pool party'));
  const lines: Record<string, string> = {
    Flyer: 'Activity · Duque Nest',
    [FIELD.headline]: 'Saturday is a pool party.',
    [FIELD.extras]: 'Everyone welcome · Bring a towel',
    [FIELD.ask]: 'Sign up at reception.',
    Photo: 'Full bleed · photo set',
    'Top and tag pill': 'NEXT ACTIVITY · @NESTSHOSTELS · ¡TAG US!',
    [FIELD.share]: 'No caption yet',
  };
  for (const [title, line] of Object.entries(lines)) await expect(lineOf(page, title), title).toHaveText(line);
  // The line is part of what the header is called, so a screen reader hears it with the name.
  await expect(sectionHead(page, 'Flyer')).toHaveAccessibleName('Flyer Activity · Duque Nest');
  // An open section's fields say it themselves; closed, it has its line: the hostel prints big in WHERE.
  await expect(lineOf(page, FACTS)).toHaveCount(0);
  await sectionHead(page, FACTS).click();
  await expect(lineOf(page, FACTS)).toHaveText('Saturday 19/9 · Duque Nest · Free');

  await openSection(page, FIELD.headline, FIELD.share);
  await page.getByLabel('Line 2').fill('paella night.');
  await page.getByLabel('Caption').fill('Come to the pool');
  await sectionHead(page, FIELD.headline).click();
  await sectionHead(page, FIELD.share).click();
  await expect(lineOf(page, FIELD.headline)).toHaveText('Saturday is a paella night.');
  await expect(lineOf(page, FIELD.share)).toHaveText('Caption written');
});

test('a closed section with something to see to shows a dot: a copy rule broken in one of its fields, and a frame with no photo', async ({ page }) => {
  await page.goto('/#/new');
  const dots = page.locator('.panel .section-dot');
  // A new flyer's frame has no photo, and the warning stands; its section is open, and an open one shows no dot.
  const addPhoto = toast(page, 'warn').filter({ hasText: 'Add a photo' });
  await expect(addPhoto).toBeVisible();
  await expect(dots).toHaveCount(0);
  await sectionHead(page, 'Photo').click();
  await expect(dotOf(page, 'Photo')).toHaveCount(1);
  await expect(sectionHead(page, 'Photo')).toHaveAccessibleName(/^Photo has a warning /);
  await addPhoto.getByRole('button', { name: 'switch to No photo' }).click();
  await expect(dots).toHaveCount(0);

  // A copy rule names its field: the dot is on that field's section, once it is closed.
  await page.getByLabel('Line 1').fill('SATURDAY IS A');
  await expect(toast(page, 'warn').filter({ hasText: 'Sentence case for headlines' })).toBeVisible();
  await expect(dots).toHaveCount(0);
  await sectionHead(page, FIELD.headline).click();
  await expect(dotOf(page, FIELD.headline)).toHaveCount(1);
  await expect(dots).toHaveCount(1);
  // The rule about too many exclamation marks is about the whole flyer: no section's dot.
  await sectionHead(page, FIELD.headline).click();
  await page.getByLabel('Line 1').fill('Saturday is a!!!!!');
  await expect(toast(page, 'warn').filter({ hasText: 'exclamation marks' })).toBeVisible();
  for (const title of ACTIVITY) await openSection(page, title).then(() => sectionHead(page, title).click());
  await expect(dots).toHaveCount(0);
});

test('a photo dropped on the preview opens the Photo section, and on a saved flyer that is how it was left', async ({ page, request }) => {
  await openFlyer(page, await sample(request, 'Pool party'));
  await expect(sectionHead(page, 'Photo')).toHaveAttribute('aria-expanded', 'false');
  const [res] = await Promise.all([page.waitForResponse(apiCall('POST', 'photos')), dropFile(page, page.locator('.stage'), PHOTO)]);
  expect(res.status(), await res.text()).toBe(201);
  await expect(sectionHead(page, 'Photo')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText(/^Zoom /)).toBeVisible();
  expect(await remembered(page)).toBe('["facts","rows","photo"]');
  // The sample itself was not saved over: the draft is unsaved, and stays in this page.
  await expect(status(page)).toHaveText('Unsaved changes');
});

/* Found in review (2026-10-07): the test that stood here started on a new flyer, where Photo is open already, and
   looked at a week flyer, which has no Photo section: it could not fail. And a file the photo checks refuse opened
   the section all the same, and wrote that into the memory. Photo opens for a photo that lands. */

test('a dropped file that is no photo opens nothing, and nothing is remembered of it', async ({ page, request }) => {
  await openFlyer(page, await sample(request, 'Pool party'));
  // The smallest GIF there is: the photo checks refuse the format.
  const gif: FilePayload = { name: 'party.gif', mimeType: 'image/gif', buffer: Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', 'base64') };
  await dropFile(page, page.locator('.stage'), gif);
  await expect(toast(page, 'error')).toContainText('GIF');
  await expect(sectionHead(page, FIELD.photo)).toHaveAttribute('aria-expanded', 'false');
  expect(await remembered(page)).toBeNull();
  await expect(status(page)).toHaveText('Saved');
});

test('a photo dropped while another action is out is refused, and opens nothing', async ({ page, request }) => {
  const id = await savedActivity(request);
  await openFlyer(page, id);
  // Something to save, typed in the one section that is open; the save is held, so the editor is busy.
  await page.getByLabel('When', { exact: true }).fill('Saturday 19/9');
  const release = await hold(page, apiRoute(`flyers/${id}`), 'PUT');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  await dropFile(page, page.locator('.stage'), PHOTO);
  await expect(toast(page, 'error')).toHaveText('Still working on the last action — drop the photo again in a moment.');
  await expect(sectionHead(page, FIELD.photo)).toHaveAttribute('aria-expanded', 'false');
  expect(await remembered(page)).toBeNull();
  release();
  await expect(status(page)).toHaveText('Saved');
});

test('a photo dropped on a This week flyer is refused, and its sections stay as they were', async ({ page, request }) => {
  await openFlyer(page, await sample(request, 'This week · Duque Nest'));
  await dropFile(page, page.locator('.stage'), PHOTO);
  await expect(toast(page, 'error')).toContainText('flyer has no photo');
  expect(await sections(page)).toEqual(allOf(WEEK, [FIELD.weekRows]));
  expect(await remembered(page)).toBeNull();
});

test('with the panel folded a dropped photo opens the Photo section, and the panel stays folded', async ({ page, request }) => {
  await openFlyer(page, await sample(request, 'Pool party'));
  await panelFold(page).click();
  const [res] = await Promise.all([page.waitForResponse(apiCall('POST', 'photos')), dropFile(page, page.locator('.stage'), PHOTO)]);
  expect(res.status(), await res.text()).toBe(201);
  await expect(status(page)).toHaveText('Unsaved changes');
  await expect(panelFold(page), 'the staff member folded it to see the flyer').toHaveAccessibleName('Show the form');
  await panelFold(page).click();
  await expect(sectionHead(page, FIELD.photo)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText(/^Zoom /)).toBeVisible();
});

test('the panel keeps its width whatever is in it: a long line is cut inside its pill', async ({ page, request }) => {
  // Found in review (2026-10-07): once the form scrolled by itself the panel was a flex item with nothing to hold it
  // to its width, and a closed section's long line, which never wraps, widened the whole panel.
  const PANEL = 421;
  const panelWidth = () => widthOf(page, '.panel');
  const cut = (title: string) => sectionHead(page, title).locator('.section-line').evaluate((el) => el.scrollWidth > el.clientWidth);

  await openFlyer(page, await sample(request, 'Pool party'));
  expect(await panelWidth(), 'the form’s 380 px, 20 px each side, and its edge').toBe(PANEL);
  await openFlyer(page, await sample(request, 'Long copy · stress test'));
  expect(await panelWidth()).toBe(PANEL);
  expect(await cut(FIELD.extras), 'the line is longer than its pill, and ends in "…"').toBe(true);
  await openFlyer(page, await sample(request, 'This week · stress test'));
  await sectionHead(page, FIELD.weekRows).click();
  expect(await panelWidth()).toBe(PANEL);
  expect(await cut(FIELD.weekRows)).toBe(true);
  for (const title of WEEK) await openSection(page, title);
  expect(await panelWidth(), 'with every section open').toBe(PANEL);
  expect(await page.locator('.panel-body').evaluate((el) => el.scrollWidth - el.clientWidth), 'and the form never scrolls sideways').toBe(0);
});

test('folded, the panel is its rail above 860 px wide and its head bar from there down, with nothing between', async ({ page, request }) => {
  await openFlyer(page, await sample(request, 'Pool party'));
  await panelFold(page).click();
  const box = async () => (await page.locator('.panel').boundingBox())!;
  await page.setViewportSize({ width: 861, height: 900 });
  expect([(await box()).width, (await box()).height], 'a rail, as tall as the window').toEqual([56, 900]);
  await page.setViewportSize({ width: 860, height: 900 });
  expect([(await box()).width, (await box()).height], 'a bar, as wide as the window').toEqual([860, 48]);
  // Folded on a desktop and then narrowed: both buttons are still there, and the form opens again.
  await expect(backToLibrary(page)).toBeInViewport({ ratio: 1 });
  await panelFold(page).click();
  await expect(page.getByLabel('When', { exact: true })).toBeVisible();
});

/* The whole panel folds away to the left on a desktop (the owner's ask; a slim rail, his pick of three shapes), and
   up to its head bar on a phone. It starts open on every visit: only the sections are remembered. */

const openAll = (page: Page) => page.locator('.panel-head').getByRole('button', { name: /^(Open|Close) all$/ });
const stageWidth = (page: Page) => page.locator('.stage').evaluate((el) => el.clientWidth);
const widthOf = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!.width;

test('the panel folds to a rail and opens again from the keyboard; folded, no field can be reached and the way back stays', async ({ page, request }) => {
  await openFlyer(page, await sample(request, 'Pool party'));
  await openSection(page, FIELD.headline);
  await page.getByLabel('Line 1').fill('Sunday is a');
  const [stage, panel] = [await stageWidth(page), await widthOf(page, '.panel')];

  expect(panel, 'the open panel’s own width').toBe(421);

  const fold = panelFold(page);
  await expect(fold).toHaveAccessibleName('Hide the form');
  expect(await page.locator(`[id="${await fold.getAttribute('aria-controls')}"]`).getAttribute('class'), 'it names the form it hides').toBe('panel-body');
  await fold.focus();
  await page.keyboard.press('Enter');
  await expect(fold).toHaveAccessibleName('Show the form');
  await expect(fold, 'the same button in both states: it keeps the focus').toBeFocused();
  const rail = await widthOf(page, '.panel');
  expect(rail, 'a slim rail').toBe(56);
  await expect.poll(() => stageWidth(page), 'the stage has what the panel gave up').toBe(stage + panel - rail);

  // Nothing of the form can be reached: not by sight, and not by the keyboard, which goes from the rail's two
  // buttons straight to the toolbar.
  await expect(page.getByLabel('Line 1')).toBeHidden();
  await expect(page.locator('.panel .section-head').first()).toBeHidden();
  await expect(openAll(page)).toBeHidden();
  await expect(backToLibrary(page)).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Tab');
  await expect(backToLibrary(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(canvasButton(page, CANVAS_IDS[0])).toBeFocused();
  // Folding is how the form is looked at: the draft is what it was.
  await expect(status(page)).toHaveText('Unsaved changes');

  await fold.focus();
  await page.keyboard.press('Space');
  await expect(fold).toHaveAccessibleName('Hide the form');
  await expect(page.getByLabel('Line 1')).toBeVisible();
  await expect(page.getByLabel('Line 1')).toHaveValue('Sunday is a');
  expect(await sections(page), 'the sections as they were').toEqual(allOf(ACTIVITY, [FIELD.headline, FACTS]));
  await expect.poll(() => stageWidth(page)).toBe(stage);
});

test('on the rail the way back leaves, and still asks first about unsaved work', async ({ page, request }) => {
  await openFlyer(page, await sample(request, 'Pool party'));
  await openSection(page, FIELD.headline);
  await page.getByLabel('Line 1').fill('Sunday is a');
  await panelFold(page).click();
  const asked = new Promise<string>((resolve) =>
    page.once('dialog', (d) => {
      resolve(d.message());
      void d.accept();
    }),
  );
  await backToLibrary(page).click();
  expect(await asked).toBe(LEAVE_PROMPT);
  await expect(page.getByRole('heading', { name: 'Flyer library' })).toBeVisible();
});

test('the panel starts open on every visit, and a fold writes nothing', async ({ page, request }) => {
  await openFlyer(page, await sample(request, 'Pool party'));
  await panelFold(page).click();
  await expect(page.getByLabel('When', { exact: true })).toBeHidden();
  await expect(status(page)).toHaveText('Saved');
  expect(await page.evaluate(() => Object.keys(localStorage)), 'nothing is remembered of the fold, nor of the sections').toEqual([]);
  await page.reload();
  await expect(panelFold(page)).toHaveAccessibleName('Hide the form');
  await expect(page.getByLabel('When', { exact: true })).toBeVisible();
});

test('the form keeps its place when the panel is folded and opened again', async ({ page }) => {
  await page.goto('/#/new');
  const form = page.locator('.panel-body');
  await expect(page.getByLabel('Line 1')).toBeVisible();
  await form.evaluate((el) => el.scrollTo(0, 400));
  expect(await form.evaluate((el) => el.scrollTop), 'a new flyer’s form scrolls').toBe(400);
  await panelFold(page).click();
  await expect(page.getByLabel('Line 1')).toBeHidden();
  await panelFold(page).click();
  await expect(page.getByLabel('Line 1')).toBeVisible();
  expect(await form.evaluate((el) => el.scrollTop)).toBe(400);
});

test('the head’s buttons never move the form, and a field focused from the keyboard is never under the head', async ({ page }) => {
  await page.goto('/#/new');
  const form = page.locator('.panel-body');
  await expect(page.getByLabel('Line 1')).toBeVisible();
  // Found while building the fold (2026-10-07): the head was a sticky bar inside the scrolling panel, with room kept
  // for it by the panel's scroll padding. That counts the bar's own buttons as out of sight, so focusing one scrolled
  // the form to its top. The head stands above the form now, and is no part of what scrolls.
  for (const inHead of [panelFold(page), backToLibrary(page), openAll(page)]) {
    await form.evaluate((el) => el.scrollTo(0, 400));
    await inHead.focus();
    expect(await form.evaluate((el) => el.scrollTop), (await inHead.textContent()) ?? '').toBe(400);
  }

  // Back from the form's last field, a field at a time: each one the keyboard lands on is below the head.
  const headBottom = await page.locator('.panel-head').evaluate((el) => el.getBoundingClientRect().bottom);
  await page.getByLabel('Caption').focus();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Shift+Tab');
    const at = await page.evaluate(() => {
      const el = document.activeElement!;
      return { inForm: !!el.closest('.panel-body'), top: el.getBoundingClientRect().top, what: el.getAttribute('aria-label') ?? el.textContent ?? el.tagName };
    });
    if (at.inForm) expect(at.top, `focus on "${at.what}"`).toBeGreaterThanOrEqual(headBottom);
  }
});

test('"Open all" opens every section and then reads "Close all"; on a saved flyer that is how they were left', async ({ page, request }) => {
  await page.goto('/#/new');
  await expect(openAll(page), 'a new flyer is fully open').toHaveText('Close all');
  await sectionHead(page, 'Photo').click();
  await expect(openAll(page), 'one section closed').toHaveText('Open all');

  await openFlyer(page, await sample(request, 'Pool party'));
  await expect(openAll(page)).toHaveText('Open all');
  await openAll(page).click();
  expect(await sections(page)).toEqual(allOf(ACTIVITY, ACTIVITY));
  await expect(openAll(page)).toHaveText('Close all');
  await expect(openAll(page), 'the same button: it keeps the focus').toBeFocused();
  expect(await remembered(page), 'every section, the other template’s too').toBe(JSON.stringify(SECTIONS));
  await openAll(page).click();
  expect(await sections(page)).toEqual(allOf(ACTIVITY, []));
  await expect(openAll(page)).toHaveText('Open all');
  expect(await remembered(page)).toBe('[]');
  await expect(status(page)).toHaveText('Saved');
});

test.describe('on a touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a pill that was tapped keeps no pointer’s ring', async ({ page, request }) => {
    // Seen in the look (2026-10-07): a finger has no pointer to move away, so the ring a pill wears under the mouse
    // stayed on the one tapped last.
    await openFlyer(page, await sample(request, 'Pool party'));
    const head = sectionHead(page, FIELD.headline);
    await head.tap();
    await expect(head).toHaveAttribute('aria-expanded', 'true');
    await head.tap();
    await expect(head).toHaveAttribute('aria-expanded', 'false');
    await expect(head).toHaveCSS('box-shadow', 'none');
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the same button folds the form up to its head bar, and the flyer gets the screen', async ({ page, request }) => {
    await openFlyer(page, await sample(request, 'Pool party'));
    const box = async (selector: string) => (await page.locator(selector).boundingBox())!;
    const open = { panel: await box('.panel'), stage: await box('.stage') };
    expect(open.panel.height, 'the form on top, a good part of the screen').toBeGreaterThan(300);
    expect(open.panel.height, 'and at most 45% of it, with its edge').toBeLessThanOrEqual(0.45 * 844 + 1);

    await panelFold(page).click();
    await expect(panelFold(page)).toHaveAccessibleName('Show the form');
    await expect(page.getByLabel('When', { exact: true })).toBeHidden();
    await expect(backToLibrary(page)).toBeInViewport({ ratio: 1 });
    const folded = { panel: await box('.panel'), stage: await box('.stage') };
    expect(folded.panel.height, 'the head bar alone').toBe(48);
    expect(folded.panel.width, 'still the screen’s width: a bar, no rail').toBe(390);
    expect(folded.stage.height, 'the flyer’s stage grew').toBeGreaterThan(open.stage.height);
    expect(folded.stage.y + folded.stage.height, 'and ends on the screen').toBeLessThanOrEqual(844);

    await panelFold(page).click();
    await expect(page.getByLabel('When', { exact: true })).toBeVisible();
    expect((await box('.panel')).height).toBe(open.panel.height);
  });
});
