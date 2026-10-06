import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AI_DAILY_LIMIT,
  AI_DAILY_LIMIT_MAX,
  AI_DAY_ZONE,
  AI_DEFAULT_MODEL,
  AI_FAKE,
  AI_FEATURE_NOUNS,
  AI_FEATURES,
  AI_INPUT_MAX,
  AI_PICTURE_ASK,
  AI_PICTURE_MAX_EDGE,
  AI_PROVIDERS,
  AI_SCHEMA_NAMES,
  AI_SHARED,
  aiDateLine,
  aiDay,
  aiFor,
  aiQuotaVars,
  aiWithRemaining,
} from '../../src/shared/ai.js';
import { apiError } from '../../src/shared/errors.js';
import { MAX_PHOTO_EDGE } from '../../src/shared/limits.js';
import type { AiConfig } from '../../src/shared/schema.js';

/* The AI assistant's shared facts (src/shared/ai.ts): each feature's daily limit, the day it counts in, and what both
   backends print as "today" in the prompt. The day vectors are replayed by PHPUnit against the PHP implementation. */

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
  // The owner's answer (2026-10-06): every feature has its own daily limit, so each has its own count.
  it('is that feature’s own limit and what is left of it, when the site runs it for the caller', () => {
    const share = { name: 'share' as const, limit: 10, remaining: 2 };
    const shareOnly: AiConfig = { enabled: true, features: [share] };
    expect(aiFor(shareOnly, 'share')).toBe(share);
    expect(aiFor(shareOnly, 'flyer')).toBeNull();
    const flyer = { name: 'flyer' as const, limit: 3, remaining: 0 };
    const both: AiConfig = { enabled: true, features: [flyer, share] };
    expect(aiFor(both, 'flyer')).toBe(flyer);
    expect(aiFor(both, 'share')).toBe(share);
  });

  it('is nothing with the AI off', () => {
    for (const feature of AI_FEATURES) expect(aiFor({ enabled: false }, feature), feature).toBeNull();
  });

  // The editor never parses an answer (zod stays out of its bundle), so a backend older than this client is met
  // here: while a release is being uploaded, its new files answer beside the old ones. It must cost the AI, never the page.
  it('is nothing, and no crash, for a backend older than this client, or an answer it cannot read', () => {
    const older = [
      { enabled: true, limit: 3, remaining: 3 }, // from before each feature had its own switch: no list
      { enabled: true, limit: 3, remaining: 3, features: ['flyer', 'share'] }, // from before each had its own limit: names
      undefined, // from before the AI: no `ai` block at all
      null,
      { enabled: true, limit: 3, remaining: 3, features: 'share' },
      { enabled: true, features: [null, 'share', 7] },
      { enabled: true, features: [{ name: 'flyer' }, { name: 'share', limit: '3', remaining: 3 }] }, // no count to show
    ];
    for (const ai of older) for (const feature of AI_FEATURES) expect(aiFor(ai as unknown as AiConfig, feature), JSON.stringify(ai)).toBeNull();
  });

  // A count is a whole number from zero up (AiFeatureStatusSchema). "-1 left" beside a live button is not one to show.
  it('is nothing for a count the contract refuses: below zero, not whole, or past what a number holds exactly', () => {
    for (const bad of [-1, 2.5, 1e21, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const entry of [{ name: 'flyer', limit: 3, remaining: bad }, { name: 'flyer', limit: bad, remaining: 0 }]) {
        expect(aiFor({ enabled: true, features: [entry] } as AiConfig, 'flyer'), JSON.stringify(entry)).toBeNull();
      }
    }
    const usedUp = { name: 'flyer' as const, limit: 3, remaining: 0 };
    expect(aiFor({ enabled: true, features: [usedUp] }, 'flyer'), 'none left is a count').toBe(usedUp);
  });
});

describe('aiWithRemaining: api/config’s answer once a route has said what is left of one feature', () => {
  const flyer = { name: 'flyer' as const, limit: 3, remaining: 3 };
  const share = { name: 'share' as const, limit: 10, remaining: 2 };

  it('moves that feature’s count, and only that one', () => {
    const before: AiConfig = { enabled: true, features: [flyer, share] };
    const after = aiWithRemaining(before, 'share', 1);
    expect(after).toEqual({ enabled: true, features: [flyer, { ...share, remaining: 1 }] });
    expect(aiFor(after, 'flyer'), 'the other feature’s entry is the one it was').toBe(flyer);
    expect(before, 'the answer it was given is not written to').toEqual({ enabled: true, features: [flyer, share] });
    expect(aiWithRemaining(before, 'flyer', 0)).toEqual({ enabled: true, features: [{ ...flyer, remaining: 0 }, share] });
  });

  // Found in review (2026-10-06): aiFor() showed a feature listed beside an entry it could not read, and the first
  // answer then walked the list by name and took the page down with it.
  it('leaves an entry it cannot read as it came, beside one it can', () => {
    const odd = { enabled: true, features: [null, 'share', 7, { name: 'photo', limit: 3, remaining: 3 }, share] } as unknown as AiConfig;
    const after = aiWithRemaining(odd, 'share', 1);
    expect(after).toEqual({ enabled: true, features: [null, 'share', 7, { name: 'photo', limit: 3, remaining: 3 }, { ...share, remaining: 1 }] });
    expect(aiFor(after, 'share')).toEqual({ ...share, remaining: 1 });
  });

  it('answers what it was given, and no crash, with the AI off or for a backend older than this client', () => {
    const unread = [
      { enabled: false },
      { enabled: true, limit: 3, remaining: 3 },
      { enabled: true, limit: 3, remaining: 3, features: ['flyer', 'share'] },
      { enabled: true, features: 'share' },
      undefined,
      null,
    ];
    for (const ai of unread) expect(aiWithRemaining(ai as unknown as AiConfig, 'share', 1), JSON.stringify(ai)).toEqual(ai);
  });

  // A route that answers its flyer with no count to show must not cost the flyer: the count stays where it was.
  it('keeps the count it had when what is left is no count', () => {
    const before: AiConfig = { enabled: true, features: [flyer, share] };
    for (const bad of [undefined, null, '1', -1, 1.5, Number.NaN, 1e21]) {
      expect(aiWithRemaining(before, 'share', bad as unknown as number), String(bad)).toBe(before);
    }
  });

  it('changes nothing for a feature the answer does not list', () => {
    const shareOnly: AiConfig = { enabled: true, features: [share] };
    expect(aiWithRemaining(shareOnly, 'flyer', 0)).toEqual(shareOnly);
    expect(aiFor(aiWithRemaining(shareOnly, 'flyer', 0), 'flyer')).toBeNull();
  });
});

describe('the AI constants', () => {
  it('pin the owner’s decisions: three a day unless a site sets its own, twenty at most, counted in the Canary Islands, the fast model of each provider', () => {
    expect(AI_DAILY_LIMIT).toBe(3);
    expect(AI_DAILY_LIMIT_MAX).toBe(20);
    expect(AI_SHARED).toMatchObject({ dailyLimit: AI_DAILY_LIMIT, dailyLimitMax: AI_DAILY_LIMIT_MAX });
    expect(AI_DAY_ZONE).toBe('Atlantic/Canary');
    expect(AI_INPUT_MAX).toBe(4000);
    expect(AI_FEATURES).toEqual(['flyer', 'share', 'photo']);
    expect(AI_PROVIDERS).toEqual(['openai', 'anthropic', 'fake']);
    expect(AI_DEFAULT_MODEL).toEqual({ openai: 'gpt-6-luna', anthropic: 'claude-haiku-4-5' });
  });

  // The owner's wording (2026-10-06): the used-up sentence names what ran out, since each feature has its own limit.
  it('name what each feature’s generations are called, once, and the used-up sentence says it', () => {
    expect(AI_FEATURE_NOUNS).toEqual({ flyer: 'AI flyers', share: 'AI share texts', photo: 'picture reads' });
    expect(Object.keys(AI_FEATURE_NOUNS)).toEqual([...AI_FEATURES]);
    expect(AI_SHARED.featureNouns).toBe(AI_FEATURE_NOUNS);
    expect(aiQuotaVars('share', 10)).toEqual({ limit: 10, what: 'AI share texts' });
    expect(apiError('ai_quota', aiQuotaVars('flyer', 3)).message).toBe('Today’s 3 AI flyers are used up. They come back at midnight, Canary Islands time.');
    expect(apiError('ai_quota', aiQuotaVars('share', 10)).message).toBe('Today’s 10 AI share texts are used up. They come back at midnight, Canary Islands time.');
    expect(apiError('ai_quota', aiQuotaVars('photo', 3)).message).toBe('Today’s 3 picture reads are used up. They come back at midnight, Canary Islands time.');
    // Every feature has the name its answer's format goes by: the fake reads the feature off it.
    expect(Object.keys(AI_SCHEMA_NAMES)).toEqual([...AI_FEATURES]);
  });

  it('name the answer formats and the fake provider once, for both backends (schema/shared.json)', () => {
    expect(AI_SCHEMA_NAMES).toEqual({ flyer: 'nest_flyer_brief', share: 'nest_share_text', photo: 'nest_picture_text' });
    expect(AI_FAKE).toEqual({
      model: 'fake-1',
      unknownHostel: 'no-such-nest',
      markers: { invalid: '[[fake:invalid]]', unknownHostel: '[[fake:unknown-hostel]]', timeout: '[[fake:timeout]]', refused: '[[fake:refused]]' },
      // A picture read has no typed text to carry a marker: the picture's width steers the fake.
      pictureWidths: { invalid: 11, timeout: 12, refused: 13, noWords: 14 },
    });
    // A width no real picture has by accident, and small enough that neither backend ever shrinks it.
    for (const width of Object.values(AI_FAKE.pictureWidths)) expect(width).toBeLessThan(32);
    expect(new Set(Object.values(AI_FAKE.pictureWidths)).size).toBe(4);
    expect(AI_SHARED.schemaNames).toBe(AI_SCHEMA_NAMES);
    expect(AI_SHARED.fake).toBe(AI_FAKE);
  });

  // The picture a read sends the model (the brief, 2026-10-06): 2048 px on its long edge, under the photo's own 3240.
  it('say how large a picture a read sends, and the one line that asks for its words', () => {
    expect(AI_PICTURE_MAX_EDGE).toBe(2048);
    expect(AI_PICTURE_MAX_EDGE).toBeLessThan(MAX_PHOTO_EDGE);
    expect(AI_PICTURE_ASK).toBe('Write out the words of the event in this picture.');
    expect(AI_SHARED).toMatchObject({ pictureMaxEdge: AI_PICTURE_MAX_EDGE, pictureAsk: AI_PICTURE_ASK });
  });
});
