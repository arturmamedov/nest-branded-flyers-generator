import type { AiConfig } from './schema.js';

/* The AI assistant's shared facts (docs/prompts/ai-assistant.md): each feature's daily limit, the longest idea text,
   the day a limit counts in, and the provider defaults. No zod here (the import above is a type's, and is gone once
   compiled): the editor imports the limit and the input limit, and `npm run gen` copies the constants into
   schema/shared.json for the PHP backend, so a number is written once. */

/** Generations a day of each feature (the owner's cap, 2026-10-01, and since 2026-10-06 each feature's own): a flyer
    from an idea already includes its share text, so one generation is a whole flyer. Counted per actor; today every
    request is the one anonymous actor. This is the default. A site may set its own number for every feature (the
    owner's answer, 2026-10-05) through the setting that has this constant's name on Node (AI_DAILY_LIMIT in .env) and
    is `dailyLimit` in config.php's `ai` block, and one feature's own through AI_DAILY_LIMITS / `dailyLimits`. */
export const AI_DAILY_LIMIT = 3;

/** The most a site's own setting may allow a feature a day: the app is public until its login exists, so the limits
    are what keeps a stranger's cost known. Above it the setting is refused. */
export const AI_DAILY_LIMIT_MAX = 20;

/** The longest idea text, in code points: a long group-chat post, not a document. */
export const AI_INPUT_MAX = 4000;

/** The most assumptions a flyer's answer carries: what the model may write, and what the route answers once the
    service has added its own note (a made-up hostel), so that note takes the model's last one's place on a full list. */
export const AI_ASSUMPTIONS_MAX = 12;

/** Every feature the app has: `flyer` is "Create with AI" (an idea → a flyer), `share` is "Write with AI" (a flyer →
    its share text). A site runs the ones its own setting names, none until then: that setting has this constant's
    name on Node (AI_FEATURES in .env) and is `features` in config.php's `ai` block. */
export const AI_FEATURES = ['flyer', 'share'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

/** What a feature's generations are called where their number is said in words: the used-up sentence (ai_quota), and
    the smoke script's lines. Each feature has its own daily limit, so the sentence names what ran out. */
export const AI_FEATURE_NOUNS: Record<AiFeature, string> = { flyer: 'AI flyers', share: 'AI share texts' };

/** What the ai_quota sentence is filled with for one feature: its limit, and what its generations are called. */
export const aiQuotaVars = (feature: AiFeature, limit: number) => ({ limit, what: AI_FEATURE_NOUNS[feature] });

/** api/config's `ai` block when the AI is on for the caller: the features that run, each with its own count. */
export type AiOn = Extract<AiConfig, { enabled: true }>;
/** One feature as api/config lists it: its name, the caller's daily limit for it, and what is left of that today. */
export type AiFeatureOn = AiOn['features'][number];

/** The AI as far as one feature goes, from api/config's answer: that feature's own limit and what is left of it
    when the site runs it for the caller, else null. The editor shows a feature only through this.
    The editor never parses an answer (zod stays out of its bundle), so a backend older than this client is met
    here, as it is while a release is being uploaded: one from before each feature had its own limit lists the
    features by name, one from before the switches lists none, one from before the AI has no `ai` block at all.
    Whatever it cannot read, nothing of the AI shows, and the page still loads. */
export function aiFor(ai: AiConfig, feature: AiFeature): AiFeatureOn | null {
  const its = listed(ai)?.find(entryOf(feature));
  return its && isCount(its.limit) && isCount(its.remaining) ? its : null;
}

/** api/config's answer once a route has said what is left today of one feature: that feature's count moves, and only
    that one. It reads the answer as loosely as aiFor() does, since it walks the same list: an entry that is no
    feature's stays as it came, and so does the whole answer when `remaining` is no count, so an answer the editor
    cannot read never costs more than the AI. */
export function aiWithRemaining(ai: AiConfig, feature: AiFeature, remaining: number): AiConfig {
  const features = listed(ai);
  if (!features || !isCount(remaining)) return ai;
  const its = entryOf(feature);
  return { ...ai, features: features.map((f) => (its(f) ? { ...f, remaining } : f)) } as AiConfig;
}

/** The entries of api/config's `ai` block as they came, when the AI is on and the block lists any: never trusted. */
function listed(ai: AiConfig): unknown[] | null {
  const answer = ai as Partial<AiOn> | null | undefined;
  return answer?.enabled === true && Array.isArray(answer.features) ? answer.features : null;
}

/** Whether an entry of that list is this feature's: an object with its name. Its counts are not checked here. */
const entryOf =
  (feature: AiFeature) =>
  (entry: unknown): entry is AiFeatureOn =>
    typeof entry === 'object' && entry !== null && (entry as AiFeatureOn).name === feature;

/** A count as the contract has it (AiFeatureStatusSchema): a whole number from zero up, one a number holds exactly. */
const isCount = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;

/** The day a generation counts for is the Canary Islands day: WET in winter, WEST in summer. */
export const AI_DAY_ZONE = 'Atlantic/Canary';

/** The provider call's time limit, safely under a shared host's request limit (IONOS runs PHP under FastCGI). */
export const AI_TIMEOUT_MS = 25_000;

/** Room for a whole brief with its share text, and for a reasoning model's hidden tokens, which count too. */
export const AI_MAX_OUTPUT_TOKENS = 8000;

export const AI_PROVIDERS = ['openai', 'anthropic', 'fake'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** The model each provider runs unless AI_MODEL (Node) or `ai.model` (PHP) says otherwise: the fast tier of each,
    the owner's choice (2026-10-02). Haiku 4.5 takes no effort setting; gpt-6-luna takes `reasoning.effort`. */
export const AI_DEFAULT_MODEL: Record<Exclude<AiProvider, 'fake'>, string> = {
  openai: 'gpt-6-luna',
  anthropic: 'claude-haiku-4-5',
};

/** The names the answer formats go by: on the wire (OpenAI's `text.format.name`) and in the fake. `photo` is the
    picture read's: the words a picture shows, for "Your idea". */
export const AI_SCHEMA_NAMES = { flyer: 'nest_flyer_brief', share: 'nest_share_text', photo: 'nest_picture_text' } as const;

/** The longest edge of the picture a read sends the model, in pixels: enough for small print on a poster, and well
    under the flyer photo's own (MAX_PHOTO_EDGE). The server prepares it; the browser shrinks to it first, as a
    courtesy. Whether it stays is the owner's to say once real reads are measured. */
export const AI_PICTURE_MAX_EDGE = 2048;

/** The one line a picture read's turn says after its picture. The rules are the reader's prompt
    (ai/prompts/photo.md); nothing else is added at request time. */
export const AI_PICTURE_ASK = 'Write out the words of the event in this picture.';

/** The fake provider both backends ship for the tests and a demo (docs/api-contract.md, "The AI assistant"): its model
    name, the slug it makes up, the markers in the last user turn that steer it, and the picture widths that steer a
    picture read. */
export const AI_FAKE = {
  model: 'fake-1',
  unknownHostel: 'no-such-nest',
  markers: {
    /** An answer that fails the schema. */
    invalid: '[[fake:invalid]]',
    /** A brief for a hostel the site does not have. */
    unknownHostel: '[[fake:unknown-hostel]]',
    timeout: '[[fake:timeout]]',
    refused: '[[fake:refused]]',
  },
  /** A picture read has no typed text to carry a marker, so the picture's width in pixels steers the fake. A tiny
      picture is never enlarged, so its width reaches the fake unchanged on both backends. Any other width is read as
      the first example's text. */
  pictureWidths: {
    /** An answer that fails the schema. */
    invalid: 11,
    timeout: 12,
    refused: 13,
    /** A picture with no words: an empty text, which counts. */
    noWords: 14,
  },
} as const;

/** The block `npm run gen` writes to schema/shared.json, in this order; PHP reads it through Shared::ai(). */
export const AI_SHARED = {
  dailyLimit: AI_DAILY_LIMIT,
  dailyLimitMax: AI_DAILY_LIMIT_MAX,
  inputMax: AI_INPUT_MAX,
  assumptionsMax: AI_ASSUMPTIONS_MAX,
  features: AI_FEATURES,
  featureNouns: AI_FEATURE_NOUNS,
  dayZone: AI_DAY_ZONE,
  timeoutMs: AI_TIMEOUT_MS,
  maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
  providers: AI_PROVIDERS,
  defaultModel: AI_DEFAULT_MODEL,
  schemaNames: AI_SCHEMA_NAMES,
  pictureMaxEdge: AI_PICTURE_MAX_EDGE,
  pictureAsk: AI_PICTURE_ASK,
  fake: AI_FAKE,
} as const;

/** The parts of an instant as the Canary Islands clock shows them. */
function parts(iso: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-GB', { timeZone: AI_DAY_ZONE, ...options }).formatToParts(new Date(iso))) out[p.type] = p.value;
  return out;
}

/** The day a generation at this instant counts for, `YYYY-MM-DD` in the Canary Islands (tests/fixtures/ai-day.json). */
export function aiDay(iso: string): string {
  const p = parts(iso, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}

/** The date the prompt reads "today" from, as PHP's `l j F Y` prints it: "Friday 2 October 2026". */
export function aiDateLine(iso: string): string {
  const p = parts(iso, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
}
