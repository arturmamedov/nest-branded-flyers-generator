import { defineConfig } from 'vitest/config';

/* The HTTP contract suite (tests/contract): one set of tests, every backend.
   - node: the Node app in-process on a temp data folder.
   - php:  php -S on a temp stage (scripts/php/serve.ts), PHP_BIN from the
           environment or .env. One server process, so files run one at a time.
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
          { test: { ...shared, name: 'php', globalSetup: ['tests/contract/setup/php.ts'], fileParallelism: false } },
        ],
  },
});
