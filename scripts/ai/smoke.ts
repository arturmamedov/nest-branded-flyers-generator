import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { ANONYMOUS } from '../../server/ai/actor.js';
import { loadBundle } from '../../server/ai/bundle.js';
import { createAiService } from '../../server/ai/composition.js';
import { redact } from '../../server/ai/providers/common.js';
import { loadConfig, type AiSettings } from '../../server/config.js';
import { HttpError } from '../../server/errors.js';
import { SEED_FILE } from '../../server/paths.js';
import { applySeedFile } from '../../server/storage/seed.js';
import { createSqliteRepositories } from '../../server/storage/sqlite/index.js';
import { systemClock } from '../../server/storage/types.js';
import { flyerFromBrief } from '../../src/shared/brief.js';
import { apiError } from '../../src/shared/errors.js';
import {
  AiConfigSchema,
  AiExampleSchema,
  AiFlyerResultSchema,
  AiShareResultSchema,
  HostelSchema,
  type AiBundle,
  type AiFlyerResult,
  type AiShareRequest,
  type AiShareResult,
  type Brief,
  type Hostel,
} from '../../src/shared/schema.js';
import type { StoredAiUsage } from '../../src/shared/storage.js';
import { flyersTarget, type RemoteSite } from '../env.js';
import { issues, SiteError, siteCaller } from '../site.js';

/* npm run ai:smoke -- [--share] [--to <app root>] [example file]

   One real generation, by hand: a staff text from docs/ai-flyers/examples goes to the provider, and the brief, the
   assumptions, the share text, the tokens and the seconds come back on the console. Never part of `npm test`: no
   test touches a provider.

   Without --to it runs the provider .env names (AI_PROVIDER, AI_API_KEY), the way the server does: the same settings,
   the same composition, the seed's hostels, the real clock, and a ledger in memory, so no site's day is spent. It
   refuses the fake provider, which proves nothing.
   With --to it goes through a site's API, as the editor does, and spends one of that site's generations for today.
   With --share it writes the caption of the example's flyer instead of a flyer from its text. */

export const USAGE = 'Usage: npm run ai:smoke -- [--share] [--to <app root>] [example file]';

export interface SmokeArgs {
  /** The caption of the example's flyer, instead of a flyer from its text. */
  share: boolean;
  /** A site's app root, ending in '/': the call goes through its API. null: straight to the provider .env names. */
  to: string | null;
  /** A file of docs/ai-flyers/examples. null: the bundle's first example. */
  file: string | null;
}

const isAddress = (text: string) => /^https?:\/\//i.test(text);

/** A site's address as an app root. A login in it is refused (fetch() refuses such an address) and never repeated. */
function appRoot(to: string): string {
  if (!isAddress(to) || !URL.canParse(to)) throw new Error(`--to takes a site's address, such as https://nestpass.ai/activities/\n${USAGE}`);
  const url = new URL(to);
  if (url.username || url.password) {
    throw new Error('--to must not carry a user or a password: the login comes from FLYERS_BASIC_USER and FLYERS_BASIC_PASSWORD in .env.');
  }
  return url.href.endsWith('/') ? url.href : `${url.href}/`;
}

export function parseSmokeArgs(argv: string[]): SmokeArgs {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: { share: { type: 'boolean' }, to: { type: 'string' } } });
  } catch (e) {
    throw new Error(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  if (positionals.length > 1) throw new Error(`One example file at a time.\n${USAGE}`);
  const file = positionals[0] ?? null;
  if (file !== null && isAddress(file)) throw new Error(`A site's address goes after --to.\n${USAGE}`);
  return { share: values.share ?? false, to: values.to === undefined ? null : appRoot(values.to), file };
}

export interface SmokeExample {
  /** Where it came from, for the first lines of a run. */
  label: string;
  /** The staff member's text, exactly as it came. */
  text: string;
  /** The brief written from it by hand: what --share builds its flyer from, and what a model's brief is read against. */
  brief: Brief;
}

/** The example a run sends: the file named, or the bundle's first (the few-shot is made of the same files). */
export function readExample(file: string | null, bundle: Pick<AiBundle, 'examples'>): SmokeExample {
  if (file === null) {
    const first = bundle.examples[0];
    if (!first) throw new Error('schema/ai.json holds no example: name an example file.');
    return { label: "the bundle's first example (schema/ai.json)", text: first.text, brief: first.answer.brief };
  }
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(`Cannot read ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${file} is not JSON: an example file is one of docs/ai-flyers/examples (docs/ai-flyers/README.md).`);
  }
  const example = AiExampleSchema.safeParse(json);
  if (!example.success) throw new Error(`${file} is not an example file (docs/ai-flyers/README.md): ${issues(example.error)}`);
  return { label: file, text: example.data.source, brief: example.data.brief };
}

/** What "Write with AI" sends for the example's flyer: the flyer its brief builds, as the editor sends its own, and
    the staff text as the idea it came from. A hostel the site does not have stops it before anything is sent. */
export function shareRequest(example: SmokeExample, hostels: readonly Pick<Hostel, 'slug' | 'name'>[]): AiShareRequest {
  const slug = example.brief.hostel;
  const hostel = slug === null ? null : hostels.find((h) => h.slug === slug);
  if (hostel === undefined) throw new Error(`No hostel "${slug}" here (${hostels.map((h) => h.slug).join(', ')}).`);
  const flyer = flyerFromBrief(example.brief, hostel?.name ?? null);
  return { hostel: flyer.hostel, template: flyer.template, data: flyer.data, idea: example.text };
}

/** Why the direct mode will not run on these settings, or null when it will: it is for a real provider with its key. */
export function refusal(settings: AiSettings): string | null {
  if (settings.provider === null) {
    return 'AI_PROVIDER is not set: put AI_PROVIDER (openai or anthropic) and AI_API_KEY in .env, or go through a site with --to <app root>.';
  }
  if (settings.provider === 'fake') return 'AI_PROVIDER is fake, which answers from the examples: the smoke is for a real provider (openai or anthropic) and its key.';
  if (settings.apiKey === null) return `AI_PROVIDER is ${settings.provider}, but AI_API_KEY is not set in .env.`;
  if (!settings.enabled) return 'AI_ENABLED switches the AI off: take that line out of .env, or set it to 1.';
  return null;
}

const sameAddress = (a: string, b: string) => URL.canParse(a) && URL.canParse(b) && new URL(a).href === new URL(b).href;

/** The site --to names. The login in .env belongs to the site .env names (FLYERS_BASE_URL): that address signs in
    with it, any other goes without. CONTRACT_* is never used: it may name a site for a read-only check. */
export function smokeSite(to: string, flyers: RemoteSite | null): RemoteSite {
  return flyers !== null && sameAddress(flyers.baseUrl, to) ? { ...flyers, baseUrl: to } : { baseUrl: to, source: 'environment' };
}

/** What a site's api/config says there is to spend: the limit and what is left of it today. It throws, with what to
    do, when there is nothing: a release from before the AI, the AI off, or the day used up. `ai_off` and an unknown
    route answer alike (404 not_found), so this is asked before the generation, not learnt from its refusal. */
export function siteAi(config: unknown): { limit: number; remaining: number } {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new Error('This is not the flyer app: api/config did not answer with its settings.');
  }
  const { ai, server } = config as { ai?: unknown; server?: { release?: { id?: unknown; builtAt?: unknown } } };
  if (ai === undefined) {
    const release = server?.release;
    const built = typeof release?.builtAt === 'string' ? `, built ${release.builtAt.slice(0, 10)}` : '';
    const named = typeof release?.id === 'string' ? ` (${release.id}${built})` : '';
    throw new Error(
      `This site runs a release from before the AI assistant${named}: upload the current release first (npm run build:php, docs/deploy.md), then add the ai block to its config.php.`,
    );
  }
  const parsed = AiConfigSchema.safeParse(ai);
  if (!parsed.success) throw new Error(`api/config's ai block is not what the contract says: ${issues(parsed.error)}`);
  if (!parsed.data.enabled) {
    throw new Error("The AI is off on this site: its settings name no provider or no key, or switch it off (config.php's ai block; AI_PROVIDER and AI_API_KEY on a Node server).");
  }
  if (parsed.data.remaining === 0) throw new Error(apiError('ai_quota', { limit: parsed.data.limit }).message);
  return { limit: parsed.data.limit, remaining: parsed.data.remaining };
}

/** The codes Node gives a certificate it has no reason to trust (a development server's own, as Laragon's is). */
const UNTRUSTED = new Set(['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY']);

/** fetch() says only "fetch failed": the reason is the cause's code. */
const causeCode = (error: unknown): string | null => {
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  return typeof cause?.code === 'string' ? cause.code : null;
};

/** What went wrong, in one line. */
export function whatFailed(error: unknown): string {
  if (error instanceof z.ZodError) return `The answer is not what the contract says: ${issues(error)}`;
  if (!(error instanceof Error)) return String(error);
  const code = causeCode(error);
  return code === null ? error.message : `${error.message} (${code})`;
}

/** What to do about a call to a site that failed, when it is one of the failures a person meets; else null. */
export function siteHint(error: unknown): string | null {
  if (error instanceof SiteError) {
    if (error.movedTo !== null) return `Run it again with --to ${error.movedTo}`;
    if (error.status === 401) return 'The site wants its staff login: set FLYERS_BASE_URL to this address in .env, with FLYERS_BASIC_USER and FLYERS_BASIC_PASSWORD.';
    if (error.code === 'not_configured') {
      return "The site refuses its config.php: an ai block on a release from before the AI, or a key in the block that config.sample.php does not have. The site's own log names it.";
    }
    if (error.code === 'ai_failed') {
      return "Nothing was counted. The reason is in the site's own log (PHP: data/php-errors.log or the host's error log; Node: its console), and the attempt is in its ledger.";
    }
    return null;
  }
  if (UNTRUSTED.has(causeCode(error) ?? '')) {
    return "Node does not trust this site's certificate. For a Laragon copy, set NODE_EXTRA_CA_CERTS to Laragon's own (C:\\laragon\\etc\\ssl\\laragon.crt) before running it.";
  }
  if (error instanceof Error && error.name === 'TimeoutError') {
    return 'No answer in time. The host may have cut the request off; the generation may still have been counted there.';
  }
  return null;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** What a run says before it spends anything: the provider and its knobs (never the key), and what goes out. */
export function opening(settings: AiSettings, example: SmokeExample, share: boolean, fewShot: { sent: number; held: number }): string {
  return [
    `Direct: ${settings.provider}, ${settings.model} (effort: ${settings.effort ?? "the model's own"}, time limit ${settings.timeoutMs / 1000} s), ${settings.apiKey === null ? 'no key' : 'key set'}. A ledger in memory: no site's day is spent.`,
    `Example: ${example.label}, ${share ? 'the share text of its flyer' : 'a flyer from its text'}.`,
    fewShot.held > 0
      ? `Few-shot: ${fewShot.sent} of ${fewShot.sent + fewShot.held} examples sent. This text is one of them, so it is held out: the answer is the model's own, not its example read back.`
      : `Few-shot: all ${fewShot.sent} examples sent.`,
  ].join('\n');
}

/** A route's answer as a person reads it: the brief without its share text, the assumptions, then the share text. */
export function describeAnswer(result: AiFlyerResult | AiShareResult): string {
  if (!('brief' in result)) return ['Share text:', result.share].join('\n');
  const { share, ...brief } = result.brief;
  return [
    'Brief:',
    JSON.stringify(brief, null, 2),
    'Assumptions:',
    ...(result.assumptions.length ? result.assumptions.map((a) => `- ${a.field}: ${a.note}`) : ['- none']),
    'Share text:',
    share ?? '(none)',
  ].join('\n');
}

/** The knobs, in the order to turn them, and the three refusals a wrong line of .env gets from a provider. */
const KNOBS = [
  "If it ran out of time: run it once more (a provider's first call with a new schema is slower), then AI_EFFORT=low (OpenAI only), then a larger AI_TIMEOUT_MS.",
  "A 401 means AI_API_KEY is not this provider's key; a 400 on claude-haiku-4-5, that AI_EFFORT is set; a 404, that AI_MODEL names no model.",
].join('\n');

/** One direct generation: the route's answer (null when it failed), the ledger's record of the attempt (the model
    that answered, its tokens, what it wrote), the time it took, the few-shot examples that went out and those held
    back, and the refusal in the API's words when there was one. */
export interface DirectOutcome {
  result: AiFlyerResult | AiShareResult | null;
  record: StoredAiUsage | null;
  ms: number;
  sent: number;
  held: number;
  error: string | null;
}

/** What a direct run says once it is over: the answer and its numbers, or why there is none. */
export function closing(outcome: DirectOutcome): string {
  const { record } = outcome;
  const tokens = record?.tokens ? `${record.tokens.input} tokens in, ${record.tokens.output} out` : 'no token count';
  if (outcome.result !== null) return [describeAnswer(outcome.result), '', `Answered by ${record?.model ?? 'an unnamed model'}: ${tokens}, ${seconds(outcome.ms)}.`].join('\n');
  return [
    `Failed after ${seconds(outcome.ms)}: ${outcome.error}`,
    "The reason is the service's own line, above. Nothing was counted.",
    ...(record === null ? ['Nothing reached the provider.'] : [`Asked of ${record.model}: ${tokens}.`]),
    ...(record?.output ? ['What the model wrote:', record.output] : []),
    KNOBS,
  ].join('\n');
}

/** One generation straight to the provider the settings name, composed as server/index.ts composes it: the seed's
    hostels and a real ledger, both in memory, the real clock, and the bundle less the text being sent (an example
    sent with its own answer among the few-shot would only be read back). */
export async function runDirect(settings: AiSettings, example: SmokeExample, share: boolean, bundle: AiBundle = loadBundle()): Promise<DirectOutcome> {
  const fewShot = bundle.examples.filter((e) => e.text !== example.text);
  const repos = createSqliteRepositories({ file: ':memory:' });
  try {
    await applySeedFile(repos, SEED_FILE);
    const service = createAiService(settings, { hostels: repos.hostels, usage: repos.aiUsage, clock: systemClock, bundle: { ...bundle, examples: fewShot } });
    if (!service) throw new Error('These settings run no provider: the direct mode needs AI_PROVIDER and its key.');
    const hostels = await repos.hostels.list();
    const started = performance.now();
    let result: AiFlyerResult | AiShareResult | null = null;
    let error: string | null = null;
    try {
      result = share ? await service.share(ANONYMOUS, shareRequest(example, hostels)) : await service.flyer(ANONYMOUS, { text: example.text });
    } catch (e) {
      // A refusal from the catalogue is this run's result; anything else is a fault, and is thrown on.
      if (!(e instanceof HttpError)) throw e;
      error = `${e.message}${e.fields ? ` ${JSON.stringify(e.fields)}` : ''}`;
    }
    const ms = Math.round(performance.now() - started);
    const record = (await repos.aiUsage.all()).at(-1) ?? null;
    return { result, record, ms, sent: fewShot.length, held: bundle.examples.length - fewShot.length, error };
  } finally {
    await repos.close();
  }
}

/** Longer than the provider's own limit on the site (25 s unless its settings say otherwise), so the site's answer,
    a refusal included, is what comes back. */
const SITE_WAIT_MS = 60_000;

/** One generation through a site's API, as the editor makes it. The network part: untested by design. */
async function runSite(to: string, share: boolean, example: SmokeExample, bundle: Pick<AiBundle, 'examples'>): Promise<void> {
  const target = smokeSite(to, flyersTarget());
  const call = siteCaller(target, { timeoutMs: SITE_WAIT_MS });
  console.log(`Through ${target.baseUrl}${target.basicAuth ? `, signed in as "${target.basicAuth.user}"` : ''}.`);
  console.log(`Example: ${example.label}, ${share ? 'the share text of its flyer' : 'a flyer from its text'}.`);
  const config = await call('GET', 'api/config', z.unknown());
  const { limit, remaining } = siteAi(config);
  console.log(`This spends one of this site's ${limit} generations today (${remaining} left).`);
  if (bundle.examples.some((e) => e.text === example.text)) {
    console.log("The text is one of the release's own few-shot examples, so the answer proves the route, the key and the host's time limit, not the model's judgment.");
  }
  const started = performance.now();
  const result = share
    ? await call('POST', 'api/ai/share', AiShareResultSchema, shareRequest(example, await call('GET', 'api/hostels', z.array(HostelSchema))))
    : await call('POST', 'api/ai/flyer', AiFlyerResultSchema, { text: example.text });
  const ms = Math.round(performance.now() - started);
  console.log(describeAnswer(result));
  console.log(`\nAnswered in ${seconds(ms)}; ${result.remaining} left today on this site.`);
  const ledger = (config as { storage?: unknown }).storage === 'sqlite' ? 'the ai_usage table of its database' : 'data/ai-usage/YYYY-MM.json';
  console.log(`The tokens and the model are in the site's ledger (${ledger}): no route answers them.`);
}

async function main(argv: string[]): Promise<number> {
  const args = parseSmokeArgs(argv);
  const bundle = loadBundle();
  const example = readExample(args.file, bundle);
  if (args.to !== null) {
    try {
      await runSite(args.to, args.share, example, bundle);
      return 0;
    } catch (e) {
      console.error(whatFailed(e));
      const hint = siteHint(e);
      if (hint !== null) console.error(hint);
      return 1;
    }
  }
  const settings = loadConfig().ai;
  const no = refusal(settings);
  if (no !== null) throw new Error(no);
  // Whatever a provider echoes is already redacted by its adapter; nothing this script prints may carry the key either.
  const say = (text: string) => console.log(redact(text, settings.apiKey ?? ''));
  const held = bundle.examples.filter((e) => e.text === example.text).length;
  say(opening(settings, example, args.share, { sent: bundle.examples.length - held, held }));
  const outcome = await runDirect(settings, example, args.share, bundle);
  say(`\n${closing(outcome)}`);
  return outcome.error === null ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e: unknown) => {
      console.error(whatFailed(e));
      process.exitCode = 1;
    },
  );
}
