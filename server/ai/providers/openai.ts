import { fetchJson, type FetchJson } from '../http.js';
import { LlmFailure, type LlmCall, type LlmPart, type LlmProvider, type LlmResult, type ProviderConfig } from '../provider.js';
import { dropNulls, toOpenAiSchema } from '../providerSchema.js';
import { answerBody, answerJson, modelOf, redact, usageOf } from './common.js';

/* OpenAI over the Responses API (docs read 2026-10-02): the system text as `instructions`, the turns as `input`, the
   schema as `text.format` in strict mode, `store: false` so staff text is not kept on OpenAI's side, and the effort
   knob as `reasoning.effort` when set. The answer is the `output_text` of the message item; a `refusal` item, an
   `incomplete` status or a `failed` one is a typed failure. The twin of php/src/Ai/OpenAiProvider.php;
   tests/fixtures/ai-openai.json pins both. */

export const OPENAI_URL = 'https://api.openai.com/v1/responses';

interface OpenAiContent {
  type: string;
  text?: string;
  refusal?: string;
}

interface OpenAiResponse {
  status?: string;
  model?: string;
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; content?: OpenAiContent[] }[];
  usage?: { input_tokens?: number; output_tokens?: number } | null;
}

/** A part of a user turn (docs read 2026-10-06): a picture is an `input_image` whose `image_url` is a data URL, at
    `high` detail so small print is read; text is an `input_text`. */
const part = (p: LlmPart) =>
  p.type === 'image'
    ? { type: 'input_image', image_url: `data:${p.mediaType};base64,${p.data}`, detail: 'high' }
    : { type: 'input_text', text: p.text };

export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai' as const;
  readonly model: string;

  constructor(
    private readonly config: ProviderConfig,
    private readonly fetch: FetchJson = fetchJson,
  ) {
    this.model = config.model;
  }

  async complete(call: LlmCall): Promise<LlmResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      instructions: call.system,
      input: call.messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.map(part) })),
      text: { format: { type: 'json_schema', name: call.schemaName, schema: toOpenAiSchema(call.schema), strict: true } },
      max_output_tokens: call.maxOutputTokens,
      store: false,
    };
    if (this.config.effort) body.reasoning = { effort: this.config.effort };

    const key = this.config.apiKey;
    const res = await this.fetch(OPENAI_URL, {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: call.timeoutMs,
    });
    const data = answerBody<OpenAiResponse>('OpenAI', res, key);
    if (data.status === 'failed') throw new LlmFailure('provider', redact(`OpenAI failed the request: ${data.error?.message ?? 'no reason given'}`, key));

    const content = (data.output ?? []).find((item) => item.type === 'message')?.content ?? [];
    const refusal = content.find((c) => c.type === 'refusal');
    if (refusal) throw new LlmFailure('refused', redact(`OpenAI refused: ${refusal.refusal ?? ''}`, key));
    const text = content.find((c) => c.type === 'output_text')?.text;
    if (data.status === 'incomplete') {
      throw new LlmFailure('cut', `OpenAI stopped early (${data.incomplete_details?.reason ?? 'no reason given'})`, text === undefined ? null : redact(text, key));
    }
    if (text === undefined) throw new LlmFailure('bad_output', 'OpenAI answered without a message', redact(res.text, key));
    return {
      // A null where the schema had an optional key is strict mode's "absent": it goes before validation.
      json: dropNulls(answerJson(text, key), call.schema),
      raw: text,
      usage: usageOf(data.usage?.input_tokens, data.usage?.output_tokens),
      model: modelOf(data.model, this.model),
    };
  }
}
