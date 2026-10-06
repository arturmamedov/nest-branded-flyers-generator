import { describe, expect, it } from 'vitest';
import { offerDraft, takeDraft, type Handoff } from '../../src/editor/handoff.js';
import { newFlyerData } from '../../src/shared/defaults.js';

/* The AI page hands its flyer to the editor in memory (src/editor/handoff.ts): never the URL, never storage, so
   nothing is kept until the staff member saves, and a reload or a later "New flyer" starts blank. */

const draft = (): Handoff['draft'] => ({ title: '', hostel: 'adeje-nest', data: { ...newFlyerData('activity'), share: 'Hola' }, photo: null });

describe('the AI draft handoff', () => {
  it('gives the offered draft, with the idea it came from, to the first editor that takes it, and only to that one', () => {
    const offered = draft();
    offerDraft(offered, 'Yoga mañana a las 9');
    expect(takeDraft()).toEqual({ draft: offered, idea: 'Yoga mañana a las 9' });
    expect(takeDraft()).toBeNull();
  });

  it('has nothing to give when nothing was offered, and a new offer replaces one never taken', () => {
    expect(takeDraft()).toBeNull();
    offerDraft(draft(), 'first');
    offerDraft({ ...draft(), title: 'Second' }, 'second');
    expect(takeDraft()?.idea).toBe('second');
  });

  it('carries the draft’s photo with it: the editor starts from the draft as it was offered', () => {
    // Stage 4 of docs/prompts/ai-flyer-from-photo.md. The handoff passes a draft straight through, so what this holds is
    // that a draft has a photo to carry (the type check: the handoff's draft is the editor's own) and that nothing is
    // dropped on the way. That the AI page offers the picture, and that the flyer opens with it in a frame, is the
    // browser's to prove (tests/render/ai.spec.ts).
    const photo = { id: 7, url: 'uploads/7.jpg', width: 1153, height: 2048 };
    const offered: Handoff['draft'] = { ...draft(), photo };
    offerDraft(offered, 'Karaoke night 06/10');
    expect(takeDraft()?.draft).toEqual(offered);
    expect(takeDraft()).toBeNull();
  });
});
