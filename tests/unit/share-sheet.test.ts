import { describe, expect, it } from 'vitest';
import { canShareFiles, sharePicture, sheetData, type ShareHost } from '../../src/editor/shareSheet.js';

/* The system's share sheet, for the flyer as a picture with its caption (src/editor/shareSheet.ts; the editor's UX
   round, Part 3; the owner's "Yes, with copy image" to a "Share…" entry for phones, 2026-10-07). The browser comes in
   as a parameter. */

const PICTURE = new File(['png'], 'pool-party-12-whatsapp.png', { type: 'image/png' });

/** A device whose sheet answers as told, and notes what it was handed. */
function device(answer: () => Promise<void>, canShare: (data: ShareData) => boolean = (data) => !!data.files?.length) {
  const handed: ShareData[] = [];
  const host: ShareHost = {
    navigator: {
      canShare,
      share(data) {
        handed.push(data);
        return answer();
      },
    },
  };
  return { host, handed };
}

const says = (name: string) => () => Promise.reject(new DOMException('no', name));

describe('whether the device can share a picture', () => {
  it('says yes where it has a sheet that takes a PNG file', () => {
    expect(canShareFiles(device(async () => {}).host)).toBe(true);
  });

  it('says no with no sheet at all, as over plain http, or with one that takes no files', () => {
    expect(canShareFiles({ navigator: {} })).toBe(false);
    expect(canShareFiles({ navigator: { share: async () => {} } }), 'no way to ask what it takes').toBe(false);
    expect(canShareFiles(device(async () => {}, () => false).host), 'text and links only').toBe(false);
  });

  it('a device that throws at the question is one that cannot', () => {
    const thrown = () => {
      throw new TypeError('files is not supported');
    };
    expect(canShareFiles(device(async () => {}, thrown).host)).toBe(false);
  });

  it('asks about a PNG file, the picture it will hand over', () => {
    const asked: ShareData[] = [];
    canShareFiles(device(async () => {}, (data) => asked.push(data) > 0).host);
    expect(asked).toHaveLength(1);
    expect(asked[0].files?.map((f) => f.type)).toEqual(['image/png']);
  });
});

describe('what the sheet is handed', () => {
  it('the picture, and the caption as its text', () => {
    expect(sheetData(PICTURE, 'TODAY we have a plan!')).toEqual({ files: [PICTURE], text: 'TODAY we have a plan!' });
  });

  it('the picture alone where there is no caption: no empty text for an app to post', () => {
    expect(sheetData(PICTURE, '')).toEqual({ files: [PICTURE] });
    expect(sheetData(PICTURE, '  \n')).toEqual({ files: [PICTURE] });
  });
});

describe('opening the sheet', () => {
  it('hands it the picture and the caption, and says it was shared', async () => {
    const { host, handed } = device(async () => {});
    expect(await sharePicture(PICTURE, 'caption', host)).toBe('shared');
    expect(handed).toEqual([{ files: [PICTURE], text: 'caption' }]);
  });

  it('a sheet the staff member closed is no failure', async () => {
    expect(await sharePicture(PICTURE, '', device(says('AbortError')).host)).toBe('closed');
  });

  it('a call with no tap close enough behind it is told apart: a second tap opens the sheet', async () => {
    expect(await sharePicture(PICTURE, '', device(says('NotAllowedError')).host)).toBe('blocked');
  });

  it('a sheet that is already open is told apart too', async () => {
    expect(await sharePicture(PICTURE, '', device(says('InvalidStateError')).host)).toBe('open');
  });

  it('anything else is a failure, also when the device throws instead of answering', async () => {
    expect(await sharePicture(PICTURE, '', device(says('DataError')).host)).toBe('failed');
    const thrown = () => {
      throw new TypeError('Illegal invocation');
    };
    expect(await sharePicture(PICTURE, '', device(thrown).host)).toBe('failed');
    expect(await sharePicture(PICTURE, '', { navigator: {} }), 'no sheet at all').toBe('failed');
  });
});
