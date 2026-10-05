import { spawnSync } from 'node:child_process';
import { APP_ROOT } from '../server/paths.js';

/* What the scripts ask git, in one place: the commit a checkout is at and whether the checkout is exactly that commit
   (release.json's `commit`), so a release names its source one way, and the tags that mark a deployed release
   (scripts/php/tag-release.ts) can trust it. */

/** How a checkout that is not exactly its commit is marked in release.json: `1490956-dirty`. */
export const DIRTY = '-dirty';

/** git's answer on stdout, trimmed; null when git refused (no repository, a revision it does not know). */
export function git(args: readonly string[], cwd: string = APP_ROOT): string | null {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

export interface Checkout {
  /** The short commit, as `git rev-parse --short HEAD` prints it. */
  commit: string;
  /** Anything there that is not in that commit: a changed tracked file, or a new file git does not ignore (a new
      source file is in a build and not in the commit, which `git describe --dirty` never noticed). */
  dirty: boolean;
}

/** The commit a checkout is at; null outside a repository. */
export function checkout(cwd: string = APP_ROOT): Checkout | null {
  const commit = git(['rev-parse', '--short', 'HEAD'], cwd);
  if (!commit) return null;
  return { commit, dirty: git(['status', '--porcelain'], cwd) !== '' };
}

/** A checkout as release.json names it: `1490956`, or `1490956-dirty`. Always the commit, never a tag's name:
    `git describe` answers `release/<id>-3-g1490956` once an annotated tag is reachable, and every release after the
    first tagged one would have named a tag where it should name its source. */
export function describeCheckout(cwd: string = APP_ROOT): string | undefined {
  const at = checkout(cwd);
  return at ? `${at.commit}${at.dirty ? DIRTY : ''}` : undefined;
}
