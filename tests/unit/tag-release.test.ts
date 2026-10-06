import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { releaseOf, releaseTag, tagRelease } from '../../scripts/php/tag-release.js';
import { tempRepo, type TempRepo } from '../tempRepo.js';

/* A git tag for each deployed release (scripts/php/tag-release.ts): `release/<id>`, annotated, on the commit that
   release.json names, with the site and the day in its message. A release's id names a build and its commit names
   the source, so the tag is what ties a site to the code it runs. Every test here tags a throwaway repository. */

const ID = '0123456789ab';
const where = { site: 'https://nestpass.ai/activities/', date: '2026-10-01', today: '2026-10-05' };

// Room, as git.test.ts has and for the same reason: a throwaway repository and a dozen runs of git per test, which
// took up to 12 s beside the rest of `npm test` on 2026-10-06.
describe('a tag for a deployed release', { timeout: 30_000 }, () => {
  let repo: TempRepo;
  beforeEach(() => {
    repo = tempRepo();
  });
  afterEach(() => repo.remove());

  const tags = () => repo.git('tag', '-l').split('\n').filter(Boolean);

  it('is an annotated release/<id> on the commit the release names, with the site and the day in its message', () => {
    const built = repo.commit('a.txt');
    repo.commit('b.txt'); // the checkout has moved on since the build
    const outcome = tagRelease({ id: ID, commit: built, builtAt: '2026-10-01T16:45:21.872Z' }, where, repo.dir);
    expect(outcome).toEqual({ tag: releaseTag(ID), commit: built, made: true });
    expect(releaseTag(ID)).toBe(`release/${ID}`);
    expect(repo.git('cat-file', '-t', releaseTag(ID)), 'annotated, not lightweight').toBe('tag');
    expect(repo.git('rev-parse', '--short', `${releaseTag(ID)}^{commit}`)).toBe(built);
    const message = repo.git('tag', '-l', '--format=%(contents)', releaseTag(ID));
    expect(message).toContain(`Release ${ID}`);
    expect(message).toContain('https://nestpass.ai/activities/');
    expect(message).toContain('2026-10-01');
    expect(message, 'tagged after the day it went up, and says so').toContain('Tagged 2026-10-05');
  });

  it('does not say when it was tagged if that is the day it went up', () => {
    const built = repo.commit('a.txt');
    tagRelease({ id: ID, commit: built }, { ...where, today: where.date }, repo.dir);
    expect(repo.git('tag', '-l', '--format=%(contents)', releaseTag(ID))).not.toContain('Tagged');
  });

  it('makes nothing the second time, and says it made nothing', () => {
    const built = repo.commit('a.txt');
    tagRelease({ id: ID, commit: built }, where, repo.dir);
    expect(tagRelease({ id: ID, commit: built }, where, repo.dir)).toEqual({ tag: releaseTag(ID), commit: built, made: false });
    expect(tags()).toEqual([releaseTag(ID)]);
  });

  it('refuses a release built from a checkout that held uncommitted changes: that commit is not what was shipped', () => {
    const built = repo.commit('a.txt');
    expect(() => tagRelease({ id: ID, commit: `${built}-dirty` }, where, repo.dir)).toThrow(/uncommitted changes/);
    expect(tags()).toEqual([]);
  });

  it('refuses a release that names no commit', () => {
    repo.commit('a.txt');
    expect(() => tagRelease({ id: ID }, where, repo.dir)).toThrow(/names no commit/);
    expect(tags()).toEqual([]);
  });

  it('refuses a commit this checkout does not have', () => {
    repo.commit('a.txt');
    expect(() => tagRelease({ id: ID, commit: 'deadbee' }, where, repo.dir)).toThrow(/does not have commit deadbee/);
    expect(tags()).toEqual([]);
  });

  it('never moves a tag: the same id on another commit is refused', () => {
    const first = repo.commit('a.txt');
    const second = repo.commit('b.txt');
    tagRelease({ id: ID, commit: first }, where, repo.dir);
    expect(() => tagRelease({ id: ID, commit: second }, where, repo.dir)).toThrow(new RegExp(`already marks ${first}`));
    expect(repo.git('rev-parse', '--short', `${releaseTag(ID)}^{commit}`)).toBe(first);
  });

  it('refuses what is no release id or no day, before git hears of it', () => {
    const built = repo.commit('a.txt');
    expect(() => tagRelease({ id: '../heads/main', commit: built }, where, repo.dir)).toThrow(/release id/);
    expect(() => tagRelease({ id: ID, commit: built }, { ...where, date: 'yesterday' }, repo.dir)).toThrow(/YYYY-MM-DD/);
    expect(tags()).toEqual([]);
  });
});

describe('the release a folder or a site runs', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const folder = (release?: unknown) => {
    const dir = mkdtempSync(join(tmpdir(), 'nest-flyers-tag-'));
    dirs.push(dir);
    if (release !== undefined) writeFileSync(join(dir, 'release.json'), JSON.stringify(release));
    return dir;
  };
  const serve = async (answer: unknown, status = 200) => {
    const server = createServer((req, res) => {
      res.writeHead(req.url === '/app/api/config' ? status : 404, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const { port } = server.address() as AddressInfo;
    return { root: `http://127.0.0.1:${port}/app/`, close: () => new Promise<void>((done) => (server.closeAllConnections(), server.close(() => done()))) };
  };

  it('is what the folder’s release.json says, and the folder is the site', async () => {
    const dir = folder({ id: ID, builtAt: '2026-10-03T23:31:28.944Z', commit: '1490956', guards: [], files: {} });
    expect(await releaseOf(dir, null)).toEqual({ release: { id: ID, commit: '1490956', builtAt: '2026-10-03T23:31:28.944Z' }, site: dir });
  });

  it('says so when the folder has no release.json', async () => {
    await expect(releaseOf(folder(), null)).rejects.toThrow(/no release\.json/);
  });

  it('is what a site’s api/config says, whatever else that release answers there', async () => {
    // As the live site answered on 2026-10-05: a release from before the AI, so no `ai` block at all.
    const site = await serve({ backend: 'php', storage: 'json', server: { php: '8.4.26', release: { id: ID, builtAt: '2026-10-01T16:45:21.872Z', commit: '0df2709', missing: [], changed: [] } } });
    try {
      expect(await releaseOf(site.root.slice(0, -1), null)).toEqual({ release: { id: ID, commit: '0df2709', builtAt: '2026-10-01T16:45:21.872Z' }, site: site.root });
    } finally {
      await site.close();
    }
  });

  it('says so when a site names no release: a Node server has none', async () => {
    const site = await serve({ backend: 'node', server: { node: 'v22.0.0' } });
    try {
      await expect(releaseOf(site.root, null)).rejects.toThrow(/names no release/);
    } finally {
      await site.close();
    }
  });
});
