import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDeployment, RULE_FILES, runCommand } from './deployment.js';

/* Empties a deployment's library — the JSON store and the photos — and leaves
   everything else alone:

     npm run deploy:reset -- <deploy folder>

   For a deployment the tests have been run against, before the real library is
   copied in, and by deploy:restore before it puts a backup back. The rules of
   data/ and uploads/ stay: they are what stops those folders being served, and
   the release is not re-uploaded afterwards.

   It refuses anything that is not a deployment (scripts/php/deployment.ts), and
   never touches a path outside <deploy>/data and <deploy>/uploads. */

export function resetDeployData(deploy: string): { removed: string[] } {
  const d = openDeployment(deploy);
  const removed: string[] = [];
  for (const [name, dir] of [['data', d.dataDir], ['uploads', d.uploadsDir]] as const) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (RULE_FILES.has(entry)) continue;
      rmSync(join(dir, entry), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      removed.push(`${name}/${entry}`);
    }
  }
  return { removed };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCommand(() => {
    const [deploy] = process.argv.slice(2);
    if (!deploy) throw new Error('Usage: npm run deploy:reset -- <deploy folder>');
    const { removed } = resetDeployData(deploy);
    console.log(removed.length ? `Removed ${removed.length} entries: ${removed.join(', ')}` : 'Nothing to remove.');
    console.log('The library is empty. The next request seeds the hostels again; copy a library in with npm run copy.');
  });
}
