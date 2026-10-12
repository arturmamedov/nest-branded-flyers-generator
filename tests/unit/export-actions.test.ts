import { describe, expect, it } from 'vitest';
import { EXPORT_ACTION, TOUCH_QUERY, entryText, exportActions } from '../../src/editor/exportActions.js';

/* What the editor's toolbar offers for the flyer as a picture (src/editor/exportActions.ts; the editor's UX round,
   Part 3): one first button, and the entries behind "Download". The owner chose "Copy beside Download", and "Yes,
   with copy image" to a "Share…" entry for phones (2026-10-07). */

const DESKTOP = false;
const PHONE = true;
const ALL = { copy: true, share: true };

describe('the toolbar’s ways out', () => {
  it('a desktop gets Copy image first; the two downloads are behind Download, and Share… after them', () => {
    expect(exportActions(ALL, DESKTOP)).toEqual({ first: 'copy', menu: ['png', 'jpg', 'share'] });
  });

  it('a phone gets Share… first: the sheet is how it hands a picture to an app. Copy image is behind Download', () => {
    expect(exportActions(ALL, PHONE)).toEqual({ first: 'share', menu: ['png', 'jpg', 'copy'] });
  });

  it('where the device’s own first way out is not possible, the other one takes its place', () => {
    expect(exportActions({ copy: true, share: false }, PHONE)).toEqual({ first: 'copy', menu: ['png', 'jpg'] });
    expect(exportActions({ copy: false, share: true }, DESKTOP)).toEqual({ first: 'share', menu: ['png', 'jpg'] });
  });

  it('a desktop browser with no share sheet is the owner’s [Copy image] [Download ▾], the menu holding PNG and JPG', () => {
    expect(exportActions({ copy: true, share: false }, DESKTOP)).toEqual({ first: 'copy', menu: ['png', 'jpg'] });
  });

  it('where neither is possible Download stands alone: nothing is offered that would only fail', () => {
    for (const touch of [DESKTOP, PHONE]) expect(exportActions({ copy: false, share: false }, touch)).toEqual({ first: null, menu: ['png', 'jpg'] });
  });

  it('the two downloads are always there, in the same order', () => {
    for (const copy of [true, false])
      for (const share of [true, false])
        for (const touch of [DESKTOP, PHONE]) expect(exportActions({ copy, share }, touch).menu.slice(0, 2)).toEqual(['png', 'jpg']);
  });

  it('“a phone” is a finger as the main pointer, the signal “Take a photo” already goes by', () => {
    expect(TOUCH_QUERY).toBe('(pointer: coarse)');
  });

  it('every action has a name and a word for while it works, and an entry reads its name and its hint', () => {
    for (const { label, busy } of Object.values(EXPORT_ACTION)) {
      expect(label).not.toBe('');
      expect(busy.endsWith('…')).toBe(true);
    }
    expect(entryText('png')).toBe('PNG · sharpest');
    expect(entryText('jpg')).toBe('JPG · smaller file');
    expect(entryText('copy')).toBe('Copy image');
    expect(entryText('share')).toBe('Share…');
  });
});
