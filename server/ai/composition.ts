import type { AiBundle } from '../../src/shared/schema.js';
import type { AiSettings } from '../config.js';
import type { AiUsageRepository, Clock, HostelRepository } from '../storage/types.js';
import { loadBundle } from './bundle.js';
import type { FetchJson } from './http.js';
import { createAiPolicy } from './policy.js';
import type { LlmProvider } from './provider.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { FakeProvider } from './providers/fake.js';
import { OpenAiProvider } from './providers/openai.js';
import { AiService } from './service.js';

/* The AI assistant's composition root: the settings (server/config.ts) pick the provider, the service gets the
   seams. Off (no provider, no key, or switched off) builds nothing: the app then answers ai_off and
   `ai: { enabled: false }` without a service at all. */

/** The provider the settings name, keyed; null when the settings say off. */
export function createProvider(settings: AiSettings, bundle: AiBundle, fetch?: FetchJson): LlmProvider | null {
  if (!settings.enabled || settings.provider === null || settings.model === null) return null;
  if (settings.provider === 'fake') return new FakeProvider(bundle);
  if (settings.apiKey === null) return null;
  const config = { apiKey: settings.apiKey, model: settings.model, effort: settings.effort };
  return settings.provider === 'openai' ? new OpenAiProvider(config, fetch) : new AnthropicProvider(config, fetch);
}

export interface AiDeps {
  hostels: Pick<HostelRepository, 'list' | 'bySlug'>;
  usage: Pick<AiUsageRepository, 'record' | 'countOk'>;
  clock: Clock;
  /** Loaded from schema/ai.json unless given (the tests hand in a stub). */
  bundle?: AiBundle;
}

export function createAiService(settings: AiSettings, deps: AiDeps): AiService | undefined {
  const bundle = deps.bundle ?? loadBundle();
  const provider = createProvider(settings, bundle);
  if (!provider) return undefined;
  return new AiService({
    provider,
    policy: createAiPolicy(settings),
    bundle,
    hostels: deps.hostels,
    usage: deps.usage,
    clock: deps.clock,
    timeoutMs: settings.timeoutMs,
  });
}
