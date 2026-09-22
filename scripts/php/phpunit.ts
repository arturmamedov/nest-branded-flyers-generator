import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PHP_DIR, requirePhp } from './phpBin.js';

/* `npm run test:php [-- phpunit args]`: PHPUnit on PHP_BIN, not on whatever
   `php` is on PATH, so the run proves the version it logs. Extra arguments go
   straight to PHPUnit (e.g. `-- --filter JsonFilesTest`). */

function main(argv: readonly string[]): number {
  let php: string;
  try {
    php = requirePhp();
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
  if (!existsSync(join(PHP_DIR, 'vendor', 'autoload.php'))) {
    console.error('php/vendor/autoload.php is missing. Run composer install in php/ first.');
    return 1;
  }
  // No cwd: a path argument resolves where the caller typed it (npm runs from the repo root).
  const r = spawnSync(php, [join(PHP_DIR, 'vendor', 'bin', 'phpunit'), '-c', join(PHP_DIR, 'phpunit.xml'), ...argv], {
    stdio: 'inherit',
    shell: false,
  });
  if (r.error) {
    console.error(`Could not start PHPUnit: ${r.error.message}`);
    return 1;
  }
  return r.status ?? 1;
}

process.exit(main(process.argv.slice(2)));
