import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/* A folder, captured so two captures can be compared. The cross-backend test
   uses it to prove that serving a store read-only leaves every byte alone, so
   the capture has to be exact: JSON files are kept as text (a failure then
   shows the line that moved rather than "two buffers differ"), everything else
   as a digest, and folders are entries of their own — an empty `.lock.d` next
   to PHP's `.lock` file is precisely the kind of difference worth seeing. */

/** Relative POSIX path → contents (JSON as text, other files as a digest, folders as `directory`). Folder keys end in `/`. */
export type Snapshot = Record<string, string>;

export function snapshot(dir: string, prefix = ''): Snapshot {
  const out: Snapshot = {};
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out[`${rel}/`] = 'directory';
      Object.assign(out, snapshot(full, rel));
      continue;
    }
    const bytes = readFileSync(full);
    out[rel] = rel.endsWith('.json') ? bytes.toString('utf8') : `${bytes.length} bytes, sha256 ${sha256(bytes)}`;
  }
  return out;
}

export const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export const added = (before: Snapshot, after: Snapshot): string[] => Object.keys(after).filter((k) => !(k in before)).sort();
export const removed = (before: Snapshot, after: Snapshot): string[] => Object.keys(before).filter((k) => !(k in after)).sort();
export const changed = (before: Snapshot, after: Snapshot): string[] =>
  Object.keys(after)
    .filter((k) => k in before && after[k] !== before[k])
    .sort();
