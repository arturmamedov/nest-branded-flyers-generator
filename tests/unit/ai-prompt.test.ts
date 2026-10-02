import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFlyerCall, buildShareCall, type PromptBundle } from '../../server/ai/prompt.js';
import type { AiShareRequest } from '../../src/shared/schema.js';

/* The prompt both backends build from the generated bundle, the hostels and the day (tests/fixtures/ai-prompt.json,
   replayed by PHPUnit). The vectors pin every byte: a provider sees the same request whichever backend made it. */

type Vectors = {
  bundle: PromptBundle;
  hostels: { slug: string; name: string; island: string }[];
  now: string;
  cases: { name: string; feature: 'flyer' | 'share'; request: unknown; system: string; messages: { role: string; content: string }[] }[];
};
const vectors = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/ai-prompt.json'), 'utf8')) as Vectors;

describe('the prompt', () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      const call =
        c.feature === 'flyer'
          ? buildFlyerCall(vectors.bundle, vectors.hostels, vectors.now, c.request as { text: string; hostel?: string })
          : buildShareCall(vectors.bundle, vectors.hostels, vectors.now, c.request as AiShareRequest);
      expect(call.system).toBe(c.system);
      expect(call.messages).toEqual(c.messages);
    });
  }
});
