<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/** A provider's answer as it came: the status, and the body as valid UTF-8 text (what fetch()'s text() gives Node). */
final class HttpResponse
{
    public function __construct(
        public readonly int $status,
        public readonly string $text,
    ) {
    }
}
