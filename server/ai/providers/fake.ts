import { AI_FAKE } from '../../../src/shared/ai.js';
import type { AiBundle } from '../../../src/shared/schema.js';
import { LlmFailure, SCHEMA_NAMES, textOf, type LlmCall, type LlmProvider, type LlmResult } from '../provider.js';

/* The provider the tests and a demo run on: deterministic answers from the bundle's first example, never the
   network. The last user turn steers it (AI_FAKE.markers), so the contract suite can ask for every failure over
   HTTP. The twin of php/src/Ai/FakeProvider.php; docs/api-contract.md names the markers. */

/** The fake's facts live in src/shared/ai.ts (AI_FAKE), so PHP's fake reads the same ones from schema/shared.json. */
export const FAKE_MODEL = AI_FAKE.model;
export const FAKE_MARKERS = AI_FAKE.markers;
export const FAKE_UNKNOWN_HOSTEL = AI_FAKE.unknownHostel;

export class FakeProvider implements LlmProvider {
  readonly name = 'fake' as const;

  constructor(private readonly bundle: Pick<AiBundle, 'examples'>) {}

  async complete(call: LlmCall): Promise<LlmResult> {
    const text = textOf(call.messages.at(-1)?.content ?? '');
    const asked = (marker: string) => text.includes(marker);
    if (asked(FAKE_MARKERS.timeout)) throw new LlmFailure('timeout', 'The fake provider timed out, as asked');
    if (asked(FAKE_MARKERS.refused)) throw new LlmFailure('refused', 'The fake provider refused, as asked');

    const example = this.bundle.examples[0];
    if (!example) throw new LlmFailure('provider', 'The bundle holds no example to answer with');
    const share = call.schemaName === SCHEMA_NAMES.share;
    let json: unknown;
    if (asked(FAKE_MARKERS.invalid)) json = share ? { share: 42 } : { brief: 42, assumptions: [] };
    else if (share) json = { share: example.answer.brief.share ?? '' };
    else if (asked(FAKE_MARKERS.unknownHostel)) json = { ...example.answer, brief: { ...example.answer.brief, hostel: FAKE_UNKNOWN_HOSTEL } };
    else json = example.answer;
    return { json, raw: JSON.stringify(json), usage: { input: 10, output: 20 }, model: FAKE_MODEL };
  }
}
