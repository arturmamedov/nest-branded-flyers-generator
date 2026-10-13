/* How a viewer looks at the library: its flyers as a list, or as a grid of larger pictures. Per viewer, never flyer
   data (prefs.ts). No React and no DOM here, so the rule is tested by itself (tests/unit/library-view.test.ts). */

export const LIBRARY_VIEWS = ['list', 'grid'] as const;
export type LibraryView = (typeof LIBRARY_VIEWS)[number];

export const VIEW_LABEL: Record<LibraryView, string> = { list: 'List', grid: 'Grid' };

/** What someone who never chose sees: the list, as the library always was (the owner's answer, 2026-10-13). */
export const DEFAULT_VIEW: LibraryView = 'list';

/** Where the choice is remembered, next to library.hostel and library.template. */
export const VIEW_PREF = 'library.view';

/** The view a stored value names. One that is neither view (nothing stored, an older or a damaged value) is ignored. */
export const viewFrom = (stored: string | null): LibraryView => LIBRARY_VIEWS.find((view) => view === stored) ?? DEFAULT_VIEW;
