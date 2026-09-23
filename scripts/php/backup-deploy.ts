import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { APP_ROOT } from '../../server/paths.js';
import { STORAGE_FILES } from '../../src/shared/storage.js';
import { libraryContents, openDeployment, runCommand, within } from './deployment.js';
import { MANIFEST_FILE } from './layout.js';

/* A deployment's library, copied out to a timestamped folder:

     npm run deploy:backup -- <deploy folder> [--to <folder>]     (default: ./backups)

   data/ (the JSON store), uploads/ (the photos) and config.php (the access rule
   they were served under), plus backup.json, which deploy:restore requires. The
   store's lock is a working file and is left out (docs/json-storage.md,
   "Backing up"). A copy taken while nobody is saving is consistent. On a host
   without a shell the same three things are downloaded by FTP (docs/deploy.md). */

export const BACKUP_MARKER = 'backup.json';
export const DEFAULT_BACKUPS = join(APP_ROOT, 'backups');

export interface BackupInfo {
  kind: 'nest-flyers-backup';
  /** The deployment folder it came from. */
  from: string;
  createdAt: string;
  /** The release running there, from its release.json, if it had one. */
  release: string | null;
  config: boolean;
  flyers: number;
  photos: number;
}

/** The store's lock: PHP's file and Node's folder. Never part of a library. */
const WORKING_FILES = new Set([STORAGE_FILES.lock, `${STORAGE_FILES.lock}.d`]);

export function backupDeployment(deploy: string, into: string = DEFAULT_BACKUPS): string {
  const d = openDeployment(deploy);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const out = join(resolve(into), `${basename(d.root)}-${stamp}`);
  // Inside the deployment it would sit in the web root, next to what it copies.
  if (within(out, d.root)) throw new Error(`A backup must not go inside the deployment (${out}).`);
  if (existsSync(out)) throw new Error(`${out} already exists.`);
  mkdirSync(out, { recursive: true });

  const skipWorking = (source: string) => !WORKING_FILES.has(basename(source));
  if (existsSync(d.dataDir)) cpSync(d.dataDir, join(out, 'data'), { recursive: true, filter: skipWorking });
  if (existsSync(d.uploadsDir)) cpSync(d.uploadsDir, join(out, 'uploads'), { recursive: true });
  if (d.configFile) copyFileSync(d.configFile, join(out, 'config.php'));

  const manifest = join(d.root, MANIFEST_FILE);
  const info: BackupInfo = {
    kind: 'nest-flyers-backup',
    from: d.root,
    createdAt: new Date().toISOString(),
    release: existsSync(manifest) ? ((JSON.parse(readFileSync(manifest, 'utf8')) as { id?: string }).id ?? null) : null,
    config: d.configFile !== null,
    ...libraryContents(d),
  };
  writeFileSync(join(out, BACKUP_MARKER), JSON.stringify(info, null, 2) + '\n');
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCommand(() => {
    const { values, positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: { to: { type: 'string' } } });
    if (positionals.length !== 1) throw new Error('Usage: npm run deploy:backup -- <deploy folder> [--to <folder>]');
    const out = backupDeployment(positionals[0], values.to);
    const info = JSON.parse(readFileSync(join(out, BACKUP_MARKER), 'utf8')) as BackupInfo;
    console.log(`Backed up ${info.flyers} flyers and ${info.photos} photos${info.config ? ', with config.php,' : ''} to ${out}`);
  });
}
