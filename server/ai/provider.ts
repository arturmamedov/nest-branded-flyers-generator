import { AI_SCHEMA_NAMES, type AiProvider } from '../../src/shared/ai.js';

/* The provider seam (docs/prompts/ai-assistant.md): one method, one shape in, one shape out, a typed failure.
   Three implementations behind it (providers/): OpenAI and Anthropic over HTTPS, and the fake the tests run on.
   Which one runs is configuration (server/config.ts, AI_PROVIDER), never code. PHP's Ai\LlmProvider is the twin. */

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** What a generation sends: the prompt (prompt.ts), the JSON Schema the answer must fit, and the two limits. */
export interface LlmCall {
  system: string;
  messages: LlmMessage[];
  /** The shared JSON Schema from schema/ai.json; each adapter turns it into its provider's dialect. */
  schema: unknown;
  /** OpenAI's name for the format; the fake reads the feature off it. */
  schemaName: string;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface LlmUsage {
  input: number;
  output: number;
}

export interface LlmResult {
  /** The answer, parsed; validated against the schema by the caller. */
  json: unknown;
  /** The answer as the model wrote it, for the ledger. */
  raw: string;
  usage: LlmUsage | null;
  /** The model that answered, as the provider names it (an alias resolved to its snapshot). */
  model: string;
}

export type LlmFailureReason = 'timeout' | 'network' | 'provider' | 'refused' | 'cut' | 'bad_output';

/** Why a call gave no usable answer. Never carries the key: the adapters redact whatever a provider echoed. */
export class LlmFailure extends Error {
  constructor(
    readonly reason: LlmFailureReason,
    message: string,
    /** What the model did write, when it wrote anything, for the ledger. */
    readonly raw: string | null = null,
  ) {
    super(message);
    this.name = 'LlmFailure';
  }
}

export interface LlmProvider {
  readonly name: AiProvider;
  readonly model: string;
  complete(call: LlmCall): Promise<LlmResult>;
}

/** What a real adapter is built from (server/config.ts). */
export interface ProviderConfig {
  apiKey: string;
  model: string;
  /** The provider's effort knob, sent only when set. */
  effort: string | null;
}

/** The names the two features' answer formats go by, on the wire and in the fake (src/shared/ai.ts, shared with PHP). */
export const SCHEMA_NAMES = AI_SCHEMA_NAMES;
