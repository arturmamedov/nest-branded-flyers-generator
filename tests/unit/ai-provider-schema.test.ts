import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../server/ai/bundle.js';
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

/** How many properties of a schema are optional (not in their object's `required`), and how many nodes are a union
    (`anyOf`, or a list of types), counted through every property, item and branch. */
function counts(schema: unknown): { optional: number; unions: number } {
  const total = { optional: 0, unions: 0 };
  const visit = (node: unknown) => {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) return;
    const n = node as Record<string, unknown>;
    if (Array.isArray(n.anyOf) || Array.isArray(n.type)) total.unions++;
    if (typeof n.properties === 'object' && n.properties !== null) {
      const required = new Set(Array.isArray(n.required) ? (n.required as string[]) : []);
      for (const [name, property] of Object.entries(n.properties)) {
        if (!required.has(name)) total.optional++;
        visit(property);
      }
    }
    visit(n.items);
    if (Array.isArray(n.anyOf)) n.anyOf.forEach(visit);
  };
  visit(schema);
  return total;
}

describe('what a provider refuses outright', () => {
  // Anthropic's structured outputs take at most 24 optional properties and 16 union-typed ones in a request's schemas
  // (its docs, read 2026-10-02), and answer 400 past either: every generation would fail, on that provider alone, and
  // no vector would show it. A field added to the brief is counted here first.
  it('the answers stay within Anthropic’s limits on optional and union-typed properties', () => {
    const { schemas } = loadBundle();
    for (const [name, schema] of Object.entries({ flyerAnswer: schemas.flyerAnswer, shareAnswer: schemas.shareAnswer })) {
      const { optional, unions } = counts(toAnthropicSchema(schema));
      expect(optional, `${name}: optional properties`).toBeLessThanOrEqual(24);
      expect(unions, `${name}: union-typed properties`).toBeLessThanOrEqual(16);
    }
  });
});
