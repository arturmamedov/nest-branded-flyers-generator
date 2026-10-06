import type { AiFeatureOn } from '../shared/ai';
import { AiUsedUp } from './panel';

/* "From a photo" on the AI page (docs/prompts/ai-flyer-from-photo.md, stage 3): what a staff member sees of the
   picture read. It makes no request of its own: AiPage has the picture read and takes the words. */

/** `ai` is the picture read as api/config lists it: its own limit, and what is left of it today. */
export function AiPhoto({ ai }: { ai: AiFeatureOn }) {
  const left = ai.remaining;
  return (
    <>
      <button type="button" className="btn btn-accent" disabled>
        ✨ Read the picture <span className="ai-left">({left} left today)</span>
      </button>
      <AiUsedUp feature={ai.name} limit={ai.limit} left={left} />
    </>
  );
}
