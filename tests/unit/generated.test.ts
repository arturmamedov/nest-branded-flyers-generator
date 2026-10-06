import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, generate } from '../../scripts/gen-shared.js';
import { SEED_FILE } from '../../server/paths.js';
import type { Brief } from '../../src/shared/schema.js';
import { SeedFileSchema } from '../../src/shared/seed.js';
import { SHARE_SPANISH_BREAK } from '../../src/shared/share.js';
import { expectOwnersRules } from '../briefRules.js';

/* The committed copies of the shared sources of truth must be current: run
   `npm run gen` after changing src/shared. */

const outputs = generate();

describe('generated files', () => {
  for (const [rel, content] of Object.entries(outputs)) {
    it(`${rel} is up to date (npm run gen)`, () => {
      const file = join(ROOT, rel);
      expect(existsSync(file), `${rel} is missing`).toBe(true);
      expect(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).toBe(content);
    });
  }

  it('flyer.schema.json carries the trim flag PHP relies on', () => {
    const schema = JSON.parse(outputs['schema/flyer.schema.json']);
    expect(schema.properties.title['x-nest-trim']).toBe(true);
  });

  it('seed.schema.json accepts the real seed file (input mode: extra keys and defaults)', () => {
    const schema = JSON.parse(outputs['schema/seed.schema.json']);
    expect(schema.additionalProperties).toBeUndefined();
    expect(SeedFileSchema.safeParse(JSON.parse(readFileSync(SEED_FILE, 'utf8'))).success).toBe(true);
  });
});

describe('the AI bundle (schema/ai.json) and the ai block of shared.json', () => {
  const bundle = JSON.parse(outputs['schema/ai.json']);

  it('carries every prompt, with the limits the schema sets rendered into them', () => {
    expect(Object.keys(bundle.prompts)).toEqual(['flyer', 'share', 'photo']);
    expect(bundle.prompts.flyer).toContain('assumptions');
    expect(bundle.prompts.flyer).toContain('headline1');
    expect(bundle.prompts.flyer).toMatch(/eyebrow[^\n]*18/);
    expect(bundle.prompts.share).toContain(SHARE_SPANISH_BREAK);
    // The reader's prompt: its rule for a word it cannot read, and the idea box's limit, which the words must fit.
    expect(bundle.prompts.photo).toContain('[?]');
    expect(bundle.prompts.photo).toMatch(/\n## Limits\n[^\n]+\n- text: at most 4000 characters\n$/);
  });

  // The owner's answers (2026-10-06), from eleven pictures read for real (docs/reports/ai-flyer-from-photo.md, "The
  // real reads"): the fast models kept a beer brand printed on a chalkboard, the two rules about lines pulled them
  // two ways on a list of activities, and every model wrote out a sign that announces no event.
  it('the reader’s rules say what the real reads asked for', () => {
    const rules = bundle.prompts.photo as string;
    // Narrowed to boards the same day: on a poster it had also dropped the event's own sound system.
    expect(rules).toContain('a brand printed on a board or its frame');
    expect(rules).not.toContain('or a poster (a drinks brand');
    expect(rules).toContain('each activity on one line of its own with its day, its time and its place');
    expect(rules).toContain('A picture that announces no event: answer with an empty text');
    // The guard against emptying a real poster: one that names an activity and gives no date is still an event.
    expect(rules).toContain('A poster that names one activity is an event even when it gives no day, time or place');
  });

  // The owner's corrections (2026-10-06): made by hand on his own flyers on the live site (#4, #5 and #8), then
  // asked for as rules. A price the text does not give is not printed, where "Ask at reception" stood since
  // 2026-10-04; no full stop ends a title line; and the share text is English first, written for English speakers.
  it('the flyer’s and the share text’s rules follow the owner’s own flyers', () => {
    const flyer = bundle.prompts.flyer as string;
    expect(flyer).toContain('Leave `cost` out');
    expect(flyer).not.toContain('`Ask at reception`, never `Free`');
    expect(flyer).toContain('no full stop at the end');
    expect(flyer).not.toContain('usually ends with a full stop');
    // A start and an end print as one range, written as on his Teide flyer: it stood "one time, the start".
    expect(flyer).toContain('`17:45-23:00`');
    expect(flyer).not.toContain('One time, the start');
    expect((bundle.examples as { answer: { brief: Brief } }[]).map((e) => e.answer.brief.when)).toContain('Every day · 17:45-23:00');
    // So the end time is on the flyer, and is no longer among what the share text carries for want of room there.
    expect(flyer).not.toContain('(the end time,');
    // Both prompts write the same caption, so both say its order.
    for (const rules of [flyer, bundle.prompts.share as string]) {
      expect(rules).toContain(`English first, then a line with \`${SHARE_SPANISH_BREAK}\`, then Spanish`);
      expect(rules).not.toContain('Spanish first');
    }
  });

  it('every example follows them: an example is what the AI imitates', () => {
    expect(bundle.examples.length).toBeGreaterThan(0);
    for (const e of bundle.examples as { text: string; answer: { brief: Brief } }[]) expectOwnersRules(e.answer.brief, e.text.slice(0, 30));
  });

  it('the rules the examples are held to refuse a spaced hyphen or a long dash in WHEN, whatever stands on either side', () => {
    // Found in review (2026-10-06): the range was a rule of the prompt's and no example was held to it. Found in the
    // next one: the check wanted a digit on both sides of the dash, so a range of days passed it.
    for (const when of ['Every day · 17:45 – 23:00', 'Every day · 17:45 - 23:00', 'Today · 19:00—21:00', 'Mon 5/10 – Fri 9/10', 'Fri 9 – Sun 11 · 10:00', 'Mon - Fri · 10:00']) {
      expect(() => expectOwnersRules({ when } as Brief, when), when).toThrow();
    }
    // A day and its time are parted by the dot, never by a hyphen with spaces: that is no range, and is refused as well.
    expect(() => expectOwnersRules({ when: 'Sat 3/10 - 20:30' } as Brief, 'a hyphen for the dot')).toThrow();
    for (const when of ['Every day · 17:45-23:00', 'Today · 19:00', 'Saturday 3/10 · 20:30', 'Mon-Fri · 10:00']) {
      expect(() => expectOwnersRules({ when } as Brief, when), when).not.toThrow();
    }
  });

  it('the picture read answers its words alone, strictly: { text }', () => {
    expect(bundle.schemas.photoAnswer).toEqual({ type: 'object', properties: { text: { type: 'string', maxLength: 4000 } }, required: ['text'], additionalProperties: false });
  });

  it('turns every example file into a few-shot pair: the text, the brief and the assumptions', () => {
    const dir = join(ROOT, 'docs/ai-flyers/examples');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    expect(bundle.examples.map((e: { text: string }) => e.text)).toEqual(files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')).source));
    for (const e of bundle.examples) {
      expect(e.answer.brief.template).toMatch(/^(activity|week)$/);
      for (const a of e.answer.assumptions) expect(Object.keys(a)).toEqual(['field', 'note']);
    }
  });

  it('inlines the answer and request schemas: no $ref, no $schema, every object closed', () => {
    expect(Object.keys(bundle.schemas)).toEqual(['flyerAnswer', 'shareAnswer', 'photoAnswer', 'flyerRequest', 'shareRequest']);
    const text = JSON.stringify(bundle.schemas);
    expect(text).not.toContain('$ref');
    expect(text).not.toContain('$schema');
    expect(bundle.schemas.flyerAnswer.properties.brief.additionalProperties).toBe(false);
    expect(bundle.schemas.flyerAnswer.required).toEqual(['brief', 'assumptions']);
    // The share text is part of every flyer the model answers, so a provider's structured output must write it.
    expect([...bundle.schemas.flyerAnswer.properties.brief.required].sort()).toEqual(['hostel', 'share', 'template']);
  });

  it('refuses an example file without its share text: the few-shot shows the model the whole answer', () => {
    const dir = 'docs/ai-flyers/examples';
    const first = readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.json')).sort()[0];
    const read = (rel: string) => {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      if (rel !== `${dir}/${first}`) return text;
      const example = JSON.parse(text);
      delete example.brief.share;
      return JSON.stringify(example);
    };
    let refused = '';
    try {
      generate(read);
    } catch (e) {
      refused = (e as Error).message;
    }
    expect(refused).toContain(`${dir}/${first}`);
    expect(refused).toContain('brief.share');
  });

  it('shared.json tells PHP the AI constants', () => {
    expect(JSON.parse(outputs['schema/shared.json']).ai).toEqual({
      dailyLimit: 3,
      dailyLimitMax: 20,
      inputMax: 4000,
      assumptionsMax: 12,
      features: ['flyer', 'share', 'photo'],
      featureNouns: { flyer: 'AI flyers', share: 'AI share texts', photo: 'picture reads' },
      // The owner's answer (2026-10-06): the picture read alone, three tries for each read of its limit.
      triesPerLimit: { photo: 3 },
      dayZone: 'Atlantic/Canary',
      timeoutMs: 25000,
      maxOutputTokens: 8000,
      providers: ['openai', 'anthropic', 'fake'],
      defaultModel: { openai: 'gpt-6-luna', anthropic: 'claude-haiku-4-5' },
      // The owner's answer (2026-10-06, after the real reads): the picture read on each provider's middle model.
      featureDefaultModel: { openai: { photo: 'gpt-6.1-sol' }, anthropic: { photo: 'claude-sonnet-5-5' } },
      schemaNames: { flyer: 'nest_flyer_brief', share: 'nest_share_text', photo: 'nest_picture_text' },
      pictureMaxEdge: 2048,
      pictureDays: 30,
      pictureAsk: 'Write out the words of the event in this picture.',
      fake: {
        model: 'fake-1',
        unknownHostel: 'no-such-nest',
        markers: { invalid: '[[fake:invalid]]', unknownHostel: '[[fake:unknown-hostel]]', timeout: '[[fake:timeout]]', refused: '[[fake:refused]]' },
        pictureWidths: { invalid: 11, timeout: 12, refused: 13, noWords: 14 },
      },
    });
  });

  it('storage.schema.json describes the AI ledger file', () => {
    const def = JSON.parse(outputs['schema/storage.schema.json']).$defs.aiUsage;
    expect(def.type).toBe('array');
    expect(Object.keys(def.items.properties)).toEqual(['at', 'day', 'actorId', 'feature', 'provider', 'model', 'tokens', 'ok', 'input', 'output']);
    expect(def.items.properties.feature.enum).toEqual(['flyer', 'share', 'photo']);
  });
});
