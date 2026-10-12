import { join } from 'node:path';
import type { APIRequestContext, Browser, Download, Locator, Page, Response as PwResponse } from '@playwright/test';
import { expect, withoutKit } from './browser';
import { EXPORT_ACTION, type ExportAction } from '../src/editor/exportActions';
import { PHOTO_MODE_LABEL } from '../src/editor/photoModes';
import { TEMPLATE_LABEL } from '../src/editor/templates';
import { CANVASES, CANVAS_IDS, type CanvasId } from '../src/shared/layout';
import { FlyerPayloadSchema, FlyerSavedSchema, type FlyerListItem, type FlyerSaved, type Template } from '../src/shared/schema';
import { WRITE_HEADERS } from '../src/shared/writeGuard';

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

/** The editor with only the in-browser exporter: Node has both, PHP only this one. Any request to the server
    renderer is aborted, so a wrong exporter fails loudly. Its own context, outside the fixture (tests/browser.ts),
    for the caller to close; `overridden()` says the editor did read the changed config. */
export async function clientOnlyEditor(browser: Browser, baseURL: string | undefined, dpr = 1) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
  await withoutKit(context);
  const page = await context.newPage();
  let configs = 0;
  await page.route('**/api/config', async (route) => {
    configs++;
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), exporters: ['client'] } });
  });
  await page.route('**/api/render/**', (route) => route.abort());
  return { context, page, overridden: () => configs > 0 };
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

/** A saved copy of a seeded sample flyer, with its data and its photo, made through the API. A spec that saves works
    on the copy, so the specs after it find the library as seeded. The caller archives it. */
export async function copyOfSample(request: APIRequestContext, sample: string, title: string): Promise<number> {
  const list = (await (await request.get('api/flyers')).json()) as FlyerListItem[];
  const found = list.find((f) => f.title === sample);
  if (!found) throw new Error(`No seeded flyer is called “${sample}”.`);
  const { flyer } = FlyerPayloadSchema.parse(await (await request.get(`api/flyers/${found.id}`)).json());
  const res = await request.post('api/flyers', {
    headers: WRITE_HEADERS,
    data: { title: `${title} ${Date.now()}`, hostel: flyer.hostel, template: flyer.template, data: flyer.data, photoId: flyer.photoId },
  });
  return FlyerSavedSchema.parse(await res.json()).id;
}

/** The page's clock stands still from here: a toast's own time passes only when the test says so
    (`page.clock.fastForward`), however slow the machine is. */
export async function stopClock(page: Page) {
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000);
}

/** The toolbar's "Copy image": the first button beside Download where the browser can copy a picture. By its name,
    so it is not found while it reads "Copying…". */
export const copyImage = (page: Page) => page.locator('.toolbar').getByRole('button', { name: EXPORT_ACTION.copy.label, exact: true });

/** The clipboard for a spec that reads it back. The test browser refuses every write until its context is granted
    it (the spike of the editor's UX round, Part 3); a staff member's browser asks for none. */
export const grantClipboard = (page: Page) => page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

/** The picture on the clipboard, as the page itself reads it back: a PNG. */
export async function clipboardPng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const bytes = new Uint8Array(await (await item.getType('image/png')).arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

/** The text on the clipboard. On Windows it holds the platform's line breaks (CRLF), which is what a paste expects. */
export const clipboardText = async (page: Page) => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');

/** The toolbar's "Download" button, which opens the list of ways to take the flyer out as a picture. By its place,
    not its words: it reads "Rendering…" while a download is being made. */
export const downloadMenu = (page: Page) => page.locator('.toolbar .menu > button');

/** An entry of that list, by its action's name, whatever hint the entry adds after it ("PNG · sharpest"). The list
    is hidden until the button opens it. */
export const exportEntry = (page: Page, action: ExportAction) =>
  page.locator('.toolbar .menu').getByRole('menuitem', { name: new RegExp(`^${EXPORT_ACTION[action].label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( · |$)`) });

/** The flyer's own actions at the bar's right end, in the order the bar shows them: Save, the first way out, and
    Download. */
export const barActions = (page: Page) => page.locator('.toolbar-actions > button, .toolbar-actions > .menu > button');

/** A new flyer with nothing missing (no photo band, so it can be taken out as it is), with a name and a caption
    where the test gives them. It is not saved: its first save is the caller's action. */
export async function newFlyerNoPhoto(page: Page, { title = '', caption = '' }: { title?: string; caption?: string } = {}) {
  await page.goto('./#/new');
  await page.getByRole('button', { name: PHOTO_MODE_LABEL.none, exact: true }).click();
  if (title) await page.getByLabel('Library name').fill(title);
  if (caption) await page.getByLabel('Caption').fill(caption);
  await expect(downloadMenu(page)).toBeEnabled();
}

/** Opens the list if it is closed and picks an entry, without waiting for what the entry does. */
export async function pickExport(page: Page, action: ExportAction) {
  const menu = downloadMenu(page);
  await expect(menu).toBeEnabled();
  if ((await menu.getAttribute('aria-expanded')) !== 'true') await menu.click();
  await exportEntry(page, action).click();
}

/** Downloads the flyer as a staff member does: Download, then the format. It returns once the file has arrived and
    the editor is idle again. */
export async function download(page: Page, format: 'png' | 'jpg'): Promise<Download> {
  const [file] = await Promise.all([page.waitForEvent('download'), pickExport(page, format)]);
  await file.path();
  await expect(downloadMenu(page)).toBeEnabled();
  return file;
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

/** A page the browser gives no clipboard: what a phone gets over plain http on a LAN address (the spike of the
    editor's UX round, Part 3: `navigator.clipboard` and `ClipboardItem` are both undefined there). Before the page
    loads. */
export const noClipboard = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'clipboard', { get: () => undefined, configurable: true });
    delete (window as { ClipboardItem?: unknown }).ClipboardItem;
  });

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
