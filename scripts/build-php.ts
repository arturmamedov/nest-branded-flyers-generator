import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_ROOT } from '../server/paths.js';
import { generate } from './gen-shared.js';
import { GUARD_FILES, MANIFEST_FILE } from './php/layout.js';
import { describeSize, type Manifest } from './php/manifest.js';
import { stagePhp } from './php/stage.js';

/* `npm run build:php` — the folder you upload to a PHP host, and the preflight
   page you upload before it (docs/deploy.md).

   It is the same stage the contract suite and the smoke test serve
   (scripts/php/stage.ts), with the Vite build in it and a real
   `composer install --no-dev`, so what ships is what was tested.

   It never writes config.php, and nothing in data/ or uploads/ but the
   .htaccess that denies them: re-uploading a release must not overwrite the
   admin's access rule or the library. */

export const RELEASE_DIR = join(APP_ROOT, 'release', 'php');

export const PREFLIGHT_SOURCE = join(APP_ROOT, 'php', 'preflight', 'nest-preflight.php');
const PREFLIGHT_NAME = /^nest-preflight-[0-9a-f]+\.php$/;

/** Every file the release must carry for the app to be safe to serve. */
function assertComplete(dir: string): void {
  const required = [
    'index.html',
    'api.php',
    'router.php',
    '.htaccess',
    '.htaccess-minimal',
    '.user.ini',
    'config.sample.php',
    MANIFEST_FILE,
    'vendor/autoload.php',
    'schema/shared.json',
    'seed/hostels.json',
    'assets/nest-logo-teal.png',
    'uploads/.htaccess-minimal',
    ...GUARD_FILES,
  ];
  const missing = required.filter((file) => !existsSync(join(dir, file)));
  if (missing.length > 0) throw new Error(`The release is incomplete: ${missing.join(', ')}`);
  // A release carrying an access rule would overwrite the admin's on upload.
  if (existsSync(join(dir, 'config.php'))) throw new Error('The release must not contain config.php');
  // The preflight page is uploaded alone, before the release; one inside it would come back with every re-upload.
  if (readdirSync(dir).some((name) => name.startsWith('nest-preflight'))) throw new Error('The release must not contain the preflight page');
}

/**
 * The preflight page, beside release/php and never inside it: its name is
 * unguessable (it answers anyone who finds it, with facts about the account),
 * it is not in the manifest, and a re-upload of the release cannot bring it
 * back once deleted. The previous build's copy is removed, so there is one.
 */
function writePreflight(): string {
  const dir = dirname(RELEASE_DIR);
  for (const old of readdirSync(dir).filter((name) => PREFLIGHT_NAME.test(name))) rmSync(join(dir, old));
  const file = join(dir, `nest-preflight-${randomBytes(8).toString('hex')}.php`);
  copyFileSync(PREFLIGHT_SOURCE, file);
  return file;
}

export function buildPhpRelease(): { dir: string; preflight: string } {
  // 1. The generated sources of truth first: PHP reads schema/*.json at runtime.
  const stale = Object.entries(generate()).filter(([rel, content]) => content !== readOr(join(APP_ROOT, rel)));
  if (stale.length > 0) throw new Error(`Run npm run gen first: ${stale.map(([rel]) => rel).join(', ')} are out of date`);

  // 2. The client build, with base './', so the app runs in a subfolder too.
  run('npm', ['run', 'build'], APP_ROOT);

  // 3. The same stage the tests serve, plus dist/ and a real vendor/.
  rmSync(RELEASE_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  stagePhp(RELEASE_DIR, { dist: true, vendor: 'install' });

  assertComplete(RELEASE_DIR);
  return { dir: RELEASE_DIR, preflight: writePreflight() };
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
  const { dir, preflight } = buildPhpRelease();
  const manifest = JSON.parse(readFileSync(join(dir, MANIFEST_FILE), 'utf8')) as Manifest;
  console.log(`\nThe release is in ${dir}: ${describeSize(manifest)}, release ${manifest.id}${manifest.commit ? ` (${manifest.commit})` : ''}.`);
  console.log(`The preflight page is ${preflight}.`);
  console.log('Follow docs/deploy.md: the preflight page goes up alone, first; then the contents of the release.');
}
