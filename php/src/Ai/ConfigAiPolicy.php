<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/**
 * The policy while there is no login: config.php's `ai` block decides which features run and how much a day each,
 * and everyone may. A feature's tries follow its limit: they are no setting.
 */
final class ConfigAiPolicy implements AiPolicy
{
    /** @param array<string, int> $triesPerLimit the features whose tries are bounded, and by how many for each generation of their limit (Shared::ai()) */
    public function __construct(private readonly AiConfig $config, private readonly array $triesPerLimit)
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

    public function dailyTries(Actor $actor, string $feature): ?int
    {
        $perLimit = $this->triesPerLimit[$feature] ?? null;
        return $perLimit === null ? null : $perLimit * $this->config->dailyLimits[$feature];
    }
}
