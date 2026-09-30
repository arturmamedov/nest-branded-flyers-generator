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

/** The editor's template toggle: "Activity" or "This week". */
export const templateButton = (page: Page, template: Template) =>
  page.getByRole('group', { name: 'Template' }).getByRole('button', { name: TEMPLATE_LABEL[template], exact: true });

/** The editor's warning that copy is cut off, on the canvas on screen or on one fitted offscreen. */
export const cutOff = (page: Page) => page.locator('.note-warn', { hasText: 'is being cut off' });

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

/** Drops a file on the preview the way the OS does: a drop event carrying a DataTransfer with the file in it. */
export async function dropFile(page: Page, target: Locator, file: FilePayload) {
  const dataTransfer = await page.evaluateHandle(
    ({ name, mimeType, base64 }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], name, { type: mimeType }));
      return dt;
    },
    { name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64') },
  );
  await target.dispatchEvent('dragover', { dataTransfer });
  await target.dispatchEvent('drop', { dataTransfer });
}
