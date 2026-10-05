import type { TestProject } from 'vitest/node';
import { startStage, writeTestConfig, type AccessPosture, type AiPosture } from '../../../scripts/php/serve.js';
import { TEST_LOGIN } from './credentials.js';

/** The access rule each project runs the suite behind, and whether it holds the fake AI provider. The project name is
    the only input, as in setup/node.ts:
    - php:       loopback through allowIps, the way the suite has always run.
    - php-basic: a staff login and nothing else, so every request the client sends must carry it.
    - php-ai:    loopback, with the fake provider in config.php's `ai` block: the AI routes generate. */
const PROJECTS: Record<string, { access: AccessPosture; ai?: AiPosture }> = {
  php: { access: { kind: 'loopback-ips' } },
  'php-basic': { access: { kind: 'basic', user: TEST_LOGIN.user, passwordHash: TEST_LOGIN.passwordHash } },
  'php-ai': { access: { kind: 'loopback-ips' }, ai: 'fake' },
};

/** The PHP backend under `php -S`: a fresh stage (exactly what a release ships, minus the app shell) in the temp dir,
    never in the repo, which Laragon's Apache serves. The store sits outside the stage, as it would outside
    public_html. stageDir is provided so security.test.ts can plant files in uploads/. */
export default async function setup(project: TestProject) {
  const settings = PROJECTS[project.name];
  if (!settings) {
    throw new Error(`No access rule for the contract project "${project.name}" (known: ${Object.keys(PROJECTS).join(', ')}).`);
  }
  const { access, ai } = settings;
  // Ready means GET api/config answered on loopback, so the store is already seeded before the lock goes on.
  const { stage, dataDir, server } = await startStage({ prefix: `nest-flyers-${project.name}-contract-` });
  try {
    writeTestConfig(stage, dataDir, access, ai);
    project.provide('baseUrl', server.baseUrl);
    project.provide('stageDir', stage);
    if (access.kind === 'basic') project.provide('basicAuth', { user: TEST_LOGIN.user, password: TEST_LOGIN.password });
    if (ai) {
      project.provide('aiProvider', ai);
      project.provide('dataDir', dataDir);
    }
  } catch (e) {
    await server.stop();
    throw e;
  }
  return () => server.stop();
}
