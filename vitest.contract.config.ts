import { defineConfig } from 'vitest/config';
import { contractTarget, describeTarget } from './scripts/env.js';

/* The HTTP contract suite (tests/contract): one set of tests, every backend.
   - node:       the Node app in-process on a temp data folder, on SQLite.
   - node-json:  the same app and the same tests on the JSON store, so the two
                 Node drivers are held to one contract (setup/node.ts reads the
                 driver off the project name).
   - php:        php -S on a temp stage (scripts/php/serve.ts), PHP_BIN from the
                 environment or .env. One server process, so files run one at a time.
   - php-basic:  the same stage behind a staff login (setup/php.ts reads the access
                 rule off the project name), so the client proves it signs every
                 request in, the way it must against a locked deployment.
   - php-access: the lock itself, over HTTP: who is refused, with what (tests/access).
   - cross:      not the contract suite but the proof the JSON store is one
                 format: Node writes a folder, PHP serves it (tests/cross).
   CONTRACT_BASE_URL (environment or .env, scripts/env.ts) points it at a running
   deployment instead, e.g. http://localhost/nest-flyers-php/.
   CONTRACT_BASIC_USER/_PASSWORD sign in to a locked one. CONTRACT_DEPLOY_DIR, when
   set, is that deployment's folder on this machine, so security.test.ts can plant
   files in its uploads/. */

const target = contractTarget();
if (target) console.log(describeTarget(target));

const shared = {
  include: ['tests/contract/**/*.test.ts'],
  environment: 'node' as const,
  testTimeout: 30_000,
  hookTimeout: 60_000,
};

/** The php project's files that read or write through the client: enough to prove the login rides on every kind of request. */
const SIGNED_IN_FILES = ['config', 'errors', 'security', 'photos'].map((name) => `tests/contract/${name}.test.ts`);

export default defineConfig({
  test: {
    projects: target
      ? [
          {
            test: {
              ...shared,
              name: 'remote',
              provide: {
                baseUrl: target.baseUrl,
                remote: true,
                ...(target.deployDir ? { stageDir: target.deployDir } : {}),
                ...(target.basicAuth ? { basicAuth: target.basicAuth } : {}),
              },
              fileParallelism: false,
            },
          },
        ]
      : [
          { test: { ...shared, name: 'node', globalSetup: ['tests/contract/setup/node.ts'] } },
          { test: { ...shared, name: 'node-json', globalSetup: ['tests/contract/setup/node.ts'] } },
          { test: { ...shared, name: 'php', globalSetup: ['tests/contract/setup/php.ts'], fileParallelism: false } },
          {
            test: { ...shared, name: 'php-basic', include: SIGNED_IN_FILES, globalSetup: ['tests/contract/setup/php.ts'], fileParallelism: false },
          },
          {
            test: {
              ...shared,
              name: 'php-access',
              include: ['tests/access/**/*.test.ts'],
              // Each file serves its own stage and switches its access rule between blocks.
              hookTimeout: 120_000,
              fileParallelism: false,
            },
          },
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
