import { AI_DAILY_LIMIT, type AiFeature } from '../../src/shared/ai.js';
import type { AiSettings } from '../config.js';
import type { Actor } from './actor.js';

/* Which features run, who may use them, and how much a day. Today: a feature runs when a provider is configured and
   keyed (or the fake is named) and the site's settings name that feature, everyone may use it, and the cap is
   AI_DAILY_LIMIT. "The AI is on" is not a second fact here: it is on when some feature runs, so the two cannot
   disagree. The login brief adds a role here (a guest gets `mayUse` false, and so ai_forbidden and no AI in the
   editor) without touching the service or the routes. */

export interface AiPolicy {
  /** Whether this feature runs on this site. Off is ai_off, for everyone: the site's own switch, not the actor's. */
  runs(feature: AiFeature): boolean;
  mayUse(actor: Actor): boolean;
  dailyLimit(actor: Actor): number;
}

export function createAiPolicy(settings: Pick<AiSettings, 'provider' | 'enabled' | 'features'>): AiPolicy {
  return {
    runs: (feature) => settings.enabled && settings.provider !== null && settings.features.includes(feature),
    mayUse: () => true,
    dailyLimit: () => AI_DAILY_LIMIT,
  };
}
