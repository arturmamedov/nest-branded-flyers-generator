import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.js';
import { loadConfig, namedLooks } from '../../server/config.js';
import { APP_ROOT } from '../../server/paths.js';
import { createSqliteRepositories } from '../../server/storage/sqlite/index.js';
import { FIRST_LOOK, lookIds } from '../../src/shared/looks.js';
import { ApiConfigSchema } from '../../src/shared/schema.js';

/* The looks a site's staff may pick (LOOKS in .env), in the site's order: the first is what a new flyer starts in (the
   owner's answers 3 and 11). The vectors (tests/fixtures/looks-settings.json) are replayed by PHPUnit against
   config.php's 'looks', and carry the looks they are read against: this release has one, and a site's order and its
   first can only be seen with two. */

/** One row of the shared vectors: `env` is the variable's value (null: not set); a row without it is PHP's alone. */
interface Row {
  name: string;
  env?: string | null;
}
const vectors = JSON.parse(readFileSync(join(APP_ROOT, 'tests/fixtures/looks-settings.json'), 'utf8')) as {
  known: string[];
  accepted: (Row & { looks: string[] })[];
  refused: Row[];
};
/** The rows Node reads, each with the variable's value (undefined: not set). */
const rows = <R extends Row>(list: R[]) => list.filter((r) => r.env !== undefined).map((r) => ({ ...r, env: r.env ?? undefined }));

describe('LOOKS: the looks a site offers', () => {
  it.each(rows(vectors.accepted))('reads $name', ({ env, looks }) => {
    expect(namedLooks(env, vectors.known)).toEqual(looks);
  });

  it.each(rows(vectors.refused))('refuses $name, by the setting’s name', ({ env }) => {
    expect(() => namedLooks(env, vectors.known)).toThrow(/^LOOKS must name/);
  });

  it('names the looks there are in a refusal, never what was typed: a key pasted on the wrong line is not printed back', () => {
    expect(() => namedLooks('sk-live-secret-42', vectors.known)).toThrow('LOOKS must name looks from: hand-drawn, second, each once');
  });

  it('holds a site to the looks this release has: not set, the first look alone', () => {
    expect(loadConfig({}).looks).toEqual([FIRST_LOOK]);
    expect(loadConfig({ LOOKS: lookIds().join(',') }).looks).toEqual(lookIds());
    expect(() => loadConfig({ LOOKS: `${FIRST_LOOK},a-later-look` })).toThrow(/^LOOKS/);
  });

  it('is in .env.example, commented out', () => {
    expect(readFileSync(join(APP_ROOT, '.env.example'), 'utf8')).toMatch(/^# ?LOOKS=/m);
  });
});

describe('api/config lists the site’s looks', () => {
  const open: { close(): void }[] = [];
  afterEach(() => {
    for (const repos of open.splice(0)) repos.close();
  });
  /** api/config of an app given these looks (server/start.ts gives it the setting's), or none. */
  async function looksOf(looks?: string[]) {
    const repos = createSqliteRepositories({ file: ':memory:' });
    open.push(repos);
    const app = createApp({ repos, storage: 'sqlite', uploadsDir: join(tmpdir(), 'nest-flyers-looks-no-uploads'), buildId: 'test', looks });
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    return ApiConfigSchema.parse(res.body).looks;
  }

  it('in the site’s order, as the setting gave them: the first is a new flyer’s', async () => {
    expect(await looksOf(['second', FIRST_LOOK])).toEqual(['second', FIRST_LOOK]);
  });

  it('given none, the first look alone', async () => {
    expect(await looksOf()).toEqual([FIRST_LOOK]);
  });

  it('is part of ApiConfigSchema: one look at least, each a name', () => {
    const config = { backend: 'node', storage: 'sqlite', exporters: ['client'], limits: { maxUploadBytes: 1, maxPhotoEdge: 1 }, server: {}, ai: { enabled: false } };
    const ok = (c: unknown) => ApiConfigSchema.safeParse(c).success;
    expect(ok(config), 'a backend from before looks answers none').toBe(false);
    expect(ok({ ...config, looks: [FIRST_LOOK] })).toBe(true);
    expect(ok({ ...config, looks: [] })).toBe(false);
    expect(ok({ ...config, looks: FIRST_LOOK })).toBe(false);
  });
});
