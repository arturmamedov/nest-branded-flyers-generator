import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';
import { createAiService } from '../../../server/ai/composition.js';
import { createApp } from '../../../server/app.js';
import { createRepositories } from '../../../server/composition.js';
import { loadConfig, type StorageDriver } from '../../../server/config.js';
import { SEED_FILE, dataPaths } from '../../../server/paths.js';
import { applySeedFile } from '../../../server/storage/seed.js';
import { systemClock } from '../../../server/storage/types.js';

/** Which store each project drives, and whether it holds the fake AI provider. The project name is the only input —
    no environment variable — so a run always says which driver it proved, and `--project node-json` means exactly
    one thing. */
const PROJECTS: Record<string, { storage: StorageDriver; ai?: 'fake' }> = {
  node: { storage: 'sqlite' },
  'node-json': { storage: 'json' },
  'node-ai': { storage: 'sqlite', ai: 'fake' },
};

/** The Node backend in-process on a fresh temp data folder, without a renderer
    (so the client-export branch of the contract runs; test:render covers the server one). */
export default async function setup(project: TestProject) {
  const settings = PROJECTS[project.name];
  if (!settings) {
    throw new Error(`No storage driver for the contract project "${project.name}" (known: ${Object.keys(PROJECTS).join(', ')}).`);
  }
  const { storage } = settings;
  const dir = mkdtempSync(join(tmpdir(), `nest-flyers-contract-${storage}-`));
  const data = dataPaths(dir);
  const repos = createRepositories({ storage }, data, systemClock);
  await applySeedFile(repos, SEED_FILE);
  // The fake provider is wired the way the real ones are, through the same settings and composition.
  const ai = settings.ai ? createAiService(loadConfig({ AI_PROVIDER: settings.ai } as NodeJS.ProcessEnv).ai, { hostels: repos.hostels, usage: repos.aiUsage, clock: systemClock }) : undefined;
  const server = createServer(createApp({ repos, storage, uploadsDir: data.uploads, buildId: 'contract', ai }));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  project.provide('baseUrl', `http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
  if (settings.ai) project.provide('aiProvider', settings.ai);
  return async () => {
    await new Promise((done) => server.close(done));
    await repos.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
}
