import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { APP_ROOT } from '../../server/paths.js';
import { flyersTarget, type RemoteSite } from '../env.js';
import { DIRTY, git, mustGit } from '../git.js';
import { appRoot, isAddress, siteAt, siteCaller } from '../site.js';
import { MANIFEST_FILE } from './layout.js';

/* npm run deploy:tag -- <deploy folder | site address> [--date YYYY-MM-DD]

   A git tag for a deployed release: `release/<id>`, annotated, on the commit its release.json names, with the site and
   the day in its message. A release's id names a build and its commit names the source, so the tag is what ties a
   site to the code it runs. npm run deploy:update makes one for a local copy; after an upload by SFTP this command
   asks the site itself which release it runs (docs/deploy.md). A tag is never moved, and never pushed from here. */

export const USAGE = 'Usage: npm run deploy:tag -- <deploy folder | site address> [--date YYYY-MM-DD]';

/** What release.json says of a release, as far as a tag needs it. */
export interface DeployedRelease {
  id: string;
  /** `1490956`, or `1490956-dirty`; absent when it was built outside a git checkout. */
  commit?: string;
  builtAt?: string;
}

export interface TagOutcome {
  tag: string;
  /** The short commit the tag marks. */
  commit: string;
  /** False when the tag was already there, on that commit. */
  made: boolean;
}

/** The tag a deployed release goes by. */
export const releaseTag = (id: string): string => `release/${id}`;

/** A day as the tag's message writes it. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** This machine's day, `YYYY-MM-DD`. */
export const today = (): string => new Date().toLocaleDateString('sv-SE');

/**
 * Tags the commit a deployed release was built from. Refused, each with its sentence: a release built from a checkout
 * that held uncommitted changes (that commit is not what was shipped), one that names no commit, a commit this
 * checkout does not have, and an id already tagged on another commit. A second call for the same release makes nothing.
 *
 * @param where the site it runs on, the day it went up there, and (for the tests) the day of tagging
 */
export function tagRelease(release: DeployedRelease, where: { site: string; date: string; today?: string }, cwd: string = APP_ROOT): TagOutcome {
  const { id } = release;
  // The id becomes a ref name: only what writeManifest makes is one.
  if (!/^[0-9a-f]{12}$/.test(id)) throw new Error('That is no release id: release.json gives twelve characters, 0-9 and a-f.');
  if (!DAY.test(where.date)) throw new Error(`The day a release went up is written YYYY-MM-DD.\n${USAGE}`);
  if (!release.commit) throw new Error(`Release ${id} names no commit: it was built outside a git checkout, so there is nothing to tag.`);
  if (release.commit.endsWith(DIRTY)) {
    throw new Error(
      `Release ${id} was built from a checkout with uncommitted changes (${release.commit}): that commit is not what was shipped. Commit, build again, and tag that release.`,
    );
  }
  const full = git(['rev-parse', '--verify', '--quiet', `${release.commit}^{commit}`], cwd);
  if (!full) throw new Error(`This checkout does not have commit ${release.commit}, which release ${id} was built from.`);
  const commit = mustGit(['rev-parse', '--short', full], cwd);

  const tag = releaseTag(id);
  const marked = git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`], cwd);
  if (marked === full) return { tag, commit, made: false };
  if (marked) throw new Error(`${tag} already marks ${mustGit(['rev-parse', '--short', marked], cwd)}, not ${commit}: a tag is never moved.`);

  const taggedOn = where.today ?? today();
  const message = [
    `Release ${id} on ${where.site}, ${where.date}`,
    '',
    [release.builtAt ? `Built ${release.builtAt} from ${commit}.` : `Built from ${commit}.`, taggedOn === where.date ? '' : `Tagged ${taggedOn}.`].filter(Boolean).join(' '),
  ].join('\n');
  mustGit(['tag', '-a', tag, full, '-m', message], cwd);
  return { tag, commit, made: true };
}

const ReleaseSchema = z.object({ id: z.string(), commit: z.string().optional(), builtAt: z.string().optional() });
/** api/config, as far as the release goes: read loosely, since a release from before a newer block answers without it. */
const ConfigSchema = z.object({ server: z.object({ release: ReleaseSchema.optional() }).optional() });

const picked = (r: z.infer<typeof ReleaseSchema>): DeployedRelease => ({ id: r.id, ...(r.commit ? { commit: r.commit } : {}), ...(r.builtAt ? { builtAt: r.builtAt } : {}) });

/**
 * The release a target runs, and what to call the target in the tag's message. A folder (a local copy of a
 * deployment, or a release just built) says it in its release.json; a site says it in api/config, which is asked once
 * and changes nothing there.
 */
export async function releaseOf(target: string, flyers: RemoteSite | null = flyersTarget()): Promise<{ release: DeployedRelease; site: string }> {
  if (isAddress(target)) {
    const root = appRoot(target);
    if (root === null) throw new Error(`${target} is no site's address.\n${USAGE}`);
    const config = await siteCaller(siteAt(root, flyers), { timeoutMs: 30_000 })('GET', 'api/config', ConfigSchema);
    const release = config.server?.release;
    if (!release) throw new Error(`${root} names no release in api/config: only the PHP backend ships one (a Node server has none).`);
    return { release: picked(release), site: root };
  }
  const folder = resolve(target);
  const file = join(folder, MANIFEST_FILE);
  if (!existsSync(file)) throw new Error(`${folder} has no ${MANIFEST_FILE}: name a deployment's folder, a release's folder, or a site's address.`);
  const release = ReleaseSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!release.success) throw new Error(`${file} is not a release's ${MANIFEST_FILE}.`);
  return { release: picked(release.data), site: folder };
}

/** What a run says of its outcome. */
export function describeTag(outcome: TagOutcome, site: string): string {
  return outcome.made
    ? `Tagged ${outcome.tag} on ${outcome.commit}: ${site}. Tags are not pushed: git push origin ${outcome.tag} when you want it there.`
    : `${outcome.tag} already marks ${outcome.commit}: nothing to do.`;
}

async function main(argv: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: { date: { type: 'string' } } });
  } catch (e) {
    throw new Error(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
  }
  if (parsed.positionals.length !== 1) throw new Error(USAGE);
  const { release, site } = await releaseOf(parsed.positionals[0]);
  console.log(describeTag(tagRelease(release, { site, date: parsed.values.date ?? today() }), site));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  });
}
