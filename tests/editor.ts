import { join } from 'node:path';
import type { Locator, Page, Response as PwResponse } from '@playwright/test';
import { TEMPLATE_LABEL } from '../src/editor/templates';
import type { Template } from '../src/shared/schema';

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

/** Matches the editor's own API call by method, path and exact query, whatever folder the app is installed in. */
export const apiCall =
  (method: string, path: string, search = '') =>
  (res: PwResponse) => {
    if (res.request().method() !== method) return false;
    const url = new URL(res.url());
    return url.pathname.endsWith(`/api/${path}`) && url.search === search;
  };

/** The toolbar's "Saved" / "Unsaved changes". */
export const status = (page: Page) => page.locator('.toolbar .status');

/** The editor's one way back, "← Library" at the top of its form (it has no top bar). */
export const backToLibrary = (page: Page) => page.locator('.panel').getByRole('link', { name: 'Library', exact: true });

/** The editor's template toggle: "Activity" or "This week". */
export const templateButton = (page: Page, template: Template) =>
  page.getByRole('group', { name: 'Template' }).getByRole('button', { name: TEMPLATE_LABEL[template], exact: true });

/** One field of a week row, by its own name ("Row 2 cost"): exact, since the labels of five rows share their words. */
export const rowField = (page: Page, n: number, field: 'day' | 'event' | 'short name' | 'time' | 'cost') =>
  page.getByLabel(`Row ${n} ${field}`, { exact: true });

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
