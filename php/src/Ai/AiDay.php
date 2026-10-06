<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use DateTimeImmutable;
use DateTimeZone;

/**
 * The day the AI's daily limits count in, and the date the prompt calls "today": aiDay() and aiDateLine() in
 * src/shared/ai.ts, held to the same vectors (tests/fixtures/ai-day.json). The zone comes from Shared::ai(), so the
 * time-zone rule is written once.
 */
final class AiDay
{
    private readonly DateTimeZone $zone;

    public function __construct(string $zone)
    {
        $this->zone = new DateTimeZone($zone);
    }

    /** The day a generation at this instant (a Clock timestamp, UTC) counts for: YYYY-MM-DD in the zone. */
    public function day(string $iso): string
    {
        return $this->local($iso)->format('Y-m-d');
    }

    /** "Friday 2 October 2026": format() is locale-free, so this is the same on every host. */
    public function dateLine(string $iso): string
    {
        return $this->local($iso)->format('l j F Y');
    }

    private function local(string $iso): DateTimeImmutable
    {
        // The timestamp carries its Z, so the host's own timezone never enters.
        return (new DateTimeImmutable($iso))->setTimezone($this->zone);
    }
}
