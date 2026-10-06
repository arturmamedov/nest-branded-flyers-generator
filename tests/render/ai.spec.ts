import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Dialog, Page } from '@playwright/test';
import sharp from 'sharp';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, apiCall, apiRoute, backToLibrary, dropFile, paste, saveNew, status, type FilePayload } from '../editor';
import { LEAVE_PROMPT } from '../../src/editor/leaveGuard';
import { AI_DAILY_LIMIT, AI_FEATURES, aiFor, aiQuotaVars, type AiFeature } from '../../src/shared/ai';
import { apiError } from '../../src/shared/errors';
import { DEFAULT_CANVAS } from '../../src/shared/layout';
import { AiFlyerResultSchema, AiShareResultSchema, ApiConfigSchema, type AiFlyerAnswer } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* The AI assistant in the browser (docs/prompts/ai-assistant.md, Phase 4). playwright.config.ts runs this file alone
   against a second server on the fake provider, with its own store and ledger. A day allows AI_DAILY_LIMIT
   generations of each feature (the owner's answer, 2026-10-06), and the file spends, on purpose: two of the flyer's (a
   Generate and a Try again) and one of the share text's (a Write with AI). Every failure comes from the fake's
   markers, which never count, and a limit reached is a routed answer. Counts are read from api/config, never assumed,
   so each test checks what it spent itself. */

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
const errorNote = (page: Page) => page.locator('.notes .note-error');
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
  await openInEditor(page).click();
  await expect(page).toHaveURL(/#\/new$/);
  expect(dialogs(), 'opening asks nothing').toEqual([]);
  // The editor's button counts the share text's own, which the two flyers above did not move.
  await expect(writeWithAi(page)).toContainText(`${shareLeft} left today`);
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
  const n = await left(page, 'flyer');
  await page.goto('/#/ai');
  await idea(page).fill(`${example.text}\n[[fake:invalid]]`);
  await generate(page).click();
  await expect(errorNote(page)).toHaveText(apiError('ai_failed').message);
  await expect(preview(page)).toHaveCount(0);
  await expect(generate(page)).toContainText(`${n} left today`);
  expect(await left(page, 'flyer')).toBe(n);
});

test('Write with AI fills the caption from the fields, asking before it replaces one', async ({ page }) => {
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
  await answerConfirm(page, 'accept', () => writeWithAi(page).click());
  const res = await answered;
  expect(res.status(), await res.text()).toBe(200);
  const request = res.request().postDataJSON() as { hostel: unknown; template: string; data: { text: { headline1: string } } };
  expect([request.hostel, request.template, request.data.text.headline1]).toEqual([null, 'activity', 'Stretching class']);
  expect(AiShareResultSchema.parse(await res.json()).remaining).toBe(n - 1);
  await expect(page.getByLabel('Caption')).toHaveValue(brief.share!);
  await expect(page.locator('.notes .note-ok')).toContainText('AI');
  await expect(writeWithAi(page)).toContainText(`${n - 1} left today`);
  expect(await left(page, 'flyer'), 'a share text costs the flyer nothing').toBe(flyerLeft);
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
  await expect(writeWithAi(page)).toContainText('1 left today');
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

/** A small picture, made here. Its width steers the fake (AI_FAKE.pictureWidths); 64 is no steer. */
async function picture(name: string, width = 64): Promise<FilePayload> {
  const buffer = await sharp({ create: { width, height: 8, channels: 3, background: '#0d6f82' } }).png().toBuffer();
  return { name, mimeType: 'image/png', buffer };
}

/** Every read a test's page sent, to say that nothing was. */
function readsSent(page: Page): string[] {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && apiRoute('ai/photo')(new URL(r.url()))) sent.push(r.url());
  });
  return sent;
}

test.describe('From a photo', () => {
  test('where the read runs the page has two ways in: From your idea is on, and From a photo shows the reads’ own count', async ({ page }) => {
    const n = await left(page, 'photo');
    await page.goto('/#/ai');
    await expect(fromIdea(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(fromPhoto(page)).toHaveAttribute('aria-pressed', 'false');
    await idea(page).fill('Yoga tomorrow at 9');

    await fromPhoto(page).click();
    await expect(fromPhoto(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(idea(page), 'the idea box is the other way’s').toHaveCount(0);
    await expect(generate(page)).toHaveCount(0);
    await expect(readPicture(page)).toContainText(`${n} left today`);
    await expect(readPicture(page), 'no picture yet').toBeDisabled();
    await expect(page.locator('.ai-used-up')).toHaveCount(0);

    await fromIdea(page).click();
    await expect(idea(page), 'what was typed is kept').toHaveValue('Yoga tomorrow at 9');
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
    await expect(readPicture(page)).toHaveCount(0);
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
    await dropFile(page, page.locator('.stage'), await picture('stray.png'));
    await expect(chosen(page)).toHaveCount(0);
    await expect(page).toHaveURL(/#\/ai$/);
    await expect(readPicture(page)).toBeDisabled();
  });
});
