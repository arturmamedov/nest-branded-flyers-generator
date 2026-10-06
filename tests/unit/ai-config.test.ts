import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../server/config.js';
import { APP_ROOT } from '../../server/paths.js';
import { AI_DAILY_LIMIT, AI_DAILY_LIMIT_MAX, AI_DEFAULT_MODEL, AI_FEATURES, AI_TIMEOUT_MS } from '../../src/shared/ai.js';

/* The AI settings the Node server reads from its environment (.env): which provider, the key, the model, the two
   knobs, the switch, the features that run, and how many a day each may. Off is the default, and the state the app
   keeps whenever a provider has no key. The vectors (tests/fixtures/ai-settings.json) are replayed by PHPUnit against
   config.php's `ai` block. */

const load = (env: Record<string, string>) => loadConfig(env as NodeJS.ProcessEnv).ai;

/** One row of the shared vectors: `env` is the variable's value (null: not set); a row without it is PHP's alone. */
interface Row {
  name: string;
  env?: string | null;
}
/** A row of the per-feature limits: `site` is the site's own number (AI_DAILY_LIMIT), set beside the pairs. */
type LimitsRow = Row & { site?: number };
const vectors = JSON.parse(readFileSync(join(APP_ROOT, 'tests/fixtures/ai-settings.json'), 'utf8')) as {
  features: { accepted: (Row & { runs: string[] })[]; refused: Row[] };
  dailyLimit: { accepted: (Row & { limit: number })[]; refused: Row[] };
  dailyLimits: { accepted: (LimitsRow & { limits: Record<string, number>; others: number })[]; refused: LimitsRow[] };
};
/** The rows Node reads, each with the environment that sets its variable (or leaves it out). */
const rows = <R extends Row>(list: R[], variable: string): (Omit<R, 'env'> & { env: Record<string, string> })[] =>
  list.filter((r) => r.env !== undefined).map((r) => ({ ...r, env: r.env == null ? {} : { [variable]: r.env } }));
/** The same for the per-feature limits, whose rows may set the site's own number too. */
const limitRows = <R extends LimitsRow>(list: R[]) =>
  rows(list, 'AI_DAILY_LIMITS').map((r) => ({ ...r, env: { ...r.env, ...(r.site === undefined ? {} : { AI_DAILY_LIMIT: String(r.site) }) } }));
/** A limit for every feature the app has: its own where `own` names it, else `others`. */
const everyFeature = (others: number, own: Record<string, number> = {}) => Object.fromEntries(AI_FEATURES.map((f) => [f, own[f] ?? others]));

describe('AI settings', () => {
  it('are off with no provider', () => {
    expect(load({})).toEqual({
      provider: null,
      apiKey: null,
      model: null,
      effort: null,
      timeoutMs: AI_TIMEOUT_MS,
      enabled: false,
      features: [],
      dailyLimit: AI_DAILY_LIMIT,
      dailyLimits: everyFeature(AI_DAILY_LIMIT),
    });
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
      features: [],
      dailyLimit: AI_DAILY_LIMIT,
      dailyLimits: everyFeature(AI_DAILY_LIMIT),
    });
  });

  // The owner's answer (2026-10-05): the cap is a setting, 3 by default, bounded in the code.
  it.each(rows(vectors.dailyLimit.accepted, 'AI_DAILY_LIMIT'))('AI_DAILY_LIMIT, $name', ({ env, limit }) => {
    expect(load({ AI_PROVIDER: 'fake', ...env }).dailyLimit).toBe(limit);
  });

  it.each(rows(vectors.dailyLimit.refused, 'AI_DAILY_LIMIT'))('refuses AI_DAILY_LIMIT with $name, whether or not the AI is on', ({ env }) => {
    expect(() => load(env)).toThrow(/AI_DAILY_LIMIT/);
    expect(() => load({ AI_PROVIDER: 'fake', ...env })).toThrow(/AI_DAILY_LIMIT/);
  });

  it('the vectors’ default and their most are the shared constants', () => {
    const { accepted, refused } = vectors.dailyLimit;
    expect(accepted.find((r) => r.env === null)?.limit).toBe(AI_DAILY_LIMIT);
    expect(Math.max(...accepted.map((r) => r.limit))).toBe(AI_DAILY_LIMIT_MAX);
    expect(refused.map((r) => r.env)).toContain(String(AI_DAILY_LIMIT_MAX + 1));
  });

  // The owner's answers (2026-10-06): every feature its own daily limit, AI_DAILY_LIMIT each feature's number unless it
  // has its own, and one setting of pairs for those.
  it.each(limitRows(vectors.dailyLimits.accepted))('AI_DAILY_LIMITS, $name', ({ env, limits, others }) => {
    expect(load({ AI_PROVIDER: 'fake', ...env }).dailyLimits).toEqual(everyFeature(others, limits));
  });

  it.each(limitRows(vectors.dailyLimits.refused))('refuses AI_DAILY_LIMITS with $name, whether or not the AI is on', ({ env }) => {
    expect(() => load(env)).toThrow(/AI_DAILY_LIMITS/);
    expect(() => load({ AI_PROVIDER: 'fake', ...env })).toThrow(/AI_DAILY_LIMITS/);
  });

  it('the per-feature vectors name real features, and their default and their most are the shared constants', () => {
    const { accepted, refused } = vectors.dailyLimits;
    for (const row of accepted) for (const feature of Object.keys(row.limits)) expect(AI_FEATURES, row.name).toContain(feature);
    expect(accepted.find((r) => r.env === null && r.site === undefined)?.others).toBe(AI_DAILY_LIMIT);
    expect(Math.max(...accepted.flatMap((r) => Object.values(r.limits)))).toBe(AI_DAILY_LIMIT_MAX);
    expect(refused.map((r) => r.env)).toContain(`${AI_FEATURES.at(-1)}:${AI_DAILY_LIMIT_MAX + 1}`);
  });

  it('a number for a feature the site does not run is kept, and runs nothing', () => {
    const [runs, other] = AI_FEATURES;
    const settings = load({ AI_PROVIDER: 'fake', AI_FEATURES: runs, AI_DAILY_LIMITS: `${other}:9` });
    expect(settings.features).toEqual([runs]);
    expect(settings.dailyLimits).toEqual(everyFeature(AI_DAILY_LIMIT, { [other]: 9 }));
  });

  // The owner's answer (2026-10-05): none until named. The switch keeps its meaning; what runs is a second fact.
  it('a provider and its key name no feature: AI_FEATURES does', () => {
    expect(load({ AI_PROVIDER: 'openai', AI_API_KEY: 'k' })).toMatchObject({ enabled: true, features: [] });
    expect(load({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_FEATURES: 'share' })).toMatchObject({ enabled: true, features: ['share'] });
  });

  it.each(rows(vectors.features.accepted, 'AI_FEATURES'))('AI_FEATURES, $name', ({ env, runs }) => {
    expect(load({ AI_PROVIDER: 'fake', ...env }).features).toEqual(runs);
  });

  it.each(rows(vectors.features.refused, 'AI_FEATURES'))('refuses AI_FEATURES with $name, whether or not the AI is on', ({ env }) => {
    expect(() => load(env)).toThrow(/AI_FEATURES/);
    expect(() => load({ AI_PROVIDER: 'fake', ...env })).toThrow(/AI_FEATURES/);
  });

  it('AI_ENABLED switches it off even with a key', () => {
    for (const off of ['0', 'false', 'off', 'no']) expect(load({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_ENABLED: off }).enabled, off).toBe(false);
    expect(load({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_ENABLED: '1' }).enabled).toBe(true);
  });

  it('refuses a provider it does not know, at start-up', () => {
    expect(() => load({ AI_PROVIDER: 'bard' })).toThrow(/AI_PROVIDER/);
  });

  it('never repeats the value it refuses: a key pasted on the wrong line would be one', () => {
    const pasted = 'sk-live-secret-42';
    const said = (env: Record<string, string>) => {
      try {
        load(env);
      } catch (e) {
        return (e as Error).message;
      }
      return 'nothing: it was accepted';
    };
    expect(said({ AI_PROVIDER: pasted })).toMatch(/AI_PROVIDER/);
    expect(said({ AI_PROVIDER: pasted })).not.toContain(pasted);
    expect(said({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_TIMEOUT_MS: pasted })).toMatch(/AI_TIMEOUT_MS/);
    expect(said({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_TIMEOUT_MS: pasted })).not.toContain(pasted);
    expect(said({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_FEATURES: pasted })).toMatch(/AI_FEATURES/);
    expect(said({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_FEATURES: `share,${pasted}` })).not.toContain(pasted);
    expect(said({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_DAILY_LIMIT: pasted })).toMatch(/AI_DAILY_LIMIT/);
    expect(said({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_DAILY_LIMIT: pasted })).not.toContain(pasted);
    // Pasted whole, as a pair's name and as a pair's number: none of them comes back.
    for (const value of [pasted, `${pasted}:5`, `share:${pasted}`, `share:5,${pasted}`]) {
      expect(said({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_DAILY_LIMITS: value }), value).toMatch(/AI_DAILY_LIMITS/);
      expect(said({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_DAILY_LIMITS: value }), value).not.toContain(pasted);
    }
  });

  // `AI_API_KEY="sk-…\n"` in .env is a key with a real line break at its end: every call then failed as "fetch
  // failed", and nothing named the cause.
  it('refuses a key that holds a line break or a space, by the setting’s name and never its value', () => {
    for (const bad of ['sk-live-secret-42\n', 'sk-live-secret-42\r\n', 'sk-live secret-42', '\tsk-live-secret-42']) {
      let said = 'nothing: it was accepted';
      try {
        load({ AI_PROVIDER: 'openai', AI_API_KEY: bad });
      } catch (e) {
        said = (e as Error).message;
      }
      expect(said, JSON.stringify(bad)).toBe('AI_API_KEY must not hold spaces or line breaks');
    }
    // Checked like the time limit: whether or not the AI is on.
    expect(() => load({ AI_API_KEY: 'k\n' })).toThrow(/AI_API_KEY/);
    expect(load({ AI_PROVIDER: 'openai', AI_API_KEY: 'sk-live-secret-42' }).enabled).toBe(true);
  });

  it('refuses a time limit that is not a positive whole number of milliseconds, as PHP does', () => {
    for (const bad of ['25s', '0', '-5', '1.5']) {
      expect(() => load({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_TIMEOUT_MS: bad }), bad).toThrow(/AI_TIMEOUT_MS/);
    }
    // Checked like the provider's name: whether or not the AI is on.
    expect(() => load({ AI_TIMEOUT_MS: 'soon' })).toThrow(/AI_TIMEOUT_MS/);
    expect(load({ AI_TIMEOUT_MS: '' }).timeoutMs).toBe(AI_TIMEOUT_MS);
  });

  it('every setting is in .env.example, commented out', () => {
    const example = readFileSync(join(APP_ROOT, '.env.example'), 'utf8');
    for (const name of ['AI_PROVIDER', 'AI_API_KEY', 'AI_FEATURES', 'AI_DAILY_LIMIT', 'AI_DAILY_LIMITS', 'AI_MODEL', 'AI_EFFORT', 'AI_TIMEOUT_MS', 'AI_ENABLED']) expect(example).toMatch(new RegExp(`^# ?${name}=`, 'm'));
  });
});
