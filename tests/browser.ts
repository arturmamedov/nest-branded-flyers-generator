import { test as base, type BrowserContext } from '@playwright/test';

/* The app loads the library's shared top bar from nestpass.ai (index.html; the nestpass-tools
   repo). The browser specs run without it, so they only ever see the app's own fallback bar:
   - a pending external script would hold back `load`;
   - a problem on nestpass.ai must never fail this repo's suites.
   It is matched by path, not host, so a run against a deploy (CONTRACT_BASE_URL) blocks it too.
   tests/render/chrome.spec.ts covers the bar in both states. Specs import `test` and `expect`
   from here; a context a spec opens itself goes through `withoutKit`. One exception, on purpose:
   baseline.spec.ts shoots its overlays from a context with no route (a route intercepts every
   request, and the timing changed Chrome's raster), and checks the render page never asks for the kit. */

export const KIT_URL = 'https://nestpass.ai/kit/nest-nav.js';
const KIT = '**/kit/nest-nav.js';

export const withoutKit = (context: BrowserContext) => context.route(KIT, (route) => route.abort());

export const test = base.extend({
  context: async ({ context }, use) => {
    await withoutKit(context);
    await use(context);
  },
});

export { expect } from '@playwright/test';
