import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';
import { createApp } from '../../../server/app.js';
import { createRepositories } from '../../../server/composition.js';
import type { StorageDriver } from '../../../server/config.js';
import { SEED_FILE, dataPaths } from '../../../server/paths.js';
import { applySeedFile } from '../../../server/storage/seed.js';

/** Which store each project drives. The project name is the only input — no environment variable — so a run
    always says which driver it proved, and `--project node-json` means exactly one thing. */
const STORAGE_BY_PROJECT: Record<string, StorageDriver> = { node: 'sqlite', 'node-json': 'json' };

/** The Node backend in-process on a fresh temp data folder, without a renderer
    (so the client-export branch of the contract runs; test:render covers the server one). */
export default async function setup(project: TestProject) {
  const storage = STORAGE_BY_PROJECT[project.name];
  if (!storage) {
    throw new Error(`No storage driver for the contract project "${project.name}" (known: ${Object.keys(STORAGE_BY_PROJECT).join(', ')}).`);
  }
  const dir = mkdtempSync(join(tmpdir(), `nest-flyers-contract-${storage}-`));
  const data = dataPaths(dir);
  const repos = createRepositories({ storage }, data);
  await applySeedFile(repos, SEED_FILE);
  const server = createServer(createApp({ repos, storage, uploadsDir: data.uploads, buildId: 'contract' }));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  project.provide('baseUrl', `http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
  return async () => {
    await new Promise((done) => server.close(done));
    await repos.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
}
