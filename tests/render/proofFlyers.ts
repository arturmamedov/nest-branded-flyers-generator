import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '../browser';
import { samples } from './drawnChecks';
import { PROOF_LOOK_ID } from '../proof/id';
import type { Body } from '../../src/shared/layout';
import type { FlyerPayload, FlyerSaved } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* Flyers in the proof look, for the looks specs (tests/render/looks*.spec.ts), on the tests' own server. This process
   never registers the proof look (Playwright lists every project's specs in one process): what the server answers
   about a proof flyer is read as it came, never through this process's schema, which has one look. */

/** The payload as the proof look draws it. */
export const inProof = (payload: FlyerPayload): FlyerPayload => ({ ...payload, flyer: { ...payload.flyer, data: { ...payload.flyer.data, look: PROOF_LOOK_ID } } });

/** How many copies this worker has saved: a copy's title is its own, so a library card is found by it alone. */
let copies = 0;

/** A seeded sample saved again, in a look (the proof look unless told), under a title of its own, in a photo mode (or
    its rows). `keep` is handed the id, for the spec to archive it afterwards. */
export async function sampleCopy(
  request: APIRequestContext,
  sample: string,
  body: Body,
  keep: (id: number) => void,
  look = PROOF_LOOK_ID,
): Promise<{ id: number; title: string }> {
  const all = await samples(request);
  const source = all.find((p) => p.flyer.title === sample)!;
  const photo = body === 'none' || body === 'week' ? null : (source.photo ?? all.find((p) => p.photo)!.photo)!.id;
  const data = { ...source.flyer.data, look, ...(body === 'week' ? {} : { photoMode: body }) };
  const title = `${look} · ${sample} / ${body} #${++copies}`;
  const res = await request.post('/api/flyers', { headers: WRITE_HEADERS, data: { title, hostel: source.flyer.hostel, template: data.template, data, photoId: photo } });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = (await res.json()) as FlyerSaved;
  keep(id);
  return { id, title };
}

/** api/config answered as a site that names only these looks, in this order. */
export async function siteNames(page: Page, looks: string[]) {
  await page.route('**/api/config', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), looks } });
  });
}
