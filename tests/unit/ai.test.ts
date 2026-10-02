import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AI_DAILY_LIMIT, AI_DAY_ZONE, AI_DEFAULT_MODEL, AI_FEATURES, AI_INPUT_MAX, AI_PROVIDERS, aiDateLine, aiDay } from '../../src/shared/ai.js';

/* The AI assistant's shared facts (src/shared/ai.ts): the cap, the day it counts in, and what both backends print as
   "today" in the prompt. The day vectors are replayed by PHPUnit against the PHP implementation. */

type DayVectors = { zone: string; cases: { at: string; day: string; line: string }[] };
const vectors = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/ai-day.json'), 'utf8')) as DayVectors;

describe('the AI day', () => {
  it('is the Canary Islands day of the instant, across both DST changes', () => {
    expect(vectors.zone).toBe(AI_DAY_ZONE);
    for (const c of vectors.cases) expect(aiDay(c.at), c.at).toBe(c.day);
  });

  it('prints the date line the prompt reads "today" from', () => {
    for (const c of vectors.cases) expect(aiDateLine(c.at), c.at).toBe(c.line);
  });
});

describe('the AI constants', () => {
  it('pin the owner’s decisions: three a day, counted in the Canary Islands, the fast model of each provider', () => {
    expect(AI_DAILY_LIMIT).toBe(3);
    expect(AI_DAY_ZONE).toBe('Atlantic/Canary');
    expect(AI_INPUT_MAX).toBe(4000);
    expect(AI_FEATURES).toEqual(['flyer', 'share']);
    expect(AI_PROVIDERS).toEqual(['openai', 'anthropic', 'fake']);
    expect(AI_DEFAULT_MODEL).toEqual({ openai: 'gpt-6-luna', anthropic: 'claude-haiku-4-5' });
  });
});
