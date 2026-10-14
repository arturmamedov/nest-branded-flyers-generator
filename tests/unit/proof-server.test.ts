import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { proofDataDir } from '../proof/dataDir.js';

/* The proof server (tests/proof/server.ts) keeps its library under test-results/ alone. Node checks a flyer against
   the schema on every read, so a flyer saved in the proof look into a real library (./data, a deployment's copy)
   could never be opened again by the release. */

describe('the proof server’s data folder', () => {
  const root = resolve('/app');

  it('is a folder under test-results/', () => {
    expect(proofDataDir('./test-results/render-looks-data', root)).toBe(join(root, 'test-results', 'render-looks-data'));
    expect(proofDataDir(join(root, 'test-results', 'a', 'b'), root)).toBe(join(root, 'test-results', 'a', 'b'));
  });

  it('is refused anywhere else, test-results/ itself included, and when not set', () => {
    for (const dir of [undefined, '', './data', 'data', './test-results', '../test-results/x', './test-results/../data', join(root, 'data'), resolve('/elsewhere/test-results/x')]) {
      expect(() => proofDataDir(dir, root), String(dir)).toThrow(/DATA_DIR/);
    }
  });
});
