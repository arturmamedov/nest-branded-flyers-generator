import { readFileSync } from 'node:fs';
import { expect, inject } from 'vitest';
import type { z } from 'zod';
import type { BasicAuth } from '../../scripts/env.js';
import { SEED_FILE } from '../../server/paths.js';
import { API_ERRORS, apiError, type ApiErrorKey } from '../../src/shared/errors.js';
import { SAMPLE_FLYERS } from '../../src/shared/samples.js';
import { SeedFileSchema } from '../../src/shared/seed.js';
import { ApiConfigSchema, ErrorEnvelopeSchema, FlyerSavedSchema, type ApiConfig, type FlyerInput } from '../../src/shared/schema.js';

/* The HTTP contract suite's client. Every backend (Node, PHP, a live deploy via
   CONTRACT_BASE_URL) is reached the same way: paths relative to the app root,
   so a subfolder install works, and every answer parsed with the shared
   response schemas, so a backend can't drift in shape unnoticed. */

declare module 'vitest' {
  export interface ProvidedContext {
    /** The app root, ending in '/'. */
    baseUrl: string;
    /** Where the PHP stage lives on disk (php project only), for planting files. */
    stageDir?: string;
    /** The staff login, when the backend is behind Basic auth (php-basic, or a locked deployment). */
    basicAuth?: BasicAuth;
    /** True when the suite runs against a deployment (CONTRACT_BASE_URL) rather than a local backend. */
    remote?: boolean;
  }
}

export const base = () => {
  const b = inject('baseUrl');
  return b.endsWith('/') ? b : b + '/';
};
export const url = (path: string) => new URL(path.replace(/^\/+/, ''), base()).href;
export const WRITE = { 'X-Nest-Flyers': '1' };

/** The Authorization header for a Basic login. A credential in the URL is no alternative: fetch() refuses such a URL. */
export const basicAuthHeader = ({ user, password }: BasicAuth) => ({
  Authorization: `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`,
});

/** The login travels on every request, apart from `headers`: a test that drops the write header (`{}`) must still
    get past the lock, or it would prove the lock instead of the write guard. */
const signedIn = (): Record<string, string> => {
  const login = inject('basicAuth');
  return login ? basicAuthHeader(login) : {};
};

export async function send(method: string, path: string, body?: unknown, headers: Record<string, string> = WRITE): Promise<Response> {
  const init: RequestInit = { method, headers: { ...signedIn(), ...headers } };
  if (body instanceof FormData) init.body = body;
  else if (typeof body === 'string') {
    init.body = body;
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  return fetch(url(path), init);
}

/** A 2xx answer, parsed with its shared schema and required to be exactly that shape. */
export async function ok<S extends z.ZodType>(res: Response | Promise<Response>, schema: S, status = 200): Promise<z.infer<S>> {
  const r = await res;
  const text = await r.text();
  expect(r.status, text).toBe(status);
  expect(r.headers.get('content-type') ?? '').toMatch(/^application\/json/);
  const raw = JSON.parse(text);
  const parsed = schema.parse(raw);
  expect(parsed, 'the answer carries exactly the schema’s keys').toStrictEqual(raw);
  return parsed;
}

/** A non-2xx answer: the shared envelope, with status, code and message from the catalogue. */
export async function fails(res: Response | Promise<Response>, key: ApiErrorKey, vars?: Record<string, string | number>) {
  const r = await res;
  const text = await r.text();
  const spec = apiError(key, vars);
  expect(r.status, text).toBe(spec.status);
  const { error } = ErrorEnvelopeSchema.parse(JSON.parse(text));
  expect(error.code).toBe(spec.code);
  if (vars || !/\{\w+\}/.test(API_ERRORS[key].message)) expect(error.message).toBe(spec.message);
  if (spec.fields) expect(error.fields).toEqual(spec.fields);
  return error;
}

let configCache: Promise<ApiConfig> | null = null;
export const config = () => (configCache ??= ok(send('GET', 'api/config'), ApiConfigSchema));

/** Unique per run, so the suite is safe against a live library. */
export const unique = (label: string) => `contract ${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** seed/hostels.json: every backend serves exactly these hostels. */
export const seed = SeedFileSchema.parse(JSON.parse(readFileSync(SEED_FILE, 'utf8')));
export const hostelName = (slug: string) => seed.hostels.find((h) => h.slug === slug)!.name;

export const sample = SAMPLE_FLYERS[0];
export const flyerInput = (over: Partial<FlyerInput> = {}): FlyerInput => ({
  title: unique('flyer'),
  hostel: null,
  template: 'activity',
  data: structuredClone(sample.data),
  photoId: null,
  ...over,
});

/** Creates a flyer and remembers it; archive() cleans up everything a file created. */
export function flyers() {
  const created: number[] = [];
  return {
    created,
    async create(input: unknown = flyerInput()) {
      const saved = await ok(send('POST', 'api/flyers', input), FlyerSavedSchema, 201);
      created.push(saved.id);
      return saved;
    },
    async archiveAll() {
      for (const id of created) await send('DELETE', `api/flyers/${id}`);
    },
  };
}

export async function upload(bytes: Uint8Array | Buffer, name = 'photo.jpg', field = 'photo'): Promise<Response> {
  const form = new FormData();
  form.append(field, new Blob([new Uint8Array(bytes)]), name);
  return send('POST', 'api/photos', form);
}
