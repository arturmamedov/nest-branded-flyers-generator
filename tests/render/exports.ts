import type { APIRequestContext } from '@playwright/test';
import { PNG } from 'pngjs';
import { expect } from '../browser';
import type { CanvasId } from '../../src/shared/layout';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* A server export read as pixels, for the specs that hold a client export or a look's ground to it. */

/** A server export of a saved flyer, as a PNG. */
export async function serverPng(request: APIRequestContext, id: number, canvas: CanvasId): Promise<PNG> {
  const res = await request.post(`/api/render/${id}`, { headers: WRITE_HEADERS, data: { format: 'png', canvas } });
  expect(res.status(), `server export ${canvas}`).toBe(200);
  return PNG.sync.read(await res.body());
}

/** A pixel of a PNG, as #RRGGBB. */
export const pixel = (png: PNG, x: number, y: number) =>
  `#${[0, 1, 2].map((c) => png.data[(y * png.width + x) * 4 + c].toString(16).padStart(2, '0')).join('')}`.toUpperCase();
