import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SiteError, siteCaller, siteFirstLook } from '../../scripts/site.js';
import { FIRST_LOOK } from '../../src/shared/looks.js';

/* How the Node-side scripts call a deployment's API (scripts/site.ts, for flyers:post and ai:smoke): the staff login
   on every request, the write header only on a write, a refusal in the API's own words, and a redirect never
   followed. Against a local server, as ai-providers.test.ts tests fetchJson: nothing here leaves the machine. */

interface Seen {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/** A site at http://127.0.0.1:<port>/app/ that answers every request with `answer` and remembers what it was sent. */
async function site(answer: (res: ServerResponse, seen: Seen) => void) {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const request = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body };
      seen.push(request);
      answer(res, request);
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  closers.push(() => new Promise<void>((done) => (server.closeAllConnections(), server.close(() => done()))));
  return { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/app/`, seen };
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const page = (res: ServerResponse, status: number, html: string) => {
  res.writeHead(status, { 'content-type': 'text/html' });
  res.end(html);
};

/** What a call was refused with; a call that went through is the test's failure. */
const refusal = (call: Promise<unknown>): Promise<SiteError> =>
  call.then(
    () => {
      throw new Error('expected the call to be refused');
    },
    (e: unknown) => e as SiteError,
  );

const login = { user: 'staff', password: 'secret' };
/** base64("staff:secret"), worked out by hand. */
const SIGNED_IN = 'Basic c3RhZmY6c2VjcmV0';
const Hostels = z.array(z.strictObject({ slug: z.string() }));

describe('siteCaller', () => {
  it('reads under the app root, signed in, with nothing only a write needs', async () => {
    const { baseUrl, seen } = await site((res) => json(res, 200, [{ slug: 'adeje-nest' }]));
    expect(await siteCaller({ baseUrl, basicAuth: login })('GET', 'api/hostels', Hostels)).toEqual([{ slug: 'adeje-nest' }]);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/app/api/hostels', body: '' });
    expect(seen[0].headers.authorization).toBe(SIGNED_IN);
    expect(seen[0].headers['x-nest-flyers']).toBeUndefined();
    expect(seen[0].headers['content-type']).toBeUndefined();
  });

  it('writes with the write header, its JSON and the login; a site without a login gets none', async () => {
    const { baseUrl, seen } = await site((res) => json(res, 201, { id: 7 }));
    const Saved = z.strictObject({ id: z.number() });
    expect(await siteCaller({ baseUrl, basicAuth: login })('POST', 'api/flyers', Saved, { title: 'Yoga' })).toEqual({ id: 7 });
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/app/api/flyers', body: '{"title":"Yoga"}' });
    expect(seen[0].headers['x-nest-flyers']).toBe('1');
    expect(seen[0].headers['content-type']).toBe('application/json');
    expect(seen[0].headers.authorization).toBe(SIGNED_IN);

    await siteCaller({ baseUrl })('POST', 'api/flyers', Saved, { title: 'Yoga' });
    expect(seen[1].headers.authorization).toBeUndefined();
  });

  it('sends a form as it is: multipart, with the write header and the login, and no JSON type of its own', async () => {
    const { baseUrl, seen } = await site((res) => json(res, 200, { text: 'Yoga', remaining: 2 }));
    const Read = z.strictObject({ text: z.string(), remaining: z.number() });
    const form = new FormData();
    form.append('photo', new Blob([new Uint8Array([1, 2, 3])]), 'picture.jpg');
    expect(await siteCaller({ baseUrl, basicAuth: login })('POST', 'api/ai/photo', Read, form)).toEqual({ text: 'Yoga', remaining: 2 });
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/app/api/ai/photo' });
    expect(seen[0].headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(seen[0].body).toContain('name="photo"; filename="picture.jpg"');
    expect(seen[0].headers['x-nest-flyers']).toBe('1');
    expect(seen[0].headers.authorization).toBe(SIGNED_IN);
  });

  it('says a refusal in the API’s own words, with its status, its code and the fields it names', async () => {
    const { baseUrl } = await site((res, req) =>
      req.url.endsWith('quota')
        ? json(res, 429, { error: { code: 'ai_quota', message: 'Today’s 3 AI flyers are used up.' } })
        : json(res, 400, { error: { code: 'invalid', message: 'Check the idea text.', fields: { text: 'Too small' } } }),
    );
    const call = siteCaller({ baseUrl });
    const quota = await refusal(call('POST', 'api/quota', Hostels, {}));
    expect(quota).toBeInstanceOf(SiteError);
    expect(quota).toMatchObject({ status: 429, code: 'ai_quota', movedTo: null, message: 'Today’s 3 AI flyers are used up.' });
    const invalid = await refusal(call('POST', 'api/ai/flyer', Hostels, { text: '' }));
    expect(invalid).toMatchObject({ status: 400, code: 'invalid', message: 'Check the idea text. {"text":"Too small"}' });
  });

  it('names an error that is not the API’s (a host’s own page) by its status and what came', async () => {
    const { baseUrl } = await site((res) => page(res, 503, '<html>Service Unavailable</html>'));
    const e = await refusal(siteCaller({ baseUrl })('GET', 'api/config', Hostels));
    expect(e).toBeInstanceOf(SiteError);
    expect(e).toMatchObject({ status: 503, code: null, message: 'GET api/config: HTTP 503 <html>Service Unavailable</html>' });
  });

  it('never follows a redirect: it names the new address, and the write is not replayed there as a read', async () => {
    const moved = await site((res) => json(res, 200, []));
    const { baseUrl, seen } = await site((res, req) => {
      res.writeHead(301, { location: new URL(req.url.replace(/^\/app\//, ''), moved.baseUrl).href });
      res.end();
    });
    const e = await refusal(siteCaller({ baseUrl })('POST', 'api/ai/flyer', Hostels, { text: 'Yoga' }));
    expect(e).toBeInstanceOf(SiteError);
    expect(e).toMatchObject({ status: 301, code: null, movedTo: moved.baseUrl });
    expect(e.message).toContain(moved.baseUrl);
    expect(seen.map((s) => s.method)).toEqual(['POST']);
    expect(moved.seen).toEqual([]);
  });

  it('refuses a 200 that is not JSON, with what came instead', async () => {
    const { baseUrl } = await site((res) => page(res, 200, '<html>Coming soon</html>'));
    const e = await refusal(siteCaller({ baseUrl })('GET', 'api/hostels', Hostels));
    expect(e).toBeInstanceOf(SiteError);
    expect(e).toMatchObject({ status: 200, code: null });
    expect(e.message).toContain('Coming soon');
  });

  it('holds an answer to its schema', async () => {
    const { baseUrl } = await site((res) => json(res, 200, { hostels: [] }));
    await expect(siteCaller({ baseUrl })('GET', 'api/hostels', Hostels)).rejects.toBeInstanceOf(z.ZodError);
  });

  it('gives up after timeoutMs when it is given one', async () => {
    const { baseUrl } = await site(() => {
      /* never answers */
    });
    const e = await refusal(siteCaller({ baseUrl }, { timeoutMs: 100 })('GET', 'api/config', Hostels));
    expect((e as Error).name).toBe('TimeoutError');
  });
});

describe('siteFirstLook', () => {
  // The look flyers:post makes its flyers in (M6), read as the editor reads api/config. Against two looks of the
  // test's own (tests/fixtures/looks-settings.json): this release has one, and a site's first can only be seen with two.
  const known = ['hand-drawn', 'second'];
  const configOf = (looks?: unknown) => ({ backend: 'php', storage: 'json', ...(looks === undefined ? {} : { looks }) });

  it('asks the site, and takes the first look it names', async () => {
    const { baseUrl, seen } = await site((res) => json(res, 200, configOf(['second', 'hand-drawn'])));
    expect(await siteFirstLook(siteCaller({ baseUrl }), known)).toBe('second');
    expect(seen.map((s) => [s.method, s.url])).toEqual([['GET', '/app/api/config']]);
  });

  it('a site from before looks names none, and one in a later release may name a look this checkout does not have: the first look', async () => {
    for (const looks of [undefined, ['another', 'second']]) {
      const { baseUrl } = await site((res) => json(res, 200, configOf(looks)));
      expect(await siteFirstLook(siteCaller({ baseUrl }), known), JSON.stringify(looks)).toBe('hand-drawn');
    }
    const { baseUrl } = await site((res) => json(res, 200, configOf()));
    expect(await siteFirstLook(siteCaller({ baseUrl })), 'against this release’s own looks').toBe(FIRST_LOOK);
  });
});
