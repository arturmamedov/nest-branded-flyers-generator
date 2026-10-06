<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/** What a real adapter is built from (config.php's `ai` block, through AiConfig). The model is the call's to name. */
final class ProviderConfig
{
    /**
     * @param string $apiKey server-side only: never in api/config, a log line, the ledger, an exception or a release
     * @param string|null $effort the provider's effort knob, sent only when set
     */
    public function __construct(
        #[\SensitiveParameter] public readonly string $apiKey,
        public readonly ?string $effort,
    ) {
    }
}
