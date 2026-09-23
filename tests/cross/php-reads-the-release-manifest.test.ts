import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GUARD_FILES, MANIFEST_FILE } from '../../scripts/php/layout.js';
import type { Manifest } from '../../scripts/php/manifest.js';
import { startStage, type ServedStage } from '../../scripts/php/serve.js';
import { ApiConfigSchema } from '../../src/shared/schema.js';

/* release.json across the language line: scripts/php/manifest.ts writes it
   into every stage, and the app (HostFacts → ReleaseCheck) reads it back in
   api/config. The PHPUnit contract case pins the reader's verdicts on a
   hand-made manifest; this proves the one the build really writes reads the
   same, and names exactly what an upload lost. */

let served: ServedStage;
let manifest: Manifest;

beforeAll(async () => {
  served = await startStage({ prefix: 'nest-flyers-manifest-' });
  manifest = JSON.parse(readFileSync(join(served.stage, MANIFEST_FILE), 'utf8')) as Manifest;
});
afterAll(() => served?.server.stop());

async function release(): Promise<Record<string, unknown>> {
  const res = await fetch(new URL('api/config', served.server.baseUrl));
  const text = await res.text();
  expect(res.status, text).toBe(200);
  const c = ApiConfigSchema.parse(JSON.parse(text));
  expect(c.server.accessRule).toBe('allowIps');
  return c.server.release as Record<string, unknown>;
}

describe('PHP reads the manifest the build wrote', () => {
  it('lists the guards, and every one of them shipped', () => {
    expect(manifest.guards).toEqual(GUARD_FILES);
    for (const guard of GUARD_FILES) expect(manifest.files[guard], guard).toBeDefined();
  });

  it('finds an intact stage intact, and says which release it is', async () => {
    expect(await release()).toEqual({
      id: manifest.id,
      builtAt: manifest.builtAt,
      commit: manifest.commit ?? null,
      missing: [],
      changed: [],
      missingGuards: [],
      htaccess: 'as shipped',
    });
  });

  it('names exactly the ordinary file and the dotfile an upload lost, and nothing else', async () => {
    const lost = ['assets/art/spark-teal.png', 'schema/.htaccess'];
    for (const path of lost) {
      expect(manifest.files[path], path).toBeDefined();
      rmSync(join(served.stage, ...path.split('/')));
    }
    expect(await release()).toMatchObject({ missing: lost, changed: [], missingGuards: ['schema/.htaccess'] });
  });
});
