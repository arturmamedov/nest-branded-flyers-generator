import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* A throwaway git repository in the temp folder, for the tests of what the scripts ask git (scripts/git.ts) and of the
   release tags (scripts/php/tag-release.ts). No test tags or commits in this repository: they get one of these. */

export interface TempRepo {
  dir: string;
  /** Runs git there and hands back its stdout, trimmed; a refusal throws with git's own words. */
  git(...args: string[]): string;
  /** Writes a file (its text is its name unless given). */
  write(file: string, text?: string): void;
  /** Writes a file, commits everything, and hands back the short commit. */
  commit(file: string, text?: string): string;
  remove(): void;
}

export function tempRepo(): TempRepo {
  const dir = mkdtempSync(join(tmpdir(), 'nest-flyers-git-'));
  // Its own identity, and no signing: a developer's global settings must not decide whether these tests pass.
  const settings = ['-c', 'user.name=Nest Flyers tests', '-c', 'user.email=tests@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false'];
  const git = (...args: string[]) => {
    const r = spawnSync('git', [...settings, ...args], { cwd: dir, encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim() || r.stdout.trim()}`);
    return r.stdout.trim();
  };
  const write = (file: string, text = file) => writeFileSync(join(dir, file), text);
  git('init', '-q');
  return {
    dir,
    git,
    write,
    commit(file, text) {
      write(file, text);
      git('add', '-A');
      git('commit', '-q', '-m', `add ${file}`);
      return git('rev-parse', '--short', 'HEAD');
    },
    remove: () => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
  };
}
