import type { Page } from '@playwright/test';
import { KIT_URL, expect, test } from '../browser';
import { EDITOR_VIEWPORT, backToLibrary } from '../editor';

/* The library's top bar is <nest-nav>, loaded from nestpass.ai; tests/browser.ts blocks it in every
   spec. These two tests hold the app's side of the contract (the nestpass-tools README):
   - without the script, the library shows its own fallback bar at the shared 54 px;
   - with a bar defined, the fallback brand steps aside and the app's links still work in its
     default slot.
   Both also hold that the editor is a focus page: no bar, and the panel's link goes back. */

const BAR_HEIGHT = 54;

// Just enough of a <nest-nav> to exercise the slots; the real one is tested in nestpass-tools.
const STAND_IN = `customElements.define('nest-nav', class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;height:54px;padding:0 20px;background:#083344"><b>Nests tools</b><slot></slot></div>';
  }
});`;

test.use({ viewport: EDITOR_VIEWPORT });

const barHeight = (page: Page) => page.locator('nest-nav').evaluate((nav) => nav.getBoundingClientRect().height);

async function editorHasNoBarAndGoesBack(page: Page) {
  await page.getByRole('link', { name: 'New flyer' }).click();
  await expect(page).toHaveURL(/#\/new$/);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await expect(page.locator('nest-nav')).toHaveCount(0);
  await backToLibrary(page).click();
  await expect(page).toHaveURL(/#\/$/);
  expect(await barHeight(page)).toBe(BAR_HEIGHT);
}

test('without the shared bar, the library shows its own: the Flyers brand and its links, at the bar height', async ({ page }) => {
  const kit = page.waitForRequest(KIT_URL);
  await page.goto('/');
  await kit; // the built index.html asks nestpass.ai for the bar, and the fixture refuses it
  await expect(page.locator('nest-nav > .brand')).toBeVisible();
  await expect(page.locator('nest-nav > .brand')).toHaveText('Flyers');
  expect(await page.evaluate(() => customElements.get('nest-nav'))).toBeUndefined();
  expect(await barHeight(page)).toBe(BAR_HEIGHT);
  await editorHasNoBarAndGoesBack(page);
});

test("with the bar defined, the brand steps aside and the library's links keep working in its slot", async ({ page }) => {
  await page.route(KIT_URL, (route) => route.fulfill({ contentType: 'text/javascript', body: STAND_IN }));
  await page.goto('/');
  await page.evaluate(() => customElements.whenDefined('nest-nav'));
  await expect(page.locator('nest-nav')).toHaveAttribute('tool', 'flyers');
  await expect(page.locator('nest-nav > .brand')).toBeHidden();
  await expect(page.getByText('Nests tools')).toBeVisible();
  expect(await barHeight(page)).toBe(BAR_HEIGHT);
  await editorHasNoBarAndGoesBack(page);
});
