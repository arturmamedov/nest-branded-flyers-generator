import { LlmFailure } from './provider.js';

/* The one place the server touches the network for the AI: a JSON POST with a time limit. The adapters take it
   injected, so the shared vectors run against a stub and no test reaches a provider. */

export interface JsonRequest {
  headers: Record<string, string>;
  /** Already serialised, so what is sent is exactly what the vectors pin. */
  body: string;
  timeoutMs: number;
}

export interface JsonResponse {
  status: number;
  text: string;
}

export type FetchJson = (url: string, init: JsonRequest) => Promise<JsonResponse>;

/** Whatever came back, status and text, within the time limit; the adapter reads it. A limit passed or a host not
    reached is a typed failure, so the service can record and answer it as any other. */
export const fetchJson: FetchJson = async (url, init) => {
  try {
    const res = await fetch(url, { method: 'POST', headers: init.headers, body: init.body, signal: AbortSignal.timeout(init.timeoutMs) });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new LlmFailure('timeout', `No answer from ${new URL(url).host} within ${init.timeoutMs} ms`);
    throw new LlmFailure('network', `Could not reach ${new URL(url).host}: ${e instanceof Error ? e.message : String(e)}`);
  }
};
