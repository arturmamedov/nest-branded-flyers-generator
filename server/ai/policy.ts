import { AI_DAILY_LIMIT } from '../../src/shared/ai.js';
import type { AiSettings } from '../config.js';
import type { Actor } from './actor.js';

/* Whether the AI runs, who may use it, and how much a day. Today: on when a provider is configured and keyed (or the
   fake is named), everyone may use it, and the cap is AI_DAILY_LIMIT. The login brief adds a role here (a guest gets
   `mayUse` false, and so ai_forbidden and no AI in the editor) without touching the service or the routes. */

export interface AiPolicy {
  enabled(): boolean;
  mayUse(actor: Actor): boolean;
  dailyLimit(actor: Actor): number;
}

export function createAiPolicy(settings: Pick<AiSettings, 'provider' | 'enabled'>): AiPolicy {
  return {
    enabled: () => settings.enabled && settings.provider !== null,
    mayUse: () => true,
    dailyLimit: () => AI_DAILY_LIMIT,
  };
}
