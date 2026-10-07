import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Dialog, Page } from '@playwright/test';
import sharp from 'sharp';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, apiCall, apiRoute, backToLibrary, dropFile, hold, openSection, paste, closeToast, saveNew, status, toast, warningsChip, type FilePayload } from '../editor';
import { LEAVE_PROMPT } from '../../src/editor/leaveGuard';
import { PHOTO_MODE_LABEL } from '../../src/editor/photoModes';
import { SECTIONS_PREF } from '../../src/editor/sectionFolds';
import { AI_DAILY_LIMIT, AI_FAKE, AI_FEATURES, AI_PICTURE_MAX_EDGE, aiFor, aiQuotaVars, type AiFeature } from '../../src/shared/ai';
import { apiError } from '../../src/shared/errors';
import { newFlyerData } from '../../src/shared/defaults';
import { DEFAULT_CANVAS, type PhotoMode } from '../../src/shared/layout';
import { AiFlyerResultSchema, AiPhotoResultSchema, AiShareResultSchema, ApiConfigSchema, FlyerSavedSchema, PhotoInfoSchema, type AiFlyerAnswer } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* The AI assistant in the browser (docs/prompts/ai-assistant.md, Phase 4). playwright.config.ts runs this file alone
   against a second server on the fake provider, with its own store and ledger. A day allows AI_DAILY_LIMIT
   generations of each feature (the owner's answer, 2026-10-06), and the file spends, on purpose: all three of the
   flyer's (a Generate, a Try again, and at the end the flyer made from a picture's words), one of the share text's (a
   Write with AI) and two of the picture reads' (one with words, one with none). Every failure comes from the fake's
   markers or, for a read, from a picture's width. Those never count, though a failed read is one of the day's nine
   tries, and the file makes one. A limit reached is a routed answer. Counts are read from api/config, never assumed,
   so each test checks what it spent itself, and a test that needs another count routes it. The specs of the steps and
   of the picture as the flyer's photo answer the read and the flyer themselves, so they spend nothing; where a picture
   is uploaded as a photo, the upload is a real one, to this server's own store. */

test.use({ viewport: EDITOR_VIEWPORT });

const bundle = JSON.parse(readFileSync(join(import.meta.dirname, '../../schema/ai.json'), 'utf8')) as { examples: { text: string; answer: AiFlyerAnswer }[] };
const example = bundle.examples[0];
const brief = example.answer.brief;

/** Flyers a test saved, archived afterwards. */
const saved: number[] = [];
const keep = (id: number) => saved.push(id);
/** The answers still being read for an id: the clean-up waits for them. */
const reading: Promise<void>[] = [];
test.afterEach(async ({ request }) => {
  await Promise.all(reading.splice(0));
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});
// A new flyer the page saves by itself is kept too: "Write with AI" writes the caption and saves the flyer.
test.beforeEach(({ page }) => {
  page.on('response', (res) => {
    if (res.status() !== 201 || !apiCall('POST', 'flyers')(res)) return;
    reading.push(
      res.json().then(
        (body) => void keep(FlyerSavedSchema.parse(body).id),
        () => {},
      ),
    );
  });
});

/** A saved flyer made through the API, with this caption, archived afterwards. */
async function savedFlyer(page: Page, share: string): Promise<number> {
  const res = await page.request.post('/api/flyers', {
    headers: WRITE_HEADERS,
    data: { title: `ai spec caption ${Date.now()}`, hostel: null, template: 'activity', data: { ...newFlyerData('activity'), share }, photoId: null },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = FlyerSavedSchema.parse(await res.json());
  keep(id);
  return id;
}

/** What is left today of one feature, as the server says. */
async function left(page: Page, feature: AiFeature): Promise<number> {
  const { ai } = ApiConfigSchema.parse(await (await page.request.get('/api/config')).json());
  const its = aiFor(ai, feature);
  if (!its) throw new Error('This file runs against the server with the fake provider and every feature named (playwright.config.ts, project ai).');
  return its.remaining;
}

const entry = (page: Page) => page.locator('nest-nav').getByRole('link', { name: /^Create with AI/ });
/** Loose: a textarea inside its label takes its own text into its name. */
const idea = (page: Page) => page.getByLabel('Your idea');
const generate = (page: Page) => page.getByRole('button', { name: /^✨ Generate/ });
const tryAgain = (page: Page) => page.getByRole('button', { name: /^Try again/ });
const openInEditor = (page: Page) => page.getByRole('button', { name: 'Open in editor', exact: true });
const writeWithAi = (page: Page) => page.getByRole('button', { name: /^✨ Write with AI/ });
/** What "Write with AI" steps back to once the caption is written for the flyer as it is. */
const writeAgain = (page: Page) => page.getByRole('button', { name: /^Write again/ });
const CAPTION_SAVED = '✨ The AI wrote the caption and saved the flyer: read it before you post.';
/** The editor's sections that are closed (src/editor/sectionFolds.ts; panel.spec.ts has the rest). */
const closedSections = (page: Page) => page.locator('.panel .section-head[aria-expanded="false"]');
const errorNote = (page: Page) => toast(page, 'error');
const preview = (page: Page) => page.locator('.stage-canvas');

/** api/config as the server answers it, but with `remaining` left today: for a test that must not depend on what the
    tests before it spent (the fake's failures still reach the server, and never count). One number is every feature's;
    by name, a feature left out has all of its own. `named` are the features the site runs: every one, unless the test
    is about a site that names fewer. */
async function withLeft(page: Page, remaining: number | Partial<Record<AiFeature, number>>, named: readonly AiFeature[] = AI_FEATURES) {
  const of = (name: AiFeature) => (typeof remaining === 'number' ? remaining : (remaining[name] ?? AI_DAILY_LIMIT));
  await page.route(apiRoute('config'), async (route) => {
    const res = await route.fetch();
    const features = named.map((name) => ({ name, limit: AI_DAILY_LIMIT, remaining: of(name) }));
    await route.fulfill({ response: res, json: { ...(await res.json()), ai: { enabled: true, features } } });
  });
}

/** Fails the test on any dialog but the ones it expects. */
function noDialogs(page: Page) {
  const seen: string[] = [];
  const handler = (d: Dialog) => {
    seen.push(d.message());
    void d.dismiss();
  };
  page.on('dialog', handler);
  return () => {
    page.off('dialog', handler);
    return seen;
  };
}

/** Runs `action`, which must open a confirm dialog, answers it, and returns its message. */
async function answerConfirm(page: Page, answer: 'accept' | 'dismiss', action: () => Promise<unknown>): Promise<string> {
  const asked = new Promise<string>((resolve) =>
    page.once('dialog', (d) => {
      expect(d.type()).toBe('confirm');
      resolve(d.message());
      void d[answer]();
    }),
  );
  await action();
  return asked;
}

test('the library offers "Create with AI" with what is left today, and the page starts empty and focused', async ({ page }) => {
  const n = await left(page, 'flyer');
  await page.goto('/');
  await expect(entry(page)).toBeVisible();
  await expect(entry(page)).toHaveAccessibleName(`Create with AI, ${n} left today`);
  await expect(entry(page)).toContainText(`${n} left`);
  await entry(page).click();

  await expect(page).toHaveURL(/#\/ai$/);
  await expect(page.locator('nest-nav'), 'a focus page, like the editor').toHaveCount(0);
  await expect(backToLibrary(page)).toBeVisible();
  await expect(idea(page)).toBeEmpty();
  // Free text, not a form: staff read the old placeholder (an emoji and a line per fact) as fields to fill in.
  const placeholder = (await idea(page).getAttribute('placeholder'))!;
  expect(placeholder, 'the owner’s words (2026-10-05)').toBe('Tomorrow at 19:00 we have a sunset stretching class by the pool. Bring water and a towel.');
  expect(placeholder, 'one plain paragraph').not.toMatch(/\n|\p{Extended_Pictographic}/u);
  await expect(page.getByLabel('Hostel', { exact: true }).locator('option').first()).toHaveText('Let the AI decide');
  await expect(generate(page)).toBeDisabled();
  await expect(generate(page)).toContainText(`${n} left today`);
  await expect(page.locator('.ai-empty')).toBeVisible();
  await idea(page).fill('Yoga tomorrow at 9');
  await expect(generate(page)).toBeEnabled();
  await backToLibrary(page).click();
  await expect(page.getByRole('heading', { name: 'Flyer library' })).toBeVisible();
});

test('an idea becomes a flyer: a waiting state, the preview, what the AI assumed and the share text; Try again costs one; the editor gets an unsaved AI draft', async ({ page }) => {
  test.setTimeout(90_000);
  const n = await left(page, 'flyer');
  const shareLeft = await left(page, 'share');
  await page.goto('/#/ai');
  await idea(page).fill(example.text);

  // The answer is held, so the waiting state can be seen.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(apiRoute('ai/flyer'), async (route) => {
    await held;
    await route.continue();
  });
  const answered = page.waitForResponse(apiCall('POST', 'ai/flyer'));
  await generate(page).click();
  await expect(page.locator('.ai-waiting')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Writing…/ }), 'one generation at a time').toBeDisabled();
  release();
  const res = await answered;
  expect(res.status(), await res.text()).toBe(200);
  expect(AiFlyerResultSchema.parse(await res.json()).remaining).toBe(n - 1);
  await page.unrouteAll({ behavior: 'wait' });

  // The flyer, through the same <Flyer> the editor and the export use, on the canvas a viewer who never chose sees.
  await expect(preview(page).locator('[data-flyer]')).toHaveAttribute('data-canvas', DEFAULT_CANVAS);
  await expect(preview(page)).toContainText(brief.text!.headline1!);
  await expect(preview(page)).toContainText(brief.text!.headline2!);
  const assumed = page.locator('.ai-assumptions li');
  await expect(assumed).toHaveText(['Hostel: Adeje Nest', 'Cost: Free']);
  await expect(page.getByLabel('The AI’s share text')).toHaveValue(brief.share!);
  await expect(page.getByRole('button', { name: 'Copy text', exact: true })).toBeEnabled();
  await expect(generate(page)).toContainText(`${n - 1} left today`);
  await expect(tryAgain(page)).toHaveText(`Try again (uses one of ${n - 1} left)`);
  await expect(idea(page), 'the idea stays, to be refined').toHaveValue(example.text);

  // An unopened result is unsaved work: leaving asks.
  const prompt = await answerConfirm(page, 'dismiss', () => backToLibrary(page).click());
  expect(prompt).toBe(LEAVE_PROMPT);
  await expect(page).toHaveURL(/#\/ai$/);
  await expect(preview(page)).toBeVisible();

  // Try again: one more generation, said before it is spent.
  const again = page.waitForResponse(apiCall('POST', 'ai/flyer'));
  await tryAgain(page).click();
  expect((await again).status()).toBe(200);
  await expect(generate(page)).toContainText(`${n - 2} left today`);
  expect(await left(page, 'flyer')).toBe(n - 2);
  expect(await left(page, 'share'), 'two flyers cost the share text nothing: each feature has its own limit').toBe(shareLeft);

  // Open in editor: a new, unsaved flyer, marked as the AI's until it is saved; nothing was asked on the way.
  const dialogs = noDialogs(page);
  await page.evaluate((key) => localStorage.setItem(key, '[]'), SECTIONS_PREF);
  await openInEditor(page).click();
  await expect(page).toHaveURL(/#\/new$/);
  expect(dialogs(), 'opening asks nothing').toEqual([]);
  // An AI-made flyer starts with every section open, as a new one does, though every section of the last saved
  // flyer was left closed (the owner's answer, 2026-10-07).
  await expect(page.locator('.panel .section-head').first()).toBeVisible();
  await expect(closedSections(page)).toHaveCount(0);
  // The editor counts the share text's own, which the two flyers above did not move. The flyer came with the AI's
  // caption, so a second try is the small link from the start.
  await expect(writeAgain(page)).toContainText(`${shareLeft} left today`);
  await expect(writeWithAi(page)).toHaveCount(0);
  await expect(page.getByLabel('Line 1')).toHaveValue(brief.text!.headline1!);
  await expect(page.getByLabel('Hostel', { exact: true })).toHaveValue('adeje-nest');
  await expect(page.getByLabel('Caption')).toHaveValue(brief.share!);
  const draftNote = toast(page, 'warn').filter({ hasText: 'AI draft: check every fact before you print' });
  await expect(draftNote).toBeVisible();
  await expect(status(page)).toHaveText('Unsaved changes');
  expect(await answerConfirm(page, 'dismiss', () => backToLibrary(page).click())).toBe(LEAVE_PROMPT);

  await saveNew(page, keep);
  await expect(draftNote).toHaveCount(0);
  // A later "New flyer" starts blank: the draft was handed over once.
  await backToLibrary(page).click();
  await page.getByRole('link', { name: 'New flyer' }).click();
  await expect(page.getByLabel('Line 1')).toHaveValue('');
  await expect(draftNote).toHaveCount(0);
});

test('an answer that fails its schema shows the catalogue message and costs nothing', async ({ page }) => {
  const n = await left(page, 'flyer');
  await page.goto('/#/ai');
  await idea(page).fill(`${example.text}\n[[fake:invalid]]`);
  await generate(page).click();
  await expect(errorNote(page)).toHaveText(apiError('ai_failed').message);
  await expect(preview(page)).toHaveCount(0);
  await expect(generate(page)).toContainText(`${n} left today`);
  expect(await left(page, 'flyer')).toBe(n);
});

test('Write with AI fills the caption from the fields, asking before it replaces one, and saves the flyer', async ({ page }) => {
  const n = await left(page, 'share');
  const flyerLeft = await left(page, 'flyer');
  expect(n, 'this file spends one generation here').toBeGreaterThan(0);
  await page.goto('/#/new');
  await expect(writeWithAi(page)).toContainText(`${n} left today`);
  await page.getByLabel('Line 1').fill('Stretching class');
  await page.getByLabel('Caption').fill('My own words');

  let sent = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && apiRoute('ai/share')(new URL(r.url()))) sent++;
  });
  const asked = await answerConfirm(page, 'dismiss', () => writeWithAi(page).click());
  expect(asked).toContain('Replace the caption');
  await expect(page.getByLabel('Caption')).toHaveValue('My own words');
  expect(sent, 'nothing sent on a no').toBe(0);

  const answered = page.waitForResponse(apiCall('POST', 'ai/share'));
  const savedAs = page.waitForResponse(apiCall('POST', 'flyers'));
  await answerConfirm(page, 'accept', () => writeWithAi(page).click());
  const res = await answered;
  expect(res.status(), await res.text()).toBe(200);
  const request = res.request().postDataJSON() as { hostel: unknown; template: string; data: { text: { headline1: string } } };
  expect([request.hostel, request.template, request.data.text.headline1]).toEqual([null, 'activity', 'Stretching class']);
  expect(AiShareResultSchema.parse(await res.json()).remaining).toBe(n - 1);
  await expect(page.getByLabel('Caption')).toHaveValue(brief.share!);
  // One press wrote it and saved the flyer (the owner's ask, 2026-10-07): the draft as it was when the answer landed,
  // with the caption in it, as a new flyer's first save.
  const created = await savedAs;
  expect(created.status(), await created.text()).toBe(201);
  const written = created.request().postDataJSON() as { title: string; data: { share: string; text: { headline1: string } } };
  expect([written.data.share, written.data.text.headline1]).toEqual([brief.share, 'Stretching class']);
  expect(written.title, 'an untitled flyer gets its library name, as on any first save').not.toBe('');
  await expect(page).toHaveURL(new RegExp(`#/flyers/${FlyerSavedSchema.parse(await created.json()).id}$`));
  await expect(status(page)).toHaveText('Saved');
  await expect(toast(page, 'ok')).toHaveText(CAPTION_SAVED);
  // That first save keeps the editor as it was: no section folds under the staff member.
  await expect(closedSections(page)).toHaveCount(0);
  // The big button steps back to a small link for a second try, with the count it had.
  await expect(writeWithAi(page)).toHaveCount(0);
  await expect(writeAgain(page)).toHaveText(`Write again (${n - 1} left today)`);
  await expect(writeAgain(page), 'the button that was pressed is the link now, and has the focus again once it can').toBeFocused();
  expect(await left(page, 'flyer'), 'a share text costs the flyer nothing').toBe(flyerLeft);
  // A flyer that started new still remembers nothing of its sections, though it is saved now.
  await page.locator('.panel .section-head').first().click();
  await expect(closedSections(page)).toHaveCount(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), SECTIONS_PREF)).toBeNull();
  await page.locator('.panel .section-head').first().click();

  // The button is back when a detail changes, and steps back again when the detail is as it was.
  await page.getByLabel('Line 1').fill('Stretching class at 9');
  await expect(writeWithAi(page)).toContainText(`${n - 1} left today`);
  await expect(writeAgain(page)).toHaveCount(0);
  await page.getByLabel('Line 1').fill('Stretching class');
  await expect(writeAgain(page)).toBeVisible();
  // What is no detail changes nothing: the library name, and the caption's own words.
  await page.getByLabel('Library name').fill('Stretching');
  await page.getByLabel('Caption').fill(`${brief.share} 🙂`);
  await expect(writeAgain(page)).toBeVisible();
  // An emptied caption has nothing to write again, and one typed by hand after it is the staff member's own.
  await page.getByLabel('Caption').fill('');
  await expect(writeWithAi(page)).toBeVisible();
  await page.getByLabel('Caption').fill('My own words');
  await expect(writeWithAi(page), 'found in review (2026-10-07): one typed character brought the link back').toBeVisible();
  await expect(writeAgain(page)).toHaveCount(0);
  // The flyer is saved, with unsaved changes since: leaving asks. Saved here, so the test ends clean.
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(status(page)).toHaveText('Saved');
});

test('a flyer that opens with a caption offers "Write again"; one with none, and a caption typed by hand, the button', async ({ page }) => {
  await withLeft(page, { share: 2 });
  await page.goto(`/#/flyers/${await savedFlyer(page, 'Come to the pool')}`);
  // A saved flyer opens with Share text closed (panel.spec.ts): the button is in it.
  await openSection(page, 'Share text');
  await expect(page.getByLabel('Caption')).toHaveValue('Come to the pool');
  await expect(writeAgain(page)).toHaveText('Write again (2 left today)');
  await expect(writeWithAi(page)).toHaveCount(0);
  // It still asks before it replaces the caption.
  expect(await answerConfirm(page, 'dismiss', () => writeAgain(page).click())).toContain('Replace the caption');

  await page.goto(`/#/flyers/${await savedFlyer(page, '')}`);
  await openSection(page, 'Share text');
  await expect(page.getByLabel('Caption')).toHaveValue('');
  await expect(writeWithAi(page)).toBeVisible();
  await page.getByLabel('Caption').fill('My own words');
  await expect(writeWithAi(page), 'only a generation, or a flyer opened with a caption, hides it').toBeVisible();
  await expect(writeAgain(page)).toHaveCount(0);
});

test('Write with AI on a saved flyer saves what was typed while the answer was on its way, and a detail changed meanwhile keeps the button', async ({ page }) => {
  await withLeft(page, { share: 2 });
  const id = await savedFlyer(page, '');
  await page.route(apiRoute('ai/share'), async (route) => {
    await asked;
    await route.fulfill({ json: { share: 'Written by the AI', remaining: 1 } });
  });
  let answer = () => {};
  const asked = new Promise<void>((resolve) => (answer = resolve));
  await page.goto(`/#/flyers/${id}`);
  await openSection(page, 'Headline', 'Share text');
  await writeWithAi(page).click();
  await expect(page.getByRole('button', { name: /^Writing…/ })).toBeDisabled();
  await page.getByLabel('Line 1').fill('Typed meanwhile');
  const put = page.waitForResponse(apiCall('PUT', `flyers/${id}`));
  answer();
  const body = (await put).request().postDataJSON() as { data: { share: string; text: { headline1: string } } };
  expect([body.data.share, body.data.text.headline1], 'the draft as it is when the answer lands').toEqual(['Written by the AI', 'Typed meanwhile']);
  await expect(status(page)).toHaveText('Saved');
  await expect(toast(page, 'ok')).toHaveText(CAPTION_SAVED);
  // The caption was written from the fields as they were sent: the line typed since is not in it.
  await expect(writeWithAi(page)).toContainText('1 left today');
  await expect(writeAgain(page)).toHaveCount(0);
});

test('a caption written and a save refused: the caption stays, unsaved, and the toast says so', async ({ page }) => {
  await withLeft(page, { share: 2 });
  await page.route(apiRoute('ai/share'), (route) => route.fulfill({ json: { share: 'Written by the AI', remaining: 1 } }));
  const flyers = apiRoute('flyers');
  await page.route(flyers, (route) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 500, json: { error: { code: 'internal', message: 'The disk is full.' } } }) : route.continue(),
  );
  await page.goto('/#/new');
  await writeWithAi(page).click();
  await expect(toast(page, 'error')).toHaveText('✨ The AI wrote the caption, but the flyer was not saved. The disk is full. Press Save to try again.');
  await expect(toast(page, 'ok')).toHaveCount(0);
  await expect(page.getByLabel('Caption')).toHaveValue('Written by the AI');
  await expect(status(page)).toHaveText('Unsaved changes');
  await expect(page).toHaveURL(/#\/new$/);
  // The generation is spent either way, and the caption is the AI's for the flyer as it is.
  await expect(writeAgain(page)).toHaveText('Write again (1 left today)');
  // Save then does what the toast says.
  await page.unroute(flyers);
  await saveNew(page, keep);
});

test('a caption that lands while the leave question is open, answered yes, saves nothing', async ({ page }) => {
  // Found in review (2026-10-07): React unmounts a page a few tasks after the move, so the page's own word that it
  // is still there is not enough. The URL says so at once.
  await withLeft(page, { share: 2 });
  let answer = () => {};
  const asked = new Promise<void>((resolve) => (answer = resolve));
  await page.route(apiRoute('ai/share'), async (route) => {
    await asked;
    await route.fulfill({ json: { share: 'Written by the AI', remaining: 1 } });
  });
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && /\/api\/flyers(\/\d+)?$/.test(new URL(r.url()).pathname)) writes.push(`${r.method()} ${r.url()}`);
  });
  await page.goto('/#/new');
  await page.getByLabel('Line 1').fill('Unsaved work');
  await writeWithAi(page).click();
  await expect(page.getByRole('button', { name: /^Writing…/ })).toBeDisabled();
  // The answer is let go while the question is open, and lands the moment it is answered.
  page.once('dialog', (d) => {
    answer();
    setTimeout(() => void d.accept(), 300);
  });
  await backToLibrary(page).click();
  await expect(page.getByRole('heading', { name: 'Flyer library' })).toBeVisible();
  await page.waitForTimeout(300);
  expect(writes, 'the flyer they chose to leave is not in the library').toEqual([]);
});

test('a caption that lands after the staff member has left saves nothing', async ({ page }) => {
  await withLeft(page, { share: 2 });
  let answer = () => {};
  const asked = new Promise<void>((resolve) => (answer = resolve));
  await page.route(apiRoute('ai/share'), async (route) => {
    await asked;
    await route.fulfill({ json: { share: 'Written by the AI', remaining: 1 } });
  });
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && /\/api\/flyers(\/\d+)?$/.test(new URL(r.url()).pathname)) writes.push(`${r.method()} ${r.url()}`);
  });
  await page.goto('/#/new');
  await writeWithAi(page).click();
  await expect(page.getByRole('button', { name: /^Writing…/ })).toBeDisabled();
  // Nothing is typed, so nothing is unsaved and the way back asks nothing.
  await backToLibrary(page).click();
  await expect(page.getByRole('heading', { name: 'Flyer library' })).toBeVisible();
  const answered = page.waitForResponse(apiCall('POST', 'ai/share'));
  answer();
  await answered;
  await page.waitForTimeout(300);
  expect(writes, 'no flyer written behind their back').toEqual([]);
  await expect(page).toHaveURL(/#\/$/);
});

test('the AI draft warning outlives the save Write with AI makes, and leaves at the staff member’s own Save', async ({ page }) => {
  // Routed both ways, so nothing is spent.
  await withLeft(page, { flyer: 2, share: 2 });
  await page.route(apiRoute('ai/flyer'), (route) => route.fulfill({ json: { brief, assumptions: [], remaining: 1 } }));
  await page.route(apiRoute('ai/share'), (route) => route.fulfill({ json: { share: 'Written again by the AI', remaining: 1 } }));
  await page.goto('/#/ai');
  await idea(page).fill('Yoga tomorrow at 9');
  await generate(page).click();
  await openInEditor(page).click();
  await expect(page).toHaveURL(/#\/new$/);
  const draftNote = toast(page, 'warn').filter({ hasText: 'AI draft: check every fact before you print' });
  await expect(draftNote).toBeVisible();
  // The flyer came with the AI's caption: a second try is the small link from the start.
  await expect(writeAgain(page)).toHaveText('Write again (2 left today)');

  await answerConfirm(page, 'accept', () => writeAgain(page).click());
  await expect(toast(page, 'ok')).toHaveText(CAPTION_SAVED);
  await expect(page).toHaveURL(/#\/flyers\/\d+$/);
  await expect(status(page)).toHaveText('Saved');
  await expect(draftNote, 'nobody has checked the facts yet').toBeVisible();

  await page.getByLabel('Line 1').fill('Checked by me');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(toast(page, 'ok')).toHaveText('Saved to the library.');
  await expect(draftNote).toHaveCount(0);
});

test('each feature shows its own count: the bar and Generate the flyer’s, Write with AI the share text’s', async ({ page }) => {
  await withLeft(page, { flyer: 1, share: 2 });
  await page.goto('/');
  await expect(entry(page)).toHaveAccessibleName('Create with AI, 1 left today');
  await entry(page).click();
  await expect(generate(page)).toContainText('1 left today');
  await backToLibrary(page).click();
  await page.getByRole('link', { name: 'New flyer' }).click();
  await expect(writeWithAi(page)).toContainText('2 left today');
});

test('a limit reached: the page says when it comes back and that none are left, and the other feature keeps its count', async ({ page }) => {
  // Routed both ways, so it holds whatever this file has spent: one flyer left on load, then the server's refusal.
  await withLeft(page, { flyer: 1, share: 2 });
  const quota = apiError('ai_quota', aiQuotaVars('flyer', AI_DAILY_LIMIT));
  await page.route(apiRoute('ai/flyer'), (route) => route.fulfill({ status: quota.status, json: { error: { code: quota.code, message: quota.message } } }));
  await page.goto('/#/ai');
  await idea(page).fill('Yoga tomorrow at 9');
  await generate(page).click();
  await expect(errorNote(page)).toHaveText(quota.message);
  await expect(generate(page)).toContainText('0 left today');
  await expect(generate(page)).toBeDisabled();
  await backToLibrary(page).click();
  await expect(entry(page)).toContainText('0 left');
  // The flyer's limit is the flyer's alone: the share text still has its two, and its button still works.
  await page.getByRole('link', { name: 'New flyer' }).click();
  await expect(writeWithAi(page)).toContainText('2 left today');
  await expect(writeWithAi(page)).toBeEnabled();
  await expect(page.locator('.ai-used-up')).toHaveCount(0);
});

test('the share text’s limit reached in the editor: the note says what ran out, its button counts none, and the flyer keeps its count', async ({ page }) => {
  // The other way round from the test above, and routed both ways too: one share text left on load, then the refusal.
  await withLeft(page, { flyer: 2, share: 1 });
  const quota = apiError('ai_quota', aiQuotaVars('share', AI_DAILY_LIMIT));
  await page.route(apiRoute('ai/share'), (route) => route.fulfill({ status: quota.status, json: { error: { code: quota.code, message: quota.message } } }));
  await page.goto('/#/new');
  await expect(writeWithAi(page)).toContainText('1 left today');
  await writeWithAi(page).click();
  await expect(errorNote(page)).toHaveText(quota.message);
  await expect(writeWithAi(page)).toContainText('0 left today');
  await expect(writeWithAi(page)).toBeDisabled();
  await expect(page.locator('.ai-used-up')).toHaveText(quota.message);
  // The share text's limit is the share text's alone: the flyer still has its two.
  await backToLibrary(page).click();
  await expect(entry(page)).toHaveAccessibleName('Create with AI, 2 left today');
});

test('the AI page’s notes are toasts too: the flyer keeps the whole stage, and a warning folds into the chip', async ({ page }) => {
  // The editor's UX round, Part 1 (tests/render/toasts.spec.ts has the rest, on the editor). Routed both ways, so
  // nothing is spent: a flyer whose copy breaks a rule, so a warning stands beside it.
  await withLeft(page, { flyer: 2 });
  const broken = { ...brief, text: { ...brief.text, headline1: 'Book now' } };
  await page.route(apiRoute('ai/flyer'), (route) => route.fulfill({ json: { brief: broken, assumptions: [], remaining: 1 } }));
  await page.goto('/#/ai');
  await idea(page).fill('Yoga tomorrow at 9');
  await generate(page).click();
  await expect(preview(page)).toBeVisible();
  const rule = toast(page, 'warn').filter({ hasText: 'Book now' });
  await expect(rule).toBeVisible();
  // The stage starts where the bar above it ends: no note lies between them.
  await expect
    .poll(async () => {
      const [bar, stage] = [(await page.locator('.toolbar').boundingBox())!, (await page.locator('.stage').boundingBox())!];
      return [Math.round(stage.y - (bar.y + bar.height)), Math.round(stage.y + stage.height)];
    })
    .toEqual([0, EDITOR_VIEWPORT.height]);
  await closeToast(rule).click();
  await expect(rule).toHaveCount(0);
  await expect(warningsChip(page)).toHaveText('⚠ 1');
  await warningsChip(page).click();
  await expect(rule).toBeVisible();
});

test('the AI page’s error is a toast that stays until it is closed', async ({ page }) => {
  await withLeft(page, { flyer: 2 });
  const failed = apiError('ai_failed');
  await page.route(apiRoute('ai/flyer'), (route) => route.fulfill({ status: failed.status, json: { error: { code: failed.code, message: failed.message } } }));
  await page.clock.install();
  await page.goto('/#/ai');
  await idea(page).fill('Yoga tomorrow at 9');
  await generate(page).click();
  await expect(errorNote(page)).toHaveText(failed.message);
  await expect(page.locator('.toasts [role="alert"] .toast-error')).toBeVisible();
  await page.clock.fastForward(60_000);
  await expect(errorNote(page)).toBeVisible();
  await closeToast(errorNote(page)).click();
  await expect(errorNote(page)).toHaveCount(0);
  await expect(idea(page), 'closing a note loses nothing typed').toHaveValue('Yoga tomorrow at 9');
});

test('the day’s last flyer leaves a Try again that says none are left', async ({ page }) => {
  // Seen in a browser on both backends (2026-10-06): the greyed button read "Try again (uses one of 0 left)".
  // Routed both ways, so nothing is spent: one flyer left on load, and the answer that spends it.
  await withLeft(page, { flyer: 1 });
  await page.route(apiRoute('ai/flyer'), (route) => route.fulfill({ json: { brief, assumptions: [], remaining: 0 } }));
  await page.goto('/#/ai');
  await idea(page).fill('Yoga tomorrow at 9');
  await generate(page).click();
  await expect(preview(page)).toBeVisible();
  await expect(tryAgain(page)).toBeDisabled();
  await expect(tryAgain(page)).toHaveText('Try again (none left today)');
  await expect(openInEditor(page), 'the flyer just made can still be opened').toBeEnabled();
});

test('with none left the page says so, what ran out and when it comes back, before anyone presses anything', async ({ page }) => {
  // Seen with a real provider (2026-10-05): a day used up left a greyed Generate and not a word about midnight.
  await withLeft(page, 0);
  await page.goto('/#/ai');
  await expect(generate(page)).toBeDisabled();
  await expect(page.locator('.ai-used-up')).toHaveText(`Today’s ${AI_DAILY_LIMIT} AI flyers are used up. They come back at midnight, Canary Islands time.`);
  await page.goto('/#/new');
  await expect(writeWithAi(page)).toBeDisabled();
  await expect(page.locator('.ai-used-up')).toHaveText(`Today’s ${AI_DAILY_LIMIT} AI share texts are used up. They come back at midnight, Canary Islands time.`);
});

test('an assumption about a field the editor has no name for shows the field as the AI wrote it, and the page stays up', async ({ page }) => {
  // The model picks `field`: "__proto__" and "constructor" pass the schema, and were once read off a plain object.
  // A routed answer costs nothing, and the count is routed too, so this holds whatever the file has spent.
  await withLeft(page, 1);
  const assumptions = [
    { field: '__proto__', note: 'first' },
    { field: 'constructor', note: 'second' },
    { field: 'text.headline1', note: 'third' },
  ];
  await page.route(apiRoute('ai/flyer'), (route) => route.fulfill({ json: { brief, assumptions, remaining: 1 } }));
  await page.goto('/#/ai');
  await idea(page).fill('Yoga tomorrow at 9');
  await generate(page).click();
  await expect(page.locator('.ai-assumptions li')).toHaveText(['__proto__: first', 'constructor: second', 'Headline line 1: third']);
  await expect(preview(page)).toBeVisible();
  await expect(tryAgain(page)).toHaveText('Try again (uses the last one)');
});

test('the question before a caption is replaced counts in plain words when one is left', async ({ page }) => {
  await withLeft(page, 1);
  await page.goto('/#/new');
  await page.getByLabel('Caption').fill('My own words');
  const asked = await answerConfirm(page, 'dismiss', () => writeWithAi(page).click());
  expect(asked).toBe('Replace the caption with one the AI writes? It uses the last generation left today.');
  await expect(page.getByLabel('Caption')).toHaveValue('My own words');
});

test('with the AI off there is no AI anywhere: no entry, #/ai is the library, no Write with AI', async ({ page }) => {
  await page.route(apiRoute('config'), async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), ai: { enabled: false } } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Flyer library' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New flyer' })).toBeVisible();
  await expect(entry(page)).toHaveCount(0);

  await page.goto('/#/ai');
  await expect(page.getByRole('heading', { name: 'Flyer library' })).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
  await expect(idea(page)).toHaveCount(0);

  await page.goto('/#/new');
  await expect(page.getByLabel('Caption')).toBeVisible();
  await expect(writeWithAi(page)).toHaveCount(0);
});

// The editor never parses an answer, so a backend older than this client is met as it comes: while a release is being
// uploaded, its new files answer beside the old ones. That must cost the AI, never the page.
for (const [which, ai] of [
  ['before each feature had its own limit (one limit, and the features by name)', { enabled: true, limit: AI_DAILY_LIMIT, remaining: AI_DAILY_LIMIT, features: [...AI_FEATURES] }],
  ['before each feature had its own switch (it lists none)', { enabled: true, limit: AI_DAILY_LIMIT, remaining: AI_DAILY_LIMIT }],
  ['before the AI (no ai block at all)', undefined],
] as const) {
  test(`a backend from ${which} shows no AI, and the app still loads`, async ({ page }) => {
    await page.route(apiRoute('config'), async (route) => {
      const res = await route.fetch();
      const { ai: _its, ...rest } = await res.json();
      await route.fulfill({ response: res, json: ai === undefined ? rest : { ...rest, ai } });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Flyer library' })).toBeVisible();
    await expect(entry(page)).toHaveCount(0);

    await page.goto('/#/new');
    await expect(page.getByLabel('Caption')).toBeVisible();
    await expect(writeWithAi(page)).toHaveCount(0);
  });
}

test('an entry the editor cannot read, listed beside a feature it can, costs nothing: that feature shows, works and counts down', async ({ page }) => {
  // Found in review (2026-10-06): the button showed, and its first answer took the whole page down. No backend
  // answers such a list today; a later one may list what this client has no name for. Routed, so nothing is spent.
  await page.route(apiRoute('config'), async (route) => {
    const res = await route.fetch();
    const features = [null, { name: 'share', limit: AI_DAILY_LIMIT, remaining: 2 }];
    await route.fulfill({ response: res, json: { ...(await res.json()), ai: { enabled: true, features } } });
  });
  await page.route(apiRoute('ai/share'), (route) => route.fulfill({ json: { share: 'Written by the AI', remaining: 1 } }));
  await page.goto('/#/new');
  await expect(writeWithAi(page)).toContainText('2 left today');
  await writeWithAi(page).click();
  await expect(page.getByLabel('Caption')).toHaveValue('Written by the AI');
  await expect(writeAgain(page)).toContainText('1 left today');
});

// A site names the features it runs (AI_FEATURES in .env, 'features' in config.php): the trial on the live site is the
// share text alone. Routed, so nothing is spent.
test('on a site that runs the share text alone: no "Create with AI" anywhere, #/ai is the library, and "Write with AI" shows what is left', async ({ page }) => {
  await withLeft(page, 2, ['share']);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'New flyer' })).toBeVisible();
  await expect(entry(page)).toHaveCount(0);
  await expect(page.getByText(/Create with AI/)).toHaveCount(0);

  await page.goto('/#/ai');
  await expect(page.getByRole('heading', { name: 'Flyer library' })).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
  await expect(idea(page)).toHaveCount(0);

  await page.goto('/#/new');
  await expect(writeWithAi(page)).toBeEnabled();
  await expect(writeWithAi(page)).toContainText('2 left today');
});

test('on a site that runs the flyer alone: the bar offers "Create with AI" with its count, and the editor has no "Write with AI"', async ({ page }) => {
  await withLeft(page, 2, ['flyer']);
  await page.goto('/');
  await expect(entry(page)).toHaveAccessibleName('Create with AI, 2 left today');
  await entry(page).click();
  await expect(page).toHaveURL(/#\/ai$/);
  await expect(idea(page)).toBeVisible();
  await expect(generate(page)).toContainText('2 left today');

  await page.goto('/#/new');
  await expect(page.getByLabel('Caption')).toBeVisible();
  await expect(writeWithAi(page)).toHaveCount(0);
});

test('on a phone the bar entry shrinks to ✨ AI, and the page stacks like the editor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withLeft(page, 1);
  await page.goto('/');
  await expect(entry(page)).toBeVisible();
  await expect(entry(page).locator('.ai-wide').first()).toBeHidden();
  expect((await entry(page).boundingBox())!.width, 'room for the shared bar’s menu').toBeLessThan(80);
  await entry(page).click();
  // Before a flyer the screen is the form's: an empty preview would push Generate out of sight.
  await idea(page).fill(`${example.text}\n[[fake:invalid]]`);
  await expect(generate(page)).toBeInViewport();
  // With something to show (here a failure, which costs nothing), the workspace sits under the form, as in the editor.
  await generate(page).click();
  await expect(errorNote(page)).toBeVisible();
  const panel = (await page.locator('.panel').boundingBox())!;
  const stage = (await page.locator('.workspace').boundingBox())!;
  expect(stage.y, 'the workspace sits under the form').toBeGreaterThanOrEqual(panel.y + panel.height - 1);
});

test('on a short phone the form scrolls under its head, and the way back stays on the screen', async ({ page }) => {
  // Found in review (2026-10-07): the form scrolls by itself now, and with nothing to hold the panel to the screen
  // the whole page scrolled instead, taking "← Library" with it.
  await page.setViewportSize({ width: 375, height: 553 });
  await withLeft(page, 1);
  await page.goto('/#/ai');
  await expect(idea(page)).toBeVisible();
  const form = page.locator('.panel-body');
  expect(await form.evaluate((el) => el.scrollHeight - el.clientHeight), 'the form is taller than the screen').toBeGreaterThan(0);
  await generate(page).scrollIntoViewIfNeeded();
  await expect(generate(page)).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => [scrollY, document.documentElement.scrollHeight - innerHeight]), 'the page itself does not scroll').toEqual([0, 0]);
  await expect(backToLibrary(page)).toBeInViewport({ ratio: 1 });
});

/* "From a photo" (docs/prompts/ai-flyer-from-photo.md, stage 3): the page's second way in, where the site runs the
   picture read. The read puts a picture's words in "Your idea", and from there the page is the one above. */
const ways = (page: Page) => page.getByRole('group', { name: 'Start from' });
const fromIdea = (page: Page) => ways(page).getByRole('button', { name: 'From your idea', exact: true });
const fromPhoto = (page: Page) => ways(page).getByRole('button', { name: 'From a photo', exact: true });
const readPicture = (page: Page) => page.getByRole('button', { name: /^✨ Read the picture/ });
/** The box a picture is chosen in, and dropped on. */
const picker = (page: Page) => page.locator('.ai-picker');
/** The input behind "Choose a picture" (the one behind "Take a photo" asks for the camera). */
const chooseInput = (page: Page) => picker(page).locator('input[type=file]:not([capture])');
/** The chosen picture, small, with its name. */
const chosen = (page: Page) => page.locator('.ai-picture');
const takePhoto = (page: Page) => page.getByRole('button', { name: 'Take a photo', exact: true });
const choosePicture = (page: Page) => page.getByRole('button', { name: 'Choose a picture', exact: true });
/** The line under the idea box after a read: what to check, or that the picture had no event. */
const readNote = (page: Page) => page.locator('.ai-read-note');
/** The line that offers drop and paste, a mouse device's. */
const dropOrPaste = (page: Page) => picker(page).getByText('Or drop a picture here, or paste a screenshot.', { exact: true });
/** The three steps from a picture to a flyer (the owner's sketch, 2026-10-06): under the switch on From a photo, and
    in its place once the picture is read. */
const steps = (page: Page) => page.locator('.ai-steps');
/** The steps' names in order, each as it reads: a step that is done carries its ✓. */
const stepNames = (page: Page) => steps(page).locator('.ai-step-name');
/** The step the staff member is at. */
const currentStep = (page: Page) => steps(page).locator('[aria-current="step"] .ai-step-name');
/** Under the steps, beside the picture that was read: the way back to choosing one. */
const changePicture = (page: Page) => page.getByRole('button', { name: 'Change the picture', exact: true });
/** The hint under the page's title: the way's own, shown wherever the switch is. */
const wayHint = (page: Page) => page.locator('.panel .section').first().locator('.hint');
/** On the result, in the bar above the flyer: the picture the idea was read from, offered as the flyer's photo (stage 4
    of the brief; the owner's words). */
const usePicture = (page: Page) => page.locator('.toolbar').getByRole('checkbox', { name: 'Use this picture as the flyer’s photo', exact: true });
/** The editor's button for a photo mode, lit when the flyer is in it. */
const photoMode = (page: Page, mode: PhotoMode) => page.getByRole('button', { name: PHOTO_MODE_LABEL[mode], exact: true });

/** A small picture, made here. Its width steers the fake (AI_FAKE.pictureWidths); 64 is no steer. */
async function picture(name: string, width = 64, height = 8): Promise<FilePayload> {
  const buffer = await sharp({ create: { width, height, channels: 3, background: '#0d6f82' } }).png().toBuffer();
  return { name, mimeType: 'image/png', buffer };
}

/** api/config with the counts a test says, one answer after another: the first on load, the next each time the page
    asks again (after a failed read), the last one from then on. A feature left out has all of its own. */
async function withCounts(page: Page, answers: Partial<Record<AiFeature, number>>[]) {
  let asked = 0;
  await page.route(apiRoute('config'), async (route) => {
    const res = await route.fetch();
    const counts = answers[Math.min(asked++, answers.length - 1)];
    const features = AI_FEATURES.map((name) => ({ name, limit: AI_DAILY_LIMIT, remaining: counts[name] ?? AI_DAILY_LIMIT }));
    await route.fulfill({ response: res, json: { ...(await res.json()), ai: { enabled: true, features } } });
  });
}

/** Every read a test's page sent, to say that nothing was. */
function readsSent(page: Page): string[] {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && apiRoute('ai/photo')(new URL(r.url()))) sent.push(r.url());
  });
  return sent;
}

/** Every photo a test's page uploaded, to say that none was. */
function uploadsSent(page: Page): string[] {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && apiRoute('photos')(new URL(r.url()))) sent.push(r.url());
  });
  return sent;
}

/** A This week flyer, as the AI answers one: it has no photo. */
const weekAnswer: AiFlyerAnswer = {
  brief: { hostel: 'adeje-nest', template: 'week', week: [{ day: 'Mon', name: 'Stretching class', time: '19:00', cost: 'Free' }], share: 'This week at Adeje Nest' },
  assumptions: [],
};

/** A picture read and its flyer made, both answered here, so nothing is spent: the page ends with the flyer on the
    stage. `text` is what the read finds: empty is a picture with no event, and the event is then typed in. */
async function flyerFromPicture(page: Page, file: FilePayload, { text = example.text, answer = example.answer }: { text?: string; answer?: AiFlyerAnswer } = {}) {
  await withLeft(page, { photo: 2, flyer: 2 });
  await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ json: { text, remaining: 1 } }));
  await page.route(apiRoute('ai/flyer'), (route) => route.fulfill({ json: { ...answer, remaining: 1 } }));
  await page.goto('/#/ai');
  await fromPhoto(page).click();
  await chooseInput(page).setInputFiles(file);
  await readPicture(page).click();
  await expect(readNote(page)).toBeVisible();
  if (!text) await idea(page).fill('Pool party on Saturday at 15:00');
  await generate(page).click();
  await expect(preview(page).locator('[data-flyer]')).toBeVisible();
}

test.describe('From a photo', () => {
  test('where the read runs the page has two ways in: From your idea is on, and From a photo shows its three steps at the first, and the reads’ own count', async ({ page }) => {
    const n = await left(page, 'photo');
    await page.goto('/#/ai');
    await expect(fromIdea(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(fromPhoto(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(steps(page), 'an idea typed in has no steps').toHaveCount(0);
    await idea(page).fill('Yoga tomorrow at 9');

    await fromPhoto(page).click();
    await expect(fromPhoto(page)).toHaveAttribute('aria-pressed', 'true');
    // From the first tap (the owner's answer, 2026-10-06): the way from a picture to a flyer, under the switch.
    await expect(stepNames(page), 'the owner’s sketch').toHaveText(['Picture', 'Check the words', 'Flyer']);
    await expect(currentStep(page)).toHaveText('Picture');
    expect((await steps(page).boundingBox())!.y, 'under the switch').toBeGreaterThan((await ways(page).boundingBox())!.y);
    await expect(wayHint(page), 'the way’s hint stays where the switch is').toBeVisible();
    await expect(idea(page), 'the idea box is the other way’s').toHaveCount(0);
    await expect(generate(page)).toHaveCount(0);
    await expect(readPicture(page)).toContainText(`${n} left today`);
    await expect(readPicture(page), 'no picture yet').toBeDisabled();
    await expect(page.locator('.ai-used-up')).toHaveCount(0);

    await fromIdea(page).click();
    await expect(idea(page), 'what was typed is kept').toHaveValue('Yoga tomorrow at 9');
    await expect(steps(page)).toHaveCount(0);
  });

  test('the read counts its own: the bar and Generate show the flyer’s, Read the picture the reads’', async ({ page }) => {
    await withLeft(page, { flyer: 2, photo: 1 });
    await page.goto('/');
    await expect(entry(page), 'every way in ends in a flyer').toHaveAccessibleName('Create with AI, 2 left today');
    await entry(page).click();
    await expect(generate(page)).toContainText('2 left today');
    await fromPhoto(page).click();
    await expect(readPicture(page)).toContainText('1 left today');
  });

  test('with no reads left the photo way says what ran out and when it comes back, and the idea’s way still works', async ({ page }) => {
    await withLeft(page, { photo: 0 });
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await expect(readPicture(page)).toContainText('0 left today');
    await expect(readPicture(page)).toBeDisabled();
    await expect(page.locator('.ai-used-up')).toHaveText(`Today’s ${AI_DAILY_LIMIT} picture reads are used up. They come back at midnight, Canary Islands time.`);
    // The reads' limit is the reads' alone: the flyer still has its three.
    await fromIdea(page).click();
    await expect(page.locator('.ai-used-up')).toHaveCount(0);
    await idea(page).fill('Yoga tomorrow at 9');
    await expect(generate(page)).toBeEnabled();
  });

  test('on a site that does not run the read the page has one way in, as before: no switch', async ({ page }) => {
    await withLeft(page, 2, ['flyer', 'share']);
    await page.goto('/#/ai');
    await expect(idea(page)).toBeVisible();
    await expect(generate(page)).toContainText('2 left today');
    await expect(ways(page)).toHaveCount(0);
    await expect(steps(page)).toHaveCount(0);
    await expect(readPicture(page)).toHaveCount(0);
  });

  test('once a picture is read the steps take the switch’s place: Picture is done, Check the words is the step, and the picture sits under them with "Change the picture"', async ({ page }) => {
    // Routed, so nothing is spent. The owner saw the page land on the From your idea tab after a read, where it
    // starts, and it read as a step back (2026-10-06): the steps say it is the next one.
    await withLeft(page, { photo: 2 });
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ json: { text: 'Karaoke night 06/10 (today)', remaining: 1 } }));
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('karaoke-board.png'));
    await readPicture(page).click();
    await expect(idea(page)).toHaveValue('Karaoke night 06/10 (today)');

    await expect(ways(page), 'the switch has left').toHaveCount(0);
    await expect(stepNames(page), 'the owner’s sketch').toHaveText(['Picture ✓', 'Check the words', 'Flyer']);
    await expect(currentStep(page)).toHaveText('Check the words');
    await expect(steps(page).getByRole('listitem'), 'a list of three, for a screen reader').toHaveCount(3);
    await expect(wayHint(page), 'no hint under the title, as in the sketch').toHaveCount(0);
    // Under them the picture that was read, small, with the way back in the place of Remove.
    await expect(chosen(page)).toContainText('karaoke-board.png');
    await expect(chosen(page).locator('img')).toBeVisible();
    await expect(changePicture(page)).toBeVisible();
    await expect(chosen(page).getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
    expect((await chosen(page).boundingBox())!.y, 'between the steps and the box').toBeLessThan((await idea(page).boundingBox())!.y);
    // The rest is as it was: the line to check the words by, with the focus, and Generate.
    await expect(readNote(page)).toBeFocused();
    await expect(generate(page)).toBeEnabled();
  });

  test('"Change the picture" goes back to choosing: the switch is back on From a photo at step 1, and the picture, the words and the leave question are kept', async ({ page }) => {
    await withLeft(page, { photo: 2 });
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ json: { text: 'Karaoke night 06/10 (today)', remaining: 1 } }));
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('karaoke-board.png'));
    await readPicture(page).click();
    await expect(currentStep(page)).toHaveText('Check the words');

    await changePicture(page).click();
    await expect(fromPhoto(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(fromPhoto(page), 'the button that was pressed is gone: a keyboard and a screen reader stand at the way they are on').toBeFocused();
    await expect(stepNames(page)).toHaveText(['Picture', 'Check the words', 'Flyer']);
    await expect(currentStep(page)).toHaveText('Picture');
    await expect(chosen(page)).toContainText('karaoke-board.png');
    await expect(readPicture(page)).toBeEnabled();
    await expect(readPicture(page)).toContainText('1 left today');

    // The words were not touched: a read was spent on them, so leaving still asks.
    expect(await answerConfirm(page, 'dismiss', () => backToLibrary(page).click())).toBe(LEAVE_PROMPT);
    // Back to them with the same picture: the same words, and the steps where they were.
    await fromIdea(page).click();
    await expect(idea(page)).toHaveValue('Karaoke night 06/10 (today)');
    await expect(ways(page)).toHaveCount(0);
    await expect(currentStep(page)).toHaveText('Check the words');
    // Found in this stage's review: the switch left with the button that was pressed, and the focus fell to the page.
    await expect(readNote(page), 'the focus goes to the line under the box, as after the read itself').toBeFocused();

    // Another picture is one not read yet: From your idea is then the tab it was, with the words still in the box.
    await changePicture(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await fromIdea(page).click();
    await expect(fromIdea(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(steps(page)).toHaveCount(0);
    await expect(idea(page)).toHaveValue('Karaoke night 06/10 (today)');
  });

  test('the third step lights when the picture’s flyer is on screen: Picture and the words are done, and the steps stay where the switch was', async ({ page }) => {
    // Routed, so nothing is spent.
    await withLeft(page, { photo: 2, flyer: 2 });
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ json: { text: example.text, remaining: 1 } }));
    await page.route(apiRoute('ai/flyer'), (route) => route.fulfill({ json: { ...example.answer, remaining: 1 } }));
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await readPicture(page).click();
    await expect(currentStep(page)).toHaveText('Check the words');
    await generate(page).click();
    await expect(preview(page)).toContainText(brief.text!.headline1!);

    await expect(stepNames(page), 'the owner’s sketch, at its end').toHaveText(['Picture ✓', 'Check the words ✓', 'Flyer']);
    await expect(currentStep(page)).toHaveText('Flyer');
    await expect(ways(page)).toHaveCount(0);
    await expect(openInEditor(page), 'the finish').toBeEnabled();
    // The words can still be changed and the flyer made again: it stays this picture's.
    await idea(page).fill(`${example.text}\nGratis`);
    await expect(currentStep(page)).toHaveText('Flyer');
  });

  test('a flyer made from a typed idea leaves a picture read afterwards at its words: the third step is for the flyer of the picture on the page', async ({ page }) => {
    // Routed, so nothing is spent.
    await withLeft(page, { photo: 2, flyer: 3 });
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ json: { text: 'Karaoke night 06/10 (today)', remaining: 1 } }));
    await page.route(apiRoute('ai/flyer'), (route) => route.fulfill({ json: { ...example.answer, remaining: 2 } }));
    await page.goto('/#/ai');
    await idea(page).fill('Yoga tomorrow at 9');
    await generate(page).click();
    await expect(preview(page)).toContainText(brief.text!.headline1!);
    await expect(steps(page)).toHaveCount(0);

    // The flyer on the stage is the typed idea's. A picture read now has its words to check first.
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('karaoke-board.png'));
    await answerConfirm(page, 'accept', () => readPicture(page).click());
    await expect(idea(page)).toHaveValue('Karaoke night 06/10 (today)');
    await expect(preview(page), 'the earlier flyer is still on the stage').toBeVisible();
    await expect(currentStep(page)).toHaveText('Check the words');
    // Made again from the picture's words, the flyer is the picture's.
    await tryAgain(page).click();
    await expect(currentStep(page)).toHaveText('Flyer');
    // A picture chosen since is not the one that flyer came from: back at the first step, and once read, at its words.
    await changePicture(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await expect(currentStep(page)).toHaveText('Picture');
    await answerConfirm(page, 'accept', () => readPicture(page).click());
    await expect(currentStep(page)).toHaveText('Check the words');
  });

  test('a read that found no event names the second step "Write the event": at the box, back at the picture, and with the flyer written for it', async ({ page }) => {
    // Routed, so nothing is spent. A photo of the activity itself has no words to check.
    await withLeft(page, { photo: 2, flyer: 2 });
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ json: { text: '', remaining: 1 } }));
    await page.route(apiRoute('ai/flyer'), (route) => route.fulfill({ json: { ...example.answer, remaining: 1 } }));
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await expect(stepNames(page), 'before a read the words are still to come').toHaveText(['Picture', 'Check the words', 'Flyer']);
    await chooseInput(page).setInputFiles(await picture('pool.png'));
    await readPicture(page).click();
    await expect(readNote(page)).toHaveText('The AI found no event in this picture. Write the event here yourself.');
    await expect(stepNames(page), 'the owner’s answer (2026-10-06)').toHaveText(['Picture ✓', 'Write the event', 'Flyer']);
    await expect(currentStep(page)).toHaveText('Write the event');

    // The step is named after what this picture's read found: back at the picture it keeps its name, and another
    // picture is one whose words are still to come.
    await changePicture(page).click();
    await expect(stepNames(page)).toHaveText(['Picture', 'Write the event', 'Flyer']);
    await fromIdea(page).click();
    await idea(page).fill('Pool party on Saturday at 15:00');
    await generate(page).click();
    await expect(preview(page)).toContainText(brief.text!.headline1!);
    await expect(stepNames(page)).toHaveText(['Picture ✓', 'Write the event ✓', 'Flyer']);
    await changePicture(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await expect(stepNames(page)).toHaveText(['Picture', 'Check the words', 'Flyer']);
  });

  test('words read and not yet made into a flyer are unsaved work for "Open in editor" too: with an older flyer on the stage it asks first, and once their flyer is made it asks nothing', async ({ page }) => {
    // Found in this stage's review, and older than it: every other way out asked. The flyer on the stage is an
    // idea's, typed in; the words read afterwards are at "Check the words", and its finish button stands beside them.
    await withLeft(page, { photo: 2, flyer: 3 });
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ json: { text: 'Karaoke night 06/10 (today)', remaining: 1 } }));
    await page.route(apiRoute('ai/flyer'), (route) => route.fulfill({ json: { ...example.answer, remaining: 2 } }));
    await page.goto('/#/ai');
    await idea(page).fill('Yoga tomorrow at 9');
    await generate(page).click();
    await expect(preview(page)).toContainText(brief.text!.headline1!);
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('karaoke-board.png'));
    await answerConfirm(page, 'accept', () => readPicture(page).click());
    await expect(idea(page)).toHaveValue('Karaoke night 06/10 (today)');
    await expect(currentStep(page)).toHaveText('Check the words');

    // A no keeps the page, the words and the flyer.
    const asked = noDialogs(page);
    await openInEditor(page).click();
    await expect(page).toHaveURL(/#\/ai$/);
    expect(asked(), 'the question every other way out asks').toEqual([LEAVE_PROMPT]);
    await expect(idea(page)).toHaveValue('Karaoke night 06/10 (today)');
    await expect(preview(page).locator('[data-flyer]')).toBeVisible();

    // Made into a flyer, the words are in it: opening asks nothing, as it never did.
    await tryAgain(page).click();
    await expect(currentStep(page)).toHaveText('Flyer');
    const quiet = noDialogs(page);
    await openInEditor(page).click();
    await expect(page).toHaveURL(/#\/new$/);
    expect(quiet()).toEqual([]);
  });

  test('a yes to that question opens the older flyer, as it was asked to', async ({ page }) => {
    await withLeft(page, { photo: 2, flyer: 3 });
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ json: { text: 'Karaoke night 06/10 (today)', remaining: 1 } }));
    await page.route(apiRoute('ai/flyer'), (route) => route.fulfill({ json: { ...example.answer, remaining: 2 } }));
    await page.goto('/#/ai');
    await idea(page).fill('Yoga tomorrow at 9');
    await generate(page).click();
    await expect(preview(page)).toContainText(brief.text!.headline1!);
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('karaoke-board.png'));
    await answerConfirm(page, 'accept', () => readPicture(page).click());
    await expect(currentStep(page)).toHaveText('Check the words');

    expect(await answerConfirm(page, 'accept', () => openInEditor(page).click())).toBe(LEAVE_PROMPT);
    await expect(page).toHaveURL(/#\/new$/);
    await expect(page.getByLabel('Line 1')).toHaveValue(brief.text!.headline1!);
  });

  test('From your idea used by itself has no steps: not with a picture chosen and never read, and not with a flyer on screen', async ({ page }) => {
    // Routed, so nothing is spent: the page as it was before the read had one.
    await withLeft(page, 2);
    await page.route(apiRoute('ai/flyer'), (route) => route.fulfill({ json: { ...example.answer, remaining: 1 } }));
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await fromIdea(page).click();
    await expect(steps(page)).toHaveCount(0);
    await idea(page).fill('Yoga tomorrow at 9');
    await generate(page).click();
    await expect(preview(page)).toContainText(brief.text!.headline1!);
    await expect(fromIdea(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(steps(page)).toHaveCount(0);
  });

  test('a picture is chosen with the button, dropped on the box or pasted: it shows small with its name, and nothing is sent until Read', async ({ page }) => {
    const sent = readsSent(page);
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await expect(chosen(page)).toHaveCount(0);

    // Chosen with the button.
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await expect(chosen(page)).toContainText('poster.png');
    const shown = await chosen(page).locator('img').evaluate((img: HTMLImageElement) => img.decode().then(() => img.naturalWidth));
    expect(shown, 'the picture itself, drawn').toBe(64);
    await expect(readPicture(page)).toBeEnabled();
    await chosen(page).getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(chosen(page)).toHaveCount(0);
    await expect(readPicture(page)).toBeDisabled();

    // Dropped on the box.
    await dropFile(page, picker(page), await picture('board.png'));
    await expect(chosen(page)).toContainText('board.png');

    // Pasted, as a screenshot is: it takes the place of the one before.
    await paste(page, await picture('image.png'));
    await expect(chosen(page)).toContainText('image.png');
    await expect(chosen(page)).not.toContainText('board.png');
    // Text on the clipboard is no picture.
    await paste(page, 'Yoga tomorrow at 9');
    await expect(chosen(page)).toContainText('image.png');

    // The picture is the page's: a look at the other way keeps it.
    await fromIdea(page).click();
    await fromPhoto(page).click();
    await expect(chosen(page)).toContainText('image.png');
    await expect(readPicture(page)).toBeEnabled();
    expect(sent, 'choosing spends nothing').toEqual([]);
  });

  test('a picture dropped beside the box, or pasted on From your idea, is not chosen', async ({ page }) => {
    await page.goto('/#/ai');
    // The page is up and the idea box has the focus, as when a staff member pastes into it.
    await idea(page).click();
    await paste(page, await picture('pasted.png'));
    await fromPhoto(page).click();
    await expect(readPicture(page)).toBeVisible();
    await expect(chosen(page)).toHaveCount(0);
    // The stage is no place for a picture: the page refuses the drop, so the browser never opens the file in the tab.
    // A scripted drop opens nothing either way, so the refusal itself is read off the event, as in editor.spec.ts.
    const prevented = await page.locator('.stage').evaluate((el) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File(['x'], 'stray.png', { type: 'image/png' }));
      return ['dragover', 'drop'].map((type) => {
        const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
        el.dispatchEvent(e);
        return e.defaultPrevented;
      });
    });
    expect(prevented, 'dragover and drop both refused').toEqual([true, true]);
    await expect(chosen(page)).toHaveCount(0);
    await expect(readPicture(page)).toBeDisabled();
  });

  test('words already in the box are replaced only on a yes, asked before the read is spent', async ({ page }) => {
    // Routed, so nothing is spent: two reads left on load, and the answer that spends one.
    await withLeft(page, { photo: 2 });
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ json: { text: 'Bachata workshop\nToday 20:00', remaining: 1 } }));
    const sent = readsSent(page);
    await page.goto('/#/ai');
    await idea(page).fill('My own words');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));

    const asked = await answerConfirm(page, 'dismiss', () => readPicture(page).click());
    expect(asked).toBe('Replace your idea with the words the AI reads from this picture? It uses one of the 2 picture reads left today.');
    expect(sent, 'nothing sent on a no').toEqual([]);
    await expect(fromPhoto(page), 'still on From a photo').toHaveAttribute('aria-pressed', 'true');
    await expect(readPicture(page)).toContainText('2 left today');

    await answerConfirm(page, 'accept', () => readPicture(page).click());
    await expect(idea(page)).toHaveValue('Bachata workshop\nToday 20:00');
    expect(sent).toHaveLength(1);

    // With one left the question counts in plain words. The way back to the picture is under the steps now.
    await changePicture(page).click();
    await expect(readPicture(page)).toContainText('1 left today');
    const last = await answerConfirm(page, 'dismiss', () => readPicture(page).click());
    expect(last).toBe('Replace your idea with the words the AI reads from this picture? It uses the last of today’s picture reads.');
  });

  test('a picture with no event says so under the box, and counts as a read', async ({ page }) => {
    const reads = await left(page, 'photo');
    expect(reads, 'this file spends a read here').toBeGreaterThan(0);
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('wall.png', AI_FAKE.pictureWidths.noWords));
    const answered = page.waitForResponse(apiCall('POST', 'ai/photo'));
    await readPicture(page).click();
    expect(AiPhotoResultSchema.parse(await (await answered).json())).toEqual({ text: '', remaining: reads - 1 });

    // The picture was read, so the steps stand where the switch was, whatever the read found. With no words to
    // check, the step is to write them (the owner's answer, 2026-10-06).
    await expect(ways(page)).toHaveCount(0);
    await expect(stepNames(page).first()).toHaveText('Picture ✓');
    await expect(currentStep(page)).toHaveText('Write the event');
    await expect(idea(page)).toBeEmpty();
    await expect(readNote(page), 'the owner’s words (2026-10-06)').toHaveText('The AI found no event in this picture. Write the event here yourself.');
    await expect(readNote(page)).toBeFocused();
    await expect(errorNote(page)).toHaveCount(0);
    await expect(generate(page), 'nothing to make a flyer from yet').toBeDisabled();
    expect(await left(page, 'photo'), 'the provider answered, so it counts').toBe(reads - 1);
  });

  test('a read that finds no event leaves what was typed in the box', async ({ page }) => {
    await withLeft(page, { photo: 2 });
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ json: { text: '', remaining: 1 } }));
    await page.goto('/#/ai');
    await idea(page).fill('My own words');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('wall.png'));
    await answerConfirm(page, 'accept', () => readPicture(page).click());
    await expect(readNote(page)).toHaveText('The AI found no event in this picture. Write the event here yourself.');
    await expect(idea(page), 'nothing is worth less than what was typed').toHaveValue('My own words');
  });

  test('a read the AI fails is free: the page says so, keeps the picture, and asks the server what is left', async ({ page }) => {
    // The fake fails this picture by its width. A failed read is one of the day's tries, and never one of its reads.
    const reads = await left(page, 'photo');
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png', AI_FAKE.pictureWidths.invalid));
    const recounted = page.waitForResponse(apiCall('GET', 'config'));
    await readPicture(page).click();
    await expect(errorNote(page), 'the server’s sentence, then the owner’s line (2026-10-06)').toHaveText(
      `${apiError('ai_failed').message} Your picture is still here: try again, or type the event yourself.`,
    );
    expect((await recounted).status(), 'a failed read answers no count, so the page asks').toBe(200);
    await expect(fromPhoto(page), 'still on From a photo').toHaveAttribute('aria-pressed', 'true');
    await expect(chosen(page)).toContainText('poster.png');
    await expect(readPicture(page)).toBeEnabled();
    await expect(readPicture(page)).toContainText(`${reads} left today`);
    await expect(readNote(page)).toHaveCount(0);
    expect(await left(page, 'photo'), 'a failed read is free').toBe(reads);
  });

  test('in the failed-read line "type the event yourself" is a link: it opens the idea box with the cursor in it, and the picture stays chosen', async ({ page }) => {
    // Routed, so nothing is spent. The owner asked for the link (2026-10-06); his sentence stays letter for letter.
    await withLeft(page, { photo: 2 });
    const failed = apiError('ai_failed');
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ status: failed.status, json: { error: { code: failed.code, message: failed.message } } }));
    const sent = readsSent(page);
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('blurry-board.png'));
    await readPicture(page).click();
    await expect(errorNote(page)).toHaveText(`${failed.message} Your picture is still here: try again, or type the event yourself.`);

    await errorNote(page).getByRole('button', { name: 'type the event yourself', exact: true }).click();
    await expect(fromIdea(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(idea(page), 'the cursor is in the box: the next thing is to type').toBeFocused();
    await expect(idea(page)).toBeEmpty();
    await expect(errorNote(page), 'the note has done its work').toHaveCount(0);
    await expect(steps(page), 'no picture was read: this idea is typed in').toHaveCount(0);
    expect(sent, 'the link sends nothing').toHaveLength(1);
    // The picture is still the page's, for another try.
    await fromPhoto(page).click();
    await expect(chosen(page)).toContainText('blurry-board.png');
    await expect(readPicture(page)).toBeEnabled();
  });

  test('with forced colours the link still shows a keyboard’s focus: an outline the system can paint, where it otherwise turns its colours round', async ({ page }) => {
    // Found in this stage's review. Windows' high contrast paints every colour itself, so a focus shown by colours
    // alone shows nothing there. Routed, so nothing is spent.
    await page.emulateMedia({ forcedColors: 'active' });
    await withLeft(page, { photo: 2 });
    const failed = apiError('ai_failed');
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ status: failed.status, json: { error: { code: failed.code, message: failed.message } } }));
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('blurry-board.png'));
    await readPicture(page).click();
    const link = errorNote(page).getByRole('button', { name: 'type the event yourself', exact: true });
    // Reached with the keyboard, which is when a focus shows.
    await link.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    const outline = await link.evaluate((el) => {
      const style = getComputedStyle(el);
      return { shown: el.matches(':focus-visible'), style: style.outlineStyle, width: style.outlineWidth };
    });
    expect(outline).toEqual({ shown: true, style: 'solid', width: '2px' });
  });

  test('after a failed read the button shows what the server says is left, which can be less: the day’s tries', async ({ page }) => {
    // Routed, so nothing is spent. api/config says two reads on load and one when asked again, as it does once the
    // day's tries bind before its reads (three tries for each read of the limit, failed ones included). The second
    // answer also says fewer flyers, as after a colleague's: the question was the read's, and moves the read's alone.
    await withCounts(page, [{ photo: 2 }, { photo: 1, flyer: 1 }]);
    const failed = apiError('ai_failed');
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ status: failed.status, json: { error: { code: failed.code, message: failed.message } } }));
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await expect(readPicture(page)).toContainText('2 left today');
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await readPicture(page).click();
    await expect(errorNote(page)).toContainText(failed.message);
    await expect(readPicture(page)).toContainText('1 left today');
    // The read's count moved, and only the read's.
    await fromIdea(page).click();
    await expect(generate(page)).toContainText(`${AI_DAILY_LIMIT} left today`);
  });

  test('a failed read that was the day’s last try says so without "try again": the used-up sentence stands under a greyed button', async ({ page }) => {
    // Found in review (2026-10-06): the note said "try again" over a button that read "0 left today". Routed.
    await withCounts(page, [{ photo: 1 }, { photo: 0 }]);
    const failed = apiError('ai_failed');
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ status: failed.status, json: { error: { code: failed.code, message: failed.message } } }));
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await readPicture(page).click();
    await expect(readPicture(page)).toContainText('0 left today');
    await expect(readPicture(page)).toBeDisabled();
    await expect(errorNote(page), 'the server’s sentence alone').toHaveText(failed.message);
    await expect(page.locator('.ai-used-up')).toHaveText(apiError('ai_quota', aiQuotaVars('photo', AI_DAILY_LIMIT)).message);
  });

  test('a failure that brings no sentence of the server’s still reads as sentences: a full stop, then the owner’s line', async ({ page }) => {
    // Found in review (2026-10-06): "Request failed (504) Your picture is still here…". A host that cuts a slow read
    // off answers with its own page, and a dropped connection with nothing: both are the slow read's own cases.
    await withLeft(page, { photo: 2 });
    const kept = 'Your picture is still here: try again, or type the event yourself.';
    let dropped = false;
    await page.route(apiRoute('ai/photo'), (route) => (dropped ? route.abort('connectionreset') : route.fulfill({ status: 504, contentType: 'text/html', body: '<h1>Gateway Timeout</h1>' })));
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await readPicture(page).click();
    await expect(errorNote(page)).toHaveText(`Request failed (504). ${kept}`);

    dropped = true;
    await readPicture(page).click();
    // The browser's own words for a dropped connection, whatever they are, end before the line begins.
    await expect(errorNote(page)).toHaveText(/[.!?] Your picture is still here: try again, or type the event yourself\.$/);
    await expect(chosen(page)).toContainText('poster.png');
  });

  test('with no flyer left today the photo way spends no read: the button waits, and the flyers’ sentence says why', async ({ page }) => {
    // Found in review (2026-10-06): a read could be spent on words no flyer could be made from that day.
    await withLeft(page, { flyer: 0, photo: 2 });
    const sent = readsSent(page);
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await expect(readPicture(page)).toContainText('2 left today');
    await expect(readPicture(page)).toBeDisabled();
    await expect(page.locator('.ai-used-up')).toHaveText(apiError('ai_quota', aiQuotaVars('flyer', AI_DAILY_LIMIT)).message);
    expect(sent).toEqual([]);
  });

  test('a picture larger than the read’s edge is shrunk in the browser before it is sent, as a flyer’s photo is to its own', async ({ page }) => {
    // Found in review (2026-10-06): no test sent the page a picture over the edge, so the read's own limits could
    // have been the photo's and nothing would have said so. The file as fetch() is given it is measured in the page.
    await withLeft(page, { photo: 2 });
    await page.addInitScript(() => {
      const send = window.fetch;
      window.fetch = async (input, init) => {
        const body = init?.body;
        if (String(input).endsWith('api/ai/photo') && body instanceof FormData) {
          const file = body.get('photo') as File;
          const drawn = await createImageBitmap(file);
          (window as unknown as { sentPicture?: unknown }).sentPicture = { name: file.name, type: file.type, width: drawn.width, height: drawn.height };
        }
        return send(input, init);
      };
    });
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ json: { text: 'Bachata workshop', remaining: 1 } }));
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    // Wider than the read's edge and under a flyer photo's (MAX_PHOTO_EDGE): only the read's own limits shrink it.
    await chooseInput(page).setInputFiles(await picture('banner.png', 3000, 60));
    await readPicture(page).click();
    await expect(idea(page)).toHaveValue('Bachata workshop');
    const sent = await page.evaluate(() => (window as unknown as { sentPicture?: unknown }).sentPicture);
    expect(sent).toEqual({ name: 'banner.jpg', type: 'image/jpeg', width: AI_PICTURE_MAX_EDGE, height: 41 });
  });

  test('a picture the photo route refuses shows that route’s own message, and nothing more: an iPhone’s HEIC gets the hint', async ({ page }) => {
    const reads = await left(page, 'photo');
    const { limits } = ApiConfigSchema.parse(await (await page.request.get('/api/config')).json());
    const sent = readsSent(page);
    await page.goto('/#/ai');
    await fromPhoto(page).click();

    // Small enough to upload: the server reads it and says HEIC. It is refused before the limit is asked or a
    // provider is, so it is no read and no try.
    const heic = (bytes: number): FilePayload => ({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(bytes)]) });
    await chooseInput(page).setInputFiles(heic(64));
    await expect(chosen(page), 'a picture the browser cannot draw shows by its name').toContainText('IMG_0001.HEIC');
    await expect(chosen(page).locator('img')).toHaveCount(0);
    const answered = page.waitForResponse(apiCall('POST', 'ai/photo'));
    await readPicture(page).click();
    expect((await answered).status()).toBe(apiError('heic').status);
    await expect(errorNote(page)).toHaveText(apiError('heic').message);
    expect(sent).toHaveLength(1);

    // Over the upload limit the server would refuse it unread (too large): the page says HEIC itself, and sends nothing.
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await expect(errorNote(page), 'a new picture is a new start').toHaveCount(0);
    await chooseInput(page).setInputFiles(heic(limits.maxUploadBytes));
    await readPicture(page).click();
    await expect(errorNote(page)).toHaveText(apiError('heic').message);
    expect(sent, 'nothing more was sent').toHaveLength(1);
    await expect(readPicture(page)).toContainText(`${reads} left today`);
    expect(await left(page, 'photo')).toBe(reads);
  });

  test('the reads’ limit reached elsewhere: the page says when they come back, the button counts none, and the flyer keeps its count', async ({ page }) => {
    // Routed both ways, so it holds whatever this file has spent: one read left on load, then the server's refusal.
    await withLeft(page, { flyer: 2, photo: 1 });
    const quota = apiError('ai_quota', aiQuotaVars('photo', AI_DAILY_LIMIT));
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ status: quota.status, json: { error: { code: quota.code, message: quota.message } } }));
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await readPicture(page).click();
    await expect(errorNote(page), 'the sentence alone: trying again would not help').toHaveText(quota.message);
    await expect(readPicture(page)).toContainText('0 left today');
    await expect(readPicture(page)).toBeDisabled();
    await expect(page.locator('.ai-used-up')).toHaveText(quota.message);
    await fromIdea(page).click();
    await expect(generate(page)).toContainText('2 left today');
  });

  test('one action at a time: a picture that arrives while a read is out is refused with a reason', async ({ page }) => {
    await withLeft(page, { photo: 2 });
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(apiRoute('ai/photo'), async (route) => {
      await held;
      await route.fulfill({ json: { text: 'Bachata workshop', remaining: 1 } });
    });
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await readPicture(page).click();
    await expect(page.locator('.ai-waiting')).toBeVisible();
    await paste(page, await picture('late.png'));
    await expect(errorNote(page)).toHaveText('Still working on the last action — try the picture again in a moment.');
    await expect(chosen(page), 'the picture being read stays').toContainText('poster.png');
    release();
    await expect(idea(page)).toHaveValue('Bachata workshop');
    // Found in review (2026-10-06): the red note stayed over the words it had nothing to do with.
    await expect(errorNote(page), 'the moment it spoke of is over').toHaveCount(0);
  });

  test('words read and not yet made into a flyer are unsaved work, so leaving asks; a picture not read and a read with no event ask nothing', async ({ page }) => {
    // Routed, so nothing is spent: the read answers what the test says next.
    await withLeft(page, { photo: 3 });
    let text = '';
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ json: { text, remaining: 2 } }));
    const library = page.getByRole('heading', { name: 'Flyer library' });
    const dialogs = noDialogs(page);

    // A picture chosen and not read: nothing was spent, nothing is lost.
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await backToLibrary(page).click();
    await expect(library).toBeVisible();

    // A read that found no event left nothing in the box.
    await entry(page).click();
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('wall.png'));
    await readPicture(page).click();
    await expect(readNote(page)).toContainText('no event');
    await backToLibrary(page).click();
    await expect(library).toBeVisible();
    expect(dialogs(), 'neither asked').toEqual([]);

    // Words read: a read was spent on them.
    text = 'Bachata workshop\nToday 20:00';
    await entry(page).click();
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await readPicture(page).click();
    await expect(idea(page)).toHaveValue(text);
    expect(await answerConfirm(page, 'dismiss', () => backToLibrary(page).click())).toBe(LEAVE_PROMPT);
    await expect(page).toHaveURL(/#\/ai$/);
    await expect(idea(page), 'a no keeps the page and its words').toHaveValue(text);

    // Once the box is emptied there is nothing of the read left to lose.
    await idea(page).fill('');
    const quiet = noDialogs(page);
    await backToLibrary(page).click();
    await expect(library).toBeVisible();
    expect(quiet()).toEqual([]);
  });

  test('words read stay unsaved work when a second picture has no event: the box keeps them, and leaving still asks', async ({ page }) => {
    // Found in review (2026-10-06): the second, empty read took the guard off words a read had been spent on.
    await withLeft(page, { photo: 3 });
    let text = 'Bachata workshop\nToday 20:00';
    await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ json: { text, remaining: 2 } }));
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await readPicture(page).click();
    await expect(idea(page)).toHaveValue(text);

    text = '';
    await changePicture(page).click();
    await chooseInput(page).setInputFiles(await picture('wall.png'));
    await answerConfirm(page, 'accept', () => readPicture(page).click());
    await expect(readNote(page)).toContainText('no event');
    await expect(idea(page), 'the first picture’s words').toHaveValue('Bachata workshop\nToday 20:00');
    expect(await answerConfirm(page, 'dismiss', () => backToLibrary(page).click())).toBe(LEAVE_PROMPT);
    await expect(page).toHaveURL(/#\/ai$/);
  });

  test('a read on its way is unsaved work: leaving asks, and a no keeps the page for its answer', async ({ page }) => {
    // Found in review (2026-10-06): the wait is 5 to 22 seconds by design, and "← Library" left it without a
    // question, with the read still out and still counted. The editor guards a photo on its way the same.
    await withLeft(page, { photo: 2 });
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(apiRoute('ai/photo'), async (route) => {
      await held;
      await route.fulfill({ json: { text: 'Bachata workshop', remaining: 1 } });
    });
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await readPicture(page).click();
    await expect(page.locator('.ai-waiting')).toBeVisible();
    expect(await answerConfirm(page, 'dismiss', () => backToLibrary(page).click())).toBe(LEAVE_PROMPT);
    await expect(page).toHaveURL(/#\/ai$/);
    release();
    await expect(idea(page)).toHaveValue('Bachata workshop');
  });

  /* The picture as the flyer's photo (stage 4 of the brief; the owner's answer: "Offered, off by default"). The read
     and the flyer are answered here, so nothing is spent; an upload is a real one, to the suite's own store. */

  test('the flyer made from a picture offers it as the flyer’s photo, unticked, in the bar above the flyer; left unticked, Open in editor uploads nothing and the flyer has no photo', async ({ page }) => {
    const uploads = uploadsSent(page);
    await flyerFromPicture(page, await picture('poster.png'));
    await expect(usePicture(page), 'offered, off by default').not.toBeChecked();
    await expect(usePicture(page)).toBeEnabled();
    expect((await usePicture(page).boundingBox())!.x, 'before the buttons it belongs to').toBeLessThan((await tryAgain(page).boundingBox())!.x);

    // Unticked, the flyer opens as an AI flyer always did.
    await openInEditor(page).click();
    await expect(page).toHaveURL(/#\/new$/);
    await expect(page.getByLabel('Line 1')).toHaveValue(brief.text!.headline1!);
    await expect(photoMode(page, 'none')).toHaveClass('on');
    expect(uploads, 'nothing was uploaded').toEqual([]);
  });

  test('a picture with no event is offered as the photo too, once the staff member wrote the event and made the flyer', async ({ page }) => {
    // The owner's answer (2026-10-06): a photo of the activity itself is the picture most worth printing.
    await flyerFromPicture(page, await picture('pool.png'), { text: '' });
    await expect(stepNames(page)).toHaveText(['Picture ✓', 'Write the event ✓', 'Flyer']);
    await expect(usePicture(page)).not.toBeChecked();
  });

  test('no picture is offered for a flyer from an idea typed in, even with a picture chosen and never read', async ({ page }) => {
    await withLeft(page, 2);
    await page.route(apiRoute('ai/flyer'), (route) => route.fulfill({ json: { ...example.answer, remaining: 1 } }));
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));
    await fromIdea(page).click();
    await idea(page).fill('Yoga tomorrow at 9');
    await generate(page).click();
    await expect(preview(page)).toContainText(brief.text!.headline1!);
    await expect(openInEditor(page)).toBeVisible();
    await expect(usePicture(page)).toHaveCount(0);
  });

  test('no picture is offered for a This week flyer, which has no photo', async ({ page }) => {
    await flyerFromPicture(page, await picture('board.png'), { answer: weekAnswer });
    await expect(preview(page)).toContainText('Stretching class');
    await expect(currentStep(page), 'it is still this picture’s flyer').toHaveText('Flyer');
    await expect(openInEditor(page)).toBeVisible();
    await expect(usePicture(page)).toHaveCount(0);
  });

  test('the offer follows the picture the flyer was made from: it outlives the words in the box, goes when another picture is chosen, and a tick is kept by a Try again from the same picture alone', async ({ page }) => {
    await flyerFromPicture(page, await picture('poster.png'));
    // The flyer remembers its picture from the moment Generate was pressed: the box may be emptied since.
    await idea(page).fill('');
    await expect(usePicture(page)).toBeVisible();
    await idea(page).fill('Sunset stretching, 19:00, by the pool');
    await usePicture(page).check();
    await tryAgain(page).click();
    await expect(tryAgain(page)).toBeEnabled();
    await expect(usePicture(page), 'made again from the same picture: the tick stays').toBeChecked();

    // Another picture is not the one this flyer came from: "this picture" would be the wrong one.
    await changePicture(page).click();
    await chooseInput(page).setInputFiles(await picture('board.png'));
    await expect(preview(page).locator('[data-flyer]'), 'the flyer is still on the stage').toBeVisible();
    await expect(usePicture(page)).toHaveCount(0);
    // Read, and its flyer made: offered again, and unticked, as every picture starts.
    await answerConfirm(page, 'accept', () => readPicture(page).click());
    await expect(currentStep(page)).toHaveText('Check the words');
    await expect(usePicture(page)).toHaveCount(0);
    await tryAgain(page).click();
    await expect(currentStep(page)).toHaveText('Flyer');
    await expect(usePicture(page)).not.toBeChecked();
  });

  test('ticked, Open in editor uploads the picture as it was chosen, at a flyer photo’s own size, and the editor opens with it in a frame; saved, the flyer has its photo', async ({ page }) => {
    // The read is sent a copy shrunk to the read's edge (above). The flyer's photo is made from the original: wider
    // than that edge and under a flyer photo's (MAX_PHOTO_EDGE), only the photo's own limits leave it as wide as it is.
    const dialogs = noDialogs(page);
    await flyerFromPicture(page, await picture('banner.png', 3000, 60));
    await usePicture(page).check();
    const [uploaded] = await Promise.all([page.waitForResponse(apiCall('POST', 'photos')), openInEditor(page).click()]);
    expect(uploaded.status(), await uploaded.text()).toBe(201);
    const photo = PhotoInfoSchema.parse(await uploaded.json());
    expect([photo.width, photo.height], 'the original, not the copy the read was sent').toEqual([3000, 60]);

    await expect(page).toHaveURL(/#\/new$/);
    expect(dialogs(), 'opening asks nothing').toEqual([]);
    await expect(page.getByLabel('Line 1')).toHaveValue(brief.text!.headline1!);
    await expect(photoMode(page, 'band'), 'in a frame, as a photo dropped on "No photo" lands').toHaveClass('on');
    const inFlyer = preview(page).locator('[data-group="photo"] img');
    await expect(inFlyer).toBeVisible();
    expect(await inFlyer.getAttribute('src'), 'the uploaded picture is the flyer’s photo').toContain(photo.url);
    await expect(toast(page, 'warn').filter({ hasText: 'AI draft: check every fact before you print' })).toBeVisible();
    await expect(status(page)).toHaveText('Unsaved changes');

    const saved = await saveNew(page, keep);
    expect(saved.flyer.photoId).toBe(photo.id);
    expect(saved.flyer.data.photoMode).toBe('band');
  });

  test('while the picture uploads the page waits as for any action: the button says Uploading…, the stage says what is happening, nothing else can be pressed, and leaving asks', async ({ page }) => {
    await flyerFromPicture(page, await picture('poster.png'));
    await usePicture(page).check();
    const release = await hold(page, apiRoute('photos'), 'POST');
    await openInEditor(page).click();
    await expect(page.getByRole('button', { name: 'Uploading…', exact: true }), 'the editor’s own word for a photo on its way (the owner’s answer, 2026-10-06)').toBeDisabled();
    await expect(page.locator('.ai-waiting')).toHaveText('Adding your picture to the flyer…');
    await expect(tryAgain(page)).toBeDisabled();
    await expect(generate(page)).toBeDisabled();
    await expect(usePicture(page)).toBeDisabled();
    await expect(usePicture(page)).toBeChecked();
    await expect(changePicture(page)).toBeDisabled();
    // The flyer is unsaved work, now with its picture on the way: leaving asks, and a no keeps the page for the answer.
    expect(await answerConfirm(page, 'dismiss', () => backToLibrary(page).click())).toBe(LEAVE_PROMPT);
    await expect(page).toHaveURL(/#\/ai$/);
    release();
    await expect(page).toHaveURL(/#\/new$/);
    await expect(photoMode(page, 'band')).toHaveClass('on');
    await expect(preview(page).locator('[data-group="photo"] img')).toBeVisible();
  });

  test('a picture that lands after the staff member has left opens nothing: the library stays, and a new flyer starts blank', async ({ page }) => {
    await flyerFromPicture(page, await picture('poster.png'));
    await usePicture(page).check();
    const release = await hold(page, apiRoute('photos'), 'POST');
    await openInEditor(page).click();
    await expect(page.locator('.ai-waiting')).toBeVisible();
    expect(await answerConfirm(page, 'accept', () => backToLibrary(page).click())).toBe(LEAVE_PROMPT);
    const library = page.getByRole('heading', { name: 'Flyer library' });
    await expect(library).toBeVisible();

    const landed = page.waitForResponse(apiCall('POST', 'photos'));
    release();
    const res = await landed;
    expect(res.status()).toBe(201);
    // The answer is in the page: what it would do, it does before two frames are drawn.
    await res.finished();
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await expect(page).toHaveURL(/#\/$/);
    await expect(library).toBeVisible();
    // Nothing was handed over: the next new flyer is nobody's draft.
    await page.getByRole('link', { name: 'New flyer' }).click();
    await expect(page.getByLabel('Line 1')).toHaveValue('');
    await expect(toast(page, 'warn').filter({ hasText: 'AI draft' })).toHaveCount(0);
  });

  test('a picture that lands after the staff member left and came back to Create with AI opens nothing either: the page that asked is gone', async ({ page }) => {
    // The page in the URL is the same one, and a new one: the answer belongs to the page that was left.
    await flyerFromPicture(page, await picture('poster.png'));
    await usePicture(page).check();
    const release = await hold(page, apiRoute('photos'), 'POST');
    await openInEditor(page).click();
    await expect(page.locator('.ai-waiting')).toBeVisible();
    expect(await answerConfirm(page, 'accept', () => backToLibrary(page).click())).toBe(LEAVE_PROMPT);
    await expect(page.getByRole('heading', { name: 'Flyer library' })).toBeVisible();
    await entry(page).click();
    await expect(idea(page), 'a new page, with nothing of the one that was left').toBeEmpty();

    const landed = page.waitForResponse(apiCall('POST', 'photos'));
    release();
    const res = await landed;
    expect(res.status()).toBe(201);
    await res.finished();
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await expect(page).toHaveURL(/#\/ai$/);
    await expect(preview(page), 'no flyer arrived on the new page').toHaveCount(0);
    // Nothing was handed over, so nothing waits for the next new flyer.
    const quiet = noDialogs(page);
    await backToLibrary(page).click();
    await page.getByRole('link', { name: 'New flyer' }).click();
    await expect(page.getByLabel('Line 1')).toHaveValue('');
    await expect(toast(page, 'warn').filter({ hasText: 'AI draft' })).toHaveCount(0);
    expect(quiet(), 'the new page had nothing unsaved').toEqual([]);
  });

  test('a picture the photo route refuses keeps the page: its own message alone, the tick still set, the flyer still there; pressed again, it opens', async ({ page }) => {
    await flyerFromPicture(page, await picture('poster.png'));
    await usePicture(page).check();
    const tooLarge = apiError('too_large', { mb: 2 });
    let refuse = true;
    await page.route(apiRoute('photos'), (route) => (refuse ? route.fulfill({ status: tooLarge.status, json: { error: { code: tooLarge.code, message: tooLarge.message } } }) : route.continue()));
    await openInEditor(page).click();
    await expect(errorNote(page), 'the photo route’s own message, and nothing more').toHaveText(tooLarge.message);
    await expect(page).toHaveURL(/#\/ai$/);
    await expect(preview(page).locator('[data-flyer]'), 'nothing is lost: the flyer is back on the stage').toBeVisible();
    await expect(usePicture(page), 'the tick is still set').toBeChecked();
    await expect(openInEditor(page)).toBeEnabled();
    await expect(currentStep(page)).toHaveText('Flyer');

    refuse = false;
    await openInEditor(page).click();
    await expect(page).toHaveURL(/#\/new$/);
    await expect(photoMode(page, 'band')).toHaveClass('on');
  });

  test('with a mouse there is no Take a photo: a laptop has Choose a picture, drop and paste', async ({ page }) => {
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await expect(choosePicture(page)).toBeVisible();
    await expect(dropOrPaste(page)).toBeVisible();
    await expect(takePhoto(page)).toBeHidden();
  });

  test.describe('on a phone or a tablet', () => {
    // A finger as the main pointer: what tells a phone from a laptop, whose browser ignores `capture`.
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test('Take a photo asks the device for its camera, beside Choose a picture, and the picture it hands back is chosen', async ({ page }) => {
      await page.goto('/#/ai');
      await fromPhoto(page).click();
      await expect(takePhoto(page)).toBeVisible();
      await expect(choosePicture(page)).toBeVisible();
      await expect(dropOrPaste(page), 'nothing to drop or paste with a finger').toBeHidden();

      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), takePhoto(page).click()]);
      expect(await chooser.element().getAttribute('capture'), 'the camera at the back, where a poster is').toBe('environment');
      expect(await chooser.element().getAttribute('accept'), 'a photo, not any file').toMatch(/^image\//);
      await chooser.setFiles(await picture('camera.png'));
      await expect(chosen(page)).toContainText('camera.png');
      await expect(readPicture(page)).toBeEnabled();
    });

    // 390 px is the brief's phone; 360 × 780 is the owner's own, a Galaxy S23.
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 360, height: 780 },
    ]) {
      test(`the steps and the picture’s offer fit a phone ${viewport.width} px wide: three names on one line under the switch and then in its place, the next button in view, and no sideways scroll`, async ({ page }) => {
        // Routed, so nothing is spent.
        await page.setViewportSize(viewport);
        await withLeft(page, { photo: 2, flyer: 2 });
        await page.route(apiRoute('ai/photo'), (route) => route.fulfill({ json: { text: 'Karaoke night 06/10 (today)\nFree event, Medano Nest hostel', remaining: 1 } }));
        await page.route(apiRoute('ai/flyer'), (route) => route.fulfill({ json: { ...example.answer, remaining: 1 } }));
        const sideways = () => page.evaluate(() => Math.max(...[document.documentElement, document.querySelector('.panel-body')!].map((el) => el.scrollWidth - el.clientWidth)));
        const whole = { ratio: 1 };
        /** The steps as they lie: every name whole on screen, and all three on one line. */
        const onOneLine = async () => {
          for (const name of await stepNames(page).all()) await expect(name).toBeInViewport(whole);
          const tops = await steps(page).locator('li').evaluateAll((items) => items.map((li) => Math.round(li.getBoundingClientRect().top)));
          const [needs, has] = await steps(page).evaluate((list) => [[...list.children].reduce((sum, li) => sum + li.getBoundingClientRect().width, 0), list.clientWidth].map(Math.round));
          expect(new Set(tops).size, `one line (tops ${tops.join(', ')}; the names take ${needs} px of ${has}, before the gaps)`).toBe(1);
          expect(await sideways()).toBeLessThanOrEqual(0);
        };

        // The first step, under the switch: with a photo as a phone takes it, Read is still on screen.
        await page.goto('/#/ai');
        await fromPhoto(page).click();
        await expect(currentStep(page)).toHaveText('Picture');
        await onOneLine();
        await chooseInput(page).setInputFiles(await picture('IMG_2041.png', 600, 800));
        await expect(readPicture(page), 'the next step, without scrolling').toBeInViewport(whole);

        // The second, in the switch's place: the picture, its way back, and Generate on screen.
        await readPicture(page).click();
        await expect(currentStep(page)).toHaveText('Check the words');
        await onOneLine();
        await expect(chosen(page).locator('img')).toBeInViewport(whole);
        await expect(changePicture(page)).toBeInViewport(whole);
        await expect(generate(page), 'the next step, without scrolling').toBeInViewport(whole);

        // The third, at its longest: two steps done.
        await generate(page).click();
        await expect(preview(page)).toContainText(brief.text!.headline1!);
        await expect(stepNames(page)).toHaveText(['Picture ✓', 'Check the words ✓', 'Flyer']);
        await onOneLine();
        await expect(openInEditor(page), 'the finish').toBeInViewport(whole);
        // With it, the picture offered as the flyer's photo: the box and all of its words on screen.
        await expect(usePicture(page)).toBeInViewport(whole);
        const offer = (await page.locator('.toolbar .check').boundingBox())!;
        expect(offer.x, 'the offer starts on screen').toBeGreaterThanOrEqual(0);
        expect(offer.x + offer.width, 'and ends on it').toBeLessThanOrEqual(viewport.width);
        expect(await sideways()).toBeLessThanOrEqual(0);
      });
    }

    test('the photo way fits a phone: the switch, both buttons and Read in view with a picture chosen, the waiting line in view, and no sideways scroll', async ({ page }) => {
      // Routed and held, so nothing is spent and the waiting state can be seen.
      await withLeft(page, { photo: 2 });
      let release = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route(apiRoute('ai/photo'), async (route) => {
        await held;
        await route.fulfill({ json: { text: 'Bachata workshop\nToday 20:00', remaining: 1 } });
      });
      /** How far the page, or the form inside it (it scrolls by itself), can be scrolled sideways: not at all. */
      const sideways = () => page.evaluate(() => Math.max(...[document.documentElement, document.querySelector('.panel-body')!].map((el) => el.scrollWidth - el.clientWidth)));
      const whole = { ratio: 1 };

      await page.goto('/#/ai');
      await expect(fromIdea(page)).toBeInViewport(whole);
      await expect(fromPhoto(page)).toBeInViewport(whole);
      await fromPhoto(page).click();
      await expect(takePhoto(page)).toBeInViewport(whole);
      await expect(choosePicture(page)).toBeInViewport(whole);
      // A photo as a phone takes it, upright: the small picture is then as tall as it gets.
      await chooseInput(page).setInputFiles(await picture('IMG_2041.png', 600, 800));
      await expect(chosen(page).locator('img')).toBeInViewport(whole);
      await expect(readPicture(page), 'the next step, without scrolling').toBeInViewport(whole);
      expect(await sideways()).toBeLessThanOrEqual(0);

      await readPicture(page).click();
      await expect(page.locator('.ai-waiting'), 'the read is slow: what the page is doing must be on screen').toBeInViewport(whole);
      expect(await sideways()).toBeLessThanOrEqual(0);
      release();
      await expect(idea(page)).toHaveValue('Bachata workshop\nToday 20:00');
      await expect(readNote(page)).toBeVisible();
      expect(await sideways()).toBeLessThanOrEqual(0);
    });
  });

  // Last on purpose: it spends the day's last flyer, and with none left the photo way reads nothing (above), so
  // every spec that sends the server a read runs before it.
  test('a picture becomes its words and the words a flyer: a waiting state, the words in Your idea with a line to check them by, and each count its own', async ({ page }) => {
    test.setTimeout(90_000);
    const reads = await left(page, 'photo');
    const flyers = await left(page, 'flyer');
    expect(Math.min(reads, flyers), 'this file spends a read and the day’s last flyer here').toBeGreaterThan(0);
    const uploads = uploadsSent(page);
    await page.goto('/#/ai');
    await fromPhoto(page).click();
    await chooseInput(page).setInputFiles(await picture('poster.png'));

    // The answer is held, so the waiting state can be seen. Nothing is in the idea box, so nothing is asked first.
    const release = await hold(page, apiRoute('ai/photo'), 'POST');
    const answered = page.waitForResponse(apiCall('POST', 'ai/photo'));
    await readPicture(page).click();
    await expect(page.locator('.ai-waiting')).toHaveText('✨ The AI is reading your picture… it can take half a minute.');
    await expect(page.getByRole('button', { name: /^Reading…/ }), 'one read at a time').toBeDisabled();
    await expect(fromIdea(page), 'the page does not change under an answer on its way').toBeDisabled();
    await expect(choosePicture(page)).toBeDisabled();
    release();
    const res = await answered;
    expect(res.status(), await res.text()).toBe(200);
    expect(res.request().headers()['content-type'], 'the picture as a file, as a flyer’s photo travels').toMatch(/^multipart\/form-data/);
    // The fake reads every picture as its first example's text: the words that example's flyer came from.
    expect(AiPhotoResultSchema.parse(await res.json())).toEqual({ text: example.text, remaining: reads - 1 });
    await page.unrouteAll({ behavior: 'wait' });

    // The page is on the words to check, the second step: the flyer is the staff member's own next one.
    await expect(ways(page), 'the steps stand where the switch was').toHaveCount(0);
    await expect(currentStep(page)).toHaveText('Check the words');
    await expect(idea(page)).toHaveValue(example.text);
    await expect(readNote(page), 'the owner’s words (2026-10-06)').toHaveText(
      'Read from your picture. Check every word, and add what is missing (the price?). [?] marks a word the AI could not read. If it lists several activities, keep the one this flyer is for.',
    );
    // The button that was pressed went with its way. The focus goes to the line, so a keyboard or a screen reader is
    // told what happened and stands at the box; the box itself would raise a phone's keyboard over the words.
    await expect(readNote(page)).toBeFocused();
    expect(await idea(page).getAttribute('aria-describedby'), 'the box is described by its line').toBe(await readNote(page).getAttribute('id'));
    await expect(errorNote(page)).toHaveCount(0);
    await expect(preview(page), 'a read makes no flyer').toHaveCount(0);
    await expect(generate(page)).toContainText(`${flyers} left today`);
    expect(await left(page, 'photo')).toBe(reads - 1);
    expect(await left(page, 'flyer'), 'a read costs the flyer nothing').toBe(flyers);
    await expect(chosen(page), 'the picture is still the page’s, under the steps').toContainText('poster.png');
    await changePicture(page).click();
    await expect(readPicture(page)).toContainText(`${reads - 1} left today`);
    await expect(chosen(page)).toContainText('poster.png');
    await fromIdea(page).click();

    // From here it is the page as it was: Generate, that example's flyer, Open in editor.
    const made = page.waitForResponse(apiCall('POST', 'ai/flyer'));
    await generate(page).click();
    expect((await made).status()).toBe(200);
    await expect(preview(page)).toContainText(brief.text!.headline1!);
    await expect(currentStep(page), 'the picture’s flyer: the last step').toHaveText('Flyer');
    await expect(generate(page)).toContainText(`${flyers - 1} left today`);
    expect(await left(page, 'photo'), 'a flyer costs the reads nothing').toBe(reads - 1);
    // The picture is offered as the flyer's photo, and left unticked the flyer opens as an AI flyer always did.
    await expect(usePicture(page), 'offered, off by default').not.toBeChecked();
    await openInEditor(page).click();
    await expect(page).toHaveURL(/#\/new$/);
    await expect(page.getByLabel('Line 1')).toHaveValue(brief.text!.headline1!);
    await expect(photoMode(page, 'none')).toHaveClass('on');
    expect(uploads, 'unticked, nothing was uploaded').toEqual([]);
  });
});
