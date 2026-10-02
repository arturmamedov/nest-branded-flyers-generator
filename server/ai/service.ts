import type { z } from 'zod';
import { AI_INPUT_MAX, AI_MAX_OUTPUT_TOKENS, aiDay, type AiFeature } from '../../src/shared/ai.js';
import {
  AiFlyerAnswerSchema,
  AiFlyerRequestSchema,
  AiShareAnswerSchema,
  AiShareRequestSchema,
  type AiBundle,
  type AiConfig,
  type AiFlyerResult,
  type AiShareResult,
} from '../../src/shared/schema.js';
import { HttpError } from '../errors.js';
import type { AiUsageRepository, Clock, HostelRepository } from '../storage/types.js';
import type { Actor } from './actor.js';
import type { AiPolicy } from './policy.js';
import { buildFlyerCall, buildShareCall, type Prompt } from './prompt.js';
import { LlmFailure, SCHEMA_NAMES, type LlmProvider, type LlmResult } from './provider.js';

/* A generation, end to end (docs/api-contract.md, "The AI assistant"): the checks in their order, the prompt, the
   provider, the answer held to its schema, the ledger record, what is left. It owns no HTTP (the routes pass the
   actor and the body and send what comes back) and no storage detail (the ledger is a repository). The provider is
   never called while a store lock is held: the count comes first, the record after. */

export interface AiServiceDeps {
  /** null when AI is off: every feature then answers ai_off. */
  provider: LlmProvider | null;
  policy: AiPolicy;
  bundle: AiBundle;
  hostels: Pick<HostelRepository, 'list' | 'bySlug'>;
  usage: Pick<AiUsageRepository, 'record' | 'countOk'>;
  clock: Clock;
  timeoutMs: number;
}

const fields = (err: z.ZodError): Record<string, string> => Object.fromEntries(err.issues.map((i) => [i.path.join('.') || '_', i.message]));

/** The body as the route schema says, or ai_input with each bad field named. */
function parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError('ai_input', { max: AI_INPUT_MAX }, fields(r.error));
  return r.data;
}

export class AiService {
  constructor(private readonly deps: AiServiceDeps) {}

  /** The `ai` block of api/config for this actor: nothing beyond `enabled: false` when they get no AI. */
  async status(actor: Actor): Promise<AiConfig> {
    if (!this.deps.provider || !this.deps.policy.enabled() || !this.deps.policy.mayUse(actor)) return { enabled: false };
    const limit = this.deps.policy.dailyLimit(actor);
    const used = await this.deps.usage.countOk(actor.id, aiDay(this.deps.clock.now()));
    return { enabled: true, limit, remaining: Math.max(0, limit - used) };
  }

  /** An idea → a brief with its assumptions. A hostel the staff member chose wins over the model's; one the model
      made up becomes chain-wide, said in the first assumption. */
  async flyer(actor: Actor, body: unknown): Promise<AiFlyerResult> {
    this.admit(actor);
    const request = parse(AiFlyerRequestSchema, body);
    const hostels = await this.deps.hostels.list();
    const known = (slug: string) => hostels.some((h) => h.slug === slug);
    if (request.hostel !== undefined && !known(request.hostel)) throw new HttpError('unknown_hostel');
    const { now, remaining } = await this.quota(actor);

    const prompt = buildFlyerCall(this.deps.bundle, hostels, now, request);
    const answer = await this.generate('flyer', actor, now, request.text, prompt, SCHEMA_NAMES.flyer, this.deps.bundle.schemas.flyerAnswer, AiFlyerAnswerSchema);
    const brief = { ...answer.brief };
    const assumptions = [...answer.assumptions];
    if (request.hostel !== undefined) brief.hostel = request.hostel;
    else if (brief.hostel !== null && !known(brief.hostel)) {
      assumptions.unshift({ field: 'hostel', note: `Unknown hostel "${brief.hostel}": left for every hostel` });
      brief.hostel = null;
    }
    return { brief, assumptions, remaining: remaining - 1 };
  }

  /** A flyer's fields → its share text. */
  async share(actor: Actor, body: unknown): Promise<AiShareResult> {
    this.admit(actor);
    const request = parse(AiShareRequestSchema, body);
    const hostels = await this.deps.hostels.list();
    if (request.hostel !== null && !hostels.some((h) => h.slug === request.hostel)) throw new HttpError('unknown_hostel');
    const { now, remaining } = await this.quota(actor);

    const prompt = buildShareCall(this.deps.bundle, hostels, now, request);
    const input = prompt.messages.at(-1)?.content ?? '';
    const answer = await this.generate('share', actor, now, input, prompt, SCHEMA_NAMES.share, this.deps.bundle.schemas.shareAnswer, AiShareAnswerSchema);
    return { share: answer.share, remaining: remaining - 1 };
  }

  /** Off before anything else, then the policy: the order the contract names. */
  private admit(actor: Actor): void {
    if (!this.deps.provider || !this.deps.policy.enabled()) throw new HttpError('ai_off');
    if (!this.deps.policy.mayUse(actor)) throw new HttpError('ai_forbidden');
  }

  /** The cap, counted on the day of this instant; the same instant stamps the ledger. */
  private async quota(actor: Actor): Promise<{ now: string; remaining: number }> {
    const now = this.deps.clock.now();
    const limit = this.deps.policy.dailyLimit(actor);
    const used = await this.deps.usage.countOk(actor.id, aiDay(now));
    if (used >= limit) throw new HttpError('ai_quota', { limit });
    return { now, remaining: limit - used };
  }

  /**
   * The provider call and its ledger record. A failure, or an answer that fails its schema, is recorded `ok: false`
   * with what the model wrote, and answered ai_failed: nothing is charged. A good answer is recorded `ok: true`,
   * which is what counts, and returned parsed.
   */
  private async generate<S extends z.ZodType>(
    feature: AiFeature,
    actor: Actor,
    now: string,
    input: string,
    prompt: Prompt,
    schemaName: string,
    schema: unknown,
    answerSchema: S,
  ): Promise<z.infer<S>> {
    const provider = this.deps.provider!;
    const record = (ok: boolean, result: { usage?: LlmResult['usage']; model?: string; output: string | null }) =>
      this.deps.usage.record({
        at: now,
        day: aiDay(now),
        actorId: actor.id,
        feature,
        provider: provider.name,
        model: result.model ?? provider.model,
        tokens: result.usage ?? null,
        ok,
        input,
        output: result.output,
      });

    let result: LlmResult;
    try {
      result = await provider.complete({ ...prompt, schema, schemaName, maxOutputTokens: AI_MAX_OUTPUT_TOKENS, timeoutMs: this.deps.timeoutMs });
    } catch (e) {
      if (!(e instanceof LlmFailure)) throw e;
      console.error(`AI ${feature} (${provider.name} ${provider.model}): ${e.reason}: ${e.message}`);
      await record(false, { output: e.raw });
      throw new HttpError('ai_failed');
    }
    const parsed = answerSchema.safeParse(result.json);
    if (!parsed.success) {
      console.error(`AI ${feature} (${provider.name} ${result.model}): the answer failed its schema: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      await record(false, { ...result, output: result.raw });
      throw new HttpError('ai_failed');
    }
    await record(true, { ...result, output: result.raw });
    return parsed.data;
  }
}
