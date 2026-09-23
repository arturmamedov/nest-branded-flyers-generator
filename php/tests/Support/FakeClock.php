<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Support;

use NestFlyers\Domain\Clock;

/**
 * A clock tests move by hand (the PHP twin of FakeClock in
 * tests/storage/repositories.contract.ts): it starts at the same instant, so
 * both repository suites expect the same timestamps.
 */
final class FakeClock implements Clock
{
    /** Milliseconds since the Unix epoch; an int keeps the arithmetic exact. */
    private int $ms;

    public function __construct(string $start = '2026-09-18T10:00:00.000Z')
    {
        $seconds = strtotime($start);
        if ($seconds === false || preg_match('/\.(\d{3})Z$/', $start, $m) !== 1) {
            throw new \InvalidArgumentException("FakeClock needs a toISOString() timestamp, got $start");
        }
        $this->ms = $seconds * 1000 + (int) $m[1];
    }

    public function now(): string
    {
        // gmdate, not date: the suite runs in Pacific/Kiritimati to prove stamps are UTC.
        return gmdate('Y-m-d\TH:i:s', intdiv($this->ms, 1000)) . sprintf('.%03dZ', $this->ms % 1000);
    }

    public function tick(int $ms = 1000): void
    {
        $this->ms += $ms;
    }
}
