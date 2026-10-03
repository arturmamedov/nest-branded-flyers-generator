<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use RuntimeException;

/**
 * Why a call gave no usable answer. Never carries the key: the adapters redact whatever a provider echoed
 * (ProviderAnswer::redact). The service records it and answers ai_failed.
 */
final class LlmFailure extends RuntimeException
{
    public const TIMEOUT = 'timeout';
    public const NETWORK = 'network';
    public const PROVIDER = 'provider';
    public const REFUSED = 'refused';
    public const CUT = 'cut';
    public const BAD_OUTPUT = 'bad_output';

    /**
     * @param string $reason one of the constants above
     * @param string|null $raw what the model did write, when it wrote anything, for the ledger
     */
    public function __construct(
        public readonly string $reason,
        string $message,
        public readonly ?string $raw = null,
    ) {
        parent::__construct($message);
    }
}
