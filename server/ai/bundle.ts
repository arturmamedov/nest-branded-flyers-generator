import { readFileSync } from 'node:fs';
import { AiBundleSchema, type AiBundle } from '../../src/shared/schema.js';
import { AI_BUNDLE_FILE } from '../paths.js';

/** schema/ai.json, as `npm run gen` wrote it: the prompts, the few-shot examples and the schemas. Checked on load,
    so a stale or missing bundle fails at start-up, not on a staff member's request. PHP reads the same file. */
export function loadBundle(file = AI_BUNDLE_FILE): AiBundle {
  return AiBundleSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
