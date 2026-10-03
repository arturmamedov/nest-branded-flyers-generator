<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use InvalidArgumentException;

/**
 * config.php's `ai` block, checked and resolved: the PHP side of loadAiSettings in server/config.ts. Off unless a
 * provider is named and, for a real one, keyed; `enabled` switches it off even then. A missing block means off, never
 * a 503; anything unexpected in a block that is there makes config.php invalid, as AccessRule does, so a typo never
 * silently runs a provider (or silently doesn't). The provider names, default models and time limit come from
 * Shared::ai(), written once in src/shared/ai.ts.
 */
final class AiConfig
{
    private const KEYS = ['provider', 'apiKey', 'model', 'effort', 'timeoutMs', 'enabled'];

    private function __construct(
        /** 'openai' | 'anthropic' | 'fake', or null: no provider, so off */
        public readonly ?string $provider,
        /** Server-side only: never in api/config, a log line, the ledger, an exception or a release. */
        #[\SensitiveParameter] public readonly ?string $apiKey,
        /** The model asked for: the block's, else the provider's default; null without a provider. */
        public readonly ?string $model,
        /** The provider's effort knob (`reasoning.effort` / `output_config.effort`), sent only when set. */
        public readonly ?string $effort,
        public readonly int $timeoutMs,
        /** On with a provider and, for a real one, a key, unless the block says `enabled => false`. */
        public readonly bool $enabled,
    ) {
    }

    /**
     * @param mixed $raw the `ai` value config.php returned; null when it has none
     * @param array{timeoutMs:int, providers:list<string>, defaultModel:array<string, string>, fake:array{model:string}} $facts Shared::ai()
     * @throws InvalidArgumentException naming the offending key, never quoting a value (the key is one)
     */
    public static function fromArray(mixed $raw, array $facts): self
    {
        if ($raw === null) {
            return new self(null, null, null, null, $facts['timeoutMs'], false);
        }
        if (!is_array($raw) || ($raw !== [] && array_is_list($raw))) {
            throw new InvalidArgumentException('ai must be an array with ' . implode(', ', self::KEYS) . ' (see config.sample.php)');
        }
        $unknown = array_diff(array_keys($raw), self::KEYS);
        if ($unknown !== []) {
            throw new InvalidArgumentException('ai has unknown keys: ' . implode(', ', $unknown));
        }
        $provider = self::text($raw, 'provider');
        if ($provider !== null && !in_array($provider, $facts['providers'], true)) {
            throw new InvalidArgumentException('ai.provider must be null or one of: ' . implode(', ', $facts['providers']));
        }
        $apiKey = self::text($raw, 'apiKey');
        $model = self::text($raw, 'model');
        $timeoutMs = $raw['timeoutMs'] ?? $facts['timeoutMs'];
        if (!is_int($timeoutMs) || $timeoutMs <= 0) {
            throw new InvalidArgumentException('ai.timeoutMs must be null or a positive whole number of milliseconds');
        }
        $switch = $raw['enabled'] ?? true;
        if (!is_bool($switch)) {
            throw new InvalidArgumentException('ai.enabled must be true or false');
        }
        $keyed = $provider === 'fake' || $apiKey !== null;
        return new self(
            $provider,
            $apiKey,
            $provider === null ? null : $model ?? ($provider === 'fake' ? $facts['fake']['model'] : $facts['defaultModel'][$provider]),
            self::text($raw, 'effort'),
            $timeoutMs,
            $provider !== null && $keyed && $switch,
        );
    }

    /**
     * A string setting; null and '' both mean unset, as `env.X || null` reads them in Node.
     * @param array<string, mixed> $raw
     */
    private static function text(array $raw, string $key): ?string
    {
        $value = $raw[$key] ?? null;
        if ($value !== null && !is_string($value)) {
            throw new InvalidArgumentException("ai.$key must be null or a string");
        }
        return $value === '' ? null : $value;
    }
}
