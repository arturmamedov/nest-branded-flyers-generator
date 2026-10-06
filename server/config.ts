import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AI_DAILY_LIMIT, AI_DAILY_LIMIT_MAX, AI_DEFAULT_MODEL, AI_FEATURES, AI_PROVIDERS, AI_TIMEOUT_MS, type AiFeature, type AiProvider } from '../src/shared/ai.js';
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
  /** The features this site runs, in AI_FEATURES' order. None until the AI_FEATURES setting names them (the owner's
      answer, 2026-10-05): a provider and its key alone run nothing. */
  features: AiFeature[];
  /** The generations a day this site allows each actor: AI_DAILY_LIMIT unless the setting of that name says
      otherwise, and never more than AI_DAILY_LIMIT_MAX. */
  dailyLimit: number;
  /** Each feature's own number a day, for every feature the app has: the one AI_DAILY_LIMITS gives it, else
      `dailyLimit` (the owner's answer, 2026-10-06). */
  dailyLimits: Record<AiFeature, number>;
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

/** The AI_FEATURES setting: the names of the features this site runs, separated by commas. It shares its name with
    the constant in src/shared/ai.ts, which lists every feature the app has: the setting picks from that list. */
function namedFeatures(value: string | undefined): AiFeature[] {
  const named = (value ?? '').split(',').map((name) => name.trim()).filter(Boolean);
  if (named.some((name) => !(AI_FEATURES as readonly string[]).includes(name))) throw new Error(`AI_FEATURES must name features from: ${AI_FEATURES.join(', ')}`);
  return AI_FEATURES.filter((feature) => named.includes(feature));
}

/** The AI_DAILY_LIMIT setting: the generations a day this site allows. It shares its name with the constant in
    src/shared/ai.ts, which is the default; AI_DAILY_LIMIT_MAX is the most a site may set. */
function dailyLimit(value: string | undefined): number {
  const limit = Number(value || AI_DAILY_LIMIT);
  if (!Number.isInteger(limit) || limit < 1 || limit > AI_DAILY_LIMIT_MAX) throw new Error(`AI_DAILY_LIMIT must be a whole number from 1 to ${AI_DAILY_LIMIT_MAX}`);
  return limit;
}

/** The AI_DAILY_LIMITS setting: a feature's own number a day, as `feature:number` pairs separated by commas. A feature
    it does not name takes `others`, the site's AI_DAILY_LIMIT. Digits alone make a number here, so this reads no
    spelling that 'dailyLimits' in config.php would refuse (`1e1`, `2.0`). */
function dailyLimits(value: string | undefined, others: number): Record<AiFeature, number> {
  const own = new Map<string, number>();
  for (const pair of (value ?? '').split(',').map((p) => p.trim()).filter(Boolean)) {
    const [name, digits, ...more] = pair.split(':').map((part) => part.trim());
    const limit = /^\d+$/.test(digits ?? '') ? Number(digits) : NaN;
    if (more.length > 0 || !(AI_FEATURES as readonly string[]).includes(name) || own.has(name) || !(limit >= 1 && limit <= AI_DAILY_LIMIT_MAX)) {
      throw new Error(`AI_DAILY_LIMITS must be feature:number pairs separated by commas: a feature from ${AI_FEATURES.join(', ')}, each once, and a whole number from 1 to ${AI_DAILY_LIMIT_MAX}`);
    }
    own.set(name, limit);
  }
  return Object.fromEntries(AI_FEATURES.map((feature) => [feature, own.get(feature) ?? others])) as Record<AiFeature, number>;
}

/* A refusal names the setting and never repeats its value, as PHP's AiConfig does: these lines are typed by hand next
   to the key, and a key pasted on the wrong one would be printed back. */
export function loadAiSettings(env: NodeJS.ProcessEnv): AiSettings {
  const provider = (env.AI_PROVIDER || null) as AiProvider | null;
  if (provider !== null && !AI_PROVIDERS.includes(provider)) throw new Error(`AI_PROVIDER must be one of ${AI_PROVIDERS.join(', ')}`);
  const apiKey = env.AI_API_KEY || null;
  // `AI_API_KEY="sk-…\n"` in .env ends in a real line break: the request then fails with nothing naming the cause.
  if (apiKey !== null && /[\s\x00-\x1f\x7f]/.test(apiKey)) throw new Error('AI_API_KEY must not hold spaces or line breaks');
  const model = provider === null ? null : env.AI_MODEL || (provider === 'fake' ? FAKE_MODEL : AI_DEFAULT_MODEL[provider]);
  const keyed = provider === 'fake' || apiKey !== null;
  const timeoutMs = Number(env.AI_TIMEOUT_MS || AI_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('AI_TIMEOUT_MS must be a positive whole number of milliseconds');
  const features = namedFeatures(env.AI_FEATURES);
  const limit = dailyLimit(env.AI_DAILY_LIMIT);
  return {
    provider,
    apiKey,
    model,
    effort: env.AI_EFFORT || null,
    timeoutMs,
    enabled: provider !== null && keyed && !OFF.has((env.AI_ENABLED ?? '').trim().toLowerCase()),
    features,
    dailyLimit: limit,
    dailyLimits: dailyLimits(env.AI_DAILY_LIMITS, limit),
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
