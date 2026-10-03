<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use NestFlyers\Http\Request;

/** Today's resolver: every request is the one anonymous actor (ActorResolver says what replaces it). */
final class AnonymousActors implements ActorResolver
{
    public const ID = 'anonymous';

    public function resolve(Request $request): Actor
    {
        return new Actor(self::ID);
    }
}
