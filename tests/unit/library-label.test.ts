import { describe, expect, it } from 'vitest';
import { ALL_LABELS, LABEL_FILTER_OPTIONS, LABEL_PREF, labelFilterFrom } from '../../src/editor/libraryLabel';
import { FLYER_LABELS, LABEL_SLUGS, NO_LABEL } from '../../src/shared/labels';

/* The library's filter by label, as this viewer left it (src/editor/libraryLabel.ts): how they look at the library,
   never flyer data. */

describe('the library’s filter by label', () => {
  it('is remembered next to the other two filters', () => {
    expect(LABEL_PREF).toBe('library.label');
  });

  it('is every flyer for someone who never chose', () => {
    expect(ALL_LABELS).toBe('');
    expect(labelFilterFrom(null)).toBe(ALL_LABELS);
    expect(labelFilterFrom('')).toBe(ALL_LABELS);
  });

  it('keeps a stored label of the list, and "no label"', () => {
    for (const slug of LABEL_SLUGS) expect(labelFilterFrom(slug), slug).toBe(slug);
    expect(labelFilterFrom(NO_LABEL)).toBe(NO_LABEL);
  });

  it('ignores a stored value that is no label any more: taken off the list, or damaged', () => {
    for (const stored of ['a-label-taken-off-the-list', 'Dinners', ' dinners', 'null', '[]']) expect(labelFilterFrom(stored), stored).toBe(ALL_LABELS);
  });

  it('offers every flyer, the ones with no label, then each label by its name in the list’s order', () => {
    expect(LABEL_FILTER_OPTIONS).toEqual([
      { value: ALL_LABELS, text: 'All labels' },
      { value: NO_LABEL, text: 'No label' },
      ...FLYER_LABELS.map((label) => ({ value: label.slug, text: label.name })),
    ]);
  });
});
