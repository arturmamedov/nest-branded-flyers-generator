import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, closeToast, downloadMenu, dropFile, saveNew, stopClock, templateButton, toast, warningsChip, type FilePayload } from '../editor';
import { PHOTO_MODE_LABEL } from '../../src/editor/photoModes';
import { OUTCOME_MS } from '../../src/editor/toastFolds';
import { TEMPLATE_LABEL } from '../../src/editor/templates';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* The editor's notes are toasts in the stage's bottom-right corner (src/editor/Toasts.tsx; the editor's UX round,
   Part 1). The owner's rule above the rest (2026-10-07): a note never takes space from the flyer. Each has a close
   button, and a closed warning whose problem is still there folds into a "⚠ n" chip. The AI page's are held in
   ai.spec.ts, which has the server they need. */

test.use({ viewport: EDITOR_VIEWPORT });

const PHONE = { width: 390, height: 844 };

const saved: number[] = [];
const keep = (id: number) => saved.push(id);
test.afterEach(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

const stage = (page: Page) => page.locator('.stage');
const flyer = (page: Page) => page.locator('.stage-canvas');
const modeButton = (page: Page, mode: keyof typeof PHOTO_MODE_LABEL) => page.getByRole('button', { name: PHOTO_MODE_LABEL[mode], exact: true });
/** A new flyer's standing warning: its frame has no photo yet. */
const needsPhoto = (page: Page) => toast(page, 'warn').filter({ hasText: 'Add a photo' });

const box = async (l: Locator) => (await l.boundingBox())!;
const apart = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

/** The preview's own margin round the flyer on the stage (Preview.tsx fits it into the stage less this). */
const STAGE_PAD = 48;

test('a warning takes nothing from the flyer: the stage keeps the whole height under the toolbar, and the flyer fills it', async ({ page }) => {
  await page.goto('/#/new');
  await expect(needsPhoto(page)).toBeVisible();
  // The flyer as tall as the stage allows, whatever stands in the corner. Polled: the toolbar's own font, once loaded,
  // moves the stage by a pixel, and the preview follows a frame later.
  const fills = () =>
    expect
      .poll(async () => {
        const [toolbar, s, f] = [await box(page.locator('.toolbar')), await box(stage(page)), await box(flyer(page))];
        return [Math.round(s.y - (toolbar.y + toolbar.height)), Math.round(s.y + s.height), Math.round(s.height - f.height)];
      })
      .toEqual([0, EDITOR_VIEWPORT.height, STAGE_PAD]);
  await fills();
  await needsPhoto(page).getByRole('button', { name: `switch to ${PHOTO_MODE_LABEL.none}` }).click();
  await expect(toast(page, 'warn')).toHaveCount(0);
  await fills();
});

test('the toasts stand in the stage’s bottom-right corner, inside it', async ({ page }) => {
  await page.goto('/#/new');
  await expect(needsPhoto(page)).toBeVisible();
  const [s, t] = [await box(stage(page)), await box(page.locator('.toasts .toast-warn'))];
  expect(Math.round(s.x + s.width - (t.x + t.width)), 'from the right edge').toBe(16);
  expect(Math.round(s.y + s.height - (t.y + t.height)), 'from the bottom edge').toBe(16);
  expect(t.y).toBeGreaterThan(s.y);
});

test('a closed warning folds into the chip while its problem stands, and the chip opens it again', async ({ page }) => {
  await page.goto('/#/new');
  await expect(warningsChip(page)).toHaveCount(0);
  await closeToast(needsPhoto(page)).click();
  await expect(needsPhoto(page)).toHaveCount(0);
  await expect(warningsChip(page)).toHaveText('⚠ 1');
  await expect(warningsChip(page)).toHaveAccessibleName('Show 1 warning');
  // The reason Download is grey is one tap away.
  await expect(downloadMenu(page)).toBeDisabled();

  // Typing leaves it folded: its words have not changed.
  await page.getByLabel('Line 1').fill('Saturday is a');
  await expect(needsPhoto(page)).toHaveCount(0);
  await expect(warningsChip(page)).toHaveText('⚠ 1');

  await warningsChip(page).click();
  await expect(needsPhoto(page)).toBeVisible();
  await expect(warningsChip(page)).toHaveCount(0);
});

test('a closed warning that goes away and comes back shows again', async ({ page }) => {
  await page.goto('/#/new');
  await closeToast(needsPhoto(page)).click();
  await expect(warningsChip(page)).toHaveText('⚠ 1');
  await modeButton(page, 'none').click();
  await expect(warningsChip(page)).toHaveCount(0);
  await modeButton(page, 'band').click();
  await expect(needsPhoto(page)).toBeVisible();
  await expect(warningsChip(page)).toHaveCount(0);
});

test('a second warning joins the chip’s count only when it is closed too', async ({ page }) => {
  await page.goto('/#/new');
  await closeToast(needsPhoto(page)).click();
  await page.getByLabel('Line 1').fill('Pool • party');
  const rule = toast(page, 'warn').filter({ hasText: 'bullets' });
  await expect(rule, 'a new warning opens beside the folded one').toBeVisible();
  await expect(warningsChip(page)).toHaveText('⚠ 1');
  await closeToast(rule).click();
  await expect(warningsChip(page)).toHaveText('⚠ 2');
  await expect(warningsChip(page)).toHaveAccessibleName('Show 2 warnings');
  await warningsChip(page).click();
  await expect(toast(page, 'warn')).toHaveCount(2);
});

test('a success closes by itself after a while, and waits while the pointer or the focus is on it', async ({ page }) => {
  await page.goto('/#/new');
  await stopClock(page);
  await saveNew(page, keep);
  const done = toast(page, 'ok');
  await expect(done).toHaveText('Saved to the library.');
  await done.hover();
  await page.clock.fastForward(OUTCOME_MS * 2);
  await expect(done, 'read at leisure').toBeVisible();
  await closeToast(done).focus();
  await page.mouse.move(5, 5);
  await page.clock.fastForward(OUTCOME_MS * 2);
  await expect(done, 'the focus holds it as the pointer did').toBeVisible();
  await page.getByLabel('Line 1').focus();
  await page.clock.fastForward(OUTCOME_MS + 100);
  await expect(done).toHaveCount(0);
});

test('a success closes after its time while the staff member keeps typing', async ({ page }) => {
  // Found in review (2026-10-07): every render started the six seconds again, so the toast stayed for as long as
  // anyone worked.
  await page.goto('/#/new');
  await stopClock(page);
  await saveNew(page, keep);
  const done = toast(page, 'ok');
  await expect(done).toBeVisible();
  for (const typed of ['S', 'Sa', 'Sat']) {
    await page.getByLabel('Line 1').fill(typed);
    await page.clock.fastForward(OUTCOME_MS / 2);
  }
  await expect(done).toHaveCount(0);
});

test('an error stays until it is closed', async ({ page }) => {
  await page.goto('/#/new');
  await stopClock(page);
  await templateButton(page, 'week').click();
  const file: FilePayload = { name: 'party.png', mimeType: 'image/png', buffer: Buffer.from('x') };
  await dropFile(page, stage(page), file);
  const refused = toast(page, 'error');
  await expect(refused).toContainText(`${TEMPLATE_LABEL.week} flyer has no photo`);
  await page.clock.fastForward(OUTCOME_MS * 3);
  await expect(refused).toBeVisible();
  await closeToast(refused).click();
  await expect(refused).toHaveCount(0);
});

test('a toast never takes the focus, and one closed from the keyboard hands it to the chip', async ({ page }) => {
  await page.goto('/#/new');
  await saveNew(page, keep);
  await expect(toast(page, 'ok')).toBeVisible();
  await expect(page.locator('.toasts :focus'), 'the toast that came did not take the focus').toHaveCount(0);

  await closeToast(needsPhoto(page)).focus();
  await page.keyboard.press('Enter');
  await expect(warningsChip(page)).toBeFocused();
});

test('an error is an alert and a success a status; the standing warnings are a plain list', async ({ page }) => {
  await page.goto('/#/new');
  await expect(page.getByRole('list', { name: 'Warnings' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.locator('.toasts [role="alert"] .toast-warn, .toasts [role="status"] .toast-warn')).toHaveCount(0);
  await saveNew(page, keep);
  await expect(page.locator('.toasts [role="status"] .toast-ok')).toBeVisible();
  await templateButton(page, 'week').click();
  await dropFile(page, stage(page), { name: 'party.png', mimeType: 'image/png', buffer: Buffer.from('x') });
  await expect(page.locator('.toasts [role="alert"] .toast-error')).toBeVisible();
});

test('the corner is no wall: beside the chip, the stage under it gets the pointer', async ({ page }) => {
  await page.goto('/#/new');
  await closeToast(needsPhoto(page)).click();
  const [corner, chip] = [await box(page.locator('.toasts')), await box(warningsChip(page))];
  expect(chip.x - corner.x, 'the corner is wider than the chip in it').toBeGreaterThan(100);
  // A point inside the corner's box, left of the chip.
  const point: [number, number] = [corner.x + 20, chip.y + chip.height / 2];
  const hit = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return { inCorner: el?.closest('.toasts') !== null, inStage: el?.closest('.stage') !== null };
  }, point);
  expect(hit).toEqual({ inCorner: false, inStage: true });
});

test('the same words on two fields are two warnings: closing one leaves the other', async ({ page }) => {
  // Found in review (2026-10-07): they shared an id, so one close folded both.
  await page.goto('/#/new');
  await page.getByLabel('Line 1').fill('Pool • party');
  await page.getByLabel('Line 2').fill('Pool • party');
  const rule = toast(page, 'warn').filter({ hasText: 'bullets' });
  await expect(rule).toHaveCount(2);
  await closeToast(rule.first()).click();
  await expect(rule).toHaveCount(1);
  await expect(warningsChip(page)).toHaveText('⚠ 1');
});

test('the chip’s focus ring is drawn whole, inside the corner’s box', async ({ page }) => {
  // Found in review (2026-10-07): the corner scrolls, so it clips, and the chip stood flush against its edges.
  await page.goto('/#/new');
  await closeToast(needsPhoto(page)).click();
  const [corner, chip] = [await box(page.locator('.toasts')), await box(warningsChip(page))];
  const ring = 4; // a 2 px outline, 2 px off the chip
  expect(corner.x + corner.width - (chip.x + chip.width)).toBeGreaterThanOrEqual(ring);
  expect(corner.y + corner.height - (chip.y + chip.height)).toBeGreaterThanOrEqual(ring);
});

test('the region a success is announced from is in the page before its words', async ({ page }) => {
  // Found in review (2026-10-07): empty, it was display: none, and a region shown together with its words is one
  // several screen readers do not read.
  await page.goto('/#/new');
  const region = page.locator('.toasts [role="status"]');
  await expect(region).toBeEmpty();
  expect(await region.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
  // Empty, it takes no room: the warning above it sits where it would without it.
  expect((await box(region)).height).toBeLessThanOrEqual(1);
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('a standing warning starts folded into the chip, and an action’s outcome opens', async ({ page }) => {
    await page.goto('/#/new');
    await expect(warningsChip(page)).toHaveText('⚠ 1');
    await expect(toast(page, 'warn')).toHaveCount(0);
    await saveNew(page, keep);
    await expect(toast(page, 'ok')).toHaveText('Saved to the library.');
    await expect(toast(page, 'warn'), 'the outcome opens by itself; the warning waits in its chip').toHaveCount(0);
    await warningsChip(page).click();
    await expect(needsPhoto(page)).toBeVisible();
  });

  test('the toasts stand above the Share text pill, which keeps its corner', async ({ page }) => {
    await page.goto('/#/new');
    await page.getByLabel('Caption').fill('Come to the pool');
    const pill = page.locator('.share-fab');
    await expect(pill).toBeVisible();
    await warningsChip(page).click();
    await expect(needsPhoto(page)).toBeVisible();
    expect(apart(await box(pill), await box(page.locator('.toasts .toast-warn'))), 'they do not overlap').toBe(true);
    // Nor does the corner's own box lie over the pill: it would take the tap meant for it.
    const [x, y] = [(await box(pill)).x + 10, (await box(pill)).y + 10];
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.share-fab') !== null, [x, y])).toBe(true);
    const [s, p] = [await box(stage(page)), await box(pill)];
    expect(Math.round(s.x + s.width - (p.x + p.width))).toBe(12);
  });

  test('on a short phone, where the stage ends below the screen, a toast is on the screen all the same', async ({ page }) => {
    // Found in review (2026-10-07): the corner is the stage's, and on a small phone the stage's bottom is under the
    // fold, so a success came and went unseen.
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/#/new');
    const s = await box(stage(page));
    expect(s.y + s.height, 'the stage ends below the screen').toBeGreaterThan(640);
    await expect(warningsChip(page)).toBeInViewport({ ratio: 1 });
    await saveNew(page, keep);
    await expect(toast(page, 'ok')).toBeInViewport({ ratio: 1 });
    // Scrolled to the stage's end, they stand in its corner, above the Share text pill's place.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(warningsChip(page)).toBeInViewport({ ratio: 1 });
    const [end, chip] = [await box(stage(page)), await box(warningsChip(page))];
    expect(Math.round(end.y + end.height - (chip.y + chip.height))).toBe(12);
  });

  test('the toasts fit the phone’s width', async ({ page }) => {
    await page.goto('/#/new');
    await warningsChip(page).click();
    const t = await box(page.locator('.toasts .toast-warn'));
    expect(t.x).toBeGreaterThanOrEqual(12);
    expect(t.x + t.width).toBeLessThanOrEqual(PHONE.width - 12 + 0.5);
  });
});
