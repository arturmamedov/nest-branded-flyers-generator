import { start } from './start.js';

// The app's server, serving the release's build (dist/) or, in dev, Vite. tests/proof/server.ts starts the same
// server on the tests' own build.
await start();
