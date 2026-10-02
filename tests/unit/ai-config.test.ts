import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../server/config.js';
import { APP_ROOT } from '../../server/paths.js';
import { AI_DEFAULT_MODEL, AI_TIMEOUT_MS } from '../../src/shared/ai.js';

/* The AI settings the Node server reads from its environment (.env): which provider, the key, the model, the two
   knobs, and the switch. Off is the default, and the state the app keeps whenever a provider has no key. */

const load = (env: Record<string, string>) => loadConfig(env as NodeJS.ProcessEnv).ai;

describe('AI settings', () => {
  it('are off with no provider', () => {
    expect(load({})).toEqual({ provider: null, apiKey: null, model: null, effort: null, timeoutMs: AI_TIMEOUT_MS, enabled: false });
  });

  it('the fake provider needs no key', () => {
    expect(load({ AI_PROVIDER: 'fake' })).toMatchObject({ provider: 'fake', apiKey: null, model: 'fake-1', enabled: true });
  });

  it('a real provider is off until it has a key, and takes its default model', () => {
    expect(load({ AI_PROVIDER: 'openai' })).toMatchObject({ provider: 'openai', apiKey: null, model: AI_DEFAULT_MODEL.openai, enabled: false });
    expect(load({ AI_PROVIDER: 'openai', AI_API_KEY: 'sk-test' })).toMatchObject({ provider: 'openai', apiKey: 'sk-test', model: AI_DEFAULT_MODEL.openai, enabled: true });
    expect(load({ AI_PROVIDER: 'anthropic', AI_API_KEY: 'k' })).toMatchObject({ provider: 'anthropic', model: AI_DEFAULT_MODEL.anthropic, enabled: true });
  });

  it('the model, the effort and the time limit can be set', () => {
    expect(load({ AI_PROVIDER: 'anthropic', AI_API_KEY: 'k', AI_MODEL: 'claude-sonnet-5-5', AI_EFFORT: 'low', AI_TIMEOUT_MS: '9000' })).toEqual({
      provider: 'anthropic',
      apiKey: 'k',
      model: 'claude-sonnet-5-5',
      effort: 'low',
      timeoutMs: 9000,
      enabled: true,
    });
  });

  it('AI_ENABLED switches it off even with a key', () => {
    for (const off of ['0', 'false', 'off', 'no']) expect(load({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_ENABLED: off }).enabled, off).toBe(false);
    expect(load({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_ENABLED: '1' }).enabled).toBe(true);
  });

  it('refuses a provider it does not know, at start-up', () => {
    expect(() => load({ AI_PROVIDER: 'bard' })).toThrow(/AI_PROVIDER/);
  });

  it('every setting is in .env.example, commented out', () => {
    const example = readFileSync(join(APP_ROOT, '.env.example'), 'utf8');
    for (const name of ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL', 'AI_EFFORT', 'AI_TIMEOUT_MS', 'AI_ENABLED']) expect(example).toMatch(new RegExp(`^# ?${name}=`, 'm'));
  });
});
