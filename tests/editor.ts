import { join } from 'node:path';
import type { Locator, Page, Response as PwResponse } from '@playwright/test';
import { expect } from './browser';
import { TEMPLATE_LABEL } from '../src/editor/templates';
import { CANVASES, CANVAS_IDS, type CanvasId } from '../src/shared/layout';
import { FlyerSavedSchema, type FlyerSaved, type Template } from '../src/shared/schema';

/* Driving the editor in a browser spec: the Node render suite (tests/render/editor.spec.ts)
   and the PHP smoke test (tests/php-smoke) use the same helpers. Paths stay relative to the
   app root, so a subfolder deploy works. */

/** A desktop window where the editor's form overflows its panel, like a staff laptop. */
export const EDITOR_VIEWPORT = { width: 1440, height: 900 };

export const POOL_PARTY = join(import.meta.dirname, '../fixtures/photos/flyer-pool-party.png');

export interface FilePayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** A URL of the editor's API, by path and exact query, whatever folder the app is installed in: a page.route predicate.
    (A string glob matches the whole URL, query included, so a glob for the list never sees '?template=activity'.) */
export const apiRoute = (path: string, search = '') => (url: URL) => url.pathname.endsWith(`/api/${path}`) && url.search === search;

/** Matches the editor's own API call by method, path and exact query. */
export const apiCall =
  (method: string, path: string, search = '') =>
  (res: PwResponse) =>
    res.request().method() === method && apiRoute(path, search)(new URL(res.url()));

/** Holds a request the route predicate matches until the returned release() is called. */
export async function hold(page: Page, url: (url: URL) => boolean, method = 'GET'): Promise<() => void> {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(url, async (route) => {
    if (route.request().method() === method) await held;
    await route.continue();
  });
  return release;
}

/** The fitted font sizes of one flyer, in document order: run in the page (page.evaluate(fitted, selector)). */
export const fitted = (selector: string) =>
  [...document.querySelectorAll<HTMLElement>(`${selector} [data-fit]`)].map((el) => el.style.fontSize);

/** What the render page (the export) fits for a flyer on a canvas. Node's render suite only: the PHP backend has no
    render page. */
export async function exportFit(page: Page, id: number, canvas: CanvasId): Promise<string[]> {
  const other = await page.context().newPage();
  await other.setViewportSize({ width: CANVASES[canvas].width, height: CANVASES[canvas].height });
  await other.goto(`/render.html?id=${id}&canvas=${canvas}`);
  await other.waitForFunction(() => (window as unknown as { __FLYER_READY?: boolean }).__FLYER_READY);
  const sizes = await other.evaluate(fitted, '[data-flyer]');
  await other.close();
  return sizes;
}

/** The toolbar's "Saved" / "Unsaved changes". */
export const status = (page: Page) => page.locator('.toolbar .status');

/** A new flyer's first save. The id goes to `keep` as soon as it is known, so clean-up has it even when a wait below
    fails. It returns once the page has taken the answer: its URL reopens the flyer (Editor.tsx replaces #/new) and
    nothing is unsaved, so the leave guard is off. The network's answer alone can come earlier, and a reload in that
    gap would reopen #/new. */
export async function saveNew(page: Page, keep: (id: number) => void): Promise<FlyerSaved> {
  const [res] = await Promise.all([page.waitForResponse(apiCall('POST', 'flyers')), page.getByRole('button', { name: 'Save', exact: true }).click()]);
  expect(res.status(), await res.text()).toBe(201);
  const saved = FlyerSavedSchema.parse(await res.json());
  keep(saved.id);
  await expect(page).toHaveURL(new RegExp(`#/flyers/${saved.id}$`));
  await expect(status(page)).toHaveText('Saved');
  return saved;
}

/** The editor's one way back, "← Library" at the top of its form (it has no top bar). */
export const backToLibrary = (page: Page) => page.locator('.panel').getByRole('link', { name: 'Library', exact: true });

/** The button at the head of the editor's form that folds the whole form away and opens it again: "Hide the form" or
    "Show the form". One button in both states, on the desktop's rail and in the phone's head bar. */
export const panelFold = (page: Page) => page.locator('.panel-head').getByRole('button', { name: /^(Hide|Show) the form$/ });

/** A section's header in the editor's form, by the section's title: a button, pressed to open and close it. */
export const sectionHead = (page: Page, title: string) =>
  page.locator('.panel .section-head').filter({ has: page.locator('.section-title', { hasText: exactly(title) }) });

/** Opens the named sections of the editor's form, each if it is closed. A saved flyer opens with most of them closed
    (src/editor/sectionFolds.ts), and a field in a closed section can be neither seen nor filled. */
export async function openSection(page: Page, ...titles: string[]) {
  for (const title of titles) {
    const head = sectionHead(page, title);
    if ((await head.getAttribute('aria-expanded')) === 'false') await head.click();
    await expect(head).toHaveAttribute('aria-expanded', 'true');
  }
}

/** The editor's template toggle: "Activity" or "This week". */
export const templateButton = (page: Page, template: Template) =>
  page.getByRole('group', { name: 'Template' }).getByRole('button', { name: TEMPLATE_LABEL[template], exact: true });

/** The toolbar's button for a canvas ("Story 9:16", "WhatsApp 3:4"): pressed while that canvas is on screen. A test
    about one canvas clicks its button; only a test about the default relies on what a fresh editor shows. */
export const canvasButton = (page: Page, canvas: CanvasId) =>
  page.getByRole('group', { name: 'Canvas' }).getByRole('button', { name: CANVASES[canvas].label, exact: true });

/** What a focus page says about the flyer on its stage (src/editor/Toasts.tsx), by kind: an action's outcome ('ok',
    'error') or an open warning. Its words alone, without its close button. A warning folded into the chip is not one
    of these: see warningsChip. */
export const toast = (page: Page, kind: 'ok' | 'error' | 'warn') => page.locator(`.toasts .toast-${kind} .toast-body`);

/** A toast's close button, from its words (a locator toast() gave). */
export const closeToast = (words: Locator) => words.locator('xpath=..').getByRole('button', { name: /^Close this/ });

/** The "⚠ n" chip the closed warnings fold into; a click opens them again. */
export const warningsChip = (page: Page) => page.locator('.toasts .toast-chip');

/** The editor's warning that copy is cut off, on the canvas on screen or on one fitted offscreen. */
export const cutOff = (page: Page) => toast(page, 'warn').filter({ hasText: 'is being cut off' });

/** The end of that warning naming exactly these canvases: the tail makes a one-canvas match exact. */
export const cutOffOn = (...canvases: CanvasId[]) =>
  `cut off on ${CANVAS_IDS.filter((c) => canvases.includes(c))
    .map((c) => CANVASES[c].label)
    .join(' and ')} — shorten it.`;

/** One field of a week row, by its own name ("Row 2 cost"): exact, since the labels of five rows share their words. */
export const rowField = (page: Page, n: number, field: 'day' | 'event' | 'short name' | 'time' | 'cost') =>
  page.getByLabel(`Row ${n} ${field}`, { exact: true });

const exactly = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

/** A library card by its exact title, so "smoke 1" never matches "smoke 1 (copy)". */
export const libraryCard = (page: Page, title: string) =>
  page.locator('li.card').filter({ has: page.locator('.card-title', { hasText: exactly(title) }) });

/** Sets one of the library's filters and waits until the list for exactly that query is on screen. The library's
    selects are named by their <label>, with no aria-label, so the name is matched loosely. */
export async function filterLibrary(page: Page, filter: 'Hostel' | 'Template', option: { value: string } | { label: string }, search: string) {
  const [res] = await Promise.all([page.waitForResponse(apiCall('GET', 'flyers', search)), page.getByLabel(filter).selectOption(option)]);
  expect(res.status(), `GET api/flyers${search}`).toBe(200);
  await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);
}

/** A DataTransfer in the page with the file in it: what a drop or a paste carries. */
const transferOf = (page: Page, file: FilePayload) =>
  page.evaluateHandle(
    ({ name, mimeType, base64 }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], name, { type: mimeType }));
      return dt;
    },
    { name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64') },
  );

/** Drops a file on the preview the way the OS does: a drop event carrying a DataTransfer with the file in it. */
export async function dropFile(page: Page, target: Locator, file: FilePayload) {
  const dataTransfer = await transferOf(page, file);
  await target.dispatchEvent('dragover', { dataTransfer });
  await target.dispatchEvent('drop', { dataTransfer });
}

/** Pastes into the page the way Ctrl+V does: a paste event on what has the focus, carrying a file (a screenshot off
    the clipboard) or plain text. */
export async function paste(page: Page, what: FilePayload | string) {
  const clipboardData =
    typeof what === 'string'
      ? await page.evaluateHandle((text) => {
          const dt = new DataTransfer();
          dt.setData('text/plain', text);
          return dt;
        }, what)
      : await transferOf(page, what);
  await page.evaluate((dt) => (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })), clipboardData);
}
