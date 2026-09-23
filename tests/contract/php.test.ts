import { describe, expect, it } from 'vitest';
import { formatMb } from '../../src/shared/errors.js';
import { MAX_UPLOAD_BYTES } from '../../src/shared/limits.js';
import { config, fails, upload } from './client.js';

/* What only the PHP backend promises (docs/api-contract.md, "GET api/config"
   and "Photos"): it reports the ini limits it runs under, derives
   maxUploadBytes from them, and answers a request PHP itself refused for
   exceeding post_max_size with the same clean 413 JSON as any other large
   photo — no warning text leaking in front of it. */

const c = await config();
const isPhp = c.backend === 'php';

/** PHP's ini size shorthand ("2M", "512K", "1G", plain bytes; K/M/G are powers of 1024). 0 means unlimited. */
function iniBytes(value: unknown): number {
  const m = /^\s*(\d+)\s*([kmg]?)\s*$/i.exec(String(value));
  if (!m) throw new Error(`Unexpected ini size ${JSON.stringify(value)}`);
  const unit = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[m[2].toLowerCase() as '' | 'k' | 'm' | 'g'];
  return Number(m[1]) * unit;
}

/** The request overhead docs/api-contract.md reserves inside post_max_size for the multipart envelope. */
const MULTIPART_HEADROOM = 64 * 1024;

/** A body we'll actually send to prove the overflow; beyond this the host's limit is too generous to test cheaply. */
const MAX_OVERFLOW_PROBE = 64 * 1024 * 1024;

describe.skipIf(!isPhp)('PHP backend', () => {
  it('reports its ini limits and image processor under server', () => {
    for (const key of ['php', 'upload_max_filesize', 'post_max_size', 'memory_limit', 'imageProcessor']) {
      expect(typeof c.server[key], `server.${key}`).toBe('string');
      expect(String(c.server[key]), `server.${key}`).not.toBe('');
    }
    expect(c.server.php).toMatch(/^\d+\.\d+\.\d+/);
  });

  // The one setting that turns "never publicly reachable without an access rule" into a breach. Run against a
  // deployment, this is the line that says so (the local Laragon one runs allowPublic by the owner's choice, and fails here).
  it('names its access rule, and it is not allowPublic', () => {
    expect(c.server.accessRule, 'config.php lets anyone in (allowPublic): set basicAuth or allowIps instead').not.toBe('allowPublic');
    expect(['allowIps', 'basicAuth', 'allowIps+basicAuth'], 'server.accessRule').toContain(c.server.accessRule);
  });

  it('derives maxUploadBytes from 15 MiB, upload_max_filesize and post_max_size', () => {
    const upload = iniBytes(c.server.upload_max_filesize);
    const post = iniBytes(c.server.post_max_size);
    const bounds = [MAX_UPLOAD_BYTES, upload, post === 0 ? 0 : post - MULTIPART_HEADROOM].filter((n) => n > 0);
    expect(c.limits.maxUploadBytes).toBe(Math.min(...bounds));
  });

  it('answers a request over post_max_size with the too_large JSON', async ({ skip }) => {
    const post = iniBytes(c.server.post_max_size);
    if (post === 0 || post > MAX_OVERFLOW_PROBE) skip(`post_max_size is ${String(c.server.post_max_size)}`);
    // The multipart envelope alone pushes the body past post_max_size.
    const res = await upload(Buffer.alloc(post, 1), 'huge.jpg');
    expect(res.headers.get('content-type') ?? '').toMatch(/^application\/json/);
    await fails(res, 'too_large', { mb: formatMb(c.limits.maxUploadBytes) });
  });
});
