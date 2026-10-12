import { describe, expect, it } from 'vitest';
import { COPY_FAILED, canCopyImage, copyImage, copyText, type ClipboardHost } from '../../src/editor/clipboard.js';

/* The one way the editor writes to the clipboard (src/editor/clipboard.ts; the editor's UX round, Part 3): the share
   text and the flyer's picture answer the same way, "copied" or why not, and never throw. The owner's phone said
   nothing at "Copy text" (2026-10-07): over plain http a browser gives a page no clipboard at all, and the call threw
   before there was a promise to answer. */

const PNG = new Blob(['png'], { type: 'image/png' });

/** A stand-in for the browser's ClipboardItem: it keeps what it was made of. */
class Item {
  static supports = (type: string): boolean => type === 'image/png';
  constructor(readonly data: Record<string, unknown>) {}
}

/** A browser with a clipboard that takes everything, and remembers it. */
function browser(over: { writeText?: (text: string) => Promise<void>; write?: (items: unknown[]) => Promise<void>; Item?: unknown } = {}) {
  const wrote: unknown[] = [];
  const host = {
    navigator: {
      clipboard: {
        writeText: over.writeText ?? (async (text: string) => void wrote.push(text)),
        // As a browser does: it waits for the picture before it answers.
        write:
          over.write ??
          (async (items: unknown[]) => {
            for (const item of items) await Promise.all(Object.values((item as Item).data));
            wrote.push(...items);
          }),
      },
    },
    ClipboardItem: 'Item' in over ? over.Item : Item,
  } as unknown as ClipboardHost;
  return { host, wrote };
}

/** A page over plain http: no clipboard, and no ClipboardItem either. */
const NO_CLIPBOARD = { navigator: {} } as ClipboardHost;

const refusal = () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'));

describe('copying the share text', () => {
  it('copies it, and says so', async () => {
    const { host, wrote } = browser();
    expect(await copyText('¡HOY tenemos plan!', host)).toEqual({ ok: true });
    expect(wrote).toEqual(['¡HOY tenemos plan!']);
  });

  it('a page with no clipboard is told so, where the call used to throw', async () => {
    expect(await copyText('caption', NO_CLIPBOARD)).toEqual({ ok: false, why: 'unavailable' });
  });

  it('a clipboard that refuses is told apart from none at all', async () => {
    expect(await copyText('caption', browser({ writeText: refusal }).host)).toEqual({ ok: false, why: 'refused' });
  });

  it('a clipboard that throws instead of answering is a refusal too, never an error on the page', async () => {
    const thrown = () => {
      throw new TypeError('Illegal invocation');
    };
    expect(await copyText('caption', browser({ writeText: thrown }).host)).toEqual({ ok: false, why: 'refused' });
  });
});

describe('copying the flyer as a picture', () => {
  it('hands the clipboard a promise for the PNG, before the picture exists', async () => {
    const { host, wrote } = browser();
    let made: (png: Blob) => void = () => {};
    const png = new Promise<Blob>((resolve) => (made = resolve));
    const asked: unknown[][] = [];
    const write = host.navigator.clipboard!.write!.bind(host.navigator.clipboard);
    host.navigator.clipboard!.write = (items) => {
      asked.push(items);
      return write(items);
    };

    const copied = copyImage(png, host);
    // Asked at once, in the same turn: a browser lets a page write only close to the tap that asked for it.
    expect(asked).toHaveLength(1);
    expect((asked[0][0] as unknown as Item).data).toEqual({ 'image/png': png });
    expect(wrote, 'nothing is written until the picture is made').toEqual([]);

    made(PNG);
    expect(await copied).toEqual({ ok: true });
    expect(wrote).toHaveLength(1);
  });

  it('can copy a picture only where the browser has a clipboard, a ClipboardItem, and says it takes a PNG', () => {
    expect(canCopyImage(browser().host)).toBe(true);
    expect(canCopyImage(NO_CLIPBOARD)).toBe(false);
    expect(canCopyImage(browser({ Item: undefined }).host)).toBe(false);
    expect(canCopyImage({ navigator: { clipboard: { writeText: async () => {} } }, ClipboardItem: Item } as unknown as ClipboardHost), 'text only').toBe(false);
    // Playwright's WebKit build on Windows answers this (the spike, 2026-10-12).
    class NoPng extends Item {
      static supports = () => false;
    }
    expect(canCopyImage(browser({ Item: NoPng }).host)).toBe(false);
    // An older browser has no such question to ask: it is taken at its word, and may still refuse the write.
    class Older {
      constructor(readonly data: Record<string, unknown>) {}
    }
    expect(canCopyImage(browser({ Item: Older }).host)).toBe(true);
  });

  it('a page that cannot copy a picture is told so, and a picture that then fails to be made is nobody’s unhandled error', async () => {
    const failed = Promise.reject(new Error('Export failed'));
    expect(await copyImage(failed, NO_CLIPBOARD)).toEqual({ ok: false, why: 'unavailable' });
  });

  it('a refused write is told apart from none at all', async () => {
    expect(await copyImage(Promise.resolve(PNG), browser({ write: refusal }).host)).toEqual({ ok: false, why: 'refused' });
  });

  it('a browser whose ClipboardItem takes no promise is a refusal, never an error on the page', async () => {
    class Strict {
      constructor() {
        throw new TypeError('Failed to construct ClipboardItem');
      }
    }
    expect(await copyImage(Promise.reject(new Error('Export failed')), browser({ Item: Strict }).host)).toEqual({ ok: false, why: 'refused' });
  });

  it('a clipboard that refuses without waiting for the picture leaves the picture’s own failure nobody’s unhandled error', async () => {
    // Found in review (2026-10-12): the write was refused at once, the promise it was handed was never listened to,
    // and a render that then failed was an error on the page with no one to hear it.
    expect(await copyImage(Promise.reject(new Error('Export failed')), browser({ write: refusal }).host)).toEqual({ ok: false, why: 'refused' });
  });

  it('a picture that failed to be made is a failed copy here: the editor says the render’s own reason', async () => {
    expect(await copyImage(Promise.reject(new Error('Export failed')), browser().host)).toEqual({ ok: false, why: 'refused' });
  });
});

describe('the words when a copy did not happen', () => {
  it('say that it did not, why, and what to do instead', () => {
    for (const what of ['text', 'image'] as const) {
      for (const why of ['unavailable', 'refused'] as const) {
        expect(COPY_FAILED[what][why]).toMatch(/^Couldn’t copy/);
        expect(COPY_FAILED[what][why].endsWith('.')).toBe(true);
      }
    }
    expect(COPY_FAILED.text.unavailable).not.toBe(COPY_FAILED.text.refused);
    expect(COPY_FAILED.text.refused).toContain('Select the text instead');
    expect(COPY_FAILED.image.refused).toContain('download it');
  });
});
