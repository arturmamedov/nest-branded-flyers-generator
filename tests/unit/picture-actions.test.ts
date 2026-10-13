import { describe, expect, it } from 'vitest';
import type { ClipboardHost } from '../../src/editor/clipboard.js';
import { PICTURE_READY, SHARED_WITH_CAPTION, SHARE_NOW, pictureActions, type PictureHost, type PictureMessage } from '../../src/editor/pictureActions.js';
import type { ShareHost } from '../../src/editor/shareSheet.js';

/* The flyer's ways out as a picture, for whichever page offers them (src/editor/pictureActions.ts): the editor, which
   saves first, and the library, whose flyers are saved. The page and the browser come in as parameters. The browser
   specs hold the editor to all of it (clipboard.spec.ts, share.spec.ts); these are the rules the two pages share. */

const PNG = new Blob(['png'], { type: 'image/png' });
const tick = () => new Promise((resolve) => setTimeout(resolve));

/** A page with one action at a time, as Editor.tsx and Library.tsx run them, and a browser that notes what it is
    asked. `sheet` is what the device's share sheet answers. */
function page({ sheet = async () => {}, stale = false }: { sheet?: () => Promise<void>; stale?: boolean } = {}) {
  const log: string[] = [];
  const said: PictureMessage[] = [];
  let made = 0;
  let here = true;
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const browser: ClipboardHost & ShareHost = {
    navigator: {
      clipboard: {
        writeText: async (text) => void log.push(`text:${text}`),
        write: async (items) => {
          log.push('write');
          await (items[0] as unknown as { png: Promise<Blob> }).png;
          log.push('written');
        },
      },
      canShare: () => true,
      share: (data) => {
        log.push(`sheet:${data.files?.length}:${data.text ?? ''}`);
        return sheet();
      },
    },
    ClipboardItem: class {
      png: Promise<Blob>;
      constructor(items: Record<string, Promise<Blob>>) {
        this.png = items['image/png'];
      }
    } as unknown as ClipboardHost['ClipboardItem'],
  };
  const host: PictureHost = {
    run: (_kind, fn) =>
      void fn().then(
        (ok) => ok && said.push({ kind: 'ok', ...(typeof ok === 'string' ? { text: ok } : ok) }),
        (e) => said.push({ kind: 'error', text: e.message }),
      ),
    say: (m) => said.push(m),
    picture: async () => {
      made += 1;
      log.push('picture asked');
      await held;
      return { blob: PNG, filename: 'pool-party-12-whatsapp.png' };
    },
    caption: 'Pool party on Saturday',
    canvas: 'whatsapp',
    onScreen: () => here,
    turn: { current: 0 },
    sheet: { current: false },
    stale,
    browser,
  };
  return { host, log, said, release, made: () => made, leave: () => void (here = false) };
}

describe('copying the picture', () => {
  it('asks the clipboard inside the tap, before the picture is made, and then offers the caption', async () => {
    const p = page();
    pictureActions(p.host).act.copy();
    expect(p.log, 'both started before anything was awaited').toEqual(['picture asked', 'write']);
    p.release();
    await tick();
    expect(p.said).toEqual([{ kind: 'ok', text: 'Image copied (1080 × 1440).', next: 'caption' }]);
    const step = pictureActions(p.host).step(p.said[0].next, false);
    expect(step?.label).toBe('Copy the caption');
    step!.onPress();
    await tick();
    expect(p.log.at(-1)).toBe('text:Pool party on Saturday');
    expect(p.said.at(-1)).toEqual({ kind: 'ok', text: 'Caption copied.' });
  });

  it('offers no caption to copy where the flyer has none', () => {
    const p = page();
    expect(pictureActions({ ...p.host, caption: '  ' }).step('caption', false)).toBeUndefined();
  });
});

describe('sharing the picture', () => {
  it('copies the caption at the tap, makes the picture, then opens the sheet with both', async () => {
    const p = page();
    pictureActions(p.host).act.share();
    expect(p.log).toEqual(['text:Pool party on Saturday', 'picture asked']);
    p.release();
    await tick();
    expect(p.log.at(-1)).toBe('sheet:1:Pool party on Saturday');
    expect(p.said).toEqual([{ kind: 'ok', text: SHARED_WITH_CAPTION }]);
  });

  it('keeps a picture whose tap ran out for "Share now", which is one sheet however often it is pressed', async () => {
    let answers = 0;
    let open = () => {};
    const p = page({
      // The first sheet is refused (the tap ran out); the next stays open until `open()`.
      sheet: () => (answers++ === 0 ? Promise.reject(new DOMException('no', 'NotAllowedError')) : new Promise<void>((resolve) => (open = resolve))),
    });
    pictureActions(p.host).act.share();
    p.release();
    await tick();
    expect(p.said.at(-1)).toMatchObject({ kind: 'ok', text: PICTURE_READY });
    const ready = p.said.at(-1)!.next;
    const step = pictureActions(p.host).step(ready, false)!;
    expect(step.label).toBe(SHARE_NOW);
    expect(pictureActions(p.host).step(ready, true), 'not offered once a frame has no photo').toBeUndefined();

    const sheets = () => p.log.filter((l) => l.startsWith('sheet:')).length;
    step.onPress();
    step.onPress();
    expect(sheets(), 'the first one and one more').toBe(2);
    expect(p.log.filter((l) => l.startsWith('text:')).length, 'the caption copied again in its own tap').toBe(2);
    expect(p.made(), 'the picture that was kept').toBe(1);
    open();
    await tick();
    expect(p.said.at(-1)).toEqual({ kind: 'ok', text: SHARED_WITH_CAPTION });
  });

  it('makes the picture again for "Share now" when the flyer has changed since', async () => {
    const p = page({ sheet: () => Promise.reject(new DOMException('no', 'NotAllowedError')), stale: true });
    pictureActions(p.host).act.share();
    p.release();
    await tick();
    pictureActions(p.host).step(p.said.at(-1)!.next, false)!.onPress();
    expect(p.made()).toBe(2);
  });

  it('says nothing of a sheet that answers after another action has started, or after the page was left', async () => {
    for (const leave of [(p: ReturnType<typeof page>) => void (p.host.turn.current += 1), (p: ReturnType<typeof page>) => p.leave()]) {
      let open = () => {};
      const p = page({ sheet: () => new Promise<void>((resolve) => (open = resolve)) });
      pictureActions(p.host).act.share();
      p.release();
      await tick();
      leave(p);
      open();
      await tick();
      expect(p.said).toEqual([]);
    }
  });
});
