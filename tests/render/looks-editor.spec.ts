import type { Page } from '@playwright/test';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, lookButton, lookSwitch, openSection, sectionHead, status } from '../editor';
import { sampleCopy, siteNames } from './proofFlyers';
import { PROOF_LOOK_ID } from '../proof/id';
import { PROOF_LOOK } from '../proof/look';
import { FIELD } from '../../src/editor/fields';
import { FIRST_LOOK } from '../../src/shared/looks';
import { HAND_DRAWN } from '../../src/shared/looks/handDrawn';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* The Look switch in the editor's Flyer section (docs/prompts/looks-seam.md, stage 6; the owner's answers 5 and 6),
   on the tests' own server, whose site names both looks: "Look" under Template, shown only with more than one look to
   pick, the pressed one the look the flyer is drawn in. The closed section's line names the look last, and only where
   the switch shows (his pick from the pictures, 2026-10-14). */

test.use({ viewport: EDITOR_VIEWPORT });

const saved: number[] = [];
const keep = (id: number) => saved.push(id);
test.afterEach(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

const drawnIn = (page: Page) => page.locator('.stage-canvas [data-flyer]');
const flyerLine = (page: Page) => sectionHead(page, FIELD.flyer).locator('.section-line');

/** The switch's buttons, in order, with the pressed one. */
async function offered(page: Page): Promise<{ names: string[]; pressed: string[] }> {
  const buttons = lookSwitch(page).getByRole('button');
  const names = await buttons.allTextContents();
  const pressed = [];
  for (const [i, name] of names.entries()) if ((await buttons.nth(i).getAttribute('aria-pressed')) === 'true') pressed.push(name);
  return { names, pressed };
}

async function closeFlyerSection(page: Page) {
  const head = sectionHead(page, FIELD.flyer);
  if ((await head.getAttribute('aria-expanded')) === 'true') await head.click();
}

test('a site with two looks shows the switch under Template: a press redraws the preview, is unsaved, saves, and is still there after a reload', async ({ page, request }) => {
  const { id } = await sampleCopy(request, 'Pool party', 'band', keep, FIRST_LOOK);
  await page.goto(`/#/flyers/${id}`);
  await openSection(page, FIELD.flyer);
  // Under Template, before Hostel.
  const fields = await page.locator('.panel .section').first().locator('.label').allTextContents();
  expect(fields.slice(0, 3)).toEqual([FIELD.template, FIELD.look, FIELD.hostel]);
  expect(await offered(page)).toEqual({ names: [HAND_DRAWN.name, PROOF_LOOK.name], pressed: [HAND_DRAWN.name] });
  await expect(drawnIn(page)).toHaveAttribute('data-look', FIRST_LOOK);
  await expect(status(page)).toHaveText('Saved');

  await lookButton(page, PROOF_LOOK.name).click();
  await expect(drawnIn(page)).toHaveAttribute('data-look', PROOF_LOOK_ID);
  expect((await offered(page)).pressed).toEqual([PROOF_LOOK.name]);
  await expect(status(page)).toHaveText('Unsaved changes');
  // And back: the flyer as it was, so nothing to save.
  await lookButton(page, HAND_DRAWN.name).click();
  await expect(status(page)).toHaveText('Saved');
  await lookButton(page, PROOF_LOOK.name).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(status(page)).toHaveText('Saved');
  const stored = (await (await request.get(`/api/flyers/${id}`)).json()) as { flyer: { data: { look: string } } };
  expect(stored.flyer.data.look).toBe(PROOF_LOOK_ID);

  await page.reload();
  await openSection(page, FIELD.flyer);
  await expect(drawnIn(page)).toHaveAttribute('data-look', PROOF_LOOK_ID);
  expect((await offered(page)).pressed).toEqual([PROOF_LOOK.name]);
  await closeFlyerSection(page);
  await expect(flyerLine(page)).toHaveText(/ · Proof$/);
});

test('the look already pressed changes nothing, on a flyer from a backend older than looks too', async ({ page, request }) => {
  const { id } = await sampleCopy(request, 'Pool party', 'band', keep, FIRST_LOOK);
  // An older backend sends no look: the editor draws the first look, and pressing it must not make the flyer unsaved.
  await page.route(`**/api/flyers/${id}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const res = await route.fetch();
    const body = (await res.json()) as { flyer: { data: Record<string, unknown> } };
    delete body.flyer.data.look;
    await route.fulfill({ response: res, json: body });
  });
  await page.goto(`/#/flyers/${id}`);
  await openSection(page, FIELD.flyer);
  await expect(status(page)).toHaveText('Saved');
  expect((await offered(page)).pressed).toEqual([HAND_DRAWN.name]);
  await lookButton(page, HAND_DRAWN.name).click();
  await expect(status(page)).toHaveText('Saved');
});

test('a site that names one look shows no switch, and the closed line is as it was; a flyer in another look shows its own beside it', async ({ page, request }) => {
  await siteNames(page, [FIRST_LOOK]);
  const hand = await sampleCopy(request, 'Pool party', 'band', keep, FIRST_LOOK);
  await page.goto(`/#/flyers/${hand.id}`);
  await openSection(page, FIELD.flyer);
  await expect(page.getByRole('group', { name: FIELD.template })).toBeVisible();
  await expect(lookSwitch(page)).toHaveCount(0);
  await closeFlyerSection(page);
  await expect(flyerLine(page)).toHaveText('Activity · Duque Nest');

  // M2: the site's list decides what is offered; a flyer in a look it does not name still shows that look, pressed.
  const proof = await sampleCopy(request, 'Pool party', 'band', keep);
  await page.goto(`/#/flyers/${proof.id}`);
  await openSection(page, FIELD.flyer);
  expect(await offered(page)).toEqual({ names: [HAND_DRAWN.name, PROOF_LOOK.name], pressed: [PROOF_LOOK.name] });
  await expect(status(page)).toHaveText('Saved');
});

test('a new flyer starts in the first look the site names, with nothing unsaved', async ({ page }) => {
  // This server names hand-drawn first.
  await page.goto('/#/new');
  await expect(drawnIn(page)).toHaveAttribute('data-look', FIRST_LOOK);
  expect(await offered(page)).toEqual({ names: [HAND_DRAWN.name, PROOF_LOOK.name], pressed: [HAND_DRAWN.name] });
  await expect(status(page)).not.toHaveText('Unsaved changes');

  // A site that names the proof look first: both copies of the blank flyer start in it.
  const other = await page.context().newPage();
  await siteNames(other, [PROOF_LOOK_ID, FIRST_LOOK]);
  await other.goto('/#/new');
  await expect(drawnIn(other)).toHaveAttribute('data-look', PROOF_LOOK_ID);
  expect(await offered(other)).toEqual({ names: [PROOF_LOOK.name, HAND_DRAWN.name], pressed: [PROOF_LOOK.name] });
  await expect(status(other)).not.toHaveText('Unsaved changes');
  await other.close();
});
