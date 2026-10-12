import type { Page } from '@playwright/test';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, noClipboard, toast } from '../editor';
import { COPY_FAILED } from '../../src/editor/clipboard';

/* One clipboard for the share text and the flyer's picture (src/editor/clipboard.ts; the editor's UX round, Part 3):
   each says "copied" or that it could not, and why. The owner's phone said nothing at "Copy text" (2026-10-07): it
   reached the editor over plain http, where a browser gives a page no clipboard at all. */

test.use({ viewport: EDITOR_VIEWPORT });

/** A clipboard that says no to text, as a browser does with no tap close enough behind the call. */
const refusingText = (page: Page) =>
  page.addInitScript(() => {
    Clipboard.prototype.writeText = () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'));
  });

const panelCopy = (page: Page) => page.getByRole('button', { name: 'Copy text', exact: true });
const panelStatus = (page: Page) => page.locator('.share-copy').getByRole('status');
const pill = (page: Page) => page.getByRole('button', { name: 'Copy the share text', exact: true });

/** A new flyer with a caption: both of its copy buttons are there. */
async function withCaption(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/new');
  await page.getByLabel('Caption').fill('TODAY we have a sunset plan! 🌅');
  await expect(panelCopy(page)).toBeEnabled();
  return errors;
}

for (const [why, arrange] of [
  ['unavailable', noClipboard],
  ['refused', refusingText],
] as const) {
  test(`“Copy text” that could not copy says so, and why (${why}): under the caption, and in a toast for the pill`, async ({ page }) => {
    await arrange(page);
    const errors = await withCaption(page);

    await panelCopy(page).click();
    await expect(panelStatus(page)).toHaveText(COPY_FAILED.text[why]);

    // The pill has room for one word: its reason is a toast, which stays until it is closed.
    await pill(page).click();
    await expect(pill(page)).toHaveText('Couldn’t copy');
    await expect(toast(page, 'error')).toHaveText(COPY_FAILED.text[why]);
    expect(errors, 'nothing thrown on the page').toEqual([]);
  });
}
