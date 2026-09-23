import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROOT } from '../../server/paths.js';

/* The .htaccess-minimal fallbacks (docs/deploy.md, step 1b) are the full files
   minus the lines a restrictive AllowOverride refuses. They are only ever used
   on a host nobody here can test, so they must never drift from the full files
   the security suite probes: same rules, same order, nothing added but the
   rewrite that stands in for "Options -Indexes". */

const WEB = join(APP_ROOT, 'php', 'web');
const read = (path: string) => readFileSync(join(WEB, ...path.split('/')), 'utf8');

/** The lines Apache acts on: no comments or blank lines, indentation kept. */
const directives = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line !== '' && !line.trimStart().startsWith('#'));

/** What needs AllowOverride Options / Indexes: the Options and DirectoryIndex lines, and the mod_php blocks' php_flag. */
const PHP_MODULE_BLOCK = /^<IfModule (mod_php\.c|php_module|mod_php7\.c)>$/;
function withoutRestrictedLines(lines: string[]): string[] {
  const out: string[] = [];
  let inPhpBlock = false;
  for (const line of lines) {
    if (PHP_MODULE_BLOCK.test(line)) inPhpBlock = true;
    else if (inPhpBlock && line === '</IfModule>') inPhpBlock = false;
    else if (!inPhpBlock && !/^(Options|DirectoryIndex)\b/.test(line)) out.push(line);
  }
  return out;
}

const NO_LISTINGS = '    RewriteRule ^.+/$ - [R=404,L]';

describe.each([
  { full: '.htaccess', minimal: '.htaccess-minimal', extra: [NO_LISTINGS] },
  { full: 'uploads/.htaccess', minimal: 'uploads/.htaccess-minimal', extra: [] },
])('$minimal', ({ full, minimal, extra }) => {
  const minimalLines = directives(read(minimal));

  it(`carries every rule of ${full} that needs no extra permission, in order`, () => {
    expect(minimalLines.filter((line) => !extra.includes(line))).toEqual(withoutRestrictedLines(directives(read(full))));
  });

  it('has none of the lines a restrictive host refuses', () => {
    for (const line of minimalLines) expect(line, line).not.toMatch(/^\s*(Options|DirectoryIndex|php_flag|php_value)\b/);
  });
});

it('.htaccess-minimal refuses folder listings by rewrite, after the API rule so api/…/ still reaches the API', () => {
  const lines = directives(read('.htaccess-minimal'));
  expect(lines.indexOf(NO_LISTINGS)).toBeGreaterThan(lines.indexOf('    RewriteRule ^api/ api.php [L,QSA]'));
});
