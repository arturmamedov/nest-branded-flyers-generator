/* One shared JSON Schema (schema/ai.json, generated from src/shared/schema.ts), two providers' dialects of it.
   OpenAI's strict mode wants every property in `required`, an optional one as a null union, and nothing open;
   Anthropic takes optional properties but refuses length limits, which move into the description so the model still
   knows them. Both lose `$schema` and the `x-*` keywords zod adds for PHP. The answer is validated against the
   original schema afterwards, limits included, so a stripped limit is still enforced. The twin is PHP's
   Ai\ProviderSchema; tests/fixtures/ai-provider-schema.json holds the vectors both pass. */

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The limits Anthropic refuses, and the note that replaces each in the description. */
const LIMIT_NOTES: Record<string, (n: number) => string> = {
  minLength: (n) => `At least ${n} character${n === 1 ? '' : 's'}.`,
  maxLength: (n) => `At most ${n} character${n === 1 ? '' : 's'}.`,
  minItems: (n) => `At least ${n} item${n === 1 ? '' : 's'}.`,
  maxItems: (n) => `At most ${n} item${n === 1 ? '' : 's'}.`,
  minimum: (n) => `At least ${n}.`,
  maximum: (n) => `At most ${n}.`,
};

/** Drops the keywords no provider takes, without touching the input. */
function clean(node: Json): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema' || key.startsWith('x-')) continue;
    out[key] = value;
  }
  return out;
}

/** Walks a schema, rewriting every object, array and union node with `rewrite` after its children are done. */
function walk(node: unknown, rewrite: (node: Json) => Json): unknown {
  if (!isObject(node)) return node;
  const out = clean(node);
  if (isObject(out.properties)) {
    const properties: Json = {};
    for (const [name, prop] of Object.entries(out.properties)) properties[name] = walk(prop, rewrite);
    out.properties = properties;
  }
  if (out.items !== undefined) out.items = walk(out.items, rewrite);
  if (Array.isArray(out.anyOf)) out.anyOf = out.anyOf.map((branch) => walk(branch, rewrite));
  return rewrite(out);
}

const allowsNull = (prop: unknown): boolean =>
  isObject(prop) && Array.isArray(prop.anyOf) && prop.anyOf.some((b) => isObject(b) && b.type === 'null');

/** An optional property as OpenAI's strict mode takes it: required, and null for "absent". */
const nullable = (prop: unknown): unknown => (allowsNull(prop) ? prop : { anyOf: [prop, { type: 'null' }] });

/** The schema as `text.format` (`strict: true`) on the Responses API takes it. */
export function toOpenAiSchema(schema: unknown): unknown {
  return walk(schema, (node) => {
    if (!isObject(node.properties)) return node;
    const required = new Set(Array.isArray(node.required) ? (node.required as string[]) : []);
    const properties: Json = {};
    for (const [name, prop] of Object.entries(node.properties)) properties[name] = required.has(name) ? prop : nullable(prop);
    return { ...node, properties, required: Object.keys(properties), additionalProperties: false };
  });
}

/** The schema as `output_config.format` on the Messages API takes it. */
export function toAnthropicSchema(schema: unknown): unknown {
  return walk(schema, (node) => {
    const out: Json = {};
    const notes: string[] = [];
    for (const [key, value] of Object.entries(node)) {
      if (key in LIMIT_NOTES && typeof value === 'number') notes.push(LIMIT_NOTES[key](value));
      else out[key] = value;
    }
    if (notes.length) out.description = [out.description, ...notes].filter(Boolean).join(' ');
    return isObject(out.properties) ? { ...out, additionalProperties: false } : out;
  });
}

/** The branch of a nullable property that describes its value. */
const valueSchema = (schema: unknown): Json | undefined => {
  if (!isObject(schema)) return undefined;
  if (Array.isArray(schema.anyOf)) return schema.anyOf.find((b) => isObject(b) && b.type !== 'null') as Json | undefined;
  return schema;
};

/** An OpenAI answer read back against the original schema: a null where the key was optional means the key is absent,
    and goes; a null where the key was required stays, for the validator to refuse. A new value: the answer is untouched. */
export function dropNulls(value: unknown, schema: unknown): unknown {
  const s = valueSchema(schema);
  if (Array.isArray(value)) return value.map((item) => dropNulls(item, s?.items));
  if (!isObject(value) || !s || !isObject(s.properties)) return value;
  const required = new Set(Array.isArray(s.required) ? (s.required as string[]) : []);
  const out: Json = {};
  for (const [key, v] of Object.entries(value)) {
    if (v === null && !required.has(key)) continue;
    out[key] = dropNulls(v, s.properties[key]);
  }
  return out;
}
