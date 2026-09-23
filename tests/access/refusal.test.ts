import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXCLUDED_RANGE, startStage, writeTestConfig, type ServedStage } from '../../scripts/php/serve.js';
import { ApiConfigSchema } from '../../src/shared/schema.js';
import { basicAuthHeader, fails, flyerInput, ok, WRITE } from '../contract/client.js';
import { TEST_LOGIN } from '../contract/setup/credentials.js';

/* "Never publicly reachable without an access rule", over real HTTP. Until
   this file every refusal was a PHPUnit test on a constructed Request; here a
   real php -S stage answers them, and the stage's config.php is switched
   between blocks (php -S reads it on every request).

   php -S and Basic auth, settled 2026-09-23 on PHP 8.3.4 before this file was
   written: the built-in server fills PHP_AUTH_USER/PHP_AUTH_PW *and*
   HTTP_AUTHORIZATION from the request's Authorization header (a password with
   a colon arrives whole). So the Basic half is proven here, not only on Apache.
   REDIRECT_HTTP_AUTHORIZATION, the CGI/FastCGI hand-off the .htaccess sets up,
   is never exercised by php -S; the preflight page reports it on the real host. */

let served: ServedStage;

beforeAll(async () => {
  served = await startStage({ prefix: 'nest-flyers-access-' });
});
afterAll(() => served?.server.stop());

const at = (path: string) => new URL(path, served.server.baseUrl).href;
const get = (path: string, headers: Record<string, string> = {}) => fetch(at(path), { headers });
const post = (path: string, headers: Record<string, string>) =>
  fetch(at(path), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(flyerInput()) });

const posture = (access: Parameters<typeof writeTestConfig>[2]) => () => writeTestConfig(served.stage, served.dataDir, access);
const CHALLENGE = 'Basic realm="Nest flyers"';
const signedIn = basicAuthHeader(TEST_LOGIN);

describe('behind a staff login (basicAuth only)', () => {
  beforeAll(posture({ kind: 'basic', user: TEST_LOGIN.user, passwordHash: TEST_LOGIN.passwordHash }));

  it('challenges an anonymous request', async () => {
    const res = await get('api/config');
    expect(res.headers.get('www-authenticate')).toBe(CHALLENGE);
    await fails(res, 'unauthorized');
  });

  it('challenges a wrong password', async () => {
    const res = await get('api/config', basicAuthHeader({ user: TEST_LOGIN.user, password: 'correct horse' }));
    expect(res.headers.get('www-authenticate')).toBe(CHALLENGE);
    await fails(res, 'unauthorized');
  });

  it('challenges a wrong user with the right password', async () => {
    const res = await get('api/config', basicAuthHeader({ user: 'admin', password: TEST_LOGIN.password }));
    expect(res.headers.get('www-authenticate')).toBe(CHALLENGE);
    await fails(res, 'unauthorized');
  });

  it('challenges a write too, before anything else is looked at', async () => {
    await fails(post('api/flyers', WRITE), 'unauthorized');
  });

  it('lets the staff login in', async () => {
    const c = await ok(get('api/config', signedIn), ApiConfigSchema);
    expect(c.backend).toBe('php');
  });

  it('still wants the write header once signed in: the login is ambient, so the header is the only CSRF defence', async () => {
    await fails(post('api/flyers', signedIn), 'forbidden');
  });
});

describe('with config.sample.php copied as it ships (a config.php with no rule)', () => {
  beforeAll(posture({ kind: 'sample' }));

  it('answers every read with 503 not_configured', async () => {
    await fails(get('api/config'), 'not_configured');
  });

  it('answers every write with 503 not_configured', async () => {
    await fails(post('api/flyers', WRITE), 'not_configured');
  });
});

describe('with no config.php at all', () => {
  beforeAll(posture({ kind: 'none' }));

  it('answers every read with 503 not_configured', async () => {
    await fails(get('api/config'), 'not_configured');
  });

  it('answers every write with 503 not_configured', async () => {
    await fails(post('api/flyers', WRITE), 'not_configured');
  });
});

describe(`behind an IP rule that leaves loopback out (${EXCLUDED_RANGE}, no login)`, () => {
  beforeAll(posture({ kind: 'excluded-ips' }));

  it('refuses with 403 and no challenge: there is no password to ask for', async () => {
    const res = await get('api/config');
    expect(res.headers.get('www-authenticate')).toBeNull();
    await fails(res, 'ip_forbidden');
  });

  // Only REMOTE_ADDR counts. A header naming an allowed address is the client's word, and anyone can send it.
  it.each([
    ['X-Forwarded-For', '192.0.2.10'],
    ['X-Forwarded-For', '192.0.2.10, 127.0.0.1'],
    ['X-Real-IP', '192.0.2.10'],
    ['Forwarded', 'for=192.0.2.10'],
    ['Client-IP', '192.0.2.10'],
  ])('is not talked round by %s: %s', async (name, value) => {
    await fails(get('api/config', { [name]: value }), 'ip_forbidden');
  });

  it('does not let a login past an IP rule that has none', async () => {
    await fails(get('api/config', signedIn), 'ip_forbidden');
  });
});
