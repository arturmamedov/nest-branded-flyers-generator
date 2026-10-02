import { LlmFailure, type LlmUsage } from '../provider.js';

/* What the two HTTPS adapters share: reading a provider's answer without letting the key out. */

/** Whatever the provider echoed, without the key: nothing that leaves an adapter may carry it (a 401 quotes it). */
export const redact = (text: string, key: string): string => (key ? text.split(key).join('[key]') : text);

/** The text as JSON, or undefined when it is not. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** The model's text as the JSON it was asked for; anything else is bad output, kept raw for the ledger. */
export function answerJson(text: string, key: string): unknown {
  const json = parseJson(text);
  if (json === undefined) throw new LlmFailure('bad_output', 'The model did not answer with JSON', redact(text, key));
  return json;
}

/** A status the provider gave instead of an answer, with its own words when it sent any, the key taken out. */
export function providerFailure(who: string, status: number, text: string, key: string): LlmFailure {
  const body = parseJson(text) as { error?: { message?: unknown } } | undefined;
  const said = typeof body?.error?.message === 'string' ? body.error.message : text.slice(0, 200);
  return new LlmFailure('provider', redact(`${who} answered ${status}: ${said}`, key));
}

/** The token counts, when the provider reported both. */
export function usageOf(input: unknown, output: unknown): LlmUsage | null {
  return typeof input === 'number' && typeof output === 'number' ? { input, output } : null;
}
