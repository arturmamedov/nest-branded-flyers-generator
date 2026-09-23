import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_ROOT } from '../server/paths.js';
import { generate } from './gen-shared.js';
import { GUARD_FILES, MANIFEST_FILE } from './php/layout.js';
import { describeSize, type Manifest } from './php/manifest.js';
import { stagePhp } from './php/stage.js';

/* `npm run build:php` — the folder you upload to a PHP host.

   It is the same stage the contract suite and the smoke test serve
   (scripts/php/stage.ts), with the Vite build in it and a real
   `composer install --no-dev`, so what ships is what was tested.

   It never writes config.php, and nothing in data/ or uploads/ but the
   .htaccess that denies them: re-uploading a release must not overwrite the
   admin's access rule or the library. */

export const RELEASE_DIR = join(APP_ROOT, 'release', 'php');

/** Every file the release must carry for the app to be safe to serve. */
function assertComplete(dir: string): void {
  const required = [
    'index.html',
    'api.php',
    'router.php',
    '.htaccess',
    '.user.ini',
    'config.sample.php',
    MANIFEST_FILE,
    'vendor/autoload.php',
    'schema/shared.json',
    'seed/hostels.json',
    'assets/nest-logo-teal.png',
    ...GUARD_FILES,
  ];
  const missing = required.filter((file) => !existsSync(join(dir, file)));
  if (missing.length > 0) throw new Error(`The release is incomplete: ${missing.join(', ')}`);
  // A release carrying an access rule would overwrite the admin's on upload.
  if (existsSync(join(dir, 'config.php'))) throw new Error('The release must not contain config.php');
}

export function buildPhpRelease(): string {
  // 1. The generated sources of truth first: PHP reads schema/*.json at runtime.
  const stale = Object.entries(generate()).filter(([rel, content]) => content !== readOr(join(APP_ROOT, rel)));
  if (stale.length > 0) throw new Error(`Run npm run gen first: ${stale.map(([rel]) => rel).join(', ')} are out of date`);

  // 2. The client build, with base './', so the app runs in a subfolder too.
  run('npm', ['run', 'build'], APP_ROOT);

  // 3. The same stage the tests serve, plus dist/ and a real vendor/.
  rmSync(RELEASE_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  stagePhp(RELEASE_DIR, { dist: true, vendor: 'install' });

  assertComplete(RELEASE_DIR);
  return RELEASE_DIR;
}

function readOr(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function run(command: string, args: string[], cwd: string): void {
  // npm is a shell script on Windows; a command string keeps Node 25 from warning about args + shell.
  const result = spawnSync([command, ...args].join(' '), { cwd, shell: true, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status ?? result.signal})`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = buildPhpRelease();
  const manifest = JSON.parse(readFileSync(join(dir, MANIFEST_FILE), 'utf8')) as Manifest;
  console.log(`\nThe release is in ${dir}: ${describeSize(manifest)}, release ${manifest.id}${manifest.commit ? ` (${manifest.commit})` : ''}.`);
  console.log('Upload its contents to the host, then copy config.sample.php to config.php and set the access rule.');
}
