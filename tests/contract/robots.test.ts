import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROBOTS_FILE } from '../../server/paths.js';
import { send } from './client.js';

/* Every backend answers robots.txt at the app root with the repo's one file, php/web/robots.txt
   (the PHP release ships it, Express serves it): every crawler, search and AI alike, asked to
   stay out. It counts only at a domain's root; in a subfolder the domain's own robots.txt does
   the job, and every answer also says noindex. */

describe('robots.txt', () => {
  it('is the repo file, as plain text, disallowing everything for every crawler', async () => {
    // Through the client, signed in: behind a lock an anonymous 401 would pass for a missing file.
    const res = await send('GET', 'robots.txt', undefined, {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    const body = await res.text();
    expect(body.replace(/\r\n/g, '\n')).toBe(readFileSync(ROBOTS_FILE, 'utf8').replace(/\r\n/g, '\n'));
    expect(body).toMatch(/^User-agent: \*\r?\nDisallow: \/\r?$/m);
    expect(body).not.toMatch(/^Allow:/im);
  });
});
