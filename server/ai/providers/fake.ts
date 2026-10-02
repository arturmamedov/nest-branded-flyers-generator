import type { AiBundle } from '../../../src/shared/schema.js';
import { LlmFailure, SCHEMA_NAMES, type LlmCall, type LlmProvider, type LlmResult } from '../provider.js';

/* The provider the tests and a demo run on: deterministic answers from the bundle's first example, never the
   network. The last user turn steers it (the markers below), so the contract suite can ask for every failure over
   HTTP. The twin of php/src/Ai/FakeProvider.php; docs/api-contract.md names the markers. */

export const FAKE_MODEL = 'fake-1';

export const FAKE_MARKERS = {
  /** An answer that fails the schema. */
  invalid: '[[fake:invalid]]',
  /** A brief for a hostel the site does not have. */
  unknownHostel: '[[fake:unknown-hostel]]',
  timeout: '[[fake:timeout]]',
  refused: '[[fake:refused]]',
} as const;

export const FAKE_UNKNOWN_HOSTEL = 'no-such-nest';

export class FakeProvider implements LlmProvider {
  readonly name = 'fake' as const;
  readonly model = FAKE_MODEL;

  constructor(private readonly bundle: Pick<AiBundle, 'examples'>) {}

  async complete(call: LlmCall): Promise<LlmResult> {
    const text = call.messages.at(-1)?.content ?? '';
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
