import { copyFileSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { buildPhpRelease } from '../build-php.js';
import { BACKUP_MARKER, backupDeployment, type BackupInfo } from './backup-deploy.js';
import { openDeployment, runCommand, within } from './deployment.js';
import { MANIFEST_FILE } from './layout.js';
import { describeSize, type Manifest } from './manifest.js';
import { describeTag, tagRelease, today, type DeployedRelease, type TagOutcome } from './tag-release.js';

/* npm run deploy:update -- <deploy folder> [--to <backups folder>]

   A newer release over a local copy of a deployment (a Laragon folder), in the order docs/deploy.md gives for a host:
   back the copy up, build the release, put it over the folder additively, and tag it. It never deletes: config.php,
   data/ and uploads/ are in no release, and a file the copy holds beside the release stays. IONOS stays SFTP, by
   hand. tests/cross/update-drill.test.ts rehearses it on a served stage. */

/** The copy's own root .htaccess as the backup keeps it, when the release replaced one that differed. */
export const HTACCESS_KEPT = 'htaccess-before-update';

export interface UpdateSteps {
  /** Where the backup goes (default: ./backups, as deploy:backup). */
  backupsInto?: string;
  /** Builds the release and says where it is (default: npm run build:php). */
  build?: () => { dir: string };
  /** Tags the release for this copy (default: release/<id> in this checkout). */
  tag?: (release: DeployedRelease, site: string) => TagOutcome;
  /** Said as each step is done, before the next one's own output (the CLI's console). */
  log?: (line: string) => void;
}

export interface UpdateResult {
  root: string;
  backup: string;
  release: DeployedRelease;
  /** What the release holds, as the build describes it: "434 files, 3.91 MB". */
  size: string;
  /** Where the copy's own root .htaccess was kept, when the release replaced one that differed; else null. */
  htaccessKept: string | null;
  tag: TagOutcome | null;
  /** Why no tag was made, when none was. The copy is updated all the same. */
  tagRefused: string | null;
}

export function updateDeployment(deploy: string, steps: UpdateSteps = {}): UpdateResult {
  const log = steps.log ?? (() => {});
  // 1. Anything that is not a deployment is refused before a byte moves.
  const d = openDeployment(deploy);

  // 2. The backup first: what follows replaces files.
  const backup = backupDeployment(d.root, steps.backupsInto);
  const kept = JSON.parse(readFileSync(join(backup, BACKUP_MARKER), 'utf8')) as BackupInfo;
  log(`Backed up ${kept.flyers} flyers and ${kept.photos} photos${kept.config ? ', with config.php,' : ''} to ${backup}`);

  // 3. The release.
  const dir = resolve((steps.build ?? buildPhpRelease)().dir);
  const manifestFile = join(dir, MANIFEST_FILE);
  if (!existsSync(manifestFile)) throw new Error(`${dir} is no release: it has no ${MANIFEST_FILE}.`);
  if (existsSync(join(dir, 'config.php'))) {
    throw new Error(`${dir} holds a config.php: a release never does, and copying it would replace this copy's own.`);
  }
  if (within(dir, d.root) || within(d.root, dir)) throw new Error(`The release (${dir}) and the deployment (${d.root}) must be two folders.`);
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as Manifest;
  const release: DeployedRelease = { id: manifest.id, ...(manifest.commit ? { commit: manifest.commit } : {}), builtAt: manifest.builtAt };

  // 4. The one file of the copy's own that a release replaces: its root .htaccess, where a lock is pasted
  //    (docs/deploy.md, step 4). When it differs from the release's, the backup keeps it and the run says so.
  const rules = join(d.root, '.htaccess');
  let htaccessKept: string | null = null;
  if (existsSync(rules) && !readFileSync(rules).equals(readFileSync(join(dir, '.htaccess')))) {
    htaccessKept = join(backup, HTACCESS_KEPT);
    copyFileSync(rules, htaccessKept);
  }

  // 5. Over the folder, additively: every file of the release, and nothing taken away.
  cpSync(dir, d.root, { recursive: true, force: true });

  // 6. The tag. A refusal (a build from uncommitted changes) is said, not thrown: the copy is updated by now.
  let tag: TagOutcome | null = null;
  let tagRefused: string | null = null;
  try {
    tag = (steps.tag ?? ((r, site) => tagRelease(r, { site, date: today() })))(release, d.root);
  } catch (e) {
    tagRefused = e instanceof Error ? e.message : String(e);
  }
  return { root: d.root, backup, release, size: describeSize(manifest), htaccessKept, tag, tagRefused };
}

/** What a run says once it is done. */
export function describeUpdate(r: UpdateResult): string[] {
  return [
    `Updated ${r.root} to release ${r.release.id}${r.release.commit ? ` (${r.release.commit})` : ''}: ${r.size}, copied over it; nothing was deleted.`,
    ...(r.htaccessKept
      ? [`Its own .htaccess differed from the release's and was replaced. It is kept as ${r.htaccessKept}: if it held a lock, paste that block again (docs/deploy.md, step 4).`]
      : []),
    r.tag ? describeTag(r.tag, r.root) : `No tag: ${r.tagRefused}`,
    `The backup is ${r.backup}`,
  ];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCommand(() => {
    const { values, positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: { to: { type: 'string' } } });
    if (positionals.length !== 1) throw new Error('Usage: npm run deploy:update -- <deploy folder> [--to <backups folder>]');
    const result = updateDeployment(positionals[0], { backupsInto: values.to, log: console.log });
    console.log(`\n${describeUpdate(result).join('\n')}`);
  });
}
