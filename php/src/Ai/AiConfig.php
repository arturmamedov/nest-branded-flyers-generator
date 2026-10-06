<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use InvalidArgumentException;

/**
 * config.php's `ai` block, checked and resolved: the PHP side of loadAiSettings in server/config.ts. Off unless a
 * provider is named and, for a real one, keyed; `enabled` switches it off even then; `features` names what runs, and
 * nothing does until it names it; `dailyLimit` is the site's own number a day for each feature, and `dailyLimits` a
 * feature's own. A missing block means off, never a 503; anything unexpected in a block that is there makes config.php invalid, as
 * AccessRule does, so a typo never silently runs a provider (or silently doesn't). The provider names, default models,
 * time limit, the app's features and the daily limit's default and bound come from Shared::ai(), written once in
 * src/shared/ai.ts.
 */
final class AiConfig
{
    private const KEYS = ['provider', 'apiKey', 'features', 'dailyLimit', 'dailyLimits', 'model', 'models', 'effort', 'timeoutMs', 'enabled'];

    private function __construct(
        /** 'openai' | 'anthropic' | 'fake', or null: no provider, so off */
        public readonly ?string $provider,
        /** Server-side only: never in api/config, a log line, the ledger, an exception or a release. */
        #[\SensitiveParameter] public readonly ?string $apiKey,
        /** The site's model: the block's, else the provider's default; null without a provider. */
        public readonly ?string $model,
        /**
         * The model each feature's calls name, for every feature the app has, in its order (the owner's answer,
         * 2026-10-06: a model per feature, so the picture read can run on a stronger one): the model `models` gives
         * the feature, else `model`. null without a provider.
         *
         * @var array<string, ?string>
         */
        public readonly array $models,
        /**
         * The provider's effort knob (`reasoning.effort` / `output_config.effort`), sent only when set. One per site:
         * a site whose features run on two model families leaves it unset if either refuses it.
         */
        public readonly ?string $effort,
        public readonly int $timeoutMs,
        /** On with a provider and, for a real one, a key, unless the block says `enabled => false`. */
        public readonly bool $enabled,
        /**
         * The features this site runs, in the app's own order. None until the block names them (the owner's answer,
         * 2026-10-05): a provider and its key alone run nothing.
         *
         * @var list<string>
         */
        public readonly array $features,
        /**
         * The generations a day this site allows each actor of each feature, for every feature the app has, in its
         * order (the owner's answer, 2026-10-06: every feature its own limit): the number `dailyLimits` gives the
         * feature, else the block's `dailyLimit`, else the shared default. Never more than the shared bound.
         *
         * @var array<string, int>
         */
        public readonly array $dailyLimits,
    ) {
    }

    /**
     * @param mixed $raw the `ai` value config.php returned; null when it has none
     * @param array{timeoutMs:int, providers:list<string>, defaultModel:array<string, string>, fake:array{model:string}, features:list<string>, dailyLimit:int, dailyLimitMax:int} $facts Shared::ai()
     * @throws InvalidArgumentException naming the offending key, never quoting a value (the key is one)
     */
    public static function fromArray(mixed $raw, array $facts): self
    {
        if ($raw === null) {
            return new self(null, null, null, array_fill_keys($facts['features'], null), null, $facts['timeoutMs'], false, [], array_fill_keys($facts['features'], $facts['dailyLimit']));
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
        // 'apiKey' => "sk-…\n" ends in a real line break: curl then sends a broken header, with nothing naming the cause.
        if ($apiKey !== null && preg_match('/[\s\x00-\x1f\x7f]/', $apiKey) === 1) {
            throw new InvalidArgumentException('ai.apiKey must not hold spaces or line breaks');
        }
        $model = self::text($raw, 'model');
        $timeoutMs = $raw['timeoutMs'] ?? $facts['timeoutMs'];
        if (!is_int($timeoutMs) || $timeoutMs <= 0) {
            throw new InvalidArgumentException('ai.timeoutMs must be null or a positive whole number of milliseconds');
        }
        $switch = $raw['enabled'] ?? true;
        if (!is_bool($switch)) {
            throw new InvalidArgumentException('ai.enabled must be true or false');
        }
        // The twin of AI_DAILY_LIMIT in .env: the shared default unless set, a whole number from 1 to the shared bound.
        // It is the number of every feature that `dailyLimits` gives none of its own.
        $dailyLimit = $raw['dailyLimit'] ?? $facts['dailyLimit'];
        if (!is_int($dailyLimit) || $dailyLimit < 1 || $dailyLimit > $facts['dailyLimitMax']) {
            throw new InvalidArgumentException('ai.dailyLimit must be null or a whole number from 1 to ' . $facts['dailyLimitMax']);
        }
        $keyed = $provider === 'fake' || $apiKey !== null;
        $model = $provider === null ? null : $model ?? ($provider === 'fake' ? $facts['fake']['model'] : $facts['defaultModel'][$provider]);
        return new self(
            $provider,
            $apiKey,
            $model,
            self::models($raw, $facts['features'], $model),
            self::text($raw, 'effort'),
            $timeoutMs,
            $provider !== null && $keyed && $switch,
            self::features($raw, $facts['features']),
            self::dailyLimits($raw, $facts['features'], $dailyLimit, $facts['dailyLimitMax']),
        );
    }

    /**
     * The `dailyLimits` key: a feature's own number a day, keyed by the feature's name. The twin of AI_DAILY_LIMITS
     * in .env, which spells the same pairs as `share:10,flyer:5`. A feature it does not name takes $others, the
     * site's `dailyLimit`.
     *
     * @param array<string, mixed> $raw
     * @param list<string> $all every feature the app has
     * @return array<string, int> a number for every feature, in the app's own order
     */
    private static function dailyLimits(array $raw, array $all, int $others, int $max): array
    {
        $own = $raw['dailyLimits'] ?? [];
        $valid = is_array($own) && ($own === [] || !array_is_list($own));
        foreach ($valid ? $own : [] as $name => $limit) {
            $valid = $valid && in_array($name, $all, true) && is_int($limit) && $limit >= 1 && $limit <= $max;
        }
        if (!$valid) {
            throw new InvalidArgumentException('ai.dailyLimits must be null or an array of feature => number: a feature from ' . implode(', ', $all) . ', and a whole number from 1 to ' . $max);
        }
        $limits = [];
        foreach ($all as $feature) {
            $limits[$feature] = $own[$feature] ?? $others;
        }
        return $limits;
    }

    /**
     * The `models` key: a feature's own model, keyed by the feature's name. The twin of AI_MODELS in .env, which
     * spells the same pairs as `share:model-b,flyer:model-c`. A feature it does not name takes $others, the site's
     * model.
     *
     * @param array<string, mixed> $raw
     * @param list<string> $all every feature the app has
     * @return array<string, ?string> a model for every feature, in the app's own order
     */
    private static function models(array $raw, array $all, ?string $others): array
    {
        $own = $raw['models'] ?? [];
        $valid = is_array($own) && ($own === [] || !array_is_list($own));
        foreach ($valid ? $own : [] as $name => $model) {
            $valid = $valid && in_array($name, $all, true) && is_string($model) && $model !== '' && preg_match('/[\s\x00-\x1f\x7f]/', $model) !== 1;
        }
        if (!$valid) {
            throw new InvalidArgumentException('ai.models must be null or an array of feature => model: a feature from ' . implode(', ', $all) . ", and a model's name with no spaces");
        }
        $models = [];
        foreach ($all as $feature) {
            // Without a provider there is no model to ask for, whatever the key names: the pairs are still checked.
            $models[$feature] = $others === null ? null : $own[$feature] ?? $others;
        }
        return $models;
    }

    /**
     * The `features` key: the names of the features this site runs, picked from the app's own list and answered in
     * its order. The twin of namedFeatures in server/config.ts, which reads them from a comma-separated AI_FEATURES.
     *
     * @param array<string, mixed> $raw
     * @param list<string> $all every feature the app has
     * @return list<string>
     */
    private static function features(array $raw, array $all): array
    {
        $named = $raw['features'] ?? [];
        $valid = is_array($named) && array_is_list($named);
        foreach ($valid ? $named : [] as $name) {
            $valid = $valid && is_string($name) && in_array($name, $all, true);
        }
        if (!$valid) {
            throw new InvalidArgumentException('ai.features must be null or a list of: ' . implode(', ', $all));
        }
        return array_values(array_filter($all, static fn (string $feature): bool => in_array($feature, $named, true)));
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
