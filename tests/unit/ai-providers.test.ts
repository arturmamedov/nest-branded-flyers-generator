import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../server/ai/bundle.js';
import { fetchJson, type FetchJson } from '../../server/ai/http.js';
import { LlmFailure, type LlmCall } from '../../server/ai/provider.js';
import { AnthropicProvider } from '../../server/ai/providers/anthropic.js';
import { FakeProvider } from '../../server/ai/providers/fake.js';
import { OpenAiProvider } from '../../server/ai/providers/openai.js';
import { AI_FAKE, AI_PICTURE_ASK } from '../../src/shared/ai.js';

/* The provider adapters against the shared vectors (tests/fixtures/ai-openai.json, ai-anthropic.json), which PHPUnit
   replays against the PHP adapters: the request each builds for one call, byte for byte, and what each recorded answer
   becomes. The HTTP seam is stubbed; fetchJson itself is proved against a local server. */

type Config = { apiKey: string; model: string; effort: string | null };
type Answer = { name: string; status: number; body?: unknown; text?: string; result?: unknown; failure?: string };
type Vectors = {
  call: LlmCall;
  /** A call whose turn carries a picture; a request entry replays it by naming it. */
  picture: LlmCall;
  requests: { name: string; call?: 'picture'; config: Config; url: string; headers: Record<string, string>; body: unknown }[];
  answers: Answer[];
};
const fixture = (name: string): Vectors => JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures', name), 'utf8')) as Vectors;
const textOf = (a: Answer) => a.text ?? JSON.stringify(a.body);

/** A fetch that records what it is sent and answers with one canned response. */
function stub(answer: { status: number; text: string }) {
  const seen: { url: string; init: Parameters<FetchJson>[1] }[] = [];
  const fetch: FetchJson = async (url, init) => {
    seen.push({ url, init });
    return answer;
  };
  return { fetch, seen };
}

const failureOf = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as LlmFailure);

const adapters = [
  { name: 'openai', file: 'ai-openai.json', make: (c: Config, f: FetchJson) => new OpenAiProvider({ apiKey: c.apiKey, effort: c.effort }, f) },
  { name: 'anthropic', file: 'ai-anthropic.json', make: (c: Config, f: FetchJson) => new AnthropicProvider({ apiKey: c.apiKey, effort: c.effort }, f) },
] as const;

for (const adapter of adapters) {
  describe(`the ${adapter.name} adapter`, () => {
    const v = fixture(adapter.file);
    const good = v.answers.find((a) => a.result)!;
    /** The call names its model (a feature's own, since 2026-10-06): an entry's `config.model` is the one it names. */
    const call = (config: Config, which: 'call' | 'picture' = 'call'): LlmCall => ({ ...v[which], model: config.model });

    for (const r of v.requests) {
      it(`sends ${r.name}`, async () => {
        const { fetch, seen } = stub({ status: good.status, text: textOf(good) });
        await adapter.make(r.config, fetch).complete(call(r.config, r.call));
        expect(seen).toHaveLength(1);
        expect(seen[0].url).toBe(r.url);
        expect(seen[0].init.headers).toEqual(r.headers);
        expect(JSON.parse(seen[0].init.body)).toEqual(r.body);
        expect(seen[0].init.timeoutMs).toBe(v.call.timeoutMs);
      });
    }

    for (const a of v.answers) {
      it(`reads ${a.name}`, async () => {
        const provider = adapter.make(v.requests[0].config, stub({ status: a.status, text: textOf(a) }).fetch);
        if (a.result) {
          expect(await provider.complete(call(v.requests[0].config))).toEqual(a.result);
          return;
        }
        const failure = await failureOf(provider.complete(call(v.requests[0].config)));
        expect(failure).toBeInstanceOf(LlmFailure);
        expect(failure!.reason).toBe(a.failure);
        // The key never leaves the adapter, whatever the provider echoed back.
        expect(`${failure!.message} ${failure!.raw ?? ''}`).not.toContain('test-key');
      });
    }

    it('names itself for the ledger', () => {
      expect(adapter.make(v.requests[0].config, stub({ status: 200, text: '' }).fetch).name).toBe(adapter.name);
    });

    it('asks for the model the call names, and reports it when the answer names none', async () => {
      const { fetch, seen } = stub({ status: good.status, text: JSON.stringify({ ...(good.body as object), model: undefined }) });
      const result = await adapter.make(v.requests[0].config, fetch).complete({ ...v.call, model: 'a-feature-s-own' });
      expect(JSON.parse(seen[0].init.body).model).toBe('a-feature-s-own');
      expect(result.model).toBe('a-feature-s-own');
    });
  });
}

describe('fetchJson', () => {
  const listen = async (handler: Parameters<typeof createServer>[1]) => {
    const server = createServer(handler);
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const { port } = server.address() as AddressInfo;
    return { port, close: () => new Promise<void>((done) => (server.closeAllConnections(), server.close(() => done()))) };
  };

  it('gives up after timeoutMs with a timeout failure', async () => {
    const { port, close } = await listen(() => {
      /* never answers */
    });
    try {
      const failure = await failureOf(fetchJson(`http://127.0.0.1:${port}/`, { headers: {}, body: '{}', timeoutMs: 100 }));
      expect(failure).toBeInstanceOf(LlmFailure);
      expect(failure!.reason).toBe('timeout');
    } finally {
      await close();
    }
  });

  it('reports a connection nobody answers as a network failure', async () => {
    const { port, close } = await listen(() => {});
    await close();
    const failure = await failureOf(fetchJson(`http://127.0.0.1:${port}/`, { headers: {}, body: '{}', timeoutMs: 2000 }));
    expect(failure).toBeInstanceOf(LlmFailure);
    expect(failure!.reason).toBe('network');
  });

  // Its own limits are wide on purpose: a local server answers in milliseconds, but on a busy machine (the storage
  // tests beside it) this once crossed the 2000 ms it used to give fetchJson. The limits are not what it tests.
  it('hands back the status and the body text, whatever the status', async () => {
    const { port, close } = await listen((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        res.writeHead(418, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ got: JSON.parse(body), auth: req.headers.authorization }));
      });
    });
    try {
      const answer = await fetchJson(`http://127.0.0.1:${port}/`, { headers: { Authorization: 'Bearer k' }, body: '{"a":1}', timeoutMs: 20_000 });
      expect(answer.status).toBe(418);
      expect(JSON.parse(answer.text)).toEqual({ got: { a: 1 }, auth: 'Bearer k' });
    } finally {
      await close();
    }
  }, 30_000);
});

describe('the fake provider', () => {
  const bundle = loadBundle();
  const fake = new FakeProvider(bundle);
  const call = (text: string, schemaName = 'nest_flyer_brief'): LlmCall => ({
    system: '',
    messages: [
      { role: 'user', content: 'an example' },
      { role: 'assistant', content: '{}' },
      { role: 'user', content: text },
    ],
    schema: {},
    schemaName,
    model: 'fake-1',
    maxOutputTokens: 1,
    timeoutMs: 1,
  });

  it('answers a flyer call with the first example, and a share call with its share text', async () => {
    const flyer = await fake.complete(call('Yoga at 9'));
    expect(flyer).toEqual({ json: bundle.examples[0].answer, raw: JSON.stringify(bundle.examples[0].answer), usage: { input: 10, output: 20 }, model: 'fake-1' });
    const share = await fake.complete(call('fields', 'nest_share_text'));
    expect(share.json).toEqual({ share: bundle.examples[0].answer.brief.share });
  });

  it('is steered by a marker in the last user turn', async () => {
    expect((await fake.complete(call('Yoga [[fake:invalid]]'))).json).toEqual({ brief: 42, assumptions: [] });
    expect((await fake.complete(call('x [[fake:invalid]]', 'nest_share_text'))).json).toEqual({ share: 42 });
    const unknown = (await fake.complete(call('Yoga [[fake:unknown-hostel]]'))).json as { brief: { hostel: string } };
    expect(unknown.brief.hostel).toBe('no-such-nest');
    expect((await failureOf(fake.complete(call('[[fake:timeout]]'))))!.reason).toBe('timeout');
    expect((await failureOf(fake.complete(call('[[fake:refused]]'))))!.reason).toBe('refused');
  });

  /** A picture read's call: one turn, a picture this wide and the line that asks for its words. */
  const read = (width: number, ask = AI_PICTURE_ASK): LlmCall => ({
    ...call(''),
    messages: [{ role: 'user', content: [{ type: 'image', mediaType: 'image/png', data: 'AAAA', width, height: 8 }, { type: 'text', text: ask }] }],
    schemaName: 'nest_picture_text',
  });

  // What the brief asks of it: a read followed by Generate gives that example's flyer.
  it('answers a picture read with the first example’s text: the words that example’s flyer is made from', async () => {
    const answer = await fake.complete(read(640));
    expect(answer).toEqual({ json: { text: bundle.examples[0].text }, raw: JSON.stringify({ text: bundle.examples[0].text }), usage: { input: 10, output: 20 }, model: 'fake-1' });
    expect((await fake.complete(call(bundle.examples[0].text))).json).toEqual(bundle.examples[0].answer);
  });

  it('is steered by the picture’s width on a read, which has no typed text to carry a marker', async () => {
    const { invalid, timeout, refused, noWords } = AI_FAKE.pictureWidths;
    expect((await fake.complete(read(invalid))).json).toEqual({ text: 42 });
    expect((await fake.complete(read(noWords))).json).toEqual({ text: '' });
    expect((await failureOf(fake.complete(read(timeout))))!.reason).toBe('timeout');
    expect((await failureOf(fake.complete(read(refused))))!.reason).toBe('refused');
    // The height is no steer, and a width means nothing to the other features.
    expect((await fake.complete({ ...read(640), messages: [{ role: 'user', content: [{ type: 'image', mediaType: 'image/png', data: 'AAAA', width: 640, height: timeout }, { type: 'text', text: AI_PICTURE_ASK }] }] })).json).toEqual({ text: bundle.examples[0].text });
    expect((await fake.complete({ ...read(timeout), schemaName: 'nest_flyer_brief' })).json).toEqual(bundle.examples[0].answer);
  });

  it('names itself, and never touches the network', () => {
    expect(fake.name).toBe('fake');
  });
});
