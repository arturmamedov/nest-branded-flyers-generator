import { createServer } from 'node:http';
import type { ViteDevServer } from 'vite';
import { computeBuildId, createApp } from './app.js';
import { createRepositories } from './composition.js';
import { loadConfig } from './config.js';
import { APP_ROOT, dataPaths } from './paths.js';
import { createRenderer } from './services/renderer.js';

const config = loadConfig();
const data = dataPaths(config.dataDir);
const repos = createRepositories(config, data);
const renderer = createRenderer({ origin: config.renderOrigin, cacheDir: data.renders, timeoutMs: config.renderTimeoutMs });

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

const app = createApp({ repos, storage: config.storage, uploadsDir: data.uploads, renderer, vite, buildId: computeBuildId(config.isProd) });
httpServer.on('request', app);

httpServer.listen(config.port, config.host, () => {
  console.log(`Nest flyers on http://${config.host}:${config.port} (${config.isProd ? 'production' : 'dev'}, ${config.storage} storage)`);
  console.log(`Data in ${data.root}`);
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
