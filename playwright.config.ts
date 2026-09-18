import { defineConfig } from '@playwright/test';

/* Render checks run against the production build (npm run test:render builds
   first) on a throwaway DATA_DIR seeded with the design's sample flyers. */
const PORT = 8799;
const DATA_DIR = './test-results/render-data';

export default defineConfig({
  testDir: './tests/render',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command:
      'node dist-server/server/cli/seed.js && node dist-server/server/cli/seedSamples.js && node dist-server/server/index.js',
    url: `http://127.0.0.1:${PORT}/api/hostels`,
    env: { PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR, NODE_ENV: 'production' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
