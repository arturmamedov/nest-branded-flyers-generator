import { describe, expect, it } from 'vitest';
import { offerDraft, takeDraft } from '../../src/editor/handoff.js';
import { newFlyerData } from '../../src/shared/defaults.js';

/* The AI page hands its flyer to the editor in memory (src/editor/handoff.ts): never the URL, never storage, so
   nothing is kept until the staff member saves, and a reload or a later "New flyer" starts blank. */

const draft = () => ({ title: '', hostel: 'adeje-nest', data: { ...newFlyerData('activity'), share: 'Hola' } });

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
});
