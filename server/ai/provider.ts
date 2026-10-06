import { AI_SCHEMA_NAMES, type AiProvider } from '../../src/shared/ai.js';

/* The provider seam (docs/prompts/ai-assistant.md): one method, one shape in, one shape out, a typed failure.
   Three implementations behind it (providers/): OpenAI and Anthropic over HTTPS, and the fake the tests run on.
   Which one runs is configuration (server/config.ts, AI_PROVIDER), never code. PHP's Ai\LlmProvider is the twin. */

/** A piece of a turn that is more than text. A picture travels as base64 with its type; its size in pixels goes
    with it for the ledger and the fake, and no adapter sends it. */
export type LlmPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; data: string; width: number; height: number };

/** A turn: text, or parts when it carries a picture (the picture first, as both providers read best). A text turn
    goes out as the string it is. The one message type: prompt.ts builds these, the adapters send them. */
export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string | LlmPart[];
}

/** The text of a turn: the string, or its text parts joined. What the fake reads its markers from. */
export const textOf = (content: LlmMessage['content']): string =>
  typeof content === 'string' ? content : content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');

/** What a generation sends: the prompt (prompt.ts), the model to ask, the JSON Schema the answer must fit, and the
    two limits. */
export interface LlmCall {
  /** The model asked for: the feature's own (AiSettings.models). One provider and one key serve every model. */
  model: string;
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
  complete(call: LlmCall): Promise<LlmResult>;
}

/** What a real adapter is built from (server/config.ts). The model is the call's to name. */
export interface ProviderConfig {
  apiKey: string;
  /** The provider's effort knob, sent only when set. */
  effort: string | null;
}

/** The names the features' answer formats go by, on the wire and in the fake (src/shared/ai.ts, shared with PHP). */
export const SCHEMA_NAMES = AI_SCHEMA_NAMES;
