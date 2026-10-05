<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/** The policy while there is no login: config.php's `ai` block decides, everyone may, one cap for all. */
final class ConfigAiPolicy implements AiPolicy
{
    public function __construct(
        private readonly AiConfig $config,
        private readonly int $dailyLimit,
    ) {
    }

    public function runs(string $feature): bool
    {
        return $this->config->enabled && in_array($feature, $this->config->features, true);
    }

    public function mayUse(Actor $actor): bool
    {
        return true;
    }

    public function dailyLimit(Actor $actor): int
    {
        return $this->dailyLimit;
    }
}
