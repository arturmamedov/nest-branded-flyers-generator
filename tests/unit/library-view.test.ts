import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, LIBRARY_VIEWS, VIEW_PREF, viewFrom } from '../../src/editor/libraryView.js';

/* The library's view, list or grid (src/editor/libraryView.ts): a per-viewer choice kept in localStorage. */

describe('the library’s view', () => {
  it('is the list for someone who never chose', () => {
    expect(DEFAULT_VIEW).toBe('list');
    expect(viewFrom(null)).toBe('list');
  });

  it('is the stored one when it names a view', () => {
    for (const view of LIBRARY_VIEWS) expect(viewFrom(view)).toBe(view);
  });

  it('ignores a stored value that is neither view', () => {
    for (const stored of ['', 'Grid', 'tiles', 'list ', '{"view":"grid"}']) expect(viewFrom(stored), JSON.stringify(stored)).toBe(DEFAULT_VIEW);
  });

  it('is remembered beside the library’s filters', () => {
    expect(VIEW_PREF).toBe('library.view');
  });
});
