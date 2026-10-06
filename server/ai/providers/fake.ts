import { AI_FAKE } from '../../../src/shared/ai.js';
import type { AiBundle } from '../../../src/shared/schema.js';
import { LlmFailure, SCHEMA_NAMES, textOf, type LlmCall, type LlmProvider, type LlmResult } from '../provider.js';

/* The provider the tests and a demo run on: deterministic answers from the bundle's first example, never the
   network. The last user turn steers it: a marker in its text (AI_FAKE.markers), or on a picture read, which has no
   typed text, the picture's width (AI_FAKE.pictureWidths). So the contract suite can ask for every failure over
   HTTP. The twin of php/src/Ai/FakeProvider.php; docs/api-contract.md names the markers and the widths. */

/** The fake's facts live in src/shared/ai.ts (AI_FAKE), so PHP's fake reads the same ones from schema/shared.json. */
export const FAKE_MODEL = AI_FAKE.model;
export const FAKE_MARKERS = AI_FAKE.markers;
export const FAKE_UNKNOWN_HOSTEL = AI_FAKE.unknownHostel;
export const FAKE_PICTURE_WIDTHS = AI_FAKE.pictureWidths;

export class FakeProvider implements LlmProvider {
  readonly name = 'fake' as const;

  constructor(private readonly bundle: Pick<AiBundle, 'examples'>) {}

  async complete(call: LlmCall): Promise<LlmResult> {
    const turn = call.messages.at(-1)?.content ?? '';
    const feature = call.schemaName === SCHEMA_NAMES.photo ? 'photo' : call.schemaName === SCHEMA_NAMES.share ? 'share' : 'flyer';
    const text = textOf(turn);
    const width = typeof turn === 'string' ? undefined : turn.flatMap((part) => (part.type === 'image' ? [part.width] : []))[0];
    /** Whether this call asks for that answer: by a marker in its text, or on a read by its picture's width. */
    const asked = (what: 'invalid' | 'timeout' | 'refused') => (feature === 'photo' ? width === FAKE_PICTURE_WIDTHS[what] : text.includes(FAKE_MARKERS[what]));
    if (asked('timeout')) throw new LlmFailure('timeout', 'The fake provider timed out, as asked');
    if (asked('refused')) throw new LlmFailure('refused', 'The fake provider refused, as asked');

    const example = this.bundle.examples[0];
    if (!example) throw new LlmFailure('provider', 'The bundle holds no example to answer with');
    let json: unknown;
    if (feature === 'photo') {
      // The words the first example's flyer is made from: a read followed by Generate gives that example's flyer.
      json = { text: asked('invalid') ? 42 : width === FAKE_PICTURE_WIDTHS.noWords ? '' : example.text };
    } else if (asked('invalid')) json = feature === 'share' ? { share: 42 } : { brief: 42, assumptions: [] };
    else if (feature === 'share') json = { share: example.answer.brief.share ?? '' };
    else if (text.includes(FAKE_MARKERS.unknownHostel)) json = { ...example.answer, brief: { ...example.answer.brief, hostel: FAKE_UNKNOWN_HOSTEL } };
    else json = example.answer;
    return { json, raw: JSON.stringify(json), usage: { input: 10, output: 20 }, model: FAKE_MODEL };
  }
}
