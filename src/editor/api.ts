import { apiUrl } from '../flyer/urls';
import type { ApiConfig, FlyerInput, FlyerListItem, FlyerPayload, FlyerSaved, Hostel, PhotoInfo } from '../shared/schema';

/* Every write carries X-Nest-Flyers: the server's cross-site-write guard.
   Paths are relative to the app root, so a subfolder install works. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

/** The server's {error:{message}} if the body has one, else a generic line. */
export async function errorFrom(res: Response, fallback: string): Promise<ApiError> {
  const err = await res.json().catch(() => null);
  return new ApiError(res.status, err?.error?.message ?? `${fallback} (${res.status})`, err?.error?.fields);
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { 'X-Nest-Flyers': '1' } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  const res = await fetch(apiUrl(path), init);
  if (!res.ok) throw await errorFrom(res, 'Request failed');
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  config: () => call<ApiConfig>('GET', 'config'),
  hostels: () => call<Hostel[]>('GET', 'hostels'),
  flyers: (hostel?: string) => call<FlyerListItem[]>('GET', 'flyers' + (hostel ? `?hostel=${encodeURIComponent(hostel)}` : '')),
  flyer: (id: number) => call<FlyerPayload>('GET', `flyers/${id}`),
  create: (input: FlyerInput) => call<FlyerSaved>('POST', 'flyers', input),
  update: (id: number, input: FlyerInput) => call<FlyerSaved>('PUT', `flyers/${id}`, input),
  archive: (id: number) => call<void>('DELETE', `flyers/${id}`),
  uploadPhoto: (photo: Blob, name: string) => {
    const form = new FormData();
    form.append('photo', photo, name);
    return call<PhotoInfo>('POST', 'photos', form);
  },
};
