import type { Request } from 'express';

/* Who is asking. The app has no login, so every request is the one anonymous actor and the AI's daily cap is
   site-wide. This is the seam the login brief fills: it replaces `anonymousActors` with a resolver that reads the
   session, and gives AiPolicy (policy.ts) a role to look at. Nothing else changes: the service counts per actor id
   and asks the policy, and the routes only pass the actor through. */

export interface Actor {
  /** What the ledger and the quota are keyed by. */
  id: string;
}

export interface ActorResolver {
  resolve(req: Request): Actor;
}

export const ANONYMOUS: Actor = { id: 'anonymous' };

export const anonymousActors: ActorResolver = { resolve: () => ANONYMOUS };
