import { defineConfig } from '@playwright/test';
import { AI_DAILY_LIMIT, AI_FEATURES } from './src/shared/ai.js';
import { FIRST_LOOK } from './src/shared/looks.js';
import { PROOF_LOOK_ID } from './tests/proof/id.js';

/* Render checks run against the production build (npm run test:render builds
   first) on a throwaway DATA_DIR seeded with the design's sample flyers.
   Three servers, one per project:
   - render: every spec but ai.spec.ts, with the AI switched off whatever .env
     holds (the environment wins over .env), so the suite proves the app as it
     is without a key, and a key in .env never reaches a test;
   - ai: ai.spec.ts against a second server on the fake provider with every
     feature named (a provider alone runs nothing), with its own store and its
     own ledger, so its day's generations are its own;
   - looks: the looks specs (looks*.spec.ts) against the tests' own build, with the proof look in it
     (tests/proof/server.ts serving dist-proof/, npm run build:proof), on a site that names both looks and on its own
     store: a flyer in the proof look never reaches a library the release reads. The other two projects run the
     release's build, which has one look. */
const PORT = 8799;
const DATA_DIR = './test-results/render-data';
const AI_PORT = 8798;
const AI_DATA_DIR = './test-results/render-ai-data';
const LOOKS_PORT = 8796;
const LOOKS_DATA_DIR = './test-results/render-looks-data';
/** The looks specs: looks.spec.ts and any looks-….spec.ts. */
const LOOKS_SPECS = /looks[^/\\]*\.spec\.ts$/;

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
    { name: 'render', testIgnore: [/ai\.spec\.ts$/, LOOKS_SPECS] },
    { name: 'ai', testMatch: /ai\.spec\.ts$/, use: { baseURL: `http://127.0.0.1:${AI_PORT}` } },
    { name: 'looks', testMatch: LOOKS_SPECS, use: { baseURL: `http://127.0.0.1:${LOOKS_PORT}` } },
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
      // Every setting ai.spec.ts counts on is pinned here: the environment wins over .env, whose own caps are the
      // owner's. Each feature's limit is named as well as the site's: a pair in .env would otherwise still count.
      env: {
        ...server,
        PORT: String(AI_PORT),
        DATA_DIR: AI_DATA_DIR,
        AI_PROVIDER: 'fake',
        AI_ENABLED: '1',
        AI_FEATURES: AI_FEATURES.join(','),
        AI_DAILY_LIMIT: String(AI_DAILY_LIMIT),
        AI_DAILY_LIMITS: AI_FEATURES.map((feature) => `${feature}:${AI_DAILY_LIMIT}`).join(','),
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // It seeds its own library first: the release's seed scripts refuse a LOOKS that names the proof look.
      command: 'npx tsx tests/proof/server.ts',
      url: `http://127.0.0.1:${LOOKS_PORT}/api/hostels`,
      env: { ...server, PORT: String(LOOKS_PORT), DATA_DIR: LOOKS_DATA_DIR, AI_ENABLED: 'false', LOOKS: [FIRST_LOOK, PROOF_LOOK_ID].join(',') },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
