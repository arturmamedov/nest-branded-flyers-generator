import { defineConfig } from 'vitest/config';

/* The HTTP contract suite (tests/contract): one set of tests, every backend.
   CONTRACT_BASE_URL points it at a running deployment instead (e.g.
   http://localhost/nest-flyers-php/). */

const remote = process.env.CONTRACT_BASE_URL;
const shared = {
  include: ['tests/contract/**/*.test.ts'],
  environment: 'node' as const,
  testTimeout: 30_000,
  hookTimeout: 60_000,
};

export default defineConfig({
  test: {
    projects: remote
      ? [{ test: { ...shared, name: 'remote', provide: { baseUrl: remote }, fileParallelism: false } }]
      : [{ test: { ...shared, name: 'node', globalSetup: ['tests/contract/setup/node.ts'] } }],
  },
});
