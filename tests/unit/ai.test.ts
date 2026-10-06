import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AI_DAILY_LIMIT,
  AI_DAILY_LIMIT_MAX,
  AI_DAY_ZONE,
  AI_DEFAULT_MODEL,
  AI_FAKE,
  AI_FEATURES,
  AI_INPUT_MAX,
  AI_PROVIDERS,
  AI_SCHEMA_NAMES,
  AI_SHARED,
  aiDateLine,
  aiDay,
  aiFor,
} from '../../src/shared/ai.js';
import type { AiConfig } from '../../src/shared/schema.js';

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

describe('aiFor: the AI as far as one feature goes, from api/config’s answer', () => {
  it('is the caller’s limit and what is left when the site runs that feature for them', () => {
    const shareOnly: AiConfig = { enabled: true, limit: 3, remaining: 2, features: ['share'] };
    expect(aiFor(shareOnly, 'share')).toBe(shareOnly);
    expect(aiFor(shareOnly, 'flyer')).toBeNull();
    const both: AiConfig = { enabled: true, limit: 3, remaining: 0, features: ['flyer', 'share'] };
    for (const feature of AI_FEATURES) expect(aiFor(both, feature), feature).toBe(both);
  });

  it('is nothing with the AI off', () => {
    for (const feature of AI_FEATURES) expect(aiFor({ enabled: false }, feature), feature).toBeNull();
  });

  // The editor never parses an answer (zod stays out of its bundle), so a backend older than this client is met
  // here: while a release is being uploaded, its new files answer beside the old ones. It must cost the AI, never the page.
  it('is nothing, and no crash, for a backend older than this client', () => {
    const older = [
      { enabled: true, limit: 3, remaining: 3 }, // from before each feature had its own switch: no list
      undefined, // from before the AI: no `ai` block at all
      null,
      { enabled: true, limit: 3, remaining: 3, features: 'share' },
    ];
    for (const ai of older) for (const feature of AI_FEATURES) expect(aiFor(ai as unknown as AiConfig, feature), JSON.stringify(ai)).toBeNull();
  });
});

describe('the AI constants', () => {
  it('pin the owner’s decisions: three a day unless a site sets its own, twenty at most, counted in the Canary Islands, the fast model of each provider', () => {
    expect(AI_DAILY_LIMIT).toBe(3);
    expect(AI_DAILY_LIMIT_MAX).toBe(20);
    expect(AI_SHARED).toMatchObject({ dailyLimit: AI_DAILY_LIMIT, dailyLimitMax: AI_DAILY_LIMIT_MAX });
    expect(AI_DAY_ZONE).toBe('Atlantic/Canary');
    expect(AI_INPUT_MAX).toBe(4000);
    expect(AI_FEATURES).toEqual(['flyer', 'share']);
    expect(AI_PROVIDERS).toEqual(['openai', 'anthropic', 'fake']);
    expect(AI_DEFAULT_MODEL).toEqual({ openai: 'gpt-6-luna', anthropic: 'claude-haiku-4-5' });
  });

  it('name the answer formats and the fake provider once, for both backends (schema/shared.json)', () => {
    expect(AI_SCHEMA_NAMES).toEqual({ flyer: 'nest_flyer_brief', share: 'nest_share_text' });
    expect(AI_FAKE).toEqual({
      model: 'fake-1',
      unknownHostel: 'no-such-nest',
      markers: { invalid: '[[fake:invalid]]', unknownHostel: '[[fake:unknown-hostel]]', timeout: '[[fake:timeout]]', refused: '[[fake:refused]]' },
    });
    expect(AI_SHARED.schemaNames).toBe(AI_SCHEMA_NAMES);
    expect(AI_SHARED.fake).toBe(AI_FAKE);
  });
});
