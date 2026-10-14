import { FLYER_LABELS, LABEL_SLUGS, NO_LABEL } from '../shared/labels';

/* The library's filter by label: which label's flyers this viewer is looking at (the flyers' labels, 2026-10-14).
   Per viewer, never flyer data (prefs.ts). The server does the filtering (GET api/flyers?label=); this is the choice
   and its memory. No React and no DOM here, so it is tested by itself (tests/unit/library-label.test.ts). */

/** Every flyer: what someone who never chose sees. */
export const ALL_LABELS = '';

/** Where the choice is remembered, next to library.hostel and library.template. */
export const LABEL_PREF = 'library.label';

/** The filter a stored value names. One that is no label of the list (nothing stored, a label taken off the list
    since, a damaged value) is ignored. */
export const labelFilterFrom = (stored: string | null): string => (stored !== null && (stored === NO_LABEL || LABEL_SLUGS.includes(stored)) ? stored : ALL_LABELS);

/** What the select offers, in its order: every flyer, the ones with no label yet, then each label by its name. */
export const LABEL_FILTER_OPTIONS: readonly { value: string; text: string }[] = [
  { value: ALL_LABELS, text: 'All labels' },
  { value: NO_LABEL, text: 'No label' },
  ...FLYER_LABELS.map((label) => ({ value: label.slug, text: label.name })),
];
