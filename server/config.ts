import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AI_DEFAULT_MODEL, AI_PROVIDERS, AI_TIMEOUT_MS, type AiProvider } from '../src/shared/ai.js';
import { FAKE_MODEL } from './ai/providers/fake.js';
import { APP_ROOT } from './paths.js';

export const STORAGE_DRIVERS = ['sqlite', 'json'] as const;
export type StorageDriver = (typeof STORAGE_DRIVERS)[number];

/** The AI assistant's settings (docs/prompts/ai-assistant.md): off unless a provider is named and, for a real one,
    keyed. PHP reads the same facts from the `ai` block of config.php. */
export interface AiSettings {
  provider: AiProvider | null;
  /** Server-side only: it never reaches api/config, a log line, the ledger or a release. */
  apiKey: string | null;
  model: string | null;
  /** The provider's effort knob (`reasoning.effort` / `output_config.effort`), sent only when set. */
  effort: string | null;
  timeoutMs: number;
  /** Off with no provider or no key, or when AI_ENABLED says so. */
  enabled: boolean;
}

export interface Config {
  host: string;
  port: number;
  dataDir: string;
  storage: StorageDriver;
  renderOrigin: string;
  renderTimeoutMs: number;
  isProd: boolean;
  ai: AiSettings;
}

const WILDCARD = new Set(['0.0.0.0', '::', '127.0.0.1', 'localhost', '::1']);
const OFF = new Set(['0', 'false', 'off', 'no']);

/* A refusal names the setting and never repeats its value, as PHP's AiConfig does: these lines are typed by hand next
   to the key, and a key pasted on the wrong one would be printed back. */
export function loadAiSettings(env: NodeJS.ProcessEnv): AiSettings {
  const provider = (env.AI_PROVIDER || null) as AiProvider | null;
  if (provider !== null && !AI_PROVIDERS.includes(provider)) throw new Error(`AI_PROVIDER must be one of ${AI_PROVIDERS.join(', ')}`);
  const apiKey = env.AI_API_KEY || null;
  const model = provider === null ? null : env.AI_MODEL || (provider === 'fake' ? FAKE_MODEL : AI_DEFAULT_MODEL[provider]);
  const keyed = provider === 'fake' || apiKey !== null;
  const timeoutMs = Number(env.AI_TIMEOUT_MS || AI_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('AI_TIMEOUT_MS must be a positive whole number of milliseconds');
  return {
    provider,
    apiKey,
    model,
    effort: env.AI_EFFORT || null,
    timeoutMs,
    enabled: provider !== null && keyed && !OFF.has((env.AI_ENABLED ?? '').trim().toLowerCase()),
  };
}

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
    ai: loadAiSettings(env),
  };
}
