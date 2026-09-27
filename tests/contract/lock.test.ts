import { describe, expect, inject, it } from 'vitest';
import { url } from './client.js';

/* A locked deployment is locked all the way down, not just its API.
   config.php guards only api/…; the editor page, the art and the photos are
   plain files that only the .htaccess block guards. That block is pasted by
   hand, and every release upload overwrites .htaccess, so it is exactly the
   lock that goes missing while the owner's own (signed-in) browser works
   perfectly. These requests carry no login on purpose and change nothing.

   Runs against a deployment that has a login (CONTRACT_BASE_URL plus
   CONTRACT_BASIC_USER/_PASSWORD) only: php -S reads no .htaccess, so locally
   the static files are served by design. Paths that need not exist: Apache
   checks the login before it looks for the file, so a 404 here means the
   folder is not behind the lock. */

const PATHS = ['', 'index.html', 'static/lock-probe.css', 'assets/lock-probe.png', 'uploads/0000000000000000.jpg', 'api/config'];

describe.runIf(inject('remote') && inject('basicAuth'))('a locked deployment refuses an anonymous visitor everywhere', () => {
  it.each(PATHS)('answers 401 to an anonymous GET /%s', async (path) => {
    const res = await fetch(url(path), { redirect: 'manual' });
    expect(res.status, `GET /${path} without a login answered ${res.status}: the .htaccess lock is missing or does not cover it`).toBe(401);
  });
});
