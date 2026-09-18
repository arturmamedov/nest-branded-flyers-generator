import { describe, expect, it } from 'vitest';
import { config, fails, flyerInput, send } from './client.js';

/* The write guard and the order requests are checked in (docs/api-contract.md):
   the JSON body is parsed first, then the X-Nest-Flyers guard, then routing. */

describe('guard and errors', () => {
  // Probes that can't touch real data even if the guard is broken: an empty
  // body creates nothing, and no library holds flyer 99999999.
  it('refuses writes without X-Nest-Flyers', async () => {
    await fails(send('POST', 'api/flyers', {}, {}), 'forbidden');
    await fails(send('PUT', 'api/flyers/99999999', flyerInput(), {}), 'forbidden');
    await fails(send('DELETE', 'api/flyers/99999999', undefined, {}), 'forbidden');
    await fails(send('POST', 'api/photos', new FormData(), {}), 'forbidden');
    await fails(send('POST', 'api/nowhere', {}, {}), 'forbidden');
  });

  it('reads need no header', async () => {
    expect((await send('GET', 'api/hostels', undefined, {})).status).toBe(200);
  });

  it('answers unknown endpoints and methods with 404 JSON', async () => {
    await fails(send('GET', 'api/nowhere'), 'no_such_endpoint');
    await fails(send('POST', 'api/nowhere', {}), 'no_such_endpoint');
    await fails(send('PATCH', 'api/flyers/1', {}), 'no_such_endpoint');
    await fails(send('GET', 'api/photos'), 'no_such_endpoint');
  });

  it('parses the body before the guard: malformed JSON is 400 even without the header', async () => {
    await fails(send('POST', 'api/flyers', '{"title": ', {}), 'malformed');
    await fails(send('PUT', 'api/flyers/abc', '{"title": '), 'malformed');
  });

  it('/api/render exists only where the server can export', async () => {
    const { exporters } = await config();
    if (exporters.includes('server')) return; // covered with a real renderer by tests/render/render.spec.ts
    await fails(send('POST', 'api/render/1', { format: 'png' }), 'no_such_endpoint');
    await fails(send('POST', 'api/render/1', { format: 'gif' }), 'no_such_endpoint');
  });
});
