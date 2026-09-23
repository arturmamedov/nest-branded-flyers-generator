import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { FlyerIndexFileSchema, PhotosFileSchema, STORAGE_FILES } from '../../src/shared/storage.js';
import { RELEASE_LAYOUT } from './layout.js';
import { requirePhp } from './phpBin.js';

/* A deployment on this machine's disk (a Laragon folder, a mounted share, a
   folder downloaded by FTP): the one guard npm run deploy:reset, deploy:backup
   and deploy:restore share. Each refuses anything that is not a deployment, and
   touches nothing but <deploy>/data, <deploy>/uploads and <deploy>/config.php. */

export interface Deployment {
  root: string;
  /** Always <root>/data: a deployment keeping its library elsewhere is refused (see openDeployment). */
  dataDir: string;
  uploadsDir: string;
  /** <root>/config.php when the deployment has one. */
  configFile: string | null;
}

/** What the writable folders keep through a reset or a restore: the rules the release ships, not the library. */
export const RULE_FILES: ReadonlySet<string> = new Set(['.htaccess', '.htaccess-minimal']);

/**
 * The deployment in `folder`: api.php and config.sample.php must be there, and
 * config.php, if present, must keep the library in data/. A dataDir elsewhere
 * (the safer choice on a host that allows it) is refused by name rather than
 * handled: a backup of data/ would then be empty, and nothing would say so.
 */
export function openDeployment(folder: string): Deployment {
  const root = resolve(folder);
  for (const marker of ['api.php', 'config.sample.php']) {
    if (!existsSync(join(root, marker))) throw new Error(`${root} is not a Nest flyers deployment (no ${marker}).`);
  }
  const dataDir = join(root, RELEASE_LAYOUT.writableDirs[0]);
  const configFile = join(root, 'config.php');
  if (!existsSync(configFile)) return { root, dataDir, uploadsDir: join(root, 'uploads'), configFile: null };

  const configured = configuredDataDir(configFile);
  if (configured !== null) {
    const actual = isAbsolute(configured) ? resolve(configured) : resolve(root, configured);
    if (!within(actual, dataDir)) {
      throw new Error(
        `${configFile} keeps the library at ${actual}, not in data/. These scripts handle data/ only: ` +
          'back that folder up yourself, with uploads/ and config.php.',
      );
    }
  }
  return { root, dataDir, uploadsDir: join(root, 'uploads'), configFile };
}

/** config.php's dataDir, read by PHP itself: the file is PHP, and may compute its values. */
function configuredDataDir(configFile: string): string | null {
  const php = requirePhp(() => {});
  const code = '$c = require $argv[1]; echo PHP_EOL, json_encode(is_array($c) && isset($c["dataDir"]) ? $c["dataDir"] : null);';
  const r = spawnSync(php, ['-r', code, '--', configFile], { encoding: 'utf8', shell: false, windowsHide: true });
  const last = r.stdout.trim().split(/\r?\n/).pop() ?? '';
  if (r.status !== 0) throw new Error(`Cannot read ${configFile} (${r.stderr.trim() || last || `exit ${r.status}`}).`);
  const value = JSON.parse(last) as unknown;
  if (value !== null && typeof value !== 'string') throw new Error(`${configFile}: dataDir must be a string or null.`);
  return value;
}

/** True when `path` is `dir` or inside it (case-insensitively on Windows, as path.relative compares there). */
export function within(path: string, dir: string): boolean {
  const rel = relative(dir, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * What the deployment's library holds: flyers (archived ones too) and photos.
 * A freshly seeded store (hostels and doodles, nothing made yet) holds nothing.
 */
export function libraryContents(d: Deployment): { flyers: number; photos: number } {
  const read = <T>(file: string, parse: (raw: unknown) => T[]): number =>
    existsSync(file) ? parse(JSON.parse(readFileSync(file, 'utf8'))).length : 0;
  const photoFiles = existsSync(d.uploadsDir)
    ? readdirSync(d.uploadsDir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && !RULE_FILES.has(e.name)).length
    : 0;
  return {
    flyers: read(join(d.dataDir, ...STORAGE_FILES.flyerIndex.split('/')), (raw) => FlyerIndexFileSchema.parse(raw)),
    photos: Math.max(photoFiles, read(join(d.dataDir, STORAGE_FILES.photos), (raw) => PhotosFileSchema.parse(raw))),
  };
}

/** Runs a deploy:* command from npm: a refusal is a sentence for whoever typed the command, not a stack trace. */
export function runCommand(main: () => void): void {
  try {
    main();
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}
