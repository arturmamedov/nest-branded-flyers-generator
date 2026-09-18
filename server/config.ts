import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { APP_ROOT } from './paths.js';

export const STORAGE_DRIVERS = ['sqlite'] as const;
export type StorageDriver = (typeof STORAGE_DRIVERS)[number];

export interface Config {
  host: string;
  port: number;
  dataDir: string;
  storage: StorageDriver;
  renderOrigin: string;
  renderTimeoutMs: number;
  isProd: boolean;
}

const WILDCARD = new Set(['0.0.0.0', '::', '127.0.0.1', 'localhost', '::1']);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const envFile = join(APP_ROOT, '.env');
  if (env === process.env && existsSync(envFile)) process.loadEnvFile(envFile);

  // Default to loopback so nobody exposes this no-login app by accident.
  const host = env.HOST || '127.0.0.1';
  const port = Number(env.PORT || 8787);
  // Headless Chromium must reach this server: a wildcard bind is reachable on
  // loopback, a specific LAN IP only on that IP.
  const internalHost = WILDCARD.has(host) ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host;
  const storage = (env.STORAGE || 'sqlite') as StorageDriver;
  if (!STORAGE_DRIVERS.includes(storage)) throw new Error(`STORAGE must be one of ${STORAGE_DRIVERS.join(', ')} (got ${env.STORAGE})`);
  return {
    host,
    port,
    dataDir: env.DATA_DIR || './data',
    storage,
    renderOrigin: env.RENDER_ORIGIN || `http://${internalHost}:${port}`,
    renderTimeoutMs: Number(env.RENDER_TIMEOUT_MS || 30_000),
    // The compiled server always serves the built client; tsx dev hosts Vite.
    isProd: env.NODE_ENV === 'production' || /dist-server/.test(import.meta.dirname),
  };
}
