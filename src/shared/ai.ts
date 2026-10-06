import type { AiConfig } from './schema.js';

/* The AI assistant's shared facts (docs/prompts/ai-assistant.md): the daily cap, the longest idea text, the day the cap
   counts in, and the provider defaults. No zod here (the import above is a type's, and is gone once compiled): the
   editor imports the cap and the input limit, and `npm run gen` copies the constants into schema/shared.json for the
   PHP backend, so a number is written once. */

/** Generations a day, both features together (the owner's cap, 2026-10-01): a flyer from an idea already includes its
    share text, so one generation is a whole flyer. Counted per actor; today every request is the one anonymous actor.
    This is the default: a site may set its own (the owner's answer, 2026-10-05) through the setting that has this
    constant's name on Node (AI_DAILY_LIMIT in .env) and is `dailyLimit` in config.php's `ai` block. */
export const AI_DAILY_LIMIT = 3;

/** The most a site's own setting may allow a day: the app is public until its login exists, so the cap is what keeps
    a stranger's cost known. Above it the setting is refused. */
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

/** api/config's `ai` block when the AI is on for the caller: their limit, what is left today, the features that run. */
export type AiOn = Extract<AiConfig, { enabled: true }>;

/** The AI as far as one feature goes, from api/config's answer: the caller's limit and what is left when the site
    runs that feature for them, else null. The editor shows a feature only through this.
    The editor never parses an answer (zod stays out of its bundle), so a backend older than this client is met
    here, as it is while a release is being uploaded: one from before the switches lists no features, one from
    before the AI has no `ai` block at all. Either way nothing of the AI shows, and the page still loads. */
export function aiFor(ai: AiConfig, feature: AiFeature): AiOn | null {
  const answer = ai as Partial<AiOn> | null | undefined;
  return answer?.enabled === true && Array.isArray(answer.features) && answer.features.includes(feature) ? (answer as AiOn) : null;
}

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

/** The names the two features' answer formats go by: on the wire (OpenAI's `text.format.name`) and in the fake. */
export const AI_SCHEMA_NAMES = { flyer: 'nest_flyer_brief', share: 'nest_share_text' } as const;

/** The fake provider both backends ship for the tests and a demo (docs/api-contract.md, "The AI assistant"): its model
    name, the slug it makes up, and the markers in the last user turn that steer it. */
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
} as const;

/** The block `npm run gen` writes to schema/shared.json, in this order; PHP reads it through Shared::ai(). */
export const AI_SHARED = {
  dailyLimit: AI_DAILY_LIMIT,
  dailyLimitMax: AI_DAILY_LIMIT_MAX,
  inputMax: AI_INPUT_MAX,
  assumptionsMax: AI_ASSUMPTIONS_MAX,
  features: AI_FEATURES,
  dayZone: AI_DAY_ZONE,
  timeoutMs: AI_TIMEOUT_MS,
  maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
  providers: AI_PROVIDERS,
  defaultModel: AI_DEFAULT_MODEL,
  schemaNames: AI_SCHEMA_NAMES,
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
