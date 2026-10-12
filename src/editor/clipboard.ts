/* The one way the editor writes to the clipboard (the editor's UX round, Part 3): the share text, and the flyer as a
   picture. Both answer the same way, "copied" or why not, and neither ever throws. No React here, and the browser
   comes in as a parameter, so the rule is tested without one (tests/unit/clipboard.test.ts). */

/** Why a copy did not happen. `unavailable`: the browser gives this page no clipboard at all (only https and the
    device itself get one, so a phone on a LAN address over http has none; or the browser is too old). `refused`: it
    has one and said no (no tap close enough behind the call, the tab not in front, a permission). */
export type CopyFailure = 'unavailable' | 'refused';

export type Copied = { ok: true } | { ok: false; why: CopyFailure };

/** What this needs of a browser: `window` is one. */
export interface ClipboardHost {
  navigator: {
    clipboard?: {
      writeText?: (text: string) => Promise<void>;
      write?: (items: ClipboardItem[]) => Promise<void>;
    };
  };
  ClipboardItem?: {
    new (items: Record<string, Promise<Blob>>): ClipboardItem;
    /** Newer browsers say which types they take; an older one is taken at its word. */
    supports?: (type: string) => boolean;
  };
}

const PNG = 'image/png';
const COPIED: Copied = { ok: true };
const no = (why: CopyFailure): Copied => ({ ok: false, why });

/** What the staff member reads when a copy did not happen: that it did not, why, and what to do instead (the owner's
    phone said nothing at "Copy text", 2026-10-07). */
export const COPY_FAILED: Record<'text' | 'image', Record<CopyFailure, string>> = {
  text: {
    unavailable: 'Couldn’t copy: this browser gives the page no clipboard here. Select the text instead.',
    refused: 'Couldn’t copy: the browser refused. Select the text instead.',
  },
  image: {
    unavailable: 'Couldn’t copy the image: this browser gives the page no clipboard here. Download it instead.',
    refused: 'Couldn’t copy the image: the browser refused. Keep this tab in front and try again, or download it.',
  },
};

/** Copies text. Call it inside the tap that asked for it. */
export function copyText(text: string, host: ClipboardHost = window): Promise<Copied> {
  const clipboard = host.navigator.clipboard;
  // Without a clipboard there is nothing to call: reading `writeText` off it threw, before any promise could say so.
  if (!clipboard?.writeText) return Promise.resolve(no('unavailable'));
  try {
    return clipboard.writeText(text).then(
      () => COPIED,
      () => no('refused'),
    );
  } catch {
    return Promise.resolve(no('refused'));
  }
}

/** Whether this browser can put a picture on the clipboard: a PNG, the one picture type browsers take. */
export const canCopyImage = (host: ClipboardHost = window): boolean =>
  typeof host.navigator.clipboard?.write === 'function' && typeof host.ClipboardItem === 'function' && (host.ClipboardItem.supports?.(PNG) ?? true);

/** Copies a picture that is still being made. Call it inside the tap that asked for it, with a promise for the PNG:
    a browser lets a page write only close to that tap (within 5 s in Chrome 143, measured; at once in Safari), and a
    render can take longer. The clipboard is asked now and waits for the picture. A picture that fails to be made is
    a failed copy here; its own reason is the caller's to say. */
export function copyImage(png: Promise<Blob>, host: ClipboardHost = window): Promise<Copied> {
  // Whoever is not handed the promise must not leave its failure unheard: the caller hears it from its own.
  const unheard = (answer: Copied) => {
    png.catch(() => {});
    return Promise.resolve(answer);
  };
  if (!canCopyImage(host)) return unheard(no('unavailable'));
  try {
    return host.navigator.clipboard!.write!([new host.ClipboardItem!({ [PNG]: png })]).then(
      () => COPIED,
      () => no('refused'),
    );
  } catch {
    // An older browser's ClipboardItem that takes no promise.
    return unheard(no('refused'));
  }
}
