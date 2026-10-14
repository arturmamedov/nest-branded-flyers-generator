import { resolve } from 'node:path';
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import app from './vite.config';

/* The tests' own build (docs/prompts/looks-seam.md, "The throwaway look"): the release's client, with the proof look
   registered before anything reads the registry, into dist-proof/. Never shipped: build:php copies dist/ alone, and
   tests/render/looks.spec.ts checks that no file of dist/ holds the proof look's id. */

const slashes = (path: string) => path.replace(/\\/g, '/');
const CLIENT = slashes(resolve(import.meta.dirname, 'tests/proof/client.ts'));
const ENTRIES = ['src/editor/main.tsx', 'src/render/main.tsx'].map((entry) => slashes(resolve(import.meta.dirname, entry)));

/** Puts the proof look's registration first in both entries: an import evaluated before the entry's own. A build
    that reached either entry without it fails, rather than leave a dist-proof/ with one look. */
const seen = new Set<string>();
const registerFirst: Plugin = {
  name: 'nest-proof-look-first',
  buildStart() {
    seen.clear();
  },
  transform(code, id) {
    const file = id.split('?')[0];
    if (!ENTRIES.includes(file)) return null;
    seen.add(file);
    return { code: `import ${JSON.stringify(CLIENT)};\n${code}`, map: null };
  },
  buildEnd() {
    const missed = ENTRIES.filter((entry) => !seen.has(entry));
    if (missed.length) throw new Error(`The proof look was not put first in: ${missed.join(', ')}`);
  },
};

export default mergeConfig(app, defineConfig({ plugins: [registerFirst], build: { outDir: 'dist-proof' } }));
