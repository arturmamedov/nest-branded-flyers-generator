import { registerLook } from '../../src/shared/looks.js';
import { PROOF_LOOK } from './look.js';

/* The proof look joins the registry. Imported first, before anything reads the registry (schema.ts when it loads,
   loadConfig() when it runs): by the tests' own build (vite.proof.config.ts puts tests/proof/client.ts first in both
   entries), by its server (tests/proof/server.ts), and by its unit tests (tests/unit/proof-look.test.ts). */
registerLook(PROOF_LOOK);
