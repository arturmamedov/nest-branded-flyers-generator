import { useSyncExternalStore } from 'react';

/** Whether a media query matches, kept up to date: the window narrow enough for the form to sit on top (the toasts),
    a finger as the main pointer (the toolbar's first button). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (changed) => {
      const media = matchMedia(query);
      media.addEventListener('change', changed);
      return () => media.removeEventListener('change', changed);
    },
    () => matchMedia(query).matches,
  );
}
