import { fetchJson, type FetchJson } from '../http.js';
import { LlmFailure, type LlmCall, type LlmProvider, type LlmResult, type ProviderConfig } from '../provider.js';
import { toAnthropicSchema } from '../providerSchema.js';
import { answerBody, answerJson, redact, usageOf } from './common.js';

/* Anthropic over the Messages API (docs read 2026-10-02): the system text as `system`, the turns as `messages`, the
   schema as `output_config.format` (GA, no beta header), and the effort knob as `output_config.effort` when set
   (Haiku 4.5 refuses it: leave AI_EFFORT unset there). The answer is the first `text` block; `stop_reason` says
   `refusal` or `max_tokens` when there is none to trust. The twin of php/src/Ai/AnthropicProvider.php;
   tests/fixtures/ai-anthropic.json pins both. */

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicResponse {
  type?: string;
  model?: string;
  error?: { message?: string } | null;
  content?: { type: string; text?: string }[];
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
}

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic' as const;
  readonly model: string;

  constructor(
    private readonly config: ProviderConfig,
    private readonly fetch: FetchJson = fetchJson,
  ) {
    this.model = config.model;
  }

  async complete(call: LlmCall): Promise<LlmResult> {
    const outputConfig: Record<string, unknown> = { format: { type: 'json_schema', schema: toAnthropicSchema(call.schema) } };
    if (this.config.effort) outputConfig.effort = this.config.effort;
    const body = {
      model: this.model,
      max_tokens: call.maxOutputTokens,
      system: call.system,
      messages: call.messages.map((m) => ({ role: m.role, content: m.content })),
      output_config: outputConfig,
    };

    const key = this.config.apiKey;
    const res = await this.fetch(ANTHROPIC_URL, {
      headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: call.timeoutMs,
    });
    const data = answerBody<AnthropicResponse>('Anthropic', res, key);
    if (data.type === 'error') throw new LlmFailure('provider', redact(`Anthropic failed the request: ${data.error?.message ?? 'no reason given'}`, key));

    const text = (data.content ?? []).find((block) => block.type === 'text')?.text;
    const raw = text === undefined ? null : redact(text, key);
    if (data.stop_reason === 'refusal') throw new LlmFailure('refused', 'Anthropic refused the request', raw);
    if (data.stop_reason === 'max_tokens') throw new LlmFailure('cut', 'Anthropic stopped at max_tokens', raw);
    if (text === undefined) throw new LlmFailure('bad_output', 'Anthropic answered without a text block', redact(res.text, key));
    return {
      json: answerJson(text, key),
      raw: text,
      usage: usageOf(data.usage?.input_tokens, data.usage?.output_tokens),
      model: data.model ?? this.model,
    };
  }
}
