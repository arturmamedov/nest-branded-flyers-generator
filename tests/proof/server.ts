// The proof look joins the registry before anything reads it: this import stays first.
import './register.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { APP_ROOT } from '../../server/paths.js';
import { start } from '../../server/start.js';
import { proofDataDir } from './dataDir.js';

/* The tests' own server (docs/prompts/looks-seam.md, "The throwaway look"): the app's server with the proof look in
   its registry, serving the tests' own build (dist-proof/, vite.proof.config.ts) on a library of its own, seeded
   first with the hostels and the samples (hand-drawn, as the release seeds them). Run from source with tsx, since
   tests/ is in no server build; the Playwright project `looks` starts it. Its settings may name the proof look
   (LOOKS), which the release's own scripts refuse: so it seeds here, after the registration. Production, always: it
   serves a build. */
const dist = join(APP_ROOT, 'dist-proof');
if (!existsSync(join(dist, 'index.html'))) throw new Error('dist-proof/ is not built: npm run build:proof');
process.env.DATA_DIR = proofDataDir(process.env.DATA_DIR, APP_ROOT);
process.env.NODE_ENV = 'production';
await import('../../server/cli/seed.js');
await import('../../server/cli/seedSamples.js');
await start({ distDir: dist });
