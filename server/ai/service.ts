import type { z } from 'zod';
import { AI_ASSUMPTIONS_MAX, AI_FEATURES, AI_INPUT_MAX, AI_MAX_OUTPUT_TOKENS, aiDay, type AiFeature } from '../../src/shared/ai.js';
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
  /** Why the ledger could not be read, last time it could not: the log says a reason once, not on every request. */
  private ledgerDown: string | null = null;

  constructor(private readonly deps: AiServiceDeps) {}

  /** The `ai` block of api/config for this actor: nothing beyond `enabled: false` when they get no AI, else their
      limit, what is left of it today and the features that run, so the editor shows only those. A ledger that
      cannot be read hides the AI too: the editor renders nothing without api/config, so the AI's own storage must
      never decide whether the app loads. The generation routes are not softened: a hidden AI never reaches them. */
  async status(actor: Actor): Promise<AiConfig> {
    const features = this.running();
    if (!this.deps.provider || features.length === 0 || !this.deps.policy.mayUse(actor)) return { enabled: false };
    const limit = this.deps.policy.dailyLimit(actor);
    let used: number;
    try {
      used = await this.deps.usage.countOk(actor.id, aiDay(this.deps.clock.now()));
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      if (reason !== this.ledgerDown) console.error(`AI: the ledger cannot be read, so the AI is hidden: ${reason}`);
      this.ledgerDown = reason;
      return { enabled: false };
    }
    this.ledgerDown = null;
    return { enabled: true, limit, remaining: Math.max(0, limit - used), features };
  }

  /** An idea → a brief with its assumptions. A hostel the staff member chose wins over the model's; one the model
      made up becomes chain-wide, said in the first assumption, which takes the model's last one's place on a full list. */
  async flyer(actor: Actor, body: unknown): Promise<AiFlyerResult> {
    this.admit(actor, 'flyer');
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
      // The answer keeps to its schema with the service's note in it: past the limit, the model's last one goes.
      assumptions.splice(AI_ASSUMPTIONS_MAX);
      brief.hostel = null;
    }
    return { brief, assumptions, remaining: remaining - 1 };
  }

  /** A flyer's fields → its share text. */
  async share(actor: Actor, body: unknown): Promise<AiShareResult> {
    this.admit(actor, 'share');
    const request = parse(AiShareRequestSchema, body);
    const hostels = await this.deps.hostels.list();
    if (request.hostel !== null && !hostels.some((h) => h.slug === request.hostel)) throw new HttpError('unknown_hostel');
    const { now, remaining } = await this.quota(actor);

    const prompt = buildShareCall(this.deps.bundle, hostels, now, request);
    const input = prompt.messages.at(-1)?.content ?? '';
    const answer = await this.generate('share', actor, now, input, prompt, SCHEMA_NAMES.share, this.deps.bundle.schemas.shareAnswer, AiShareAnswerSchema);
    return { share: answer.share, remaining: remaining - 1 };
  }

  /** The features that run on this site, in the app's own order: none means the AI is off. */
  private running(): AiFeature[] {
    return AI_FEATURES.filter((feature) => this.deps.policy.runs(feature));
  }

  /** Off before anything else, then the policy: the order the contract names. A feature the site does not run is
      off as the whole AI is, so nothing of the request is read, counted or recorded. */
  private admit(actor: Actor, feature: AiFeature): void {
    if (!this.deps.provider || !this.deps.policy.runs(feature)) throw new HttpError('ai_off');
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
