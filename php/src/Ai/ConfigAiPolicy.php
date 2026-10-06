<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/**
 * The policy while there is no login: config.php's `ai` block decides which features run and how much a day each,
 * and everyone may.
 */
final class ConfigAiPolicy implements AiPolicy
{
    public function __construct(private readonly AiConfig $config)
    {
    }

    public function runs(string $feature): bool
    {
        return $this->config->enabled && in_array($feature, $this->config->features, true);
    }

    public function mayUse(Actor $actor): bool
    {
        return true;
    }

    public function dailyLimit(Actor $actor, string $feature): int
    {
        return $this->config->dailyLimits[$feature];
    }
}
