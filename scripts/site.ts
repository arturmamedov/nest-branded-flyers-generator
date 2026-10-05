import type { z } from 'zod';
import { ErrorEnvelopeSchema } from '../src/shared/schema.js';
import { WRITE_HEADERS } from '../src/shared/writeGuard.js';
import { basicAuthHeader, type RemoteSite } from './env.js';

/* One way for the Node-side scripts to call a deployment's API (flyers:post, ai:smoke), as the editor does: a path
   under the app root, the staff login on every request, the write header on a write, and the answer held to its
   shared schema. A refusal is said in the API's own words; anything else that came instead is named by its status. */

/** A call the site did not answer as asked: the status, the API's error code when the answer was its envelope, and
    the app root it pointed to instead when it redirected. */
export class SiteError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    readonly movedTo: string | null = null,
  ) {
    super(message);
    this.name = 'SiteError';
  }
}

export type SiteCall = <S extends z.ZodType>(method: string, path: string, schema: S, body?: unknown) => Promise<z.infer<S>>;

/** What failed a schema (an answer, or a file a script was given), each bad field by its dotted path, as the API names them. */
export const issues = (e: z.ZodError): string => e.issues.map((i) => `${i.path.join('.') || '_'}: ${i.message}`).join('; ');

/** The text as JSON, or undefined when it is none (a host's own error page, an empty body). */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

const excerpt = (text: string) => text.slice(0, 200);

/** Whether a word on a command line is a site's address, not a file or a folder. */
export const isAddress = (text: string): boolean => /^https?:\/\//i.test(text);

/** A site's address as an app root, ending in '/'; null when the text is no address. A login in it is refused
    (fetch() refuses such an address) and never repeated. */
export function appRoot(address: string): string | null {
  if (!isAddress(address) || !URL.canParse(address)) return null;
  const url = new URL(address);
  if (url.username || url.password) {
    throw new Error("A site's address must not carry a user or a password: the login comes from FLYERS_BASIC_USER and FLYERS_BASIC_PASSWORD in .env.");
  }
  return url.href.endsWith('/') ? url.href : `${url.href}/`;
}

const sameAddress = (a: string, b: string) => URL.canParse(a) && URL.canParse(b) && new URL(a).href === new URL(b).href;

/** The site at an app root, as a script reaches it. The login in .env belongs to the site .env names
    (FLYERS_BASE_URL): that address signs in with it, any other goes without. CONTRACT_* is never used: it may name
    a site for a read-only check. */
export function siteAt(root: string, flyers: RemoteSite | null): RemoteSite {
  return flyers !== null && sameAddress(flyers.baseUrl, root) ? { ...flyers, baseUrl: root } : { baseUrl: root, source: 'environment' };
}

/** Calls to one deployment. `timeoutMs` bounds each call (a TimeoutError); without it a call waits as fetch does. */
export function siteCaller(target: Pick<RemoteSite, 'baseUrl' | 'basicAuth'>, options: { timeoutMs?: number } = {}): SiteCall {
  const login = target.basicAuth ? basicAuthHeader(target.basicAuth) : {};
  return async (method, path, schema, body) => {
    const res = await fetch(new URL(path, target.baseUrl), {
      method,
      headers: { ...login, ...(body === undefined ? {} : { ...WRITE_HEADERS, 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Never followed: a POST that follows a 301 arrives as a GET, and the site then answers some other question.
      redirect: 'manual',
      ...(options.timeoutMs === undefined ? {} : { signal: AbortSignal.timeout(options.timeoutMs) }),
    });
    const text = await res.text();
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      // The app root the site points to: where it sent this path, less the path.
      const there = location === null ? null : new URL(location, target.baseUrl).href;
      const movedTo = there === null ? null : there.endsWith(path) ? there.slice(0, -path.length) : there;
      throw new SiteError(
        `${target.baseUrl} redirects to ${movedTo ?? 'another address'} (${res.status}): use that address. A write that follows a redirect arrives as a read.`,
        res.status,
        null,
        movedTo,
      );
    }
    const json = parseJson(text);
    if (!res.ok) {
      const envelope = ErrorEnvelopeSchema.safeParse(json);
      if (!envelope.success) throw new SiteError(`${method} ${path}: HTTP ${res.status} ${excerpt(text)}`, res.status);
      const { code, message, fields } = envelope.data.error;
      throw new SiteError(`${message}${fields ? ` ${JSON.stringify(fields)}` : ''}`, res.status, code);
    }
    if (json === undefined) throw new SiteError(`${method} ${path}: answered ${res.status}, but not with JSON: ${excerpt(text)}`, res.status);
    return schema.parse(json);
  };
}
