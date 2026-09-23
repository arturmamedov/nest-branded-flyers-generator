import { z } from 'zod';

/* seed/hostels.json: the hostels (only Artur supplies names) and the built-in
   doodles. Both backends upsert it by slug and never delete. PHP validates it
   against the generated schema/seed.schema.json. */

export const SeedFileSchema = z.object({
  hostels: z.array(
    z.object({
      slug: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string().min(1),
      island: z.string().min(1),
      logo_path: z.string().nullable().default(null),
      sort_order: z.number().default(0),
    }),
  ),
  doodles: z.array(z.object({ slug: z.string(), label: z.string(), path: z.string(), kind: z.string() })),
});
export type SeedFile = z.infer<typeof SeedFileSchema>;
