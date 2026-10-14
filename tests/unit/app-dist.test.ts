import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { computeBuildId, createApp } from '../../server/app.js';
import { createSqliteRepositories } from '../../server/storage/sqlite/index.js';

/* The built client an app serves is a folder it is given (AppDeps.distDir): dist/ unless told otherwise. The tests'
   own build (tests/proof/server.ts) serves dist-proof/, the release's build with the proof look in it. */

describe('the built client an app serves', () => {
  const made: string[] = [];
  const open: { close(): void }[] = [];
  afterEach(() => {
    for (const repos of open.splice(0)) repos.close();
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** A built client of its own: an index.html and a render page that say which build they are. */
  function build(name: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'nest-flyers-dist-'));
    made.push(dir);
    writeFileSync(join(dir, 'index.html'), `<!doctype html><title>${name}</title>`);
    writeFileSync(join(dir, 'render.html'), `<!doctype html><title>${name} render</title>`);
    return dir;
  }

  it('is the folder it is given', async () => {
    const repos = createSqliteRepositories({ file: ':memory:' });
    open.push(repos);
    const app = createApp({ repos, storage: 'sqlite', uploadsDir: join(tmpdir(), 'nest-flyers-dist-no-uploads'), buildId: 'test', distDir: build('the other build') });
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('the other build');
  });

  it('names its cache by that folder’s render page', () => {
    const one = build('one');
    const two = build('two');
    expect(computeBuildId(true, one)).toBe(computeBuildId(true, one));
    expect(computeBuildId(true, one)).not.toBe(computeBuildId(true, two));
  });
});
