import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PHP_DIR, requirePhp } from './phpBin.js';

/* Composer, run by PHP_BIN. `composer` on Windows is composer.bat, which Node
   can't spawn without a shell, and it would run on PATH's PHP (8.3 here) rather
   than the one we prove the backend on. So we run `PHP_BIN composer.phar …`
   directly, and judge it by its exit code only: composer writes progress and
   deprecation notices to stderr even when it succeeds. */

/** COMPOSER_PHAR, else the composer.phar that sits next to `composer` in a PATH folder. */
export function composerPhar(): string {
  const fromEnv = process.env.COMPOSER_PHAR?.trim();
  if (fromEnv) {
    if (!existsSync(fromEnv)) throw new Error(`COMPOSER_PHAR points to "${fromEnv}", which does not exist.`);
    return fromEnv;
  }
  for (const entry of (process.env.PATH ?? '').split(delimiter)) {
    const dir = entry.trim().replace(/^"(.*)"$/, '$1');
    if (!dir) continue;
    const phar = join(dir, 'composer.phar');
    if (existsSync(phar)) return phar;
  }
  throw new Error('composer.phar not found: set COMPOSER_PHAR to its path, or put Composer (with its composer.phar) on PATH.');
}

/** Runs `PHP_BIN composer.phar <args> --no-interaction --no-progress` in `cwd`; throws unless it exits 0. */
export function runComposer(args: readonly string[], cwd: string, phpBin: string = requirePhp()): void {
  const phar = composerPhar();
  const r = spawnSync(phpBin, [phar, ...args, '--no-interaction', '--no-progress'], {
    cwd,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  });
  if (r.error) throw new Error(`Could not start composer (${phpBin} ${phar}): ${r.error.message}`);
  if (r.status !== 0) throw new Error(`composer ${args.join(' ')} failed in ${cwd} (exit ${r.status ?? r.signal}).`);
}

// `tsx scripts/php/composer.ts <args>` runs Composer in php/ on PHP_BIN (e.g. `dump-autoload --strict-psr`).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runComposer(process.argv.slice(2), PHP_DIR);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
