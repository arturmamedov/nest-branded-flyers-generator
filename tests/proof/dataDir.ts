import { isAbsolute, join, relative, resolve } from 'node:path';

/** The proof server's data folder, as DATA_DIR names it: a folder under the app's test-results/, or refused. Node
    checks a flyer against the schema on every read, so a flyer saved in the proof look into a real library would
    never open again in the release, which does not have that look. */
export function proofDataDir(value: string | undefined, appRoot: string): string {
  const under = join(appRoot, 'test-results');
  const dir = value ? resolve(appRoot, value) : '';
  const rel = dir ? relative(under, dir) : '';
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`DATA_DIR must name a folder under ${under}: the proof look's flyers never go into a real library`);
  }
  return dir;
}
