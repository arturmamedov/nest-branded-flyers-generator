import { describe, expect, it } from 'vitest';
import { pictureLimits } from '../../src/editor/photoPrep.js';
import { AI_PICTURE_MAX_EDGE } from '../../src/shared/ai.js';
import { MAX_PHOTO_EDGE, MAX_UPLOAD_BYTES } from '../../src/shared/limits.js';

/* What the browser shrinks a picture to before the AI reads it (src/editor/photoPrep.ts): preparePhoto() takes its
   limits as an argument, and a read's are the site's own with the read's edge. The shrinking itself needs a canvas,
   and is the browser suites' (tests/render/ai.spec.ts, the PHP smoke test). */

describe('the limits a picture is prepared with for a read', () => {
  it('are the site’s upload limit and the read’s edge, which is under a flyer photo’s', () => {
    expect(AI_PICTURE_MAX_EDGE).toBeLessThan(MAX_PHOTO_EDGE);
    expect(pictureLimits({ maxUploadBytes: MAX_UPLOAD_BYTES, maxPhotoEdge: MAX_PHOTO_EDGE })).toEqual({ maxUploadBytes: MAX_UPLOAD_BYTES, maxPhotoEdge: AI_PICTURE_MAX_EDGE });
    // A shared host's 2 MB stays the host's.
    expect(pictureLimits({ maxUploadBytes: 2 * 1024 * 1024, maxPhotoEdge: MAX_PHOTO_EDGE }).maxUploadBytes).toBe(2 * 1024 * 1024);
  });

  it('never raise a site’s own edge, and leave the limits they were given untouched', () => {
    const site = { maxUploadBytes: MAX_UPLOAD_BYTES, maxPhotoEdge: 1600 };
    expect(pictureLimits(site).maxPhotoEdge).toBe(1600);
    expect(site).toEqual({ maxUploadBytes: MAX_UPLOAD_BYTES, maxPhotoEdge: 1600 });
  });
});
