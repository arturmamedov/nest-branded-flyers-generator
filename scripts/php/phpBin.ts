import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_ROOT as REPO_ROOT } from '../../server/paths.js';

/* Which PHP the Node-side scripts run. On the dev machine `php` on PATH is not
   the version the host runs (Laragon puts 8.3 there, the host is 8.4), and npm
   scripts run in cmd.exe where `PHP_BIN=… npm run …` doesn't work, so the
   binary also comes from the repo's untracked .env. */

export const PHP_DIR = join(REPO_ROOT, 'php');

/** The oldest PHP the backend promises to run on: php/composer.json's `require.php`, the one place it is stated. */
export const MIN_PHP: readonly [number, number] = (() => {
  const composer = JSON.parse(readFileSync(join(PHP_DIR, 'composer.json'), 'utf8')) as { require?: { php?: string } };
  const m = /^>=\s*(\d+)\.(\d+)$/.exec(composer.require?.php ?? '');
  if (!m) throw new Error(`php/composer.json: require.php must read ">=X.Y" (got ${JSON.stringify(composer.require?.php)}).`);
  return [Number(m[1]), Number(m[2])];
})();

/** KEY=value lines, `#` comments. Values are taken verbatim, so Windows paths keep their backslashes. */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

/** PHP_BIN from the environment, else from <repo>/.env, else `php` on PATH. */
export function resolvePhpBin(): string {
  const fromEnv = process.env.PHP_BIN?.trim();
  if (fromEnv) return fromEnv;
  const envFile = join(REPO_ROOT, '.env');
  const fromFile = existsSync(envFile) ? parseDotEnv(readFileSync(envFile, 'utf8')).PHP_BIN : undefined;
  return fromFile || 'php';
}

/** PHP_VERSION of a binary, e.g. "8.4.25". */
export function phpVersion(bin: string): string {
  const r = spawnSync(bin, ['-r', 'echo PHP_VERSION;'], { encoding: 'utf8', shell: false, windowsHide: true });
  if (r.error) {
    throw new Error(`Cannot run PHP at "${bin}" (${r.error.message}). Set PHP_BIN (environment or .env) to a PHP >= ${MIN_PHP.join('.')} binary.`);
  }
  if (r.status !== 0) throw new Error(`"${bin} -r 'echo PHP_VERSION;'" exited with ${r.status ?? r.signal}: ${r.stderr.trim()}`);
  // Laragon's php.ini shows startup warnings on stdout, so read the version from the end.
  const m = /(\d+\.\d+\.\d+\S*)$/.exec(r.stdout.trim());
  if (!m) throw new Error(`"${bin}" did not print a PHP version (got ${JSON.stringify(r.stdout.slice(-200))}).`);
  return m[1];
}

/** Throws unless `bin` meets the >= 8.1 promise (MIN_PHP); returns its version. */
export function assertPhp81(bin: string): string {
  const version = phpVersion(bin);
  const [major, minor] = version.split('.').map(Number);
  const [minMajor, minMinor] = MIN_PHP;
  if (major < minMajor || (major === minMajor && minor < minMinor)) {
    throw new Error(
      `PHP ${version} at "${bin}" is too old: the PHP backend needs >= ${MIN_PHP.join('.')}. ` +
        'Set PHP_BIN (environment or .env) to a newer binary.',
    );
  }
  return version;
}

/** The PHP binary every script uses: resolved, checked against MIN_PHP, and logged so a run says which PHP it proved. */
export function requirePhp(log: (line: string) => void = console.log): string {
  const bin = resolvePhpBin();
  log(`PHP ${assertPhp81(bin)} (${bin})`);
  return bin;
}
