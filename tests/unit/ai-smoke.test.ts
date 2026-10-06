import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  closing,
  closingPhoto,
  featureOf,
  opening,
  openingPhoto,
  parseSmokeArgs,
  readExample,
  readPicture,
  refusal,
  runDirect,
  runDirectPhoto,
  shareRequest,
  siteAi,
  siteHint,
  siteLeft,
  siteSpends,
  USAGE,
  whatFailed,
} from '../../scripts/ai/smoke.js';
import { siteAt, SiteError } from '../../scripts/site.js';
import { loadBundle } from '../../server/ai/bundle.js';
import { loadAiSettings } from '../../server/config.js';
import { APP_ROOT, SEED_FILE } from '../../server/paths.js';
import { AI_FAKE, AI_FEATURES, AI_PICTURE_MAX_EDGE } from '../../src/shared/ai.js';
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
    expect(parseSmokeArgs([])).toEqual({ share: false, photo: null, save: null, to: null, file: null });
  });

  it('takes --share, a site as its app root, and one example file', () => {
    expect(parseSmokeArgs(['--share', '--to', 'http://h/app', 'ex.json'])).toEqual({ share: true, photo: null, save: null, to: 'http://h/app/', file: 'ex.json' });
    expect(parseSmokeArgs(['--to', 'https://nestpass.ai/activities/']).to).toBe('https://nestpass.ai/activities/');
  });

  it('takes --photo with a picture or an image example, and --save for the picture as it was sent', () => {
    expect(parseSmokeArgs(['--photo', 'board.jpg'])).toEqual({ share: false, photo: 'board.jpg', save: null, to: null, file: null });
    expect(parseSmokeArgs(['--photo', 'case.json', '--save', 'sent.jpg'])).toMatchObject({ photo: 'case.json', save: 'sent.jpg' });
    expect(parseSmokeArgs(['--photo', 'board.jpg', '--to', 'http://h/app'])).toMatchObject({ photo: 'board.jpg', to: 'http://h/app/' });
    expect(featureOf(parseSmokeArgs(['--photo', 'board.jpg']))).toBe('photo');
    expect(featureOf(parseSmokeArgs(['--share']))).toBe('share');
    expect(featureOf(parseSmokeArgs([]))).toBe('flyer');
  });

  it('refuses what it does not know, with the usage line', () => {
    const photo = [
      ['--photo'],
      ['--photo', 'board.jpg', '--share'],
      ['--photo', 'board.jpg', 'ex.json'],
      // --save is the picture a read sent: nothing to save without one, and a site prepares its own.
      ['--save', 'sent.jpg'],
      ['--photo', 'board.jpg', '--save', 'sent.jpg', '--to', 'http://h/app'],
    ];
    for (const argv of [...photo, ['--to'], ['--dry-run'], ['a.json', 'b.json'], ['--to', 'nestpass.ai/activities'], ['https://nestpass.ai/activities/']]) {
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
    expect(refusal(loadAiSettings({}), 'flyer')).toContain('AI_PROVIDER');
    expect(refusal(loadAiSettings({ AI_PROVIDER: 'fake' }), 'flyer')).toContain('a real provider');
    expect(refusal(loadAiSettings({ AI_PROVIDER: 'openai' }), 'flyer')).toContain('AI_API_KEY');
    const off = refusal(loadAiSettings({ AI_PROVIDER: 'openai', AI_API_KEY: KEY, AI_ENABLED: '0' }), 'flyer');
    expect(off).toContain('AI_ENABLED');
    expect(off).not.toContain(KEY);
  });

  // None until named (the owner's answer, 2026-10-05): a key alone runs nothing, and the service would answer ai_off.
  it('names the feature these settings do not run, before anything is sent', () => {
    const keyed = { AI_PROVIDER: 'openai', AI_API_KEY: KEY };
    for (const feature of AI_FEATURES) {
      const none = refusal(loadAiSettings(keyed), feature);
      expect(none, feature).toContain('AI_FEATURES');
      expect(none, feature).toContain(feature);
      expect(none, feature).not.toContain(KEY);
    }
    const shareOnly = loadAiSettings({ ...keyed, AI_FEATURES: 'share' });
    expect(refusal(shareOnly, 'flyer')).toContain('AI_FEATURES');
    expect(refusal(shareOnly, 'share')).toBeNull();
  });

  it('lets a keyed provider that runs the feature through', () => {
    for (const feature of AI_FEATURES) {
      expect(refusal(loadAiSettings({ AI_PROVIDER: 'anthropic', AI_API_KEY: KEY, AI_FEATURES: AI_FEATURES.join(',') }), feature)).toBeNull();
      expect(refusal(loadAiSettings({ AI_PROVIDER: 'openai', AI_API_KEY: KEY, AI_FEATURES: feature }), feature)).toBeNull();
    }
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

describe('siteAt', () => {
  const flyers = { baseUrl: 'https://nestpass.ai/activities/', basicAuth: { user: 'staff', password: 'secret' }, source: '.env' as const };

  it('signs in with .env’s login only at the address .env names', () => {
    expect(siteAt('https://nestpass.ai/activities/', flyers).basicAuth).toEqual({ user: 'staff', password: 'secret' });
    expect(siteAt('https://nestpass.ai/activities/', { ...flyers, baseUrl: 'https://NESTPASS.ai:443/activities/' }).basicAuth).toEqual({ user: 'staff', password: 'secret' });
    expect(siteAt('https://localhost/nest-flyers-php/', flyers)).toEqual({ baseUrl: 'https://localhost/nest-flyers-php/', source: 'environment' });
    expect(siteAt('https://nestpass.ai/activities/', null)).toEqual({ baseUrl: 'https://nestpass.ai/activities/', source: 'environment' });
  });
});

describe('siteAi: what a site’s api/config says there is to spend', () => {
  const flyer = { name: 'flyer', limit: 3, remaining: 2 };
  const share = { name: 'share', limit: 10, remaining: 10 };

  // The owner's answer (2026-10-06): every feature its own daily limit, so a run spends the one of the feature it calls.
  it('gives the feature’s own limit and what is left of it today, for a feature the site runs', () => {
    expect(siteAi({ backend: 'php', ai: { enabled: true, features: [flyer, share] } }, 'flyer')).toEqual({ limit: 3, remaining: 2 });
    expect(siteAi({ backend: 'php', ai: { enabled: true, features: [flyer, share] } }, 'share')).toEqual({ limit: 10, remaining: 10 });
    expect(siteAi({ backend: 'php', ai: { enabled: true, features: [share] } }, 'share')).toEqual({ limit: 10, remaining: 10 });
  });

  // The trial on the live site runs the share text alone: a smoke for a flyer there must stop before it is sent.
  it('stops when the site does not run the feature, naming the ones it does and the setting', () => {
    const flyerOff = said(() => siteAi({ backend: 'php', ai: { enabled: true, features: [share] } }, 'flyer'));
    expect(flyerOff).toContain('flyer');
    // The features it does run, by their names.
    expect(flyerOff).toContain('its settings name share alone');
    expect(flyerOff).toContain("'features'");
    expect(flyerOff).toContain('--share');
    const shareOff = said(() => siteAi({ backend: 'node', ai: { enabled: true, features: [flyer] } }, 'share'));
    expect(shareOff).toContain('its settings name flyer alone');
    expect(shareOff).toContain('AI_FEATURES');
    expect(shareOff).not.toContain('--share');
  });

  it('names a release from before the AI, so nothing is sent to it', () => {
    const before = said(() => siteAi({ backend: 'php', server: { release: { id: 'd1d8fcef7c1b', builtAt: '2026-09-29T22:23:28.284Z' } } }, 'flyer'));
    expect(before).toContain('d1d8fcef7c1b');
    expect(before).toContain('2026-09-29');
    expect(before).toContain('npm run build:php');
    expect(said(() => siteAi({ backend: 'node', server: { node: 'v24' } }, 'flyer'))).toContain('before the AI');
  });

  // Such a release answers enabled: true with no list, and runs both: the smoke is of this checkout's contract.
  it('names a release from before each feature had its own switch, so nothing is sent to it', () => {
    const before = said(() => siteAi({ backend: 'php', ai: { enabled: true, limit: 3, remaining: 3 }, server: { release: { id: '3f909ea91548', builtAt: '2026-10-05T20:16:20.000Z' } } }, 'share'));
    expect(before).toContain('3f909ea91548');
    expect(before).toContain('2026-10-05');
    expect(before).toContain('its own switch');
    expect(before).toContain('npm run build:php');
  });

  // Such a release answers one limit for every feature and lists the features by name: this checkout's contract
  // gives each feature its own, so a run would misread what there is to spend.
  it('names a release from before each feature had its own daily limit, so nothing is sent to it', () => {
    const ai = { enabled: true, limit: 3, remaining: 3, features: ['share'] };
    const before = said(() => siteAi({ backend: 'php', ai, server: { release: { id: '2ad58f28364e', builtAt: '2026-10-06T01:25:07.000Z' } } }, 'share'));
    expect(before).toContain('2ad58f28364e');
    expect(before).toContain('2026-10-06');
    expect(before).toContain('its own daily limit');
    expect(before).toContain('npm run build:php');
    expect(before).not.toContain('not what the contract says');
  });

  it('says what a run through a site will spend, and what it left: the feature’s own, by what it is called', () => {
    expect(siteSpends('share', 10, 4)).toBe("This spends one of this site's 10 AI share texts for today (4 left).");
    expect(siteSpends('flyer', 3, 1)).toBe("This spends one of this site's 3 AI flyers for today (1 left).");
    expect(siteLeft('share', 3)).toBe('3 AI share texts left today on this site.');
  });

  it('stops when the AI is off there, or the feature’s day is used up, in the catalogue’s words', () => {
    expect(said(() => siteAi({ ai: { enabled: false } }, 'flyer'))).toContain('off');
    const features = [flyer, { ...share, remaining: 0 }];
    const used = said(() => siteAi({ ai: { enabled: true, features } }, 'share'));
    expect(used).toContain('10 AI share texts are used up');
    expect(used).toContain('midnight');
    // The flyer's own count is not the share text's: it still has two.
    expect(siteAi({ ai: { enabled: true, features } }, 'flyer')).toEqual({ limit: 3, remaining: 2 });
  });

  it('refuses an answer that is not the app’s', () => {
    expect(said(() => siteAi('<html>Coming soon</html>', 'flyer'))).toContain('api/config');
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

  // A release refuses a config.php key that came after it (503): the hint names the keys an older release meets.
  it('a site that refuses its config.php: the keys an older release does not know', () => {
    const hint = siteHint(new SiteError('This app is not set up yet', 503, 'not_configured'));
    expect(hint).toContain("'features'");
    expect(hint).toContain("'dailyLimits'");
  });

  it('a site that wants its login: where the login goes', () => {
    expect(siteHint(new SiteError('Sign in', 401))).toContain('FLYERS_BASIC_USER');
    expect(siteHint(new Error('boom'))).toBeNull();
  });

  it('says why fetch failed, which its own message does not', () => {
    expect(whatFailed(fetchFailed('ECONNREFUSED'))).toBe('fetch failed (ECONNREFUSED)');
    expect(whatFailed(new SiteError('Today’s 3 AI flyers are used up.', 429, 'ai_quota'))).toBe('Today’s 3 AI flyers are used up.');
  });
});

describe('the direct mode, on the fake provider through the server’s own composition', () => {
  const fake = loadAiSettings({ AI_PROVIDER: 'fake', AI_FEATURES: 'flyer,share' });

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

/* --photo: one picture read, by hand. Stage 2's checkpoint runs it with real pictures on both providers; here it
   runs on the fake, through the server's own intake and composition. */
describe('--photo: a picture read', () => {
  const fake = loadAiSettings({ AI_PROVIDER: 'fake', AI_FEATURES: 'photo' });
  const jpeg = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: '#88aacc' } }).jpeg().toBuffer();
  const caseFile = (name: string, picture: Buffer | null, ext = 'png') => {
    if (picture !== null) writeFileSync(join(scratch, `${name}.${ext}`), picture);
    return file(`${name}.json`, JSON.stringify({ source: 'Today\nBACHATA WORKSHOP', brief: first.brief }));
  };

  it('reads a picture file as it is: no words are expected of it', async () => {
    const bytes = await jpeg(64, 48);
    writeFileSync(join(scratch, 'board.jpg'), bytes);
    const picture = readPicture(join(scratch, 'board.jpg'));
    expect(picture).toEqual({ label: join(scratch, 'board.jpg'), bytes, expected: null });
  });

  it('reads an image example as its picture, beside it under the same name, and the words it should give', async () => {
    const bytes = await jpeg(64, 48);
    const picture = readPicture(caseFile('2026-10-05-bachata', bytes, 'jpg'));
    expect(picture.bytes).toEqual(bytes);
    expect(picture.expected).toBe('Today\nBACHATA WORKSHOP');
    expect(picture.label).toContain('2026-10-05-bachata.jpg');
  });

  it('names what it cannot read: a case with no picture beside it, a .json that is no example, a file that is not there', () => {
    expect(said(() => readPicture(caseFile('lonely', null)))).toMatch(/no picture beside it.*lonely\.(png|jpg)/);
    expect(said(() => readPicture(file('notes.json', '{"hello": 1}')))).toContain('not an image example');
    expect(said(() => readPicture(join(scratch, 'nowhere.jpg')))).toContain('nowhere.jpg');
  });

  it('prepares the picture as the server does, reads it, and hands back what was sent', async () => {
    const big = await jpeg(3000, 1500);
    const outcome = await runDirectPhoto(fake, { label: 'a poster', bytes: big, expected: bundle.examples[0].text }, bundle);
    expect(outcome.error).toBeNull();
    expect(outcome.result).toEqual({ text: bundle.examples[0].text, remaining: 2 });
    expect(outcome.record).toMatchObject({ provider: 'fake', model: 'fake-1', feature: 'photo', ok: true, tokens: { input: 10, output: 20 } });
    // What was sent is what the server would send: shrunk to the read's edge, and it is what the ledger's line names.
    expect(outcome.sent).toMatchObject({ width: AI_PICTURE_MAX_EDGE, height: AI_PICTURE_MAX_EDGE / 2, mediaType: 'image/jpeg' });
    expect(outcome.record?.input).toContain(`image/jpeg ${AI_PICTURE_MAX_EDGE}x${AI_PICTURE_MAX_EDGE / 2} ${outcome.sent?.bytes.length} bytes`);
    const meta = await sharp(outcome.sent!.bytes).metadata();
    expect([meta.format, meta.width]).toEqual(['jpeg', AI_PICTURE_MAX_EDGE]);
  });

  it('prints the words read under the ones expected, with the seconds, the tokens and what was sent', async () => {
    const picture = { label: 'a case', bytes: await jpeg(64, 48), expected: 'Today\nBACHATA WORKSHOP' };
    const printed = closingPhoto(await runDirectPhoto(fake, picture, bundle), picture);
    expect(printed.indexOf('Expected:\nToday\nBACHATA WORKSHOP')).toBeGreaterThanOrEqual(0);
    expect(printed.indexOf('Read:\n' + bundle.examples[0].text)).toBeGreaterThan(printed.indexOf('Expected:'));
    for (const part of ['fake-1', '10 tokens in', '20 out', ' s.', 'Sent: 64x48 image/jpeg']) expect(printed, part).toContain(part);
    // A picture with nothing expected of it prints no such block.
    const plain = { ...picture, expected: null };
    expect(closingPhoto(await runDirectPhoto(fake, plain, bundle), plain)).not.toContain('Expected:');
  });

  it('says so when the picture has no words, and when the read failed, with what the model wrote', async () => {
    const tiny = (width: number) => sharp({ create: { width, height: 8, channels: 3, background: '#fff' } }).png().toBuffer();
    const blank = { label: 'a blank wall', bytes: await tiny(AI_FAKE.pictureWidths.noWords), expected: null };
    expect(closingPhoto(await runDirectPhoto(fake, blank, bundle), blank)).toContain('Read:\n(no words: the model found none about an event)');

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const bad = { label: 'a bad answer', bytes: await tiny(AI_FAKE.pictureWidths.invalid), expected: null };
      const outcome = await runDirectPhoto(fake, bad, bundle);
      expect(outcome.result).toBeNull();
      const printed = closingPhoto(outcome, bad);
      for (const part of ['The AI didn’t answer properly', 'Nothing was counted', '{"text":42}', 'AI_MODELS=photo:']) expect(printed, part).toContain(part);
    } finally {
      errors.mockRestore();
    }
  });

  it('refuses a file that is no picture in the photo route’s own words, before anything is asked', async () => {
    const outcome = await runDirectPhoto(fake, { label: 'notes', bytes: Buffer.from('not an image'), expected: null }, bundle);
    expect(outcome).toMatchObject({ result: null, record: null, sent: null, error: 'That file is not an image we can read. Use a JPG, PNG or WebP.' });
  });

  it('says before it spends anything which model reads: the photo’s own when the settings give it one, and never the key', () => {
    const settings = loadAiSettings({ AI_PROVIDER: 'anthropic', AI_API_KEY: KEY, AI_FEATURES: 'photo', AI_MODELS: 'photo:claude-sonnet-5-5' });
    const printed = openingPhoto(settings, { label: 'board.jpg', bytes: Buffer.alloc(2048), expected: null });
    for (const part of ['anthropic', 'claude-sonnet-5-5', 'key set', 'board.jpg', '2 KB', `${AI_PICTURE_MAX_EDGE} px`]) expect(printed, part).toContain(part);
    expect(printed).not.toContain('claude-haiku-4-5');
    expect(printed).not.toContain(KEY);
    // The flyer's line names the flyer's model, which is the site's.
    expect(opening(settings, first, false, { sent: 1, held: 1 })).toContain('claude-haiku-4-5');
  });
});
