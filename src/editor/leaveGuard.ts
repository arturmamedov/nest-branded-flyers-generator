import { useEffect, useLayoutEffect } from 'react';

/* Every way out of an editor with unsaved work asks first:
   - a move inside the app (the ← Library link, Back and Forward, a typed #/…) is a hash
     change, which never fires beforeunload: route.ts asks mayLeave() and cancels a refusal (or
     undoes one the browser won't let it cancel); the ← Library link also asks on its own;
   - closing or reloading the tab, or leaving for another site: beforeunload, in the
     browser's own words. Desktop browsers show it; phones (iOS Safari above all) may not;
   - a photo dropped anywhere but the preview would open in the tab: refused outright.
   One editor is mounted at a time (App keys it on each move to another page), so one flag is enough. */

export const LEAVE_PROMPT = 'This flyer has unsaved changes. Leave without saving?';

let armed = false;

const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (armed) e.preventDefault();
};

// Window listeners run after the preview's own (React listens on the root): a drop it took is its own.
const refuseStrayFile = (e: DragEvent) => {
  if (e.defaultPrevented || !e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'none';
};

/** Arms the guard while there is unsaved work; refuses stray file drops while the editor is mounted. */
export function useLeaveGuard(unsaved: boolean) {
  // A layout effect arms it before the browser paints, so no frame lets a move through unasked
  // (an upload's answer lands outside any input event). beforeunload is listened to only while
  // armed, so a clean page stays eligible for the back/forward cache.
  useLayoutEffect(() => {
    if (!unsaved) return;
    armed = true;
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      armed = false;
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [unsaved]);

  useEffect(() => {
    window.addEventListener('dragover', refuseStrayFile);
    window.addEventListener('drop', refuseStrayFile);
    return () => {
      window.removeEventListener('dragover', refuseStrayFile);
      window.removeEventListener('drop', refuseStrayFile);
    };
  }, []);
}

/** Asks before a move inside the app. A yes disarms the guard, so nothing asks twice on the way out. */
export function mayLeave(): boolean {
  if (armed && !confirm(LEAVE_PROMPT)) return false;
  armed = false;
  return true;
}
