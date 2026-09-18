import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, generate } from '../../scripts/gen-shared.js';
import { SEED_FILE } from '../../server/paths.js';
import { SeedFileSchema } from '../../src/shared/seed.js';

/* The committed copies of the shared sources of truth must be current: run
   `npm run gen` after changing src/shared. */

const outputs = generate();

describe('generated files', () => {
  for (const [rel, content] of Object.entries(outputs)) {
    it(`${rel} is up to date (npm run gen)`, () => {
      const file = join(ROOT, rel);
      expect(existsSync(file), `${rel} is missing`).toBe(true);
      expect(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).toBe(content);
    });
  }

  it('flyer.schema.json carries the trim flag PHP relies on', () => {
    const schema = JSON.parse(outputs['schema/flyer.schema.json']);
    expect(schema.properties.title['x-nest-trim']).toBe(true);
  });

  it('seed.schema.json accepts the real seed file (input mode: extra keys and defaults)', () => {
    const schema = JSON.parse(outputs['schema/seed.schema.json']);
    expect(schema.additionalProperties).toBeUndefined();
    expect(SeedFileSchema.safeParse(JSON.parse(readFileSync(SEED_FILE, 'utf8'))).success).toBe(true);
  });
});
