import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { closing, opening, parseSmokeArgs, readExample, refusal, runDirect, shareRequest, siteAi, siteHint, smokeSite, USAGE, whatFailed } from '../../scripts/ai/smoke.js';
import { SiteError } from '../../scripts/site.js';
import { loadBundle } from '../../server/ai/bundle.js';
import { loadAiSettings } from '../../server/config.js';
import { APP_ROOT, SEED_FILE } from '../../server/paths.js';
import { AiFlyerRequestSchema, AiFlyerResultSchema, AiShareRequestSchema, AiShareResultSchema, type AiFlyerResult } from '../../src/shared/schema.js';
import { SeedFileSchema } from '../../src/shared/seed.js';

/* `npm run ai:smoke` (scripts/ai/smoke.ts): one real generation, by hand. Everything here runs without the network:
   the arguments, what is sent, what is refused before anything is spent, and the direct mode end to end on the fake
   provider, through the composition the server uses. The calls to a real provider and to a site stay untested, by
   design: no test touches a provider. */

const bundle = loadBundle();
const first = readExample(null, bundle);
const EXAMPLES_DIR = join(APP_ROOT, 'docs', 'ai-flyers', 'examples');
const exampleFiles = readdirSync(EXAMPLES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => join(EXAMPLES_DIR, f));
const hostels = SeedFileSchema.parse(JSON.parse(readFileSync(SEED_FILE, 'utf8'))).hostels.map((h) => ({ slug: h.slug, name: h.name }));
const KEY = 'sk-live-secret-42';

const scratch = mkdtempSync(join(tmpdir(), 'nest-flyers-smoke-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
const file = (name: string, content: string) => {
  const path = join(scratch, name);
  writeFileSync(path, content);
  return path;
};

/** What a call threw, as text; a call that went through is the test's failure. */
const said = (call: () => unknown): string => {
  try {
    call();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('expected a refusal');
};

describe('parseSmokeArgs', () => {
  it('means a flyer from the bundle’s first example, straight to the provider, when given nothing', () => {
    expect(parseSmokeArgs([])).toEqual({ share: false, to: null, file: null });
  });

  it('takes --share, a site as its app root, and one example file', () => {
    expect(parseSmokeArgs(['--share', '--to', 'http://h/app', 'ex.json'])).toEqual({ share: true, to: 'http://h/app/', file: 'ex.json' });
    expect(parseSmokeArgs(['--to', 'https://nestpass.ai/activities/']).to).toBe('https://nestpass.ai/activities/');
  });

  it('refuses what it does not know, with the usage line', () => {
    for (const argv of [['--to'], ['--dry-run'], ['a.json', 'b.json'], ['--to', 'nestpass.ai/activities'], ['https://nestpass.ai/activities/']]) {
      expect(said(() => parseSmokeArgs(argv)), argv.join(' ')).toContain(USAGE);
    }
  });

  it('refuses a login in the address, and does not repeat it', () => {
    const refused = said(() => parseSmokeArgs(['--to', 'https://staff:pw-12345@nestpass.ai/activities/']));
    expect(refused).toContain('FLYERS_BASIC_PASSWORD');
    expect(refused).not.toContain('pw-12345');
  });
});

describe('refusal: the direct mode is for a real provider with its key', () => {
  it('names what is missing, and never the key', () => {
    expect(refusal(loadAiSettings({}))).toContain('AI_PROVIDER');
    expect(refusal(loadAiSettings({ AI_PROVIDER: 'fake' }))).toContain('a real provider');
    expect(refusal(loadAiSettings({ AI_PROVIDER: 'openai' }))).toContain('AI_API_KEY');
    const off = refusal(loadAiSettings({ AI_PROVIDER: 'openai', AI_API_KEY: KEY, AI_ENABLED: '0' }));
    expect(off).toContain('AI_ENABLED');
    expect(off).not.toContain(KEY);
  });

  it('lets a keyed provider through', () => {
    expect(refusal(loadAiSettings({ AI_PROVIDER: 'anthropic', AI_API_KEY: KEY }))).toBeNull();
    expect(refusal(loadAiSettings({ AI_PROVIDER: 'openai', AI_API_KEY: KEY }))).toBeNull();
  });
});

describe('readExample', () => {
  it('is the bundle’s first example when no file is named', () => {
    expect(first.text).toBe(bundle.examples[0].text);
    expect(first.brief).toEqual(bundle.examples[0].answer.brief);
  });

  it('reads a file of docs/ai-flyers/examples: the staff text as it came, and the brief written from it', () => {
    expect(exampleFiles.length).toBeGreaterThan(0);
    for (const path of exampleFiles) {
      const written = JSON.parse(readFileSync(path, 'utf8')) as { source: string; brief: unknown };
      const example = readExample(path, bundle);
      expect(example.text, path).toBe(written.source);
      expect(example.brief, path).toEqual(written.brief);
      expect(example.label).toBe(path);
    }
  });

  it('says what is wrong with a file it cannot use', () => {
    const missing = join(scratch, 'no-such-file.json');
    expect(said(() => readExample(missing, bundle))).toContain(missing);
    expect(said(() => readExample(file('prose.json', 'Yoga at 9'), bundle))).toContain('not JSON');
    const misshapen = said(() => readExample(file('misshapen.json', JSON.stringify({ source: 1, brief: first.brief, extra: true })), bundle));
    expect(misshapen).toContain('source');
    expect(misshapen).toContain('docs/ai-flyers/README.md');
  });
});

describe('what is sent', () => {
  it('every example can be sent as an idea', () => {
    for (const path of exampleFiles) expect(AiFlyerRequestSchema.safeParse({ text: readExample(path, bundle).text }).success, path).toBe(true);
  });

  it('--share sends the flyer the brief builds, as the editor sends its own, with the text as the idea it came from', () => {
    for (const path of exampleFiles) {
      const example = readExample(path, bundle);
      const request = shareRequest(example, hostels);
      expect(AiShareRequestSchema.safeParse(request).success, path).toBe(true);
      expect(request.idea).toBe(example.text);
      expect(request.hostel).toBe(example.brief.hostel);
      expect(request.template).toBe(example.brief.template);
      expect(request.data.photoMode).toBe('none');
    }
    const stretching = shareRequest(readExample(join(EXAMPLES_DIR, '2026-10-01-adeje-nest-sunset-stretching.json'), bundle), hostels);
    expect(stretching.data.chips.map((c) => [c.key, c.value])).toEqual([
      ['when', 'Today · 19:00'],
      ['where', 'Pool area'],
      ['cost', 'Free'],
    ]);
  });

  it('--share stops before anything is sent when the site lacks the example’s hostel', () => {
    const example = readExample(join(EXAMPLES_DIR, '2026-10-01-adeje-nest-sunset-stretching.json'), bundle);
    const refused = said(() => shareRequest(example, [{ slug: 'duque-nest', name: 'Duque Nest' }]));
    expect(refused).toContain('adeje-nest');
    expect(refused).toContain('duque-nest');
  });
});

describe('smokeSite', () => {
  const flyers = { baseUrl: 'https://nestpass.ai/activities/', basicAuth: { user: 'staff', password: 'secret' }, source: '.env' as const };

  it('signs in with .env’s login only at the address .env names', () => {
    expect(smokeSite('https://nestpass.ai/activities/', flyers).basicAuth).toEqual({ user: 'staff', password: 'secret' });
    expect(smokeSite('https://nestpass.ai/activities/', { ...flyers, baseUrl: 'https://NESTPASS.ai:443/activities/' }).basicAuth).toEqual({ user: 'staff', password: 'secret' });
    expect(smokeSite('https://localhost/nest-flyers-php/', flyers)).toEqual({ baseUrl: 'https://localhost/nest-flyers-php/', source: 'environment' });
    expect(smokeSite('https://nestpass.ai/activities/', null)).toEqual({ baseUrl: 'https://nestpass.ai/activities/', source: 'environment' });
  });
});

describe('siteAi: what a site’s api/config says there is to spend', () => {
  it('gives the limit and what is left of it today', () => {
    expect(siteAi({ backend: 'php', ai: { enabled: true, limit: 3, remaining: 2 } })).toEqual({ limit: 3, remaining: 2 });
  });

  it('names a release from before the AI, so nothing is sent to it', () => {
    const before = said(() => siteAi({ backend: 'php', server: { release: { id: 'd1d8fcef7c1b', builtAt: '2026-09-29T22:23:28.284Z' } } }));
    expect(before).toContain('d1d8fcef7c1b');
    expect(before).toContain('2026-09-29');
    expect(before).toContain('npm run build:php');
    expect(said(() => siteAi({ backend: 'node', server: { node: 'v24' } }))).toContain('before the AI');
  });

  it('stops when the AI is off there, or the day is used up, in the catalogue’s words', () => {
    expect(said(() => siteAi({ ai: { enabled: false } }))).toContain('off');
    const used = said(() => siteAi({ ai: { enabled: true, limit: 3, remaining: 0 } }));
    expect(used).toContain('3 AI generations are used up');
    expect(used).toContain('midnight');
  });

  it('refuses an answer that is not the app’s', () => {
    expect(said(() => siteAi('<html>Coming soon</html>'))).toContain('api/config');
  });
});

describe('what to do about a call that failed', () => {
  const fetchFailed = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('the cause'), { code }) });

  it('a redirect: the address to run it with', () => {
    expect(siteHint(new SiteError('moved', 301, null, 'https://localhost/nest-flyers-php/'))).toContain('--to https://localhost/nest-flyers-php/');
  });

  it('a certificate Node does not trust: the setting that names it', () => {
    expect(siteHint(fetchFailed('DEPTH_ZERO_SELF_SIGNED_CERT'))).toContain('NODE_EXTRA_CA_CERTS');
    expect(siteHint(fetchFailed('ECONNREFUSED'))).toBeNull();
  });

  it('a site that wants its login: where the login goes', () => {
    expect(siteHint(new SiteError('Sign in', 401))).toContain('FLYERS_BASIC_USER');
    expect(siteHint(new Error('boom'))).toBeNull();
  });

  it('says why fetch failed, which its own message does not', () => {
    expect(whatFailed(fetchFailed('ECONNREFUSED'))).toBe('fetch failed (ECONNREFUSED)');
    expect(whatFailed(new SiteError('Today’s 3 AI generations are used up.', 429, 'ai_quota'))).toBe('Today’s 3 AI generations are used up.');
  });
});

describe('the direct mode, on the fake provider through the server’s own composition', () => {
  const fake = loadAiSettings({ AI_PROVIDER: 'fake' });

  it('makes a flyer from the text, holding that text out of the few-shot, and reads the numbers off the ledger', async () => {
    const outcome = await runDirect(fake, first, false, bundle);
    expect(outcome.error).toBeNull();
    expect(AiFlyerResultSchema.safeParse(outcome.result).success).toBe(true);
    expect((outcome.result as AiFlyerResult).remaining).toBe(2);
    expect(outcome.record).toMatchObject({ provider: 'fake', model: 'fake-1', tokens: { input: 10, output: 20 }, ok: true, feature: 'flyer', actorId: 'anonymous', input: first.text });
    // The fake answers from the first example it is given: with the text sent held out, that is the next one.
    expect({ sent: outcome.sent, held: outcome.held }).toEqual({ sent: bundle.examples.length - 1, held: 1 });
    expect((outcome.result as AiFlyerResult).brief).toEqual(bundle.examples[1].answer.brief);
    const printed = closing(outcome);
    expect(printed).toContain('fake-1');
    expect(printed).toContain('10 tokens in');
    expect(printed).toContain('20 out');
    expect(printed).toContain(bundle.examples[1].answer.brief.text?.headline1 ?? 'no headline');
  });

  it('writes the caption of the example’s flyer with --share', async () => {
    const outcome = await runDirect(fake, first, true, bundle);
    expect(outcome.error).toBeNull();
    expect(AiShareResultSchema.safeParse(outcome.result).success).toBe(true);
    expect(outcome.record).toMatchObject({ feature: 'share', ok: true });
    expect(outcome.record?.input).toContain("The flyer's fields:");
    expect(outcome.record?.input).toContain(`Hostel: ${hostels.find((h) => h.slug === first.brief.hostel)?.name}`);
    expect(closing(outcome)).toContain('Share text:');
  });

  it('sends every example when the text is not one of them, and on a failure says what the model wrote and that nothing counted', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const outcome = await runDirect(fake, { label: 'a made-up text', text: `${first.text}\n[[fake:invalid]]`, brief: first.brief }, false, bundle);
      expect({ sent: outcome.sent, held: outcome.held }).toEqual({ sent: bundle.examples.length, held: 0 });
      expect(outcome.result).toBeNull();
      expect(outcome.error).toBe('The AI didn’t answer properly. Try again in a moment.');
      expect(outcome.record).toMatchObject({ ok: false, output: '{"brief":42,"assumptions":[]}' });
      // The reason is the service's own line, on the console of whoever runs the smoke.
      expect(errors.mock.calls.map((c) => String(c[0])).join('\n')).toContain('the answer failed its schema');
      const printed = closing(outcome);
      expect(printed).toContain('The AI didn’t answer properly');
      expect(printed).toContain('Nothing was counted');
      expect(printed).toContain('{"brief":42,"assumptions":[]}');
    } finally {
      errors.mockRestore();
    }
  });

  it('refuses settings that run no provider', async () => {
    await expect(runDirect(loadAiSettings({}), first, false, bundle)).rejects.toThrow(/provider/);
  });
});

describe('opening: what a run says before it spends anything', () => {
  it('names the provider, the model, the knobs and what goes out, and never the key', () => {
    const settings = loadAiSettings({ AI_PROVIDER: 'openai', AI_API_KEY: KEY, AI_EFFORT: 'low', AI_TIMEOUT_MS: '9000' });
    const printed = opening(settings, first, false, { sent: 1, held: 1 });
    for (const part of ['openai', 'gpt-6-luna', 'low', '9 s', 'key set', '1 of 2', first.label]) expect(printed, part).toContain(part);
    expect(printed).not.toContain(KEY);
    expect(opening(loadAiSettings({ AI_PROVIDER: 'anthropic', AI_API_KEY: KEY }), first, true, { sent: 2, held: 0 })).toContain('claude-haiku-4-5');
  });
});
