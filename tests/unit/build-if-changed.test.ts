import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forced, inputsHash, reasonToBuild, TARGETS } from '../../scripts/build-if-changed.js';
import { APP_ROOT } from '../../server/paths.js';

/* test:render and test:php-smoke build only when what a build reads has changed (scripts/build-if-changed.ts). A hash
   that missed a change would test a stale build, so each kind of change is held here on a tree of its own. */

describe('the hash of what a build reads', () => {
  let root: string;
  const target = { command: 'npm run build', inputs: ['src', 'index.html', 'missing.json'] };
  const write = (rel: string, content: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  };
  const hash = () => inputsHash(root, target);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nest-flyers-inputs-'));
    write('src/a.ts', 'export const a = 1;');
    write('src/deep/b.ts', 'export const b = 2;');
    write('index.html', '<!doctype html>');
    write('elsewhere.txt', 'not an input');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('is the same for a tree left alone, whatever its files’ times', () => {
    const before = hash();
    utimesSync(join(root, 'src/a.ts'), new Date(2020, 0, 1), new Date(2020, 0, 1));
    expect(hash()).toBe(before);
  });

  it('changes with a changed file', () => {
    const before = hash();
    write('src/deep/b.ts', 'export const b = 3;');
    expect(hash()).not.toBe(before);
  });

  it('changes with a new file', () => {
    const before = hash();
    write('src/deep/c.ts', '');
    expect(hash()).not.toBe(before);
  });

  it('changes with a deleted file', () => {
    const before = hash();
    rmSync(join(root, 'src/a.ts'));
    expect(hash()).not.toBe(before);
  });

  it('changes with a file renamed, its bytes the same', () => {
    const before = hash();
    renameSync(join(root, 'src/a.ts'), join(root, 'src/z.ts'));
    expect(hash()).not.toBe(before);
  });

  it('is steady with an input missing, and changes when it appears', () => {
    const before = hash();
    expect(hash()).toBe(before);
    write('missing.json', '{}');
    expect(hash()).not.toBe(before);
  });

  it('does not read what is no input', () => {
    const before = hash();
    write('elsewhere.txt', 'changed');
    write('other/x.ts', 'new');
    expect(hash()).toBe(before);
  });

  it('changes with the command or the list of inputs', () => {
    const before = hash();
    expect(inputsHash(root, { ...target, command: 'npm run build:proof' })).not.toBe(before);
    expect(inputsHash(root, { ...target, inputs: [...target.inputs, 'elsewhere.txt'] })).not.toBe(before);
  });
});

describe('whether a target is built', () => {
  const current = 'abc';
  const state = { force: false, missing: [], stored: current, current };

  it('is not, when the last build read these inputs and its outputs are there', () => {
    expect(reasonToBuild(state)).toBeNull();
  });

  it('is, when its inputs changed', () => {
    expect(reasonToBuild({ ...state, stored: 'old' })).toBe('its inputs changed');
  });

  it('is, when there is no record of its last build', () => {
    expect(reasonToBuild({ ...state, stored: null })).toBe('no record of its last build');
  });

  it('is, when an output is missing, whatever the hash says', () => {
    expect(reasonToBuild({ ...state, missing: ['dist-server/server/index.js'] })).toBe('dist-server/server/index.js is missing');
  });

  it('is, when FORCE_BUILD is set', () => {
    expect(reasonToBuild({ ...state, force: true })).toBe('FORCE_BUILD is set');
  });

  it('reads FORCE_BUILD as set unless it is empty, 0 or false', () => {
    expect(forced({})).toBe(false);
    for (const value of ['', '0', 'false', 'FALSE']) expect(forced({ FORCE_BUILD: value }), value).toBe(false);
    for (const value of ['1', 'true', 'yes']) expect(forced({ FORCE_BUILD: value }), value).toBe(true);
  });
});

describe('the targets', () => {
  // A misspelt input would be "missing" for good, and its changes never seen.
  it('name inputs this checkout has', () => {
    for (const [name, target] of Object.entries(TARGETS)) {
      expect(target.inputs.filter((input) => !existsSync(join(APP_ROOT, input))), name).toEqual([]);
    }
  });

  // The hash is kept inside the output the build empties or rewrites, so a build made by hand never passes for one.
  it('keep their hash inside one of their own outputs’ folders', () => {
    for (const [name, target] of Object.entries(TARGETS)) {
      const folders = target.outputs.map((output) => output.split('/')[0]);
      expect(folders, name).toContain(target.hashFile.split('/')[0]);
    }
  });
});
