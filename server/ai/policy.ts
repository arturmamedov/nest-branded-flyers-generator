import { AI_TRIES_PER_LIMIT, type AiFeature } from '../../src/shared/ai.js';
import type { AiSettings } from '../config.js';
import type { Actor } from './actor.js';

/* Which features run, who may use them, and how much a day. Today: a feature runs when a provider is configured and
   keyed (or the fake is named) and the site's settings name that feature, everyone may use it, and each feature has
   its own daily limit, the site's own (AI_DAILY_LIMITS for that feature, else AI_DAILY_LIMIT, else the default). A
   feature whose failed generations must be bounded too has a number of tries, so many for each generation of its
   limit (AI_TRIES_PER_LIMIT): today the picture read alone.
   "The AI is on" is not a second fact here: it is on when some feature runs, so the two cannot disagree. The login
   brief adds a role here (a guest gets `mayUse` false, and so ai_forbidden and no AI in the editor) without touching
   the service or the routes. */

export interface AiPolicy {
  /** Whether this feature runs on this site. Off is ai_off, for everyone: the site's own switch, not the actor's. */
  runs(feature: AiFeature): boolean;
  mayUse(actor: Actor): boolean;
  /** How many generations of this feature the actor may make a day: every feature has its own limit. */
  dailyLimit(actor: Actor, feature: AiFeature): number;
  /** How many times a day the actor may try this feature, failed generations included: every one that reaches the
      provider is a try. null where a failed generation has no bound. */
  dailyTries(actor: Actor, feature: AiFeature): number | null;
}

export function createAiPolicy(settings: Pick<AiSettings, 'provider' | 'enabled' | 'features' | 'dailyLimits'>): AiPolicy {
  return {
    runs: (feature) => settings.enabled && settings.provider !== null && settings.features.includes(feature),
    mayUse: () => true,
    dailyLimit: (_actor, feature) => settings.dailyLimits[feature],
    dailyTries: (_actor, feature) => {
      const perLimit = AI_TRIES_PER_LIMIT[feature];
      return perLimit === undefined ? null : perLimit * settings.dailyLimits[feature];
    },
  };
}
