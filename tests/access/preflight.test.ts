import { copyFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREFLIGHT_SOURCE } from '../../scripts/build-php.js';
import { startPhpServer, startStage, type PhpServer, type ServedStage } from '../../scripts/php/serve.js';
import { ApiConfigSchema } from '../../src/shared/schema.js';
import { basicAuthHeader, fails, ok } from '../contract/client.js';

/* The preflight page (php/preflight/nest-preflight.php) over HTTP, in a real
   stage. PHPUnit covers each check with injected values; this proves the page
   as the owner meets it: it renders from a bare folder, the config.php it
   prints is one the app accepts, and its release and fonts lines go red for
   the right reason.

   php -S on Windows answers one request at a time, and the page fetches its
   own site (the outside vantage, the fonts), so a second php -S serves the
   same stage and the page is asked with that server's Host. It fetches from
   whatever its Host header names, as long as that is its own server name. */

const PAGE = 'nest-preflight-test.php';
const LOGIN = { user: 'staff', password: "the owner's pass:word" };

let served: ServedStage;
let other: PhpServer;

beforeAll(async () => {
  served = await startStage({ prefix: 'nest-flyers-preflight-' });
  copyFileSync(PREFLIGHT_SOURCE, join(served.stage, PAGE));
  other = await startPhpServer({ stage: served.stage, logFile: `${served.stage}.other.php-server.log` });
});
afterAll(async () => {
  await other?.stop();
  await served?.server.stop();
});

/** Asks the page on the first server, as if at the second (see above). */
function preflight(options: { form?: Record<string, string>; headers?: Record<string, string> } = {}): Promise<{ status: number; html: string }> {
  const target = new URL(PAGE, served.server.baseUrl);
  const body = options.form ? new URLSearchParams(options.form).toString() : undefined;
  return new Promise((done, fail) => {
    const req = request(
      {
        host: target.hostname,
        port: target.port,
        path: target.pathname,
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Host: new URL(other.baseUrl).host,
          ...(body === undefined ? {} : { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }),
          ...options.headers,
        },
      },
      (res) => {
        let html = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (html += chunk));
        res.on('end', () => done({ status: res.statusCode ?? 0, html }));
      },
    );
    req.on('error', fail);
    req.end(body);
  });
}

/** Every line of the report: check id → { status, text }. */
function lines(html: string): Record<string, { status: string; text: string }> {
  const out: Record<string, { status: string; text: string }> = {};
  for (const m of html.matchAll(/<li class="check \w+" data-check="([\w-]+)" data-status="(\w+)">([\s\S]*?)<\/li>/g)) {
    out[m[1]] = { status: m[2], text: decode(m[3].replace(/<[^>]+>/g, ' ')) };
  }
  return out;
}

function decode(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');
}

function printed(html: string, id: string): string {
  const m = new RegExp(`<pre id="${id}">([\\s\\S]*?)</pre>`).exec(html);
  if (!m) throw new Error(`The page printed no #${id}:\n${html.slice(0, 2000)}`);
  return decode(m[1]);
}

const api = (headers: Record<string, string> = {}) => fetch(new URL('api/config', served.server.baseUrl), { headers });

describe('the preflight page', () => {
  it('reports on the account and the release', async () => {
    const { status, html } = await preflight();
    expect(status, html.slice(0, 1000)).toBe(200);
    const report = lines(html);
    expect(report.php.status).toBe('pass');
    expect(report.extensions.status).toBe('pass');
    expect(report.writable.status).toBe('pass');
    expect(report.guards.status).toBe('pass');
    expect(report.release.status, report.release.text).toBe('pass');
    // php -S is plain http and reads no .htaccess: exactly what these lines exist to catch.
    expect(report.https.status).toBe('fail');
    expect(report['outside-denied'].status).toBe('pass');
    expect(html).not.toContain('Warning:');
  });

  it('prints a config.php the app accepts: that login gets in, no other does', async () => {
    const { html } = await preflight({ form: LOGIN });
    writeFileSync(join(served.stage, 'config.php'), printed(html, 'config-php'));
    expect(printed(html, 'htpasswd')).toMatch(/^staff:\$2y\$05\$/);
    expect(printed(html, 'htaccess')).toContain('Require valid-user');

    const c = await ok(api(basicAuthHeader(LOGIN)), ApiConfigSchema);
    expect(c.server.accessRule).toBe('basicAuth');
    await fails(api(basicAuthHeader({ ...LOGIN, password: 'the owner' })), 'unauthorized');
    await fails(api(), 'unauthorized');

    // Asked again, now behind that login: the stranger's view of the API is a refusal, and the page says which
    // variable carried the login to PHP (the question only the real host can answer, for CGI/FastCGI).
    const again = lines((await preflight({ headers: basicAuthHeader(LOGIN) })).html);
    expect(again['outside-api'].status).toBe('pass');
    expect(again.login.status).toBe('pass');
    expect(again.login.text).toContain('PHP_AUTH_USER');
    expect(again.login.text).not.toContain(LOGIN.password);
  });

  it('names exactly what an upload lost', async () => {
    rmSync(join(served.stage, 'assets', 'art', 'spark-teal.png'));
    rmSync(join(served.stage, 'schema', '.htaccess'));
    const report = lines((await preflight()).html);
    expect(report.guards.status).toBe('fail');
    expect(report.guards.text).toContain('schema/.htaccess');
    expect(report.release.status).toBe('fail');
    expect(report.release.text).toContain('assets/art/spark-teal.png');
    expect(report.release.text).not.toContain('schema/.htaccess');
  });

  it('fetches every flyer font, and goes red when one is missing', async () => {
    // The shape Vite writes into static/: a woff2 and a woff per face, relative to the stylesheet.
    const faces = ['caveat-latin-400-normal-T1', 'montserrat-latin-500-normal-T2'];
    mkdirSync(join(served.stage, 'static'), { recursive: true });
    writeFileSync(
      join(served.stage, 'static', 'main-test.css'),
      faces.map((f) => `@font-face{font-family:x;src:url(./${f}.woff2) format("woff2"),url(./${f}.woff) format("woff")}`).join(''),
    );
    for (const f of faces) writeFileSync(join(served.stage, 'static', `${f}.woff2`), 'wOF2');
    const before = lines((await preflight({ headers: basicAuthHeader(LOGIN) })).html).fonts;
    expect(before.status, before.text).not.toBe('fail');
    expect(before.text).toContain('All 2 fonts load');

    renameSync(join(served.stage, 'static', `${faces[1]}.woff2`), join(served.stage, 'static', `${faces[1]}.woff2.moved`));
    const after = lines((await preflight({ headers: basicAuthHeader(LOGIN) })).html).fonts;
    expect(after.status).toBe('fail');
    expect(after.text).toContain(`static/${faces[1]}.woff2 (404`);
  });

  it('renders with no vendor/ and no config.php: it needs nothing the release brings', async () => {
    rmSync(join(served.stage, 'vendor'), { recursive: true, force: true });
    rmSync(join(served.stage, 'config.php'), { force: true });
    const { status, html } = await preflight();
    expect(status).toBe(200);
    expect(lines(html).php.status).toBe('pass');
  });
});
