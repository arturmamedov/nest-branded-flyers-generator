/* Per-viewer conveniences (the library's hostel filter, the editor's canvas),
   remembered in localStorage. Never flyer data: a private window, blocked site
   data or a full quota just means nothing is remembered. */

export function localStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function localStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered, and that's fine */
  }
}
