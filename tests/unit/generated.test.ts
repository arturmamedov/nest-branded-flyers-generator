import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, generate } from '../../scripts/gen-shared.js';
import { SEED_FILE } from '../../server/paths.js';
import { SeedFileSchema } from '../../src/shared/seed.js';

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
    expect(bundle.prompts.share).toContain('---');
    // The reader's prompt: its rule for a word it cannot read, and the idea box's limit, which the words must fit.
    expect(bundle.prompts.photo).toContain('[?]');
    expect(bundle.prompts.photo).toMatch(/\n## Limits\n[^\n]+\n- text: at most 4000 characters\n$/);
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
