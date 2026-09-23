import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RELEASE_LAYOUT } from './layout.js';

/* Empties a deployment's library — the JSON store and the photos — and leaves
   everything else alone:

     npx tsx scripts/php/reset-deploy.ts <deploy folder>

   For a deployment the tests have been run against, before the real library is
   copied in. The .htaccess of data/ and uploads/ stays: it is what stops those
   folders being served, and the release is not re-uploaded afterwards.

   It refuses anything that is not a deployment (api.php and config.sample.php
   must be there), and never touches a path outside <deploy>/data and
   <deploy>/uploads. */

/** The files a deployment's writable folders keep: the deny rules the release ships. */
const KEEP = new Set(['.htaccess']);

export function resetDeployData(deploy: string): { removed: string[] } {
  const root = resolve(deploy);
  for (const marker of ['api.php', 'config.sample.php']) {
    if (!existsSync(join(root, marker))) throw new Error(`${root} is not a Nest flyers deployment (no ${marker}).`);
  }
  const removed: string[] = [];
  for (const folder of RELEASE_LAYOUT.writableDirs) {
    const dir = join(root, folder);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (KEEP.has(entry)) continue;
      rmSync(join(dir, entry), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      removed.push(`${folder}/${entry}`);
    }
  }
  return { removed };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [deploy] = process.argv.slice(2);
  if (!deploy) throw new Error('Usage: npx tsx scripts/php/reset-deploy.ts <deploy folder>');
  const { removed } = resetDeployData(deploy);
  console.log(removed.length ? `Removed ${removed.length} entries: ${removed.join(', ')}` : 'Nothing to remove.');
  console.log('The library is empty. The next request seeds the hostels again; copy a library in with npm run copy.');
}
