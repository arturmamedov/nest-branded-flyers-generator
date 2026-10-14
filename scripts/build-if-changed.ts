import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_ROOT } from '../server/paths.js';

/* `npm run test:render` and `npm run test:php-smoke` build only when something a build reads has changed since the
   last build they made (docs/reports/faster-sessions.md). A target's hash is kept inside its own output and written
   only once its build succeeded, so a build made any other way (`npm run build`, `build:php`: vite empties dist/)
   counts as changed, and a failed one is never taken as current. A missed input is a stale build: the lists err on
   the side of one too many. FORCE_BUILD=1 builds anyway. */

export interface Target {
  /** What builds it, run in the app's root. */
  command: string;
  /** Files and folders, from the app's root, whose bytes the build reads. */
  inputs: readonly string[];
  /** Files the build leaves: one of them missing is a build to make, whatever the hash says. */
  outputs: readonly string[];
  /** Where the hash of the inputs the last build read is kept, inside the build's own output. */
  hashFile: string;
}

/** What the client build reads: its sources and the hostels they import, the art, the generated schemas, the
    pages, the configs, and what is installed (`node_modules/.package-lock.json` is npm's record of it). */
const CLIENT_INPUTS = [
  'src',
  'assets',
  'seed',
  'schema',
  'index.html',
  'render.html',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.server.json',
  'package.json',
  'package-lock.json',
  'node_modules/.package-lock.json',
];

export const TARGETS = {
  /** The release's build: vite → dist/, tsc → dist-server/. test:php-smoke makes this one too, though it serves
      dist/ alone: two targets keeping their hash in dist/ would rebuild each other's. */
  build: {
    command: 'npm run build',
    inputs: [...CLIENT_INPUTS, 'server'],
    outputs: ['dist/index.html', 'dist/render.html', 'dist-server/server/index.js', 'dist-server/server/cli/seed.js', 'dist-server/server/cli/seedSamples.js'],
    hashFile: 'dist/.inputs-hash',
  },
  /** The tests' own build, with the proof look (vite.proof.config.ts). Not server/: tests/proof/server.ts runs the
      server from its source. */
  proof: {
    command: 'npm run build:proof',
    inputs: [...CLIENT_INPUTS, 'vite.proof.config.ts', 'tests/proof'],
    outputs: ['dist-proof/index.html', 'dist-proof/render.html'],
    hashFile: 'dist-proof/.inputs-hash',
  },
} as const satisfies Record<string, Target>;

export type TargetName = keyof typeof TARGETS;

/** Every file under an input, as a path from the root with forward slashes; null for an input that is not there. */
function filesOf(root: string, input: string): string[] | null {
  const abs = join(root, input);
  if (!existsSync(abs)) return null;
  if (!statSync(abs).isDirectory()) return [input];
  const files: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${input}/${entry.name}`;
    // A link is followed: what the build reads is what it points at.
    const isDir = entry.isDirectory() || (entry.isSymbolicLink() && statSync(join(root, rel)).isDirectory());
    if (isDir) files.push(...(filesOf(root, rel) ?? []));
    else files.push(rel);
  }
  return files;
}

/** The hash of what a target's build reads: every input file's path and bytes, in one order whatever the disk's,
    an input that is not there marked as such, and the command and the list themselves, so a change to either is a
    change. File times are not read: a checkout or a copy that leaves the bytes alone changes nothing. */
export function inputsHash(root: string, target: Pick<Target, 'command' | 'inputs'>): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify({ command: target.command, inputs: target.inputs }));
  const files = new Set<string>();
  for (const input of target.inputs) {
    const found = filesOf(root, input);
    if (found === null) hash.update(`\0missing\0${input}`);
    else for (const file of found) files.add(file);
  }
  for (const file of [...files].sort()) {
    const bytes = readFileSync(join(root, file));
    hash.update(`\0${file}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return hash.digest('hex');
}

/** FORCE_BUILD set to anything but nothing, 0 or false. */
export function forced(env: NodeJS.ProcessEnv): boolean {
  return !['', '0', 'false'].includes((env.FORCE_BUILD ?? '').trim().toLowerCase());
}

/** Why a target must be built, or null when its last build is current. */
export function reasonToBuild(state: { force: boolean; missing: readonly string[]; stored: string | null; current: string }): string | null {
  if (state.force) return 'FORCE_BUILD is set';
  if (state.missing.length > 0) return `${state.missing[0]} is missing`;
  if (state.stored === null) return 'no record of its last build';
  if (state.stored !== state.current) return 'its inputs changed';
  return null;
}

function readOr(file: string): string | null {
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
}

const seconds = (since: number) => `${((performance.now() - since) / 1000).toFixed(2)} s`;

/** Builds each named target whose inputs changed, in the order given; a failed build throws. */
export function buildIfChanged(names: readonly string[], root: string = APP_ROOT, env: NodeJS.ProcessEnv = process.env): void {
  const unknown = names.filter((name) => !(name in TARGETS));
  if (names.length === 0 || unknown.length > 0) {
    throw new Error(`Name the targets to build: ${Object.keys(TARGETS).join(', ')}${unknown.length ? ` (not ${unknown.join(', ')})` : ''}`);
  }
  for (const name of names as TargetName[]) {
    const target: Target = TARGETS[name];
    const started = performance.now();
    const current = inputsHash(root, target);
    const why = reasonToBuild({
      force: forced(env),
      missing: target.outputs.filter((output) => !existsSync(join(root, output))),
      stored: readOr(join(root, target.hashFile)),
      current,
    });
    if (why === null) {
      console.log(`${name}: unchanged, skipped (checked in ${seconds(started)})`);
      continue;
    }
    console.log(`${name}: ${why}, building with ${target.command}`);
    rmSync(join(root, target.hashFile), { force: true });
    // npm is a shell script on Windows; a command string keeps Node from warning about args + shell (build-php.ts).
    const result = spawnSync(target.command, { cwd: root, shell: true, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`${name}: ${target.command} failed (${result.status ?? result.signal})`);
    // The hash taken before the build: a file changed while it ran makes the next run build again, never the reverse.
    writeFileSync(join(root, target.hashFile), `${current}\n`);
    console.log(`${name}: built in ${seconds(started)}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    buildIfChanged(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
