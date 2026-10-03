<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/**
 * Whether the AI runs, who may use it, and how much a day. Today (ConfigAiPolicy): on when config.php names a provider
 * and keys it (or names the fake), everyone may use it, and the cap is Shared::ai()['dailyLimit']. The login brief adds
 * a role here (a guest gets mayUse false, and so ai_forbidden and no AI in the editor) without touching the service or
 * the routes. The twin of server/ai/policy.ts.
 */
interface AiPolicy
{
    public function enabled(): bool;

    public function mayUse(Actor $actor): bool;

    public function dailyLimit(Actor $actor): int;
}
