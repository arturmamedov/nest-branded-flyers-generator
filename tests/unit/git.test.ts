import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkout, describeCheckout } from '../../scripts/git.js';
import { tempRepo, type TempRepo } from '../tempRepo.js';

/* The commit a build names in release.json (scripts/git.ts). It used to be `git describe --always --dirty`, which
   answers with a tag's name as soon as an annotated tag is reachable: the release tags themselves would have turned
   every later release's `commit` into `release/<id>-3-g1490956`. */

// Each test makes a throwaway repository and runs git a dozen times. Alone a test takes one or two seconds; beside
// the rest of `npm test`, right after a render suite, they took 8 to 10 s on 2026-10-06, past vitest's 5 s default.
describe('the commit a checkout is at', { timeout: 30_000 }, () => {
  let repo: TempRepo;
  beforeEach(() => {
    repo = tempRepo();
  });
  afterEach(() => repo.remove());

  it('is the short commit, and clean, right after a commit', () => {
    const commit = repo.commit('a.txt');
    expect(checkout(repo.dir)).toEqual({ commit, dirty: false });
    expect(describeCheckout(repo.dir)).toBe(commit);
  });

  it('is still the commit, never a tag’s name, with an annotated tag on it or behind it', () => {
    const first = repo.commit('a.txt');
    repo.git('tag', '-a', 'release/0123456789ab', '-m', 'a release');
    expect(repo.git('describe', '--always', '--dirty'), 'what git describe says here').toBe('release/0123456789ab');
    expect(describeCheckout(repo.dir)).toBe(first);

    const second = repo.commit('b.txt');
    expect(repo.git('describe', '--always', '--dirty')).toBe(`release/0123456789ab-1-g${second}`);
    expect(describeCheckout(repo.dir)).toBe(second);
  });

  it('is dirty when a tracked file has changed', () => {
    const commit = repo.commit('a.txt');
    repo.write('a.txt', 'changed');
    expect(checkout(repo.dir)).toEqual({ commit, dirty: true });
    expect(describeCheckout(repo.dir)).toBe(`${commit}-dirty`);
  });

  it('is dirty with a new file git does not ignore: it would be in a build and not in the commit', () => {
    const commit = repo.commit('.gitignore', 'release/\n');
    mkdirSync(join(repo.dir, 'release'));
    repo.write('release/built.txt');
    expect(describeCheckout(repo.dir), 'an ignored file changes nothing').toBe(commit);
    repo.write('new-source.ts');
    expect(describeCheckout(repo.dir)).toBe(`${commit}-dirty`);
  });

  // Seen on 2026-10-05: another session saved an example under docs/ while a release was due, and every tag would have
  // been refused. No release is made from documentation: an example reaches one only through schema/ai.json, which
  // is tracked, and npm run build:php refuses stale generated files.
  it('stays clean when only documentation differs: a new file or a changed one under docs/', () => {
    mkdirSync(join(repo.dir, 'docs'));
    const commit = repo.commit('docs/deploy.md');
    mkdirSync(join(repo.dir, 'docs', 'examples'));
    repo.write('docs/examples/new.json');
    repo.write('docs/deploy.md', 'changed');
    expect(checkout(repo.dir)).toEqual({ commit, dirty: false });
    repo.write('docs.txt');
    expect(checkout(repo.dir), 'a file beside docs/ is not documentation').toEqual({ commit, dirty: true });
  });

  it('is nothing outside a repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nest-flyers-no-git-'));
    try {
      expect(checkout(dir)).toBeNull();
      expect(describeCheckout(dir)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
