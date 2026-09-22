import { defineConfig } from 'vitest/config';

/* The HTTP contract suite (tests/contract): one set of tests, every backend.
   - node:      the Node app in-process on a temp data folder, on SQLite.
   - node-json: the same app and the same tests on the JSON store, so the two
                Node drivers are held to one contract (setup/node.ts reads the
                driver off the project name).
   - php:       php -S on a temp stage (scripts/php/serve.ts), PHP_BIN from the
                environment or .env. One server process, so files run one at a time.
   - cross:     not the contract suite but the proof the JSON store is one
                format: Node writes a folder, PHP serves it (tests/cross).
   CONTRACT_BASE_URL points it at a running deployment instead (e.g.
   http://localhost/nest-flyers-php/). CONTRACT_DEPLOY_DIR, when set, is that
   deployment's folder on this machine, so security.test.ts can plant files
   in its uploads/. */

const remote = process.env.CONTRACT_BASE_URL;
const deployDir = process.env.CONTRACT_DEPLOY_DIR;
const shared = {
  include: ['tests/contract/**/*.test.ts'],
  environment: 'node' as const,
  testTimeout: 30_000,
  hookTimeout: 60_000,
};

export default defineConfig({
  test: {
    projects: remote
      ? [
          {
            test: {
              ...shared,
              name: 'remote',
              provide: { baseUrl: remote, ...(deployDir ? { stageDir: deployDir } : {}) },
              fileParallelism: false,
            },
          },
        ]
      : [
          { test: { ...shared, name: 'node', globalSetup: ['tests/contract/setup/node.ts'] } },
          { test: { ...shared, name: 'node-json', globalSetup: ['tests/contract/setup/node.ts'] } },
          { test: { ...shared, name: 'php', globalSetup: ['tests/contract/setup/php.ts'], fileParallelism: false } },
          {
            test: {
              ...shared,
              name: 'cross',
              include: ['tests/cross/**/*.test.ts'],
              // One setup builds a store with Node, stages PHP and serves it: photo processing, a composer-less
              // stage copy and a php -S boot all happen before the first assertion.
              hookTimeout: 300_000,
              testTimeout: 60_000,
              fileParallelism: false,
            },
          },
        ],
  },
});
