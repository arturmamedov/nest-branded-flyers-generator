import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, apiCall, apiRoute, exportFit, filterLibrary, hold, libraryCard as card } from '../editor';
import { TEMPLATE_LABEL } from '../../src/editor/templates';
import { CANVASES, DEFAULT_CANVAS } from '../../src/shared/layout';
import { FlyerPayloadSchema, type FlyerListItem } from '../../src/shared/schema';

/* Each library card shows its flyer (src/editor/FlyerThumb.tsx): the same <Flyer> the editor and the export mount,
   at its canvas's true size, scaled down and fitted as an export is. Never a second renderer, never a stored
   thumbnail. It is decoration: the card is still its title's link. The server is the render suite's, seeded with the
   nine sample flyers, four of them with a photo. */

test.use({ viewport: EDITOR_VIEWPORT });

/** The picture's box on screen: the default canvas's shape (WhatsApp, 3:4), smaller at phone width. */
const BOX = { desktop: { width: 120, height: 160 }, phone: { width: 96, height: 128 } };

const thumb = (c: Locator) => c.locator('.card-thumb');
const flyerIn = (c: Locator) => thumb(c).locator('[data-flyer]');
/** The picture once it is fitted and on show. */
const shown = (c: Locator) => c.locator('.card-thumb.card-thumb-ready');

async function size(l: Locator): Promise<{ width: number; height: number }> {
  const box = (await l.boundingBox())!;
  return { width: Math.round(box.width * 100) / 100, height: Math.round(box.height * 100) / 100 };
}

/** The library as the API lists it: newest first, the order of the cards. */
const flyers = async (page: Page) => (await (await page.request.get('/api/flyers')).json()) as FlyerListItem[];
const sample = async (page: Page, title: string) => (await flyers(page)).find((f) => f.title === title)!;

test('each card shows its flyer: the real <Flyer> on the WhatsApp canvas, fitted as the export fits it', async ({ page }) => {
  expect([CANVASES[DEFAULT_CANVAS].width, CANVASES[DEFAULT_CANVAS].height], 'the box is the default canvas’s shape').toEqual([1080, 1440]);
  // The stress copy fits differently on the two canvases, so the comparison cannot pass by accident.
  const stress = await sample(page, 'Long copy · stress test');
  const want = { story: await exportFit(page, stress.id, 'story'), whatsapp: await exportFit(page, stress.id, 'whatsapp') };
  expect(want.story, 'the stress copy fits differently per canvas').not.toEqual(want.whatsapp);

  await page.goto('/');
  const c = card(page, stress.title);
  await expect(shown(c)).toBeVisible();
  await expect(flyerIn(c)).toHaveAttribute('data-canvas', DEFAULT_CANVAS);
  const sizes = await flyerIn(c).evaluate((flyer) => [...flyer.querySelectorAll<HTMLElement>('[data-fit]')].map((el) => el.style.fontSize));
  expect(sizes, 'preview = export').toEqual(want.whatsapp);
  const { flyer } = FlyerPayloadSchema.parse(await (await page.request.get(`/api/flyers/${stress.id}`)).json());
  await expect(flyerIn(c), 'its own copy').toContainText(flyer.data.text.headline1);

  // The box, and the whole flyer scaled into exactly that box.
  expect(await size(thumb(c))).toEqual(BOX.desktop);
  expect(await size(flyerIn(c))).toEqual(BOX.desktop);

  // A flyer with a photo draws it, in its own crop.
  const pool = card(page, 'Pool party');
  await pool.scrollIntoViewIfNeeded();
  await expect(shown(pool)).toBeVisible();
  const photos = await flyerIn(pool).locator('img').evaluateAll((imgs) => imgs.map((img) => img as HTMLImageElement).filter((img) => img.src.includes('/uploads/')).map((img) => img.naturalWidth > 0));
  expect(photos, 'its photo, loaded').toEqual([true]);
});

test('a card’s box is the same size while its picture waits, once it shows, and when the flyer cannot load', async ({ page }) => {
  const [first, second, third] = await flyers(page);
  const release = await hold(page, apiRoute(`flyers/${first.id}`));
  await page.route(apiRoute(`flyers/${second.id}`), (route) => route.fulfill({ status: 500, json: { error: { code: 'server_error', message: 'Something went wrong on the server.' } } }));
  await page.goto('/');
  const [waiting, broken, fine] = [card(page, first.title), card(page, second.title), card(page, third.title)];
  await expect(shown(fine)).toBeVisible();

  const boxes = () =>
    page.locator('li.card').evaluateAll((cards) =>
      cards.map((el) => {
        const r = el.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 100) / 100);
      }),
    );
  const before = await boxes();
  await expect(flyerIn(waiting), 'still waiting for its flyer').toHaveCount(0);
  for (const c of [waiting, broken, fine]) expect(await size(thumb(c))).toEqual(BOX.desktop);

  release();
  await expect(shown(waiting)).toBeVisible();
  expect(await boxes(), 'nothing moved').toEqual(before);

  // The flyer that could not load: its card as it was, its box empty, and no error over the library.
  await expect(flyerIn(broken)).toHaveCount(0);
  await expect(shown(broken)).toHaveCount(0);
  await expect(broken.getByRole('link', { name: 'Open', exact: true })).toBeVisible();
  await expect(page.locator('.banner-error')).toHaveCount(0);
});

test('the picture is decoration: the card is still one link named by its title, nothing in it takes focus or is read out, and a click on it opens the flyer', async ({ page }) => {
  const [first] = await flyers(page);
  await page.goto('/');
  const c = card(page, first.title);
  await expect(shown(c)).toBeVisible();

  const main = c.locator('a.card-main');
  await expect(main).toHaveAccessibleName(new RegExp(`^${first.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} .* · ${TEMPLATE_LABEL[first.template]} · `));
  await expect(c.getByRole('link'), 'the card and "Open", as before').toHaveCount(2);
  await expect(thumb(c)).toHaveAttribute('aria-hidden', 'true');
  expect(await thumb(c).evaluate((el) => (el as HTMLElement).inert), 'inert').toBe(true);
  // The flyer's own images carry alt text (the hostel's badge, the wordmark): none of it is read out here.
  await expect(c.getByRole('img')).toHaveCount(0);

  // Tab from the card's link goes straight to "Open": nothing inside the picture stops it.
  await main.focus();
  await page.keyboard.press('Tab');
  await expect(c.getByRole('link', { name: 'Open', exact: true })).toBeFocused();

  // A click on the picture is a click on the card. The mouse itself, so the browser picks what is hit.
  const box = (await thumb(c).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page).toHaveURL(new RegExp(`#/flyers/${first.id}$`));
});

test('a picture that arrives after its list has gone shows nothing, and breaks nothing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const [first] = await flyers(page);
  const other = first.template === 'week' ? 'activity' : 'week';
  const release = await hold(page, apiRoute(`flyers/${first.id}`));
  const late = page.waitForResponse(apiCall('GET', `flyers/${first.id}`));
  await page.goto('/');
  await expect(card(page, first.title)).toBeVisible();

  // The list changes while the first card's flyer is still on its way.
  await filterLibrary(page, 'Template', { label: TEMPLATE_LABEL[other] }, `?template=${other}`);
  await expect(card(page, first.title)).toHaveCount(0);
  const now = page.locator('li.card');
  await expect(now.first().locator('.card-thumb.card-thumb-ready')).toBeVisible();

  release();
  await (await late).finished();
  await page.evaluate(() => new Promise((resolve) => requestIdleCallback(resolve)));
  await expect(card(page, first.title)).toHaveCount(0);
  // Every picture on screen is its own card's: as many flyers as cards that have asked, never one more.
  expect(await page.locator('.card-thumb [data-flyer]').count()).toBeLessThanOrEqual(await now.count());
  await expect(page.locator('.banner-error')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a card asks for its flyer only when it nears the screen, and once', async ({ page }) => {
  const list = await flyers(page);
  expect(list.length, 'enough cards to scroll past the screen').toBeGreaterThanOrEqual(8);
  const [top, bottom] = [list[0], list.at(-1)!];
  const asked: number[] = [];
  page.on('request', (r) => {
    const id = /\/api\/flyers\/(\d+)$/.exec(new URL(r.url()).pathname);
    if (id && r.method() === 'GET') asked.push(Number(id[1]));
  });
  await page.goto('/');
  await expect(shown(card(page, top.title))).toBeVisible();
  expect(asked).toContain(top.id);
  expect(asked, 'the last card is far below the screen').not.toContain(bottom.id);
  await expect(flyerIn(card(page, bottom.title))).toHaveCount(0);

  await card(page, bottom.title).scrollIntoViewIfNeeded();
  await expect(shown(card(page, bottom.title))).toBeVisible();
  await card(page, top.title).scrollIntoViewIfNeeded();
  await card(page, bottom.title).scrollIntoViewIfNeeded();
  expect(asked.filter((id) => id === bottom.id), 'asked once').toEqual([bottom.id]);
  expect(new Set(asked).size, 'no flyer asked for twice').toBe(asked.length);
});

test('on a phone the picture is smaller, the card fits the screen, and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const c = page.locator('li.card').first();
  await expect(c.locator('.card-thumb.card-thumb-ready')).toBeVisible();
  expect(await size(thumb(c))).toEqual(BOX.phone);
  expect(await size(flyerIn(c)), 'the whole flyer, scaled into the smaller box').toEqual(BOX.phone);

  expect(await page.locator('.library').evaluate((el) => el.scrollWidth <= el.clientWidth), 'no sideways scroll').toBe(true);
  for (const part of [c, c.locator('.card-title'), ...['Open', 'Duplicate', 'Archive'].map((name) => c.getByRole(name === 'Open' ? 'link' : 'button', { name, exact: true }))]) {
    const box = (await part.boundingBox())!;
    expect(box.x, 'inside the screen, left').toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, 'inside the screen, right').toBeLessThanOrEqual(390);
  }
});
