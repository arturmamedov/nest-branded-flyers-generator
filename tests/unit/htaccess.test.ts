import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { APP_ROOT } from '../../server/paths.js';

/* The app root's .htaccess is the one IONOS runs (docs/reports/host-facts.md):
   IONOS answered 403 to every page while it carried "Options -Indexes
   -MultiViews", and <If> needs AllowOverride All. Nobody can test the host from
   here, so these hold the file to what it took: rewrites, headers and
   FilesMatch only, the https redirect ahead of everything, and the listing
   rule behind the API's. The rules themselves are probed by the security suite. */

const lines = readFileSync(join(APP_ROOT, 'php', 'web', '.htaccess'), 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'));

const rewriteRules = lines.filter((line) => line.startsWith('RewriteRule '));

it('has none of the lines a restrictive host refuses', () => {
  for (const line of lines) expect(line, line).not.toMatch(/^(Options|php_flag|php_value|php_admin_\w+|<If\b|<ElseIf\b|<Else>)/);
});

it('sends http:// to https:// before any other rule, to the address as the visitor sent it', () => {
  expect(rewriteRules[0]).toBe('RewriteRule ^ https://%{HTTP_HOST}%1 [R=301,L,NE]');
  // %1 comes from the request line: under MultiViews (IONOS) REQUEST_URI already reads api.php/config, a 404.
  const conditions = lines.slice(0, lines.indexOf(rewriteRules[0])).filter((line) => line.startsWith('RewriteCond '));
  expect(conditions.at(-1)).toBe('RewriteCond %{THE_REQUEST} ^\\S+\\s+(?:https?://[^/\\s]+)?(/\\S*)');
});

it('refuses folder listings by rewrite, after the API rule so api/…/ still reaches the API', () => {
  expect(rewriteRules.indexOf('RewriteRule ^.+/$ - [R=404,L]')).toBeGreaterThan(rewriteRules.indexOf('RewriteRule ^api/ api.php [L,QSA]'));
  expect(rewriteRules.indexOf('RewriteRule ^api/ api.php [L,QSA]')).toBeGreaterThan(0);
});
