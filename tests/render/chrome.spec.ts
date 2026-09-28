import type { Page } from '@playwright/test';
import { KIT_URL, expect, test } from '../browser';

/* The editor's top bar is <nest-nav>, loaded from nestpass.ai; tests/browser.ts blocks it in every
   spec. These two tests hold the editor's side of the contract (the nestpass-tools README):
   - without the script, the editor shows its own fallback bar at the shared 54 px;
   - with a bar defined, the fallback brand steps aside and the editor's links still work in its
     default slot. */

const BAR_HEIGHT = 54;

// Just enough of a <nest-nav> to exercise the slots; the real one is tested in nestpass-tools.
const STAND_IN = `customElements.define('nest-nav', class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;height:54px;padding:0 20px;background:#083344"><b>Nests tools</b><slot></slot></div>';
  }
});`;

test.use({ viewport: { width: 1440, height: 900 } });

const barHeight = (page: Page) => page.locator('nest-nav').evaluate((nav) => nav.getBoundingClientRect().height);

async function editorLinksWork(page: Page) {
  await page.getByRole('link', { name: 'New flyer' }).click();
  await expect(page).toHaveURL(/#\/new$/);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
}

test('without the shared bar, the editor shows its own: the Flyers brand and its links, at the bar height', async ({ page }) => {
  const kit = page.waitForRequest(KIT_URL);
  await page.goto('/');
  await kit; // the built index.html asks nestpass.ai for the bar, and the fixture refuses it
  await expect(page.locator('nest-nav > .brand')).toBeVisible();
  await expect(page.locator('nest-nav > .brand')).toHaveText('Flyers');
  expect(await page.evaluate(() => customElements.get('nest-nav'))).toBeUndefined();
  expect(await barHeight(page)).toBe(BAR_HEIGHT);
  await editorLinksWork(page);
});

test("with the bar defined, the brand steps aside and the editor's links keep working in its slot", async ({ page }) => {
  await page.route(KIT_URL, (route) => route.fulfill({ contentType: 'text/javascript', body: STAND_IN }));
  await page.goto('/');
  await page.evaluate(() => customElements.whenDefined('nest-nav'));
  await expect(page.locator('nest-nav')).toHaveAttribute('tool', 'flyers');
  await expect(page.locator('nest-nav > .brand')).toBeHidden();
  await expect(page.getByText('Nests tools')).toBeVisible();
  expect(await barHeight(page)).toBe(BAR_HEIGHT);
  await editorLinksWork(page);
});
