import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dropNulls, toAnthropicSchema, toOpenAiSchema } from '../../server/ai/providerSchema.js';

/* One shared JSON Schema, two providers' dialects (tests/fixtures/ai-provider-schema.json, replayed by PHPUnit). */

type Vectors = {
  cases: { name: string; input: unknown; openai: unknown; anthropic: unknown }[];
  dropNulls: { name: string; case: string; in: unknown; out: unknown }[];
};
const vectors = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/ai-provider-schema.json'), 'utf8')) as Vectors;

describe('provider schemas', () => {
  for (const c of vectors.cases) {
    it(`OpenAI strict: ${c.name}`, () => {
      expect(toOpenAiSchema(c.input)).toEqual(c.openai);
    });
    it(`Anthropic: ${c.name}`, () => {
      expect(toAnthropicSchema(c.input)).toEqual(c.anthropic);
    });
  }

  it('leaves the input untouched', () => {
    const input = structuredClone(vectors.cases[0].input);
    toOpenAiSchema(input);
    toAnthropicSchema(input);
    expect(input).toEqual(vectors.cases[0].input);
  });

  for (const d of vectors.dropNulls) {
    it(`dropNulls: ${d.name}`, () => {
      const original = vectors.cases.find((c) => c.name === d.case)!.input;
      expect(dropNulls(d.in, original)).toEqual(d.out);
    });
  }
});
