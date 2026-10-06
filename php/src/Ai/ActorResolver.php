<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use NestFlyers\Http\Request;

/**
 * Who is asking. The app has no login, so every request is the one anonymous actor (AnonymousActors) and each feature's
 * daily limit is site-wide. This is the seam the login brief fills: it replaces AnonymousActors with a resolver that reads the
 * session, and gives the AiPolicy a role to look at. Nothing else changes: the service counts per actor id and asks
 * the policy, and the routes only pass the actor through. The twin of server/ai/actor.ts.
 */
interface ActorResolver
{
    public function resolve(Request $request): Actor;
}
