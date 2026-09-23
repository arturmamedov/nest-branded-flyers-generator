import { copyFileSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { BACKUP_MARKER, type BackupInfo } from './backup-deploy.js';
import { libraryContents, openDeployment, RULE_FILES, runCommand } from './deployment.js';
import { resetDeployData } from './reset-deploy.js';

/* A backup made by deploy:backup, put back into a deployment:

     npm run deploy:restore -- <backup folder> <deploy folder> [--force]

   The deployment's library is replaced, not merged: its data/ and uploads/ are
   emptied (their rules stay: the release's own, not the backup's), then the
   backup's are copied in, with its config.php. Without --force it refuses a
   deployment that holds flyers or photos, or a config.php other than the
   backup's, so a restore never quietly destroys newer work. */

export function restoreDeployment(backup: string, deploy: string, { force = false }: { force?: boolean } = {}): BackupInfo {
  const from = resolve(backup);
  if (!existsSync(join(from, BACKUP_MARKER))) throw new Error(`${from} is not a backup made by deploy:backup (no ${BACKUP_MARKER}).`);
  const info = JSON.parse(readFileSync(join(from, BACKUP_MARKER), 'utf8')) as BackupInfo;
  if (info.kind !== 'nest-flyers-backup') throw new Error(`${join(from, BACKUP_MARKER)} is not a Nest flyers backup.`);
  const d = openDeployment(deploy);

  if (!force) {
    const held = libraryContents(d);
    const backupConfig = join(from, 'config.php');
    const otherConfig =
      d.configFile !== null && existsSync(backupConfig) && readFileSync(d.configFile, 'utf8') !== readFileSync(backupConfig, 'utf8');
    if (held.flyers > 0 || held.photos > 0 || otherConfig) {
      const what = [held.flyers && `${held.flyers} flyers`, held.photos && `${held.photos} photos`, otherConfig && 'a different config.php'].filter(Boolean);
      throw new Error(`${d.root} already holds ${what.join(', ')}. A restore replaces them: back them up first (npm run deploy:backup), then add --force.`);
    }
  }

  resetDeployData(d.root);
  const notRules = (source: string) => !RULE_FILES.has(basename(source));
  if (existsSync(join(from, 'data'))) cpSync(join(from, 'data'), d.dataDir, { recursive: true, filter: notRules });
  if (existsSync(join(from, 'uploads'))) cpSync(join(from, 'uploads'), d.uploadsDir, { recursive: true, filter: notRules });
  if (existsSync(join(from, 'config.php'))) copyFileSync(join(from, 'config.php'), join(d.root, 'config.php'));
  return info;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCommand(() => {
    const { values, positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: { force: { type: 'boolean', default: false } } });
    if (positionals.length !== 2) throw new Error('Usage: npm run deploy:restore -- <backup folder> <deploy folder> [--force]');
    const info = restoreDeployment(positionals[0], positionals[1], { force: values.force });
    console.log(`Restored ${info.flyers} flyers and ${info.photos} photos from ${info.createdAt}${info.config ? ', and config.php' : ''} into ${resolve(positionals[1])}.`);
  });
}
