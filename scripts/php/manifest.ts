import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { APP_ROOT } from '../../server/paths.js';
import { GUARD_FILES, MANIFEST_FILE } from './layout.js';

/* release.json: what a stage or release shipped, file by file. The one upload
   failure that announces nothing is a file that never arrived (an FTP client
   that hid the dotfiles) or arrived damaged; the app (HostFacts in api/config)
   and the preflight page compare the folder against this list and name what
   differs. Denied over HTTP like config.php (RELEASE_LAYOUT.deniedFiles). */

export interface ManifestEntry {
  bytes: number;
  sha256: string;
}

export interface Manifest {
  /** A content hash: two builds with the same files have the same id, whatever the clock or the checkout said. */
  id: string;
  builtAt: string;
  /** `git describe --always --dirty` of the checkout it was built from, when there is one. */
  commit?: string;
  /** GUARD_FILES, so the readers need no copy of the list. */
  guards: readonly string[];
  files: Record<string, ManifestEntry>;
}

function filesUnder(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .filter((path) => path !== MANIFEST_FILE)
    .sort();
}

function gitDescribe(): string | undefined {
  const r = spawnSync('git', ['describe', '--always', '--dirty'], { cwd: APP_ROOT, encoding: 'utf8', windowsHide: true });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : undefined;
}

/** Writes `<dir>/release.json` over everything in `dir` (itself excluded) and returns it. */
export function writeManifest(dir: string): Manifest {
  const files: Record<string, ManifestEntry> = {};
  for (const path of filesUnder(dir)) {
    const bytes = readFileSync(join(dir, ...path.split('/')));
    files[path] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  const id = createHash('sha256')
    .update(Object.entries(files).map(([path, f]) => `${f.sha256}  ${path}\n`).join(''))
    .digest('hex')
    .slice(0, 12);
  const commit = gitDescribe();
  const manifest: Manifest = { id, builtAt: new Date().toISOString(), ...(commit ? { commit } : {}), guards: GUARD_FILES, files };
  writeFileSync(join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return manifest;
}

/** "385 files, 3.08 MB": the size file-manager caps and FTP timeouts go by. */
export function describeSize(manifest: Manifest): string {
  const entries = Object.values(manifest.files);
  const bytes = entries.reduce((sum, f) => sum + f.bytes, 0);
  return `${entries.length + 1} files, ${(bytes / 1_000_000).toFixed(2)} MB`;
}
