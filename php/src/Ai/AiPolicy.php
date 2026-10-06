<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/**
 * Which features run, who may use them, and how much a day. Today (ConfigAiPolicy): a feature runs when config.php
 * names a provider and keys it (or names the fake) and names that feature, everyone may use it, and each feature has
 * its own daily limit, the site's own (config.php's dailyLimits for that feature, else its dailyLimit, else the shared
 * default). A feature whose failed generations must be bounded too has a number of tries, so many for each generation
 * of its limit (triesPerLimit in schema/shared.json): today the picture read alone.
 * "The AI is on" is not a second fact here: it is on when some feature runs, so the two cannot disagree.
 * The login brief adds a role here (a guest gets mayUse false, and so ai_forbidden and no AI in the editor) without
 * touching the service or the routes. The twin of server/ai/policy.ts.
 */
interface AiPolicy
{
    /** Whether this feature runs on this site. Off is ai_off, for everyone: the site's own switch, not the actor's. */
    public function runs(string $feature): bool;

    public function mayUse(Actor $actor): bool;

    /** How many generations of this feature the actor may make a day: every feature has its own limit. */
    public function dailyLimit(Actor $actor, string $feature): int;

    /**
     * How many times a day the actor may try this feature, failed generations included: every one that reaches the
     * provider is a try. null where a failed generation has no bound.
     */
    public function dailyTries(Actor $actor, string $feature): ?int;
}
