import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { ANONYMOUS } from '../../server/ai/actor.js';
import { loadBundle } from '../../server/ai/bundle.js';
import { createAiService } from '../../server/ai/composition.js';
import { createMemoryAiPictures } from '../../server/ai/pictures.js';
import { redact } from '../../server/ai/providers/common.js';
import { loadConfig, type AiSettings } from '../../server/config.js';
import { HttpError } from '../../server/errors.js';
import { SEED_FILE } from '../../server/paths.js';
import { preparePhoto, type PreparedPhoto } from '../../server/services/photos.js';
import { applySeedFile } from '../../server/storage/seed.js';
import { createSqliteRepositories } from '../../server/storage/sqlite/index.js';
import { systemClock } from '../../server/storage/types.js';
import { AI_FEATURE_NOUNS, AI_FEATURES, AI_PICTURE_MAX_EDGE, aiFor, aiQuotaVars, type AiFeature } from '../../src/shared/ai.js';
import { flyerFromBrief } from '../../src/shared/brief.js';
import { apiError } from '../../src/shared/errors.js';
import {
  AiConfigSchema,
  AiExampleSchema,
  AiFlyerResultSchema,
  AiPhotoResultSchema,
  AiShareResultSchema,
  HostelSchema,
  type AiBundle,
  type AiFlyerResult,
  type AiPhotoResult,
  type AiShareRequest,
  type AiShareResult,
  type Brief,
  type Hostel,
} from '../../src/shared/schema.js';
import type { StoredAiUsage } from '../../src/shared/storage.js';
import { flyersTarget } from '../env.js';
import { appRoot, isAddress, issues, siteAt, SiteError, siteCaller } from '../site.js';

/* npm run ai:smoke -- [--share] [--to <app root>] [example file]
   npm run ai:smoke -- --photo <picture | image example .json> [--save <file>] [--to <app root>]

   One real generation, by hand: a staff text from docs/ai-flyers/examples goes to the provider, and the brief, the
   assumptions, the share text, the tokens and the seconds come back on the console. Never part of `npm test`: no
   test touches a provider.

   Without --to it runs the provider .env names (AI_PROVIDER, AI_API_KEY), the way the server does: the same settings,
   the same composition, the seed's hostels, the real clock, and a ledger in memory, so no site's day is spent. It
   refuses the fake provider, which proves nothing.
   With --to it goes through a site's API, as the editor does, and spends one of that site's generations for today.
   With --share it writes the caption of the example's flyer instead of a flyer from its text.
   With --photo it reads one picture into its words instead: a picture file, or a case of
   docs/ai-flyers/image-examples (its .json, with its picture beside it), whose `source` is then printed above the
   words read. Directly, the picture is prepared as the server prepares it, and --save writes it as it was sent:
   that file is what a case commits. Through a site (--to) the site prepares it, and spends one of its reads. */

export const USAGE = [
  'Usage: npm run ai:smoke -- [--share] [--to <app root>] [example file]',
  '       npm run ai:smoke -- --photo <picture | image example .json> [--save <file>] [--to <app root>]',
].join('\n');

export interface SmokeArgs {
  /** The caption of the example's flyer, instead of a flyer from its text. */
  share: boolean;
  /** A picture to read into its words instead: a picture file, or an image example's .json. */
  photo: string | null;
  /** Where to write the picture as it was sent to the provider (a direct read only). */
  save: string | null;
  /** A site's app root, ending in '/': the call goes through its API. null: straight to the provider .env names. */
  to: string | null;
  /** A file of docs/ai-flyers/examples. null: the bundle's first example. */
  file: string | null;
}

/** What --to names, as an app root (appRoot, scripts/site.ts). */
function toRoot(to: string): string {
  const root = appRoot(to);
  if (root === null) throw new Error(`--to takes a site's address, such as https://nestpass.ai/activities/\n${USAGE}`);
  return root;
}

export function parseSmokeArgs(argv: string[]): SmokeArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { share: { type: 'boolean' }, photo: { type: 'string' }, save: { type: 'string' }, to: { type: 'string' } },
    });
  } catch (e) {
    throw new Error(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  if (positionals.length > 1) throw new Error(`One example file at a time.\n${USAGE}`);
  const file = positionals[0] ?? null;
  if (file !== null && isAddress(file)) throw new Error(`A site's address goes after --to.\n${USAGE}`);
  const photo = values.photo ?? null;
  const save = values.save ?? null;
  if (photo !== null && (values.share || file !== null)) throw new Error(`--photo reads a picture: it takes no --share and no example file.\n${USAGE}`);
  if (save !== null && photo === null) throw new Error(`--save writes the picture a read sent: it goes with --photo.\n${USAGE}`);
  if (save !== null && values.to !== undefined) throw new Error(`--save is for a direct read: through a site, the site prepares the picture.\n${USAGE}`);
  return { share: values.share ?? false, photo, save, to: values.to === undefined ? null : toRoot(values.to), file };
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

/** The feature a run calls: a picture read with --photo, the share text with --share, else a flyer from the text. */
export const featureOf = (args: Pick<SmokeArgs, 'share' | 'photo'>): AiFeature => (args.photo !== null ? 'photo' : args.share ? 'share' : 'flyer');

/** Why the direct mode will not run on these settings, or null when it will: it is for a real provider with its key,
    on a machine whose settings name the feature the run calls. */
export function refusal(settings: AiSettings, feature: AiFeature): string | null {
  if (settings.provider === null) {
    return 'AI_PROVIDER is not set: put AI_PROVIDER (openai or anthropic) and AI_API_KEY in .env, or go through a site with --to <app root>.';
  }
  if (settings.provider === 'fake') return 'AI_PROVIDER is fake, which answers from the examples: the smoke is for a real provider (openai or anthropic) and its key.';
  if (settings.apiKey === null) return `AI_PROVIDER is ${settings.provider}, but AI_API_KEY is not set in .env.`;
  if (!settings.enabled) return 'AI_ENABLED switches the AI off: take that line out of .env, or set it to 1.';
  if (!settings.features.includes(feature)) {
    return `AI_FEATURES in .env does not name "${feature}", so this machine does not run it: AI_FEATURES=${AI_FEATURES.join(',')} runs every feature.`;
  }
  return null;
}

/** A site's release as a run names it: " (id, built YYYY-MM-DD)", or nothing when api/config does not say. */
function releaseOf(server: { release?: { id?: unknown; builtAt?: unknown } } | undefined): string {
  const release = server?.release;
  const built = typeof release?.builtAt === 'string' ? `, built ${release.builtAt.slice(0, 10)}` : '';
  return typeof release?.id === 'string' ? ` (${release.id}${built})` : '';
}

/** What a site's api/config says there is to spend on this feature: its own limit and what is left of it today. It
    throws, with what to do, when there is nothing: a release from before the AI, from before its features had their
    own switches or from before each had its own limit, the AI off, the feature off, or the feature's day used up.
    `ai_off` and an unknown route answer alike (404 not_found), so this is asked before the generation, not learnt
    from its refusal. */
export function siteAi(config: unknown, feature: AiFeature): { limit: number; remaining: number } {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new Error('This is not the flyer app: api/config did not answer with its settings.');
  }
  const { ai, server } = config as { ai?: unknown; server?: { release?: { id?: unknown; builtAt?: unknown } } };
  if (ai === undefined) {
    throw new Error(
      `This site runs a release from before the AI assistant${releaseOf(server)}: upload the current release first (npm run build:php, docs/deploy.md), then add the ai block to its config.php.`,
    );
  }
  // Such a release runs both features and lists none: this script speaks this checkout's contract, so it stops here.
  if (typeof ai === 'object' && ai !== null && (ai as { enabled?: unknown }).enabled === true && !('features' in ai)) {
    throw new Error(
      `This site runs a release from before each AI feature had its own switch${releaseOf(server)}: upload the current release first (npm run build:php, docs/deploy.md), then name the features in its settings ('features' in config.php's ai block; AI_FEATURES on a Node server).`,
    );
  }
  // Such a release has one limit for every feature and lists its features by name: what it says is left is not this
  // feature's own, so the run stops here too.
  const listed = typeof ai === 'object' && ai !== null ? (ai as { features?: unknown }).features : undefined;
  if (Array.isArray(listed) && listed.some((feature) => typeof feature === 'string')) {
    throw new Error(
      `This site runs a release from before each AI feature had its own daily limit${releaseOf(server)}: upload the current release first (npm run build:php, docs/deploy.md). Its settings need no change: 'dailyLimit' in config.php's ai block (AI_DAILY_LIMIT on a Node server) then counts for each feature.`,
    );
  }
  const parsed = AiConfigSchema.safeParse(ai);
  if (!parsed.success) throw new Error(`api/config's ai block is not what the contract says: ${issues(parsed.error)}`);
  if (!parsed.data.enabled) {
    throw new Error(
      "The AI is off on this site: its settings name no provider, no key or no feature, or switch it off (config.php's ai block; AI_PROVIDER, AI_API_KEY and AI_FEATURES on a Node server).",
    );
  }
  const on = aiFor(parsed.data, feature);
  if (on === null) {
    throw new Error(
      `This site does not run "${feature}": its settings name ${parsed.data.features.map((f) => f.name).join(', ')} alone ('features' in config.php's ai block; AI_FEATURES on a Node server).${feature === 'flyer' ? ' Run it with --share for the share text.' : ''}`,
    );
  }
  if (on.remaining === 0) throw new Error(apiError('ai_quota', aiQuotaVars(feature, on.limit)).message);
  return { limit: on.limit, remaining: on.remaining };
}

/** What a run through a site says before it spends anything: one of the feature's own, by what it is called. */
export const siteSpends = (feature: AiFeature, limit: number, remaining: number) =>
  `This spends one of this site's ${limit} ${AI_FEATURE_NOUNS[feature]} for today (${remaining} left).`;

/** What is left of the feature on the site once the run is over. */
export const siteLeft = (feature: AiFeature, remaining: number) => `${remaining} ${AI_FEATURE_NOUNS[feature]} left today on this site.`;

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
      return "The site refuses its config.php: an ai block on a release from before the AI, a key in the block that the site's own release does not know ('features' on one from before the switches, 'dailyLimits' on one from before each feature had its own limit), or a value it will not take. The site's own log names it.";
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
    `Direct: ${settings.provider}, ${settings.models[share ? 'share' : 'flyer']} (effort: ${settings.effort ?? "the model's own"}, time limit ${settings.timeoutMs / 1000} s), ${settings.apiKey === null ? 'no key' : 'key set'}. A ledger in memory: no site's day is spent.`,
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

/** The few-shot a direct run sends: the bundle's examples less the text being sent. An example sent with its own
    answer among the examples would only be read back. */
export function fewShotFor(bundle: Pick<AiBundle, 'examples'>, example: SmokeExample): AiBundle['examples'] {
  return bundle.examples.filter((e) => e.text !== example.text);
}

/** One generation straight to the provider the settings name, composed as server/start.ts composes it: the seed's
    hostels and a real ledger, both in memory, the real clock, and the bundle with the text being sent held out. */
export async function runDirect(settings: AiSettings, example: SmokeExample, share: boolean, bundle: AiBundle = loadBundle()): Promise<DirectOutcome> {
  const fewShot = fewShotFor(bundle, example);
  const repos = createSqliteRepositories({ file: ':memory:' });
  try {
    await applySeedFile(repos, SEED_FILE);
    const service = createAiService(settings, { hostels: repos.hostels, usage: repos.aiUsage, clock: systemClock, pictures: createMemoryAiPictures(), bundle: { ...bundle, examples: fewShot } });
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

/** The picture a read sends: its bytes as they are on disk, and the words it should give when it is a case. */
export interface SmokePicture {
  /** Where it came from, for the first lines of a run. */
  label: string;
  bytes: Buffer;
  /** A case's `source`: what the picture prints, typed out. null for a picture nobody typed out. */
  expected: string | null;
}

/** The kinds of picture a case may have beside it, the ones the app takes. */
const PICTURE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

/** What --photo names: a picture file, or a case of docs/ai-flyers/image-examples by its .json, whose picture sits
    beside it under the same name. */
export function readPicture(file: string): SmokePicture {
  const bytesOf = (path: string): Buffer => {
    try {
      return readFileSync(path);
    } catch (e) {
      throw new Error(`Cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  if (!file.toLowerCase().endsWith('.json')) return { label: file, bytes: bytesOf(file), expected: null };
  let json: unknown;
  try {
    json = JSON.parse(bytesOf(file).toString('utf8'));
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error(`${file} is not JSON: an image example is one of docs/ai-flyers/image-examples.`);
    throw e;
  }
  const example = AiExampleSchema.safeParse(json);
  if (!example.success) throw new Error(`${file} is not an image example (docs/ai-flyers/README.md): ${issues(example.error)}`);
  const name = basename(file).slice(0, -'.json'.length);
  const beside = PICTURE_EXTENSIONS.map((ext) => join(dirname(file), `${name}.${ext}`));
  const picture = beside.find((path) => existsSync(path));
  if (picture === undefined) throw new Error(`${file} has no picture beside it: ${beside.map((path) => basename(path)).join(', ')}.`);
  return { label: picture, bytes: bytesOf(picture), expected: example.data.source };
}

const kilobytes = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** What a read says before it spends anything: the provider, the model that reads (the photo's own when the
    settings give it one), never the key, and the picture. */
export function openingPhoto(settings: AiSettings, picture: SmokePicture): string {
  return [
    `Direct: ${settings.provider}, ${settings.models.photo} (effort: ${settings.effort ?? "the model's own"}, time limit ${settings.timeoutMs / 1000} s), ${settings.apiKey === null ? 'no key' : 'key set'}. A ledger in memory: no site's day is spent.`,
    `Picture: ${picture.label}, ${kilobytes(picture.bytes.length)} on disk. It is prepared as the server prepares it: upright, no metadata, ${AI_PICTURE_MAX_EDGE} px at most on its long edge.`,
  ].join('\n');
}

/** One direct read: the route's answer (null when it failed), the ledger's record of the attempt, the time the
    provider took, the picture as it was sent (null when the file was refused before anything was asked), and the
    refusal in the API's words when there was one. */
export interface PhotoOutcome {
  result: AiPhotoResult | null;
  record: StoredAiUsage | null;
  ms: number;
  sent: PreparedPhoto | null;
  error: string | null;
}

/** One read straight to the provider the settings name, as POST api/ai/photo makes it: the server's own intake at
    the read's edge, its composition, the real clock, and a ledger and kept pictures in memory. */
export async function runDirectPhoto(settings: AiSettings, picture: SmokePicture, bundle: AiBundle = loadBundle()): Promise<PhotoOutcome> {
  const repos = createSqliteRepositories({ file: ':memory:' });
  try {
    const service = createAiService(settings, { hostels: repos.hostels, usage: repos.aiUsage, clock: systemClock, pictures: createMemoryAiPictures(), bundle });
    if (!service) throw new Error('These settings run no provider: the direct mode needs AI_PROVIDER and its key.');
    let sent: PreparedPhoto | null = null;
    let result: AiPhotoResult | null = null;
    let error: string | null = null;
    let started = performance.now();
    try {
      sent = await preparePhoto(picture.bytes, AI_PICTURE_MAX_EDGE);
      // The seconds are the read's: preparing the picture is this machine's work, not the provider's.
      started = performance.now();
      result = await service.photo(ANONYMOUS, sent);
    } catch (e) {
      // A refusal from the catalogue is this run's result; anything else is a fault, and is thrown on.
      if (!(e instanceof HttpError)) throw e;
      error = e.message;
    }
    const ms = Math.round(performance.now() - started);
    return { result, record: (await repos.aiUsage.all()).at(-1) ?? null, ms, sent, error };
  } finally {
    await repos.close();
  }
}

/** Whether a file's name says what a prepared picture holds: .png for a PNG, .jpg or .jpeg for a JPEG. */
export const namesItsFormat = (file: string, sent: Pick<PreparedPhoto, 'ext'>): boolean => (sent.ext === 'png' ? /\.png$/i : /\.jpe?g$/i).test(file);

/** Writes the picture as it was sent, under a name that says what it is: a case commits this file, and an opaque
    PNG goes out as a JPEG. */
export function savePicture(file: string, sent: PreparedPhoto): void {
  if (!namesItsFormat(file, sent)) throw new Error(`${file} would not say what it holds: the picture was sent as ${sent.mediaType}, so name it .${sent.ext}.`);
  writeFileSync(file, sent.bytes);
}

/** A read's words as a person compares them: the ones expected first, when the picture is a case, then the ones read. */
function describeWords(text: string, picture: SmokePicture): string {
  return [...(picture.expected === null ? [] : ['Expected:', picture.expected, '']), 'Read:', text === '' ? '(no words: the model found none about an event)' : text].join('\n');
}

/** What a direct read says once it is over: the words and their numbers, or why there are none. */
export function closingPhoto(outcome: PhotoOutcome, picture: SmokePicture): string {
  const { record, sent } = outcome;
  const tokens = record?.tokens ? `${record.tokens.input} tokens in, ${record.tokens.output} out` : 'no token count';
  const wasSent = sent === null ? [] : [`Sent: ${sent.width}x${sent.height} ${sent.mediaType}, ${kilobytes(sent.bytes.length)}.`];
  if (outcome.result !== null) {
    return [describeWords(outcome.result.text, picture), '', `Answered by ${record?.model ?? 'an unnamed model'}: ${tokens}, ${seconds(outcome.ms)}.`, ...wasSent].join('\n');
  }
  return [
    `Failed after ${seconds(outcome.ms)}: ${outcome.error}`,
    ...(record === null ? ['Nothing reached the provider.'] : ["The reason is the service's own line, above. Nothing was counted.", `Asked of ${record.model}: ${tokens}.`]),
    ...wasSent,
    ...(record?.output ? ['What the model wrote:', record.output] : []),
    ...(record === null ? [] : [KNOBS, 'A model that cannot read pictures answers an error: name one that can for the read alone, AI_MODELS=photo:<model>.']),
  ].join('\n');
}

/** Longer than the provider's own limit on the site (25 s unless its settings say otherwise), so the site's answer,
    a refusal included, is what comes back. */
const SITE_WAIT_MS = 60_000;

/** One generation through a site's API, as the editor makes it. The network part: untested by design. */
async function runSite(to: string, share: boolean, example: SmokeExample, bundle: Pick<AiBundle, 'examples'>): Promise<void> {
  const target = siteAt(to, flyersTarget());
  const call = siteCaller(target, { timeoutMs: SITE_WAIT_MS });
  console.log(`Through ${target.baseUrl}${target.basicAuth ? `, signed in as "${target.basicAuth.user}"` : ''}.`);
  console.log(`Example: ${example.label}, ${share ? 'the share text of its flyer' : 'a flyer from its text'}.`);
  const config = await call('GET', 'api/config', z.unknown());
  const feature = featureOf({ share, photo: null });
  const { limit, remaining } = siteAi(config, feature);
  console.log(siteSpends(feature, limit, remaining));
  if (fewShotFor(bundle, example).length < bundle.examples.length) {
    console.log("The text is one of the release's own few-shot examples, so the answer proves the route, the key and the host's time limit, not the model's judgment.");
  }
  const started = performance.now();
  const result = share
    ? await call('POST', 'api/ai/share', AiShareResultSchema, shareRequest(example, await call('GET', 'api/hostels', z.array(HostelSchema))))
    : await call('POST', 'api/ai/flyer', AiFlyerResultSchema, { text: example.text });
  const ms = Math.round(performance.now() - started);
  console.log(describeAnswer(result));
  console.log(`\nAnswered in ${seconds(ms)}; ${siteLeft(feature, result.remaining)}`);
  const ledger = (config as { storage?: unknown }).storage === 'sqlite' ? 'the ai_usage table of its database' : 'data/ai-usage/YYYY-MM.json';
  console.log(`The tokens and the model are in the site's ledger (${ledger}): no route answers them.`);
}

/** One read through a site's API, as the page will make it: the picture as it is on disk, which the site prepares.
    The network part: untested by design. */
async function runSitePhoto(to: string, picture: SmokePicture): Promise<void> {
  const target = siteAt(to, flyersTarget());
  const call = siteCaller(target, { timeoutMs: SITE_WAIT_MS });
  console.log(`Through ${target.baseUrl}${target.basicAuth ? `, signed in as "${target.basicAuth.user}"` : ''}.`);
  console.log(`Picture: ${picture.label}, ${kilobytes(picture.bytes.length)} on disk. The site prepares it.`);
  const config = await call('GET', 'api/config', z.unknown());
  const { limit, remaining } = siteAi(config, 'photo');
  console.log(siteSpends('photo', limit, remaining));
  const form = new FormData();
  form.append('photo', new Blob([new Uint8Array(picture.bytes)]), basename(picture.label));
  const started = performance.now();
  const result = await call('POST', 'api/ai/photo', AiPhotoResultSchema, form);
  const ms = Math.round(performance.now() - started);
  console.log(describeWords(result.text, picture));
  console.log(`\nAnswered in ${seconds(ms)}, the upload included; ${siteLeft('photo', result.remaining)}`);
  const ledger = (config as { storage?: unknown }).storage === 'sqlite' ? 'the ai_usage table of its database' : 'data/ai-usage/YYYY-MM.json';
  console.log(`The tokens and the model are in the site's ledger (${ledger}), and the picture as it was sent is in its data folder (ai-pictures/, for thirty days): no route answers them.`);
}

async function main(argv: string[]): Promise<number> {
  const args = parseSmokeArgs(argv);
  const bundle = loadBundle();
  const picture = args.photo === null ? null : readPicture(args.photo);
  const example = picture === null ? readExample(args.file, bundle) : null;
  if (args.to !== null) {
    try {
      if (picture !== null) await runSitePhoto(args.to, picture);
      else await runSite(args.to, args.share, example!, bundle);
      return 0;
    } catch (e) {
      console.error(whatFailed(e));
      const hint = siteHint(e);
      if (hint !== null) console.error(hint);
      return 1;
    }
  }
  const settings = loadConfig().ai;
  const no = refusal(settings, featureOf(args));
  if (no !== null) throw new Error(no);
  // Whatever a provider echoes is already redacted by its adapter; nothing this script prints may carry the key either.
  const say = (text: string) => console.log(redact(text, settings.apiKey ?? ''));
  if (picture !== null) {
    say(openingPhoto(settings, picture));
    const outcome = await runDirectPhoto(settings, picture, bundle);
    say(`\n${closingPhoto(outcome, picture)}`);
    if (args.save !== null && outcome.sent !== null) {
      savePicture(args.save, outcome.sent);
      say(`The picture as it was sent is in ${args.save}.`);
    }
    return outcome.error === null ? 0 : 1;
  }
  if (example === null) throw new Error('No example to send.');
  const sent = fewShotFor(bundle, example).length;
  say(opening(settings, example, args.share, { sent, held: bundle.examples.length - sent }));
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
