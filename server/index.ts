import { createServer } from 'node:http';
import type { ViteDevServer } from 'vite';
import { createAiService } from './ai/composition.js';
import { computeBuildId, createApp } from './app.js';
import { createRepositories } from './composition.js';
import { loadConfig } from './config.js';
import { APP_ROOT, dataPaths } from './paths.js';
import { createRenderer } from './services/renderer.js';
import { systemClock } from './storage/types.js';

const config = loadConfig();
const data = dataPaths(config.dataDir);
const repos = createRepositories(config, data, systemClock);
const renderer = createRenderer({ origin: config.renderOrigin, cacheDir: data.renders, timeoutMs: config.renderTimeoutMs });
const ai = createAiService(config.ai, { hostels: repos.hostels, usage: repos.aiUsage, clock: systemClock });

const httpServer = createServer();

let vite: ViteDevServer | undefined;
if (!config.isProd) {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({
    root: APP_ROOT,
    appType: 'mpa',
    server: { middlewareMode: true, hmr: { server: httpServer } },
  });
}

const app = createApp({ repos, storage: config.storage, uploadsDir: data.uploads, renderer, vite, buildId: computeBuildId(config.isProd), ai });
httpServer.on('request', app);

httpServer.listen(config.port, config.host, () => {
  console.log(`Nest flyers on http://${config.host}:${config.port} (${config.isProd ? 'production' : 'dev'}, ${config.storage} storage)`);
  console.log(`Data in ${data.root}`);
  console.log(ai ? `AI assistant on: ${config.ai.provider}, ${config.ai.model}` : 'AI assistant off (AI_PROVIDER and AI_API_KEY in .env turn it on)');
  if (!['127.0.0.1', 'localhost', '::1'].includes(config.host)) {
    console.log('Reminder: no login by design — this must only be reachable from the office network.');
  }
});

const shutdown = async () => {
  httpServer.close();
  await renderer.close();
  await vite?.close();
  await repos.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
