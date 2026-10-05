import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Dialog, Page } from '@playwright/test';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, apiCall, apiRoute, backToLibrary, saveNew, status } from '../editor';
import { LEAVE_PROMPT } from '../../src/editor/leaveGuard';
import { AI_DAILY_LIMIT, AI_FEATURES, type AiFeature } from '../../src/shared/ai';
import { apiError } from '../../src/shared/errors';
import { AiFlyerResultSchema, AiShareResultSchema, ApiConfigSchema, type AiFlyerAnswer } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* The AI assistant in the browser (docs/prompts/ai-assistant.md, Phase 4). playwright.config.ts runs this file alone
   against a second server on the fake provider, with its own store and ledger. A day allows AI_DAILY_LIMIT
   generations, so the file spends exactly that many, on purpose: a Generate and a Try again, then a Write with AI.
   Every failure comes from the fake's markers, which never count, and the cap is a routed answer. Counts are read from
   api/config, never assumed, so each test checks what it spent itself. */

test.use({ viewport: EDITOR_VIEWPORT });

const bundle = JSON.parse(readFileSync(join(import.meta.dirname, '../../schema/ai.json'), 'utf8')) as { examples: { text: string; answer: AiFlyerAnswer }[] };
const example = bundle.examples[0];
const brief = example.answer.brief;

/** Flyers a test saved, archived afterwards. */
const saved: number[] = [];
const keep = (id: number) => saved.push(id);
test.afterEach(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

/** What is left today, as the server says. */
async function left(page: Page): Promise<number> {
  const { ai } = ApiConfigSchema.parse(await (await page.request.get('/api/config')).json());
  if (!ai.enabled) throw new Error('This file runs against the server with the fake provider (playwright.config.ts, project ai).');
  return ai.remaining;
}

const entry = (page: Page) => page.locator('nest-nav').getByRole('link', { name: /^Create with AI/ });
/** Loose: a textarea inside its label takes its own text into its name. */
const idea = (page: Page) => page.getByLabel('Your idea');
const generate = (page: Page) => page.getByRole('button', { name: /^✨ Generate/ });
const tryAgain = (page: Page) => page.getByRole('button', { name: /^Try again/ });
const openInEditor = (page: Page) => page.getByRole('button', { name: 'Open in editor', exact: true });
const writeWithAi = (page: Page) => page.getByRole('button', { name: /^✨ Write with AI/ });
const errorNote = (page: Page) => page.locator('.notes .note-error');
const preview = (page: Page) => page.locator('.stage-canvas');

/** api/config as the server answers it, but with `remaining` left today: for a test that must not depend on what the
    tests before it spent (the fake's failures still reach the server, and never count). `features` are the ones the
    site runs: every one, unless the test is about a site that names fewer. */
async function withLeft(page: Page, remaining: number, features: readonly AiFeature[] = AI_FEATURES) {
  await page.route(apiRoute('config'), async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), ai: { enabled: true, limit: AI_DAILY_LIMIT, remaining, features } } });
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
  const n = await left(page);
  await page.goto('/');
  await expect(entry(page)).toBeVisible();
  await expect(entry(page)).toHaveAccessibleName(`Create with AI, ${n} left today`);
  await expect(entry(page)).toContainText(`${n} left`);
  await entry(page).click();

  await expect(page).toHaveURL(/#\/ai$/);
  await expect(page.locator('nest-nav'), 'a focus page, like the editor').toHaveCount(0);
  await expect(backToLibrary(page)).toBeVisible();
  await expect(idea(page)).toBeEmpty();
  expect(await idea(page).getAttribute('placeholder'), 'a real staff text, shortened').toContain('🕖');
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
  const n = await left(page);
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

  // The flyer, through the same <Flyer> the editor and the export use.
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
  expect(await left(page)).toBe(n - 2);

  // Open in editor: a new, unsaved flyer, marked as the AI's until it is saved; nothing was asked on the way.
  const dialogs = noDialogs(page);
  await openInEditor(page).click();
  await expect(page).toHaveURL(/#\/new$/);
  expect(dialogs(), 'opening asks nothing').toEqual([]);
  await expect(page.getByLabel('Line 1')).toHaveValue(brief.text!.headline1!);
  await expect(page.getByLabel('Hostel', { exact: true })).toHaveValue('adeje-nest');
  await expect(page.getByLabel('Caption')).toHaveValue(brief.share!);
  const draftNote = page.locator('.note-warn', { hasText: 'AI draft: check every fact before you print' });
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
  const n = await left(page);
  await page.goto('/#/ai');
  await idea(page).fill(`${example.text}\n[[fake:invalid]]`);
  await generate(page).click();
  await expect(errorNote(page)).toHaveText(apiError('ai_failed').message);
  await expect(preview(page)).toHaveCount(0);
  await expect(generate(page)).toContainText(`${n} left today`);
  expect(await left(page)).toBe(n);
});

test('Write with AI fills the caption from the fields, asking before it replaces one', async ({ page }) => {
  const n = await left(page);
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
  await answerConfirm(page, 'accept', () => writeWithAi(page).click());
  const res = await answered;
  expect(res.status(), await res.text()).toBe(200);
  const request = res.request().postDataJSON() as { hostel: unknown; template: string; data: { text: { headline1: string } } };
  expect([request.hostel, request.template, request.data.text.headline1]).toEqual([null, 'activity', 'Stretching class']);
  expect(AiShareResultSchema.parse(await res.json()).remaining).toBe(n - 1);
  await expect(page.getByLabel('Caption')).toHaveValue(brief.share!);
  await expect(page.locator('.notes .note-ok')).toContainText('AI');
  await expect(writeWithAi(page)).toContainText(`${n - 1} left today`);
});

test('the cap: once the day is used up, the page says when it comes back and that none are left', async ({ page }) => {
  // Routed both ways, so it holds whatever this file has spent: one left on load, then the server's cap.
  await withLeft(page, 1);
  const quota = apiError('ai_quota', { limit: AI_DAILY_LIMIT });
  await page.route(apiRoute('ai/flyer'), (route) => route.fulfill({ status: quota.status, json: { error: { code: quota.code, message: quota.message } } }));
  await page.goto('/#/ai');
  await idea(page).fill('Yoga tomorrow at 9');
  await generate(page).click();
  await expect(errorNote(page)).toHaveText(quota.message);
  await expect(generate(page)).toContainText('0 left today');
  await expect(generate(page)).toBeDisabled();
  await backToLibrary(page).click();
  await expect(entry(page)).toContainText('0 left');
});

test('with none left the page says so, and when they come back, before anyone presses anything', async ({ page }) => {
  // Seen with a real provider (2026-10-05): a day used up left a greyed Generate and not a word about midnight.
  const usedUp = apiError('ai_quota', { limit: AI_DAILY_LIMIT }).message;
  await withLeft(page, 0);
  await page.goto('/#/ai');
  await expect(generate(page)).toBeDisabled();
  await expect(page.locator('.ai-used-up')).toHaveText(usedUp);
  await page.goto('/#/new');
  await expect(writeWithAi(page)).toBeDisabled();
  await expect(page.locator('.ai-used-up')).toHaveText(usedUp);
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

// A site names the features it runs (AI_FEATURES in .env, 'features' in config.php): the trial on the live site is the
// share text alone. Routed, so nothing is spent.
test('on a site that runs the share text alone: no "Create with AI" anywhere, #/ai is the library, and "Write with AI" counts down', async ({ page }) => {
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
