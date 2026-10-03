<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/** A provider's answer, before the service holds it to its schema. */
final class LlmResult
{
    /**
     * @param mixed $json the answer, parsed (a Json::decode tree)
     * @param string $raw the answer as the model wrote it, for the ledger
     * @param string $model the model that answered, as the provider names it (an alias resolved to its snapshot)
     */
    public function __construct(
        public readonly mixed $json,
        public readonly string $raw,
        public readonly ?LlmUsage $usage,
        public readonly string $model,
    ) {
    }
}
