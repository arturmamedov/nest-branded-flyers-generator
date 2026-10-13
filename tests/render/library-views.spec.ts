import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, exportFit, libraryCard as card, lightbox, zoomButton } from '../editor';
import { VIEW_PREF } from '../../src/editor/libraryView';
import { CANVAS_PREF } from '../../src/editor/prefs';
import { newFlyerData } from '../../src/shared/defaults';
import { CANVASES, DEFAULT_CANVAS } from '../../src/shared/layout';
import { FlyerSavedSchema, type FlyerListItem } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* The library as a list or as a grid, and a flyer shown large (the library's views, 2026-10-13; the owner's asks: "see
   the flyers as a list or as a grid", and "instead of full image box open the lightbox, let's add a zoom icon … and
   the image click still open the edit"). library.spec.ts holds the list as it always was, and the card's picture. */

test.use({ viewport: EDITOR_VIEWPORT });

const saved: number[] = [];
test.afterEach(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

/** A flyer of this spec's own, with no photo frame, saved through the API: the newest, so the library's first card. */
async function save(request: APIRequestContext, title: string): Promise<number> {
  const data = { ...newFlyerData(), photoMode: 'none' };
  const res = await request.post('/api/flyers', { headers: WRITE_HEADERS, data: { title, hostel: null, template: 'activity', data, photoId: null } });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = FlyerSavedSchema.parse(await res.json());
  saved.push(id);
  return id;
}

const flyers = async (page: Page) => (await (await page.request.get('/api/flyers')).json()) as FlyerListItem[];
const viewButton = (page: Page, view: 'List' | 'Grid') => page.getByRole('group', { name: 'View' }).getByRole('button', { name: view, exact: true });
const cards = (page: Page) => page.locator('ul.cards');
const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);
const noSidewaysScroll = async (page: Page) => expect(await page.locator('.library').evaluate((el) => el.scrollWidth <= el.clientWidth), 'no sideways scroll').toBe(true);

async function box(l: Locator) {
  const b = (await l.boundingBox())!;
  return { x: Math.round(b.x * 100) / 100, y: Math.round(b.y * 100) / 100, width: Math.round(b.width * 100) / 100, height: Math.round(b.height * 100) / 100 };
}

test.describe('list or grid', () => {
  test('someone who never chose sees the list; the choice is one press, and the browser remembers it', async ({ page }) => {
    await page.goto('/');
    await expect(cards(page)).toHaveClass(/\bcards-list\b/);
    await expect(viewButton(page, 'List')).toHaveAttribute('aria-pressed', 'true');
    await expect(viewButton(page, 'Grid')).toHaveAttribute('aria-pressed', 'false');
    expect(await stored(page, VIEW_PREF), 'nothing is stored until someone chooses').toBeNull();

    await viewButton(page, 'Grid').click();
    await expect(cards(page)).toHaveClass(/\bcards-grid\b/);
    await expect(viewButton(page, 'Grid')).toHaveAttribute('aria-pressed', 'true');
    expect(await stored(page, VIEW_PREF)).toBe('grid');

    await page.reload();
    await expect(cards(page)).toHaveClass(/\bcards-grid\b/);
    await viewButton(page, 'List').click();
    await expect(cards(page)).toHaveClass(/\bcards-list\b/);
    expect(await stored(page, VIEW_PREF)).toBe('list');
  });

  test('a stored value that is neither view is ignored', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, 'tiles'), VIEW_PREF);
    await page.goto('/');
    await expect(cards(page)).toHaveClass(/\bcards-list\b/);
    await expect(viewButton(page, 'List')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the grid shows larger pictures, three to a row on a desktop, each still its card’s link, with the poster whole under them', async ({ page }) => {
    const [first, second, third, fourth] = await flyers(page);
    await page.addInitScript((key) => localStorage.setItem(key, 'grid'), VIEW_PREF);
    await page.goto('/');
    const c = card(page, first.title);
    await expect(c.locator('.card-thumb.card-thumb-ready')).toBeVisible();
    // The default canvas's shape, larger than the list's 120 × 160, and the whole flyer scaled into exactly that box.
    expect(await box(c.locator('.card-thumb'))).toMatchObject({ width: 252, height: 336 });
    expect(await box(c.locator('.card-thumb [data-flyer]'))).toMatchObject({ width: 252, height: 336 });
    await expect(c.locator('.card-thumb [data-flyer]')).toHaveAttribute('data-canvas', DEFAULT_CANVAS);

    const rows = await Promise.all([first, second, third, fourth].map(async (f) => (await box(card(page, f.title))).y));
    expect(new Set(rows.slice(0, 3)).size, 'three to a row').toBe(1);
    expect(rows[3], 'the fourth starts the next row').toBeGreaterThan(rows[0]);
    await noSidewaysScroll(page);

    // The poster is no card: under the last of them, whole.
    const poster = page.getByRole('region', { name: 'Main reception flyer' }).getByRole('img');
    await poster.scrollIntoViewIfNeeded();
    const last = await box(page.locator('li.card').last());
    expect((await box(poster)).y).toBeGreaterThan(last.y + last.height);

    // A click on the picture is still a click on the card.
    await c.scrollIntoViewIfNeeded();
    const thumb = await box(c.locator('.card-thumb'));
    await page.mouse.click(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
    await expect(page).toHaveURL(new RegExp(`#/flyers/${first.id}$`));
  });

  for (const width of [390, 360]) {
    test(`at ${width} px the grid is two to a row, every button of a card inside the screen and a finger’s height`, async ({ page, request }) => {
      await page.setViewportSize({ width, height: 800 });
      // A title in one unbroken run has to wrap inside half the screen.
      await save(request, `Bachata_night_at_the_rooftop_terrace_${Date.now()}`);
      await page.addInitScript((key) => localStorage.setItem(key, 'grid'), VIEW_PREF);
      await page.goto('/');
      const [a, b, c] = [0, 1, 2].map((n) => page.locator('li.card').nth(n));
      await expect(a.locator('.card-thumb.card-thumb-ready')).toBeVisible();
      expect((await box(a)).y, 'two to a row').toBe((await box(b)).y);
      expect((await box(c)).y).toBeGreaterThan((await box(a)).y);
      expect(await box(a.locator('.card-thumb'))).toMatchObject({ width: 136, height: 181.33 });

      await noSidewaysScroll(page);
      for (const part of [a, b, zoomButton(a), zoomButton(b), ...(await a.locator('.card-actions').getByRole('button').all()), ...(await b.locator('.card-actions').getByRole('button').all())]) {
        const r = await box(part);
        expect(r.x, 'inside the screen, left').toBeGreaterThanOrEqual(0);
        expect(r.x + r.width, 'inside the screen, right').toBeLessThanOrEqual(width);
      }
      for (const button of await a.locator('.card-actions').getByRole('button').all()) expect((await box(button)).height, 'a finger’s height').toBeGreaterThanOrEqual(40);
    });
  }
});

test.describe('the zoom button and the lightbox', () => {
  test('the zoom button is a real button over the picture’s corner, 44 px to hit, in both views and on a phone', async ({ page }) => {
    const [first] = await flyers(page);
    for (const [view, width] of [
      ['list', 1440],
      ['grid', 1440],
      ['list', 360],
      ['grid', 360],
    ] as const) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await page.evaluate(([key, v]) => localStorage.setItem(key, v), [VIEW_PREF, view] as const);
      await page.reload();
      const c = card(page, first.title);
      const zoom = zoomButton(c);
      await expect(zoom, `${view} at ${width}`).toBeEnabled();
      await expect(zoom).toHaveAccessibleName(`Zoom in on ${first.title}`);
      const [z, thumb] = [await box(zoom), await box(c.locator('.card-thumb'))];
      expect([z.width, z.height], `${view} at ${width}: 44 px to hit`).toEqual([44, 44]);
      // In the picture's top-right corner, inside it.
      expect(z.x + z.width, `${view} at ${width}: at the picture's right edge`).toBeCloseTo(thumb.x + thumb.width, 0);
      expect(z.y, `${view} at ${width}: at the picture's top`).toBeCloseTo(thumb.y, 0);
      // No part of the link: a button in a link is no button.
      expect(await zoom.evaluate((el) => el.closest('a') === null)).toBe(true);
    }
  });

  test('it opens the flyer large and nothing else: no editor, the real <Flyer> fitted as the export, inside the window', async ({ page }) => {
    const stress = (await flyers(page)).find((f) => f.title === 'Long copy · stress test')!;
    const want = await exportFit(page, stress.id, DEFAULT_CANVAS);
    await page.goto('/');
    const c = card(page, stress.title);
    await c.scrollIntoViewIfNeeded();
    await zoomButton(c).click();

    const dialog = lightbox(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(`${stress.title}, large`);
    await expect(page, 'still the library').not.toHaveURL(/#\/flyers\//);
    const flyer = dialog.locator('.card-thumb.card-thumb-ready [data-flyer]');
    await expect(flyer).toBeVisible();
    await expect(flyer).toHaveAttribute('data-canvas', DEFAULT_CANVAS);
    expect(await flyer.evaluate((el) => [...el.querySelectorAll<HTMLElement>('[data-fit]')].map((f) => f.style.fontSize)), 'lightbox = export').toEqual(want);
    await expect(dialog.locator('.lightbox-meta')).toHaveText(`${CANVASES[DEFAULT_CANVAS].label} · 1080 × 1440`);

    // Whole, at its own shape, inside the window and above its bar.
    const [f, bar] = [await box(flyer), await box(dialog.locator('.lightbox-bar'))];
    expect(f.height / f.width).toBeCloseTo(1440 / 1080, 2);
    expect(f.x).toBeGreaterThanOrEqual(0);
    expect(f.x + f.width).toBeLessThanOrEqual(EDITOR_VIEWPORT.width);
    expect(f.y).toBeGreaterThanOrEqual(0);
    expect(f.y + f.height).toBeLessThanOrEqual(bar.y);
    expect(bar.y + bar.height).toBeLessThanOrEqual(EDITOR_VIEWPORT.height);
    expect(f.height, 'large: most of the window’s height').toBeGreaterThan(600);
    // "Open in editor" is its way to the editor.
    await dialog.getByRole('link', { name: 'Open in editor', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/flyers/${stress.id}$`));
    await expect(lightbox(page)).toHaveCount(0);
  });

  test('it shows the canvas this viewer last chose in the editor, with its name', async ({ page }) => {
    const stress = (await flyers(page)).find((f) => f.title === 'Long copy · stress test')!;
    const want = await exportFit(page, stress.id, 'story');
    await page.addInitScript((key) => localStorage.setItem(key, 'story'), CANVAS_PREF);
    await page.goto('/');
    const c = card(page, stress.title);
    await c.scrollIntoViewIfNeeded();
    // The card's own picture stays the default canvas.
    await expect(c.locator('.card-thumb [data-flyer]')).toHaveAttribute('data-canvas', DEFAULT_CANVAS);
    await zoomButton(c).click();
    const flyer = lightbox(page).locator('.card-thumb.card-thumb-ready [data-flyer]');
    await expect(flyer).toHaveAttribute('data-canvas', 'story');
    expect(await flyer.evaluate((el) => [...el.querySelectorAll<HTMLElement>('[data-fit]')].map((f) => f.style.fontSize))).toEqual(want);
    await expect(lightbox(page).locator('.lightbox-meta')).toHaveText(`${CANVASES.story.label} · 1080 × 1920`);
    const f = await box(flyer);
    expect(f.height / f.width).toBeCloseTo(1920 / 1080, 2);
  });

  test('the focus goes in, stays in, and comes back to the zoom button; Escape, the close button and the backdrop close it', async ({ page }) => {
    const [first] = await flyers(page);
    await page.goto('/');
    const zoom = zoomButton(card(page, first.title));
    const dialog = lightbox(page);
    const inside = () => page.evaluate(() => !!document.activeElement?.closest('dialog'));

    // By the keyboard: in, round and round, and back. (The button waits greyed until its card's flyer is here.)
    await expect(zoom).toBeEnabled();
    await zoom.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    expect(await inside(), 'the focus went in').toBe(true);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      // The browser's own bar may take the focus for one stop of the round; the page behind never does.
      expect(await page.evaluate(() => !document.activeElement?.closest('.library')), `Tab ${i + 1} stays out of the page behind`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(zoom, 'the focus is back').toBeFocused();

    // The close button.
    await zoom.click();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(zoom).toBeFocused();

    // A press on the flyer closes nothing; a press on the backdrop does.
    await zoom.click();
    const f = await box(dialog.locator('.card-thumb'));
    await page.mouse.click(f.x + f.width / 2, f.y + f.height / 2);
    await expect(dialog).toBeVisible();
    await expect(page, 'and opens no editor').not.toHaveURL(/#\/flyers\//);
    // Nor does a press that starts on the bar and is let go over the backdrop (a slip while aiming at a button).
    const bar = await box(dialog.locator('.lightbox-title'));
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(f.x / 2, f.y + f.height / 2);
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    await page.mouse.click(f.x / 2, f.y + f.height / 2);
    await expect(dialog).toHaveCount(0);
  });

  test('the library behind keeps its place: it does not scroll under the lightbox', async ({ page }) => {
    const list = await flyers(page);
    await page.goto('/');
    const c = card(page, list[2].title);
    await c.scrollIntoViewIfNeeded();
    const library = page.locator('.library');
    await library.evaluate((el) => (el.scrollTop = 150));
    const before = await library.evaluate((el) => el.scrollTop);
    await zoomButton(c).click();
    await expect(lightbox(page)).toBeVisible();
    await page.mouse.move(EDITOR_VIEWPORT.width / 2, EDITOR_VIEWPORT.height / 2);
    await page.mouse.wheel(0, 600);
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(200);
    expect(await library.evaluate((el) => el.scrollTop)).toBe(before);
    await page.keyboard.press('Escape');
    await page.mouse.wheel(0, 300);
    await expect.poll(() => library.evaluate((el) => el.scrollTop), 'and scrolls again once it is closed').toBeGreaterThan(before);
  });

  test('on a phone the flyer and its bar fit the screen', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const [first] = await flyers(page);
    await page.goto('/');
    await zoomButton(card(page, first.title)).click();
    const dialog = lightbox(page);
    await expect(dialog.locator('.card-thumb.card-thumb-ready')).toBeVisible();
    for (const part of [dialog.locator('.card-thumb'), dialog.getByRole('button', { name: 'Close', exact: true }), ...(await dialog.locator('.lightbox-actions').locator('button:visible, a:visible').all())]) {
      const r = await box(part);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(360);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.height).toBeLessThanOrEqual(740);
    }
    expect((await box(dialog.locator('.card-thumb'))).width, 'nearly the screen’s width').toBeGreaterThan(300);
  });
});
