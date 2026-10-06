import { describe, expect, it } from 'vitest';
import { AI_INPUT_MAX } from '../../src/shared/ai.js';
import { CHIP_VALUE_MAX } from '../../src/shared/chips.js';
import { newFlyerData } from '../../src/shared/defaults.js';
import { EXTRA_MAX, EXTRAS_MAX } from '../../src/shared/extras.js';
import { TITLE_MAX } from '../../src/shared/names.js';
import {
  AiConfigSchema,
  AiFlyerAnswerSchema,
  AiFlyerRequestSchema,
  AiFlyerResultSchema,
  AiShareAnswerSchema,
  AiShareRequestSchema,
  ApiConfigSchema,
  BriefSchema,
  ChipSchema,
  FlyerDataSchema,
} from '../../src/shared/schema.js';
import { SHARE_MAX } from '../../src/shared/share.js';
import { WEEK_ROWS_MAX } from '../../src/shared/week.js';

/* The AI routes' shapes, and the brief as the model must write it: every limit a flyer has, checked on the brief, so a
   brief that passes always builds a flyer the API saves (the PHP backend has no flyerFromBrief to check it with). */

const brief = { hostel: null, template: 'activity' as const };
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;

describe('AiFlyerRequestSchema', () => {
  it('takes the idea text, trimmed, and an optional hostel slug', () => {
    expect(AiFlyerRequestSchema.parse({ text: '  Yoga at 9  ' })).toEqual({ text: 'Yoga at 9' });
    expect(AiFlyerRequestSchema.parse({ text: 'Yoga', hostel: 'adeje-nest' })).toEqual({ text: 'Yoga', hostel: 'adeje-nest' });
  });

  it('refuses an empty idea, one past the limit, and keys it does not know', () => {
    expect(ok(AiFlyerRequestSchema, { text: '   ' })).toBe(false);
    expect(ok(AiFlyerRequestSchema, { text: 'x'.repeat(AI_INPUT_MAX + 1) })).toBe(false);
    expect(ok(AiFlyerRequestSchema, { text: 'x'.repeat(AI_INPUT_MAX) })).toBe(true);
    expect(ok(AiFlyerRequestSchema, { text: 'Yoga', template: 'week' })).toBe(false);
  });
});

describe('AiFlyerAnswerSchema (what the model fills)', () => {
  /** A brief as the model must answer it: with the flyer's share text. */
  const answered = { ...brief, share: 'Yoga a las 9\n---\nYoga at 9' };

  it('is a brief plus the assumptions it made', () => {
    const answer = { brief: { ...answered, text: { headline1: 'Yoga' } }, assumptions: [{ field: 'cost', note: 'Ask at reception' }] };
    expect(AiFlyerAnswerSchema.parse(answer)).toEqual(answer);
    expect(ok(AiFlyerAnswerSchema, { brief: answered, assumptions: [] })).toBe(true);
  });

  it('always carries the share text, in the model’s answer and in the route’s: one generation is a whole flyer', () => {
    expect(ok(AiFlyerAnswerSchema, { brief, assumptions: [] })).toBe(false);
    expect(ok(AiFlyerResultSchema, { brief, assumptions: [], remaining: 2 })).toBe(false);
    expect(ok(AiFlyerResultSchema, { brief: answered, assumptions: [], remaining: 2 })).toBe(true);
    // A brief written by hand (an example file's, one flyers:post saves) may still go without one.
    expect(ok(BriefSchema, brief)).toBe(true);
  });

  it('refuses a missing assumptions list, a long note, and extra keys anywhere', () => {
    expect(ok(AiFlyerAnswerSchema, { brief: answered })).toBe(false);
    expect(ok(AiFlyerAnswerSchema, { brief: answered, assumptions: [{ field: 'cost', note: 'x'.repeat(201) }] })).toBe(false);
    expect(ok(AiFlyerAnswerSchema, { brief: answered, assumptions: [], remaining: 2 })).toBe(false);
    expect(ok(AiFlyerAnswerSchema, { brief: answered, assumptions: [{ field: 'cost', note: 'n', why: 'w' }] })).toBe(false);
    expect(ok(AiFlyerAnswerSchema, { brief: { ...answered, photo: 'beach.jpg' }, assumptions: [] })).toBe(false);
  });

  it('holds twelve assumptions and no more, and so does the route’s answer', () => {
    const made = (n: number) => Array.from({ length: n }, () => ({ field: 'cost', note: 'Ask at reception' }));
    expect(ok(AiFlyerAnswerSchema, { brief: answered, assumptions: made(12) })).toBe(true);
    expect(ok(AiFlyerAnswerSchema, { brief: answered, assumptions: made(13) })).toBe(false);
    expect(ok(AiFlyerResultSchema, { brief: answered, assumptions: made(12), remaining: 2 })).toBe(true);
    expect(ok(AiFlyerResultSchema, { brief: answered, assumptions: made(13), remaining: 2 })).toBe(false);
  });
});

describe('BriefSchema carries every limit the flyer has', () => {
  it('names the limits once, where FlyerDataSchema takes them too', () => {
    expect(CHIP_VALUE_MAX).toBe(90);
    expect(EXTRA_MAX).toBe(32);
    expect(EXTRAS_MAX).toBe(4);
    expect(ok(ChipSchema, { key: 'when', label: 'When', value: 'x'.repeat(CHIP_VALUE_MAX) })).toBe(true);
    expect(ok(ChipSchema, { key: 'when', label: 'When', value: 'x'.repeat(CHIP_VALUE_MAX + 1) })).toBe(false);
    const data = newFlyerData();
    expect(ok(FlyerDataSchema, { ...data, extras: Array(EXTRAS_MAX).fill('x'.repeat(EXTRA_MAX)) })).toBe(true);
    expect(ok(FlyerDataSchema, { ...data, extras: Array(EXTRAS_MAX + 1).fill('x') })).toBe(false);
    expect(ok(FlyerDataSchema, { ...data, extras: ['x'.repeat(EXTRA_MAX + 1)] })).toBe(false);
  });

  it('refuses a chip value, an extra, a share text, a title or a week past its limit', () => {
    expect(ok(BriefSchema, { ...brief, when: 'x'.repeat(CHIP_VALUE_MAX) })).toBe(true);
    expect(ok(BriefSchema, { ...brief, when: 'x'.repeat(CHIP_VALUE_MAX + 1) })).toBe(false);
    expect(ok(BriefSchema, { ...brief, where: 'x'.repeat(CHIP_VALUE_MAX + 1) })).toBe(false);
    expect(ok(BriefSchema, { ...brief, cost: 'x'.repeat(CHIP_VALUE_MAX + 1) })).toBe(false);
    expect(ok(BriefSchema, { ...brief, extras: Array(EXTRAS_MAX + 1).fill('x') })).toBe(false);
    expect(ok(BriefSchema, { ...brief, extras: ['x'.repeat(EXTRA_MAX + 1)] })).toBe(false);
    expect(ok(BriefSchema, { ...brief, share: 'x'.repeat(SHARE_MAX + 1) })).toBe(false);
    expect(ok(BriefSchema, { ...brief, title: 'x'.repeat(TITLE_MAX + 1) })).toBe(false);
    const row = { day: 'Mon', name: 'Surf', time: '10:00', cost: '35€' };
    expect(ok(BriefSchema, { ...brief, template: 'week', week: Array(WEEK_ROWS_MAX).fill(row) })).toBe(true);
    expect(ok(BriefSchema, { ...brief, template: 'week', week: Array(WEEK_ROWS_MAX + 1).fill(row) })).toBe(false);
  });
});

describe('AiShareRequestSchema and AiShareAnswerSchema', () => {
  it('take the flyer as the editor holds it, with the idea it came from when there was one', () => {
    const data = newFlyerData();
    expect(ok(AiShareRequestSchema, { hostel: null, template: 'activity', data })).toBe(true);
    expect(ok(AiShareRequestSchema, { hostel: 'adeje-nest', template: 'week', data, idea: 'Pool party' })).toBe(true);
    expect(ok(AiShareRequestSchema, { hostel: null, template: 'activity', data, idea: 'x'.repeat(AI_INPUT_MAX + 1) })).toBe(false);
    expect(ok(AiShareRequestSchema, { hostel: null, template: 'activity' })).toBe(false);
    expect(ok(AiShareAnswerSchema, { share: 'Hola' })).toBe(true);
    expect(ok(AiShareAnswerSchema, { share: 'x'.repeat(SHARE_MAX + 1) })).toBe(false);
    expect(ok(AiShareAnswerSchema, { share: 'Hola', brief })).toBe(false);
  });
});

describe('api/config’s ai block', () => {
  const flyer = { name: 'flyer', limit: 3, remaining: 2 };
  const share = { name: 'share', limit: 10, remaining: 10 };

  // The owner's answer (2026-10-06): every feature its own daily limit, so each is listed with its own.
  it('says only enabled: false when off, and each feature that runs with its limit and what is left when on', () => {
    expect(ok(AiConfigSchema, { enabled: false })).toBe(true);
    expect(ok(AiConfigSchema, { enabled: true, features: [flyer, share] })).toBe(true);
    expect(ok(AiConfigSchema, { enabled: true, features: [share] })).toBe(true);
    expect(ok(AiConfigSchema, { enabled: true, features: [{ ...share, remaining: 0 }] })).toBe(true);
    expect(ok(AiConfigSchema, { enabled: true })).toBe(false);
    expect(ok(AiConfigSchema, { enabled: true, features: [{ ...share, remaining: -1 }] })).toBe(false);
    expect(ok(AiConfigSchema, { enabled: true, features: [{ ...share, limit: 2.5 }] })).toBe(false);
    expect(ok(AiConfigSchema, { enabled: true, features: [{ name: 'share', limit: 3 }] })).toBe(false);
    expect(ok(AiConfigSchema, { enabled: true, features: [{ ...share, model: 'gpt' }] })).toBe(false);
  });

  it('holds no limit for the whole AI any more: one cap for every feature is the shape of an older release', () => {
    expect(ok(AiConfigSchema, { enabled: true, limit: 3, remaining: 2, features: [flyer, share] })).toBe(false);
    expect(ok(AiConfigSchema, { enabled: true, limit: 3, remaining: 2, features: ['flyer', 'share'] })).toBe(false);
    expect(ok(AiConfigSchema, { enabled: false, limit: 3, remaining: 3 })).toBe(false);
  });

  it('on means some feature runs: the list is never left out, empty, or of names no feature has', () => {
    expect(ok(AiConfigSchema, { enabled: true, features: [] })).toBe(false);
    expect(ok(AiConfigSchema, { enabled: true, features: [{ ...share, name: 'captions' }] })).toBe(false);
    expect(ok(AiConfigSchema, { enabled: true, features: ['share'] })).toBe(false);
    expect(ok(AiConfigSchema, { enabled: false, features: [] })).toBe(false);
  });

  it('is part of ApiConfigSchema', () => {
    const config = { backend: 'node', storage: 'sqlite', exporters: ['client'], limits: { maxUploadBytes: 1, maxPhotoEdge: 1 }, server: {} };
    expect(ok(ApiConfigSchema, config)).toBe(false);
    expect(ok(ApiConfigSchema, { ...config, ai: { enabled: false } })).toBe(true);
  });
});
