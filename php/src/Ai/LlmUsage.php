<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/** The tokens a call took, as the provider counted them. */
final class LlmUsage
{
    public function __construct(
        public readonly int $input,
        public readonly int $output,
    ) {
    }
}
