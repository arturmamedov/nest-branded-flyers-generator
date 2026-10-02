/* The AI assistant's shared facts (docs/prompts/ai-assistant.md): the daily cap, the longest idea text, the day the cap
   counts in, and the provider defaults. No zod here: the editor imports the cap and the input limit, and `npm run gen`
   copies the constants into schema/shared.json for the PHP backend, so a number is written once. */

/** Generations a day, both features together (the owner's cap, 2026-10-01): a flyer from an idea already includes its
    share text, so one generation is a whole flyer. Counted per actor; today every request is the one anonymous actor. */
export const AI_DAILY_LIMIT = 3;

/** The longest idea text, in code points: a long group-chat post, not a document. */
export const AI_INPUT_MAX = 4000;

export const AI_FEATURES = ['flyer', 'share'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

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

/** The block `npm run gen` writes to schema/shared.json, in this order; PHP reads it through Shared::ai(). */
export const AI_SHARED = {
  dailyLimit: AI_DAILY_LIMIT,
  inputMax: AI_INPUT_MAX,
  features: AI_FEATURES,
  dayZone: AI_DAY_ZONE,
  timeoutMs: AI_TIMEOUT_MS,
  maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
  providers: AI_PROVIDERS,
  defaultModel: AI_DEFAULT_MODEL,
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
