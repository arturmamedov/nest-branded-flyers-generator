import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DoodleSchema, HostelSchema } from '../../src/shared/schema.js';
import { ok, seed, send } from './client.js';

/* Hostels and doodles come from seed/hostels.json on every backend (Node seeds
   by CLI, PHP inside the first request), so the file says what to expect. */
const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

describe('catalogue', () => {
  it('GET api/hostels: the seeded hostels by sortOrder, then name', async () => {
    const hostels = await ok(send('GET', 'api/hostels'), z.array(HostelSchema));
    const expected = [...seed.hostels].sort((a, b) => a.sort_order - b.sort_order || byCodePoint(a.name, b.name));
    expect(hostels.map(({ id: _, ...h }) => h)).toEqual(
      expected.map((h) => ({ slug: h.slug, name: h.name, island: h.island, logoPath: h.logo_path, sortOrder: h.sort_order })),
    );
  });

  it('GET api/doodles: the built-ins, url = stored path, built-ins first, then kind, then label', async () => {
    const doodles = await ok(send('GET', 'api/doodles'), z.array(DoodleSchema));
    const builtins = doodles.filter((d) => d.builtin);
    expect(builtins.map((d) => d.slug).sort()).toEqual(seed.doodles.map((d) => d.slug).sort());
    for (const d of builtins) expect(d.url).toBe(seed.doodles.find((s) => s.slug === d.slug)!.path);
    const order = (d: z.infer<typeof DoodleSchema>) => [d.builtin ? 0 : 1, d.kind, d.label] as const;
    const sorted = [...doodles].sort((a, b) => {
      const [x, y] = [order(a), order(b)];
      return x[0] - y[0] || byCodePoint(x[1], y[1]) || byCodePoint(x[2], y[2]) || a.id - b.id;
    });
    expect(doodles).toEqual(sorted);
  });
});
