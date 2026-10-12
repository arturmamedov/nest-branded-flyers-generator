import { describe, expect, it } from 'vitest';
import { EXPORT_ACTION, entryText, exportActions } from '../../src/editor/exportActions.js';

/* What the editor's toolbar offers for the flyer as a picture (src/editor/exportActions.ts; the editor's UX round,
   Part 3): one first button, and the entries behind "Download". The owner chose "Copy beside Download" (2026-10-07). */

describe('the toolbar’s ways out', () => {
  it('a browser that can copy a picture gets Copy image first, and the two downloads behind Download', () => {
    expect(exportActions({ copy: true })).toEqual({ first: 'copy', menu: ['png', 'jpg'] });
  });

  it('a browser that cannot copy a picture gets Download alone: nothing is offered that would only fail', () => {
    expect(exportActions({ copy: false })).toEqual({ first: null, menu: ['png', 'jpg'] });
  });

  it('every action has a name and a word for while it works, and an entry reads its name and its hint', () => {
    for (const { label, busy } of Object.values(EXPORT_ACTION)) {
      expect(label).not.toBe('');
      expect(busy.endsWith('…')).toBe(true);
    }
    expect(entryText('png')).toBe('PNG · sharpest');
    expect(entryText('jpg')).toBe('JPG · smaller file');
    expect(entryText('copy')).toBe('Copy image');
  });
});
