import { defineConfig } from '@playwright/test';
import { contractTarget, describeTarget } from './scripts/env.js';

/* The PHP smoke test (npm run test:php-smoke): the real editor from the Vite
   build, driving the PHP backend. Locally, scripts/php/serve.ts stages php/web
   with dist/ and runs `php -S` on a fixed port with shared-hosting upload limits.
   CONTRACT_BASE_URL (environment or .env, scripts/env.ts) points the same spec
   at a deploy instead (Laragon's Apache, a subfolder on a host), and then no
   server is started; CONTRACT_BASIC_USER/_PASSWORD sign the browser in to a
   locked one. The spec only uses relative URLs, so the base ends in '/' to keep
   a subfolder in the path. */

const PORT = 8797;
const remote = contractTarget();
if (remote) console.log(describeTarget(remote));
const baseURL = remote ? remote.baseUrl : `http://127.0.0.1:${PORT}/`;

export default defineConfig({
  testDir: './tests/php-smoke',
  // Not test-results/: Playwright empties outputDir before starting the webServer, and that folder holds the render data.
  outputDir: 'test-results-php',
  timeout: 180_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    ...(remote?.basicAuth ? { httpCredentials: { username: remote.basicAuth.user, password: remote.basicAuth.password } } : {}),
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    // A failed smoke run is hard to read from the list alone; the trace shows each step's page.
    trace: 'retain-on-failure',
  },
  webServer: remote
    ? undefined
    : {
        command: `npx tsx scripts/php/serve.ts --dist --port ${PORT}`,
        url: `http://127.0.0.1:${PORT}/api/config`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
