<?php

declare(strict_types=1);

namespace NestFlyers\Domain;

use DateTimeImmutable;
use DateTimeZone;

/** Real time, always in UTC whatever the host's date.timezone says. */
final class SystemClock implements Clock
{
    public function now(): string
    {
        return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
    }
}
