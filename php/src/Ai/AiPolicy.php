<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/**
 * Which features run, who may use them, and how much a day. Today (ConfigAiPolicy): a feature runs when config.php
 * names a provider and keys it (or names the fake) and names that feature, everyone may use it, and the cap is the
 * site's own (config.php's dailyLimit, the shared default unless set). "The AI is on" is not a second fact here: it
 * is on when some feature runs, so the two cannot disagree. The login brief adds a role here (a guest gets mayUse
 * false, and so ai_forbidden and no AI in the editor) without touching the service or the routes. The twin of
 * server/ai/policy.ts.
 */
interface AiPolicy
{
    /** Whether this feature runs on this site. Off is ai_off, for everyone: the site's own switch, not the actor's. */
    public function runs(string $feature): bool;

    public function mayUse(Actor $actor): bool;

    public function dailyLimit(Actor $actor): int;
}
