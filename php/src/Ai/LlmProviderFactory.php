<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use LogicException;
use NestFlyers\Shared;

/**
 * config.php's `ai` block → the provider that runs: the twin of createProvider in server/ai/composition.ts. A new
 * provider is a new arm here and a new class, nothing else.
 */
final class LlmProviderFactory
{
    private function __construct()
    {
    }

    /** null when the block says off: no provider, no key for a real one, or switched off. */
    public static function create(AiConfig $config, AiBundle $bundle, Shared $shared, HttpClient $http): ?LlmProvider
    {
        if (!$config->enabled || $config->provider === null || $config->model === null) {
            return null;
        }
        if ($config->provider === 'fake') {
            return new FakeProvider($bundle->examples, $shared->ai());
        }
        if ($config->apiKey === null) {
            return null;
        }
        $settings = new ProviderConfig($config->apiKey, $config->effort);
        return match ($config->provider) {
            'openai' => new OpenAiProvider($settings, $http),
            'anthropic' => new AnthropicProvider($settings, $http),
            default => throw new LogicException("No adapter for the AI provider \"$config->provider\""),
        };
    }
}
