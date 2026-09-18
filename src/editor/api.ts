import type { FlyerInput, FlyerListItem, FlyerPayload, Hostel, PhotoInfo } from '../shared/schema';

/* Every write carries X-Nest-Flyers: the server's cross-site-write guard. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { 'X-Nest-Flyers': '1' } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new ApiError(res.status, err?.error?.message ?? `Request failed (${res.status})`, err?.error?.fields);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  hostels: () => call<Hostel[]>('GET', '/api/hostels'),
  flyers: (hostel?: string) => call<FlyerListItem[]>('GET', '/api/flyers' + (hostel ? `?hostel=${encodeURIComponent(hostel)}` : '')),
  flyer: (id: number) => call<FlyerPayload>('GET', `/api/flyers/${id}`),
  create: (input: FlyerInput) => call<{ id: number }>('POST', '/api/flyers', input),
  update: (id: number, input: FlyerInput) => call<{ id: number }>('PUT', `/api/flyers/${id}`, input),
  archive: (id: number) => call<void>('DELETE', `/api/flyers/${id}`),
  uploadPhoto: (file: File) => {
    const form = new FormData();
    form.append('photo', file);
    return call<PhotoInfo>('POST', '/api/photos', form);
  },
  async render(id: number, format: 'png' | 'jpg'): Promise<{ blob: Blob; filename: string }> {
    const res = await fetch(`/api/render/${id}`, {
      method: 'POST',
      headers: { 'X-Nest-Flyers': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ format }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new ApiError(res.status, err?.error?.message ?? `Export failed (${res.status})`);
    }
    const disposition = res.headers.get('Content-Disposition') || '';
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `flyer.${format}`;
    return { blob: await res.blob(), filename };
  },
};
