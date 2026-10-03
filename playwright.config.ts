import { defineConfig } from '@playwright/test';

/* Render checks run against the production build (npm run test:render builds
   first) on a throwaway DATA_DIR seeded with the design's sample flyers.
   Two servers, one per project:
   - render: every spec but ai.spec.ts, with the AI switched off whatever .env
     holds (the environment wins over .env), so the suite proves the app as it
     is without a key, and a key in .env never reaches a test;
   - ai: ai.spec.ts against a second server on the fake provider, with its own
     store and its own ledger, so its day's generations are its own. */
const PORT = 8799;
const DATA_DIR = './test-results/render-data';
const AI_PORT = 8798;
const AI_DATA_DIR = './test-results/render-ai-data';

const server = { NODE_ENV: 'production', HOST: '127.0.0.1' };

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
  projects: [
    { name: 'render', testIgnore: /ai\.spec\.ts$/ },
    { name: 'ai', testMatch: /ai\.spec\.ts$/, use: { baseURL: `http://127.0.0.1:${AI_PORT}` } },
  ],
  webServer: [
    {
      command:
        'node dist-server/server/cli/seed.js && node dist-server/server/cli/seedSamples.js && node dist-server/server/index.js',
      url: `http://127.0.0.1:${PORT}/api/hostels`,
      env: { ...server, PORT: String(PORT), DATA_DIR, AI_ENABLED: 'false' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node dist-server/server/cli/seed.js && node dist-server/server/index.js',
      url: `http://127.0.0.1:${AI_PORT}/api/hostels`,
      env: { ...server, PORT: String(AI_PORT), DATA_DIR: AI_DATA_DIR, AI_PROVIDER: 'fake', AI_ENABLED: '1' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
