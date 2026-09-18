import { describe, expect, it } from 'vitest';
import { MAX_PHOTO_EDGE, MAX_UPLOAD_BYTES } from '../../src/shared/limits.js';
import { config } from './client.js';

describe('GET api/config', () => {
  it('says what the backend can do', async () => {
    const c = await config();
    expect(c.exporters).toContain('client');
    expect(c.limits.maxPhotoEdge).toBe(MAX_PHOTO_EDGE);
    expect(c.limits.maxUploadBytes).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
    if (c.backend === 'php') {
      expect(c.storage).toBe('json');
      expect(c.exporters).toEqual(['client']);
    }
  });
});
