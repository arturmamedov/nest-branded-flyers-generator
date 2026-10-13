/* The flyer's ways out as a picture (the editor's UX round, Part 3), for whichever page offers them: the editor, whose
   picture is "save, then export", and the library, whose flyers are saved. One home, so both say and do the same.
   No React here: the page comes in as a parameter, and so does the browser, so the rules are tested without either
   (tests/unit/picture-actions.test.ts). */

import { CANVASES, type CanvasId } from '../shared/layout';
import { COPY_FAILED, copyImage, copyText, type ClipboardHost, type Copied } from './clipboard';
import type { ExportFormat } from './export';
import { PICTURE_TYPE, type ExportAction } from './exportActions';
import { sharePicture, type ShareHost } from './shareSheet';

/** What copying the flyer as a picture answers, and the step its toast then offers. A browser's clipboard holds the
    picture or the caption, and the app pasted into keeps one of them: two pastes, one tap each. */
const imageCopied = (canvas: CanvasId) => `Image copied (${CANVASES[canvas].width} × ${CANVASES[canvas].height}).`;
export const COPY_CAPTION = 'Copy the caption';
export const CAPTION_COPIED = 'Caption copied.';

/** What the system's share sheet answers (shareSheet.ts). It is handed the picture and the caption, and what an app
    does with the caption is the app's: the caption is on the clipboard too, and the toast says so when it is. */
export const SHARED = 'Shared.';
export const SHARED_WITH_CAPTION = 'Shared. The caption is on the clipboard too: paste it if the app left it out.';
/** The sheet opens only inside a tap, and the picture took longer to make than a tap counts for: a second tap. */
export const PICTURE_READY = 'The picture is ready.';
export const SHARE_NOW = 'Share now';
export const SHEET_OPEN = 'The share sheet is already open.';
export const SHEET_FAILED = 'Couldn’t open the share sheet. Download the picture instead.';

/** A picture made for the share sheet, with the caption that goes beside it and the canvas it is of: kept while the
    toast offers "Share now". */
export interface Ready {
  picture: File;
  caption: string;
  canvas: CanvasId;
}

/** What an action came to, as the page holds it: its words, and the next step its toast offers, if any. The step is
    data here and a button only when it is drawn, with the flyer as it is then: the caption to copy after a picture
    was copied, or a picture that is ready for its sheet. */
export interface PictureMessage {
  kind: 'ok' | 'error';
  text: string;
  next?: 'caption' | Ready;
}

/** What an action answers to the page that ran it: its success, in words or with a next step, or nothing. */
export type Answer = string | Omit<PictureMessage, 'kind'> | void;

/** What the ways out need of the page that offers them. */
export interface PictureHost {
  /** The page's one action at a time (oneAction.ts). It calls `fn` at once, before it awaits anything. */
  run: (kind: ExportAction, fn: () => Promise<Answer>) => void;
  /** A message outside an action: the caption's copy, and what the share sheet answered. */
  say: (message: PictureMessage) => void;
  /** The flyer as a picture of `canvas`. The editor saves first; the library's flyer is saved. */
  picture: (format: ExportFormat) => Promise<{ blob: Blob; filename: string }>;
  /** The flyer's caption as it is now. */
  caption: string;
  canvas: CanvasId;
  /** Whether the page that asked is still the one on screen, for an answer that lands late. */
  onScreen: () => boolean;
  /** Which of the page's actions is in hand, counted (oneAction.ts). */
  turn: { current: number };
  /** A share sheet this page asked for and has no answer from yet: one at a time. */
  sheet: { current: boolean };
  /** Whether a picture kept for "Share now" may no longer be the flyer (unsaved changes in the editor). */
  stale: boolean;
  /** The browser, for the tests: `window` unless given. */
  browser?: ClipboardHost & ShareHost;
}

/** Hands the browser a file to save. */
function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function pictureActions(host: PictureHost) {
  const { run, say, picture, caption, canvas, onScreen, turn, sheet, stale } = host;
  const browser = () => host.browser ?? window;

  const download = (format: ExportFormat) =>
    run(format, async () => {
      const { blob, filename } = await picture(format);
      saveFile(blob, filename);
      return `Downloaded ${filename} (${CANVASES[canvas].width} × ${CANVASES[canvas].height}).`;
    });

  // The flyer on the clipboard, as a PNG (the only picture a browser's clipboard takes). A browser lets a page write
  // there only close to the tap that asked: Chrome refuses a write started 6 s after it, and Safari one started
  // after anything was awaited (the spike, 2026-10-12). A save and a render can take longer than that. So both start
  // here, inside the tap, and the clipboard is handed a promise for the picture, which it waits for.
  const copy = () =>
    run('copy', async () => {
      const made = picture('png');
      const copied = copyImage(
        made.then((p) => p.blob),
        browser(),
      );
      // The picture first: a save or a render that failed says so itself, where the clipboard would only say no.
      await made;
      const answer = await copied;
      if (!answer.ok) throw new Error(COPY_FAILED.image[answer.why]);
      return { text: imageCopied(canvas), next: 'caption' as const };
    });

  // The step the toast offers after that: the caption as it is now, for a second paste. Inside its own tap.
  const copyCaption = () =>
    void copyText(caption, browser()).then((copied) => say(copied.ok ? { kind: 'ok', text: CAPTION_COPIED } : { kind: 'error', text: COPY_FAILED.text[copied.why] }));

  // Asks the device for its share sheet, with a picture that is made. Call it inside a tap. The page does not wait
  // for the answer: a sheet stays open for as long as the staff member likes, and one that never answers must not
  // leave the page greyed. What it answers is a toast when it comes, unless another action has started since, or
  // the page is no longer the one on screen.
  // `captionCopied` is the caption's own copy, started in the same tap: the toast says the caption is on the
  // clipboard only when that copy said so.
  const openSheet = (ready: Ready, captionCopied: Promise<Copied> | null, secondTap: boolean) => {
    const mine = turn.current;
    sheet.current = true;
    void Promise.all([sharePicture(ready.picture, ready.caption, browser()), captionCopied]).then(([answer, copied]) => {
      sheet.current = false;
      if (!onScreen() || turn.current !== mine) return;
      if (answer === 'shared') say({ kind: 'ok', text: copied?.ok ? SHARED_WITH_CAPTION : SHARED });
      // The tap had run out by the time the picture was made: it waits in the toast for a tap of its own.
      else if (answer === 'blocked' && !secondTap) say({ kind: 'ok', text: PICTURE_READY, next: ready });
      // The device says a sheet of this page's is open. The picture is kept for when it is not.
      else if (answer === 'open') say({ kind: 'error', text: SHEET_OPEN, next: ready });
      // Closed without sharing is the staff member's own choice, and says nothing.
      else if (answer !== 'closed') say({ kind: 'error', text: SHEET_FAILED });
    });
  };

  // The caption on the clipboard, for a tap that opens the sheet. What an app does with the sheet's text is the app's
  // (one shows it under the picture, another drops it), and a paste is then one tap away.
  const captionFor = (text: string) => (text.trim() ? copyText(text, browser()) : null);

  // The system's share sheet, with the picture and the caption (the owner's "Yes, with copy image", 2026-10-07): how
  // a phone hands a flyer to WhatsApp or Instagram. Unlike the clipboard, the sheet takes no promise for a picture
  // still being made, and opens only while its tap counts (5 s, measured). So the picture is made first, and when
  // that took too long the toast offers "Share now".
  const share = () =>
    run('share', async () => {
      // The caption goes on the clipboard first, inside the tap, before the picture is made.
      const captionCopied = captionFor(caption);
      const { blob, filename } = await picture('png');
      // The staff member left while the picture was being made: no sheet opens over another page.
      if (!onScreen()) return;
      openSheet({ picture: new File([blob], filename, { type: PICTURE_TYPE }), caption, canvas }, captionCopied, false);
    });

  // The toast's "Share now", a tap of its own, so the caption is copied again in it: minutes may have passed, and the
  // clipboard may hold something else by now. A flyer or a canvas changed since the picture was made is shared as it
  // is now: the picture is made again, which may need its own second tap.
  const shareNow = (ready: Ready) => {
    // Pressed twice, it is one sheet: the second press, with the first sheet still open, would only be told so by
    // the device, and that answer would take the place of the toast that holds the picture. (Share… itself still
    // asks: a sheet whose answer never came must not end sharing for good.)
    if (sheet.current) return;
    if (stale || ready.canvas !== canvas) return void share();
    openSheet(ready, captionFor(ready.caption), true);
  };

  const act: Record<ExportAction, () => void> = { copy, share, png: () => download('png'), jpg: () => download('jpg') };

  /** A toast's next step, drawn with the flyer as it is now: a caption emptied since has nothing to copy. Nor is a
      picture offered for its sheet once a frame has no photo: Share… itself is greyed then. */
  const step = (next: PictureMessage['next'], needsPhoto: boolean): { label: string; onPress: () => void } | undefined =>
    next === 'caption'
      ? caption.trim()
        ? { label: COPY_CAPTION, onPress: copyCaption }
        : undefined
      : next && !needsPhoto
        ? { label: SHARE_NOW, onPress: () => shareNow(next) }
        : undefined;

  return { act, step };
}
