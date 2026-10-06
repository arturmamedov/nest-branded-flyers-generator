import { describe, expect, it } from 'vitest';
import { offerDraft, takeDraft, type Handoff } from '../../src/editor/handoff.js';
import { newFlyerData, withPhoto } from '../../src/shared/defaults.js';

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

  it('carries the photo the flyer opens with: the picture its idea was read from, uploaded on the way, and the flyer as a photo lands on it', () => {
    // Stage 4 of docs/prompts/ai-flyer-from-photo.md. The draft is the editor's own, whole: it starts from it as it is.
    const photo = { id: 7, url: 'uploads/7.jpg', width: 1153, height: 2048 };
    const offered: Handoff['draft'] = { ...draft(), data: withPhoto({ ...draft().data, photoMode: 'none' }), photo };
    offerDraft(offered, 'Karaoke night 06/10');
    const taken = takeDraft();
    expect(taken?.draft.photo).toEqual(photo);
    expect(taken?.draft.data.photoMode, 'in a frame, as a photo dropped on "No photo" lands').toBe('band');
    expect(taken?.draft).toEqual(offered);
  });
});
