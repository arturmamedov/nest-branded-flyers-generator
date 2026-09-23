import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';
import { startPhpServer, writeTestConfig, type PhpServer } from '../../../scripts/php/serve.js';
import { stagePhp } from '../../../scripts/php/stage.js';

/** The PHP backend under `php -S`: a fresh stage (exactly what a release ships, minus the app shell) in the temp dir,
    never in the repo, which Laragon's Apache serves. The store sits outside the stage, as it would outside
    public_html. stageDir is provided so security.test.ts can plant files in uploads/. */
export default async function setup(project: TestProject) {
  const root = mkdtempSync(join(tmpdir(), 'nest-flyers-php-contract-'));
  let server: PhpServer | undefined;
  try {
    const stage = stagePhp(join(root, 'stage'), { dist: false, vendor: 'shim' });
    writeTestConfig(stage, join(root, 'data'));
    server = await startPhpServer({ stage, tempRoot: root });
    // The first request seeds the store; take that hit here rather than inside a test's timeout.
    const warm = await fetch(server.baseUrl + 'api/config');
    if (!warm.ok) throw new Error(`GET api/config answered ${warm.status}: ${(await warm.text()).slice(0, 300)}`);
    project.provide('baseUrl', server.baseUrl);
    project.provide('stageDir', stage);
  } catch (e) {
    if (server) await server.stop();
    else rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    throw e;
  }
  const running = server;
  return () => running.stop();
}
