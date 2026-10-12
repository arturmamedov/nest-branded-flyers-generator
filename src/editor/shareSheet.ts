/* The system's share sheet, for the flyer as a picture with its caption (the editor's UX round, Part 3; the owner's
   "Yes, with copy image" to a "Share…" entry for phones, 2026-10-07). It is how a phone hands a picture to WhatsApp
   or Instagram. No React here, and the browser comes in as a parameter, so the rule is tested without one
   (tests/unit/share-sheet.test.ts). */

/** What this needs of a browser: `window` is one. */
export interface ShareHost {
  navigator: {
    share?: (data: ShareData) => Promise<void>;
    canShare?: (data: ShareData) => boolean;
  };
}

/** What the sheet answered.
    - `shared`: it handed the picture on.
    - `closed`: the staff member closed it without sharing, which is no failure.
    - `blocked`: no tap close enough behind the call. A tap counts for 5 s (measured, the spike of 2026-10-12), and
      the picture took longer to make: a second tap opens the sheet.
    - `open`: a sheet is already open.
    - `failed`: anything else. */
export type Shared = 'shared' | 'closed' | 'blocked' | 'open' | 'failed';

const ANSWERS: Record<string, Shared> = { AbortError: 'closed', NotAllowedError: 'blocked', InvalidStateError: 'open' };
const answerOf = (error: unknown): Shared => ANSWERS[(error as { name?: string } | null)?.name ?? ''] ?? 'failed';

/** Whether this device says it can share a picture: a sheet, and one that takes a PNG file. Desktop browsers have one
    too (Windows does); a page over plain http has none. */
export function canShareFiles(host: ShareHost = window): boolean {
  const { navigator } = host;
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([], 'flyer.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

/** What the sheet is handed: the picture, and the caption as its text where there is one. What an app does with the
    text is the app's: one shows it under the picture, another drops it. */
export const sheetData = (picture: File, caption: string): ShareData => ({ files: [picture], ...(caption.trim() ? { text: caption } : {}) });

/** Opens the sheet with a picture that is already made. Call it inside a tap: unlike the clipboard, the sheet takes
    no promise for a picture still on its way. It never throws. */
export function sharePicture(picture: File, caption: string, host: ShareHost = window): Promise<Shared> {
  try {
    return host.navigator.share!(sheetData(picture, caption)).then(() => 'shared' as const, answerOf);
  } catch (error) {
    return Promise.resolve(answerOf(error));
  }
}
