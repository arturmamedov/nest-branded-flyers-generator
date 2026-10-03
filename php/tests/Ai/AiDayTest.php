<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Ai;

use NestFlyers\Ai\AiDay;
use NestFlyers\Json;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The day a generation counts for and the date the prompt calls "today" (aiDay and aiDateLine in src/shared/ai.ts),
 * against the vectors Vitest replays too (tests/fixtures/ai-day.json): both DST changes, midnight, the year's end.
 */
final class AiDayTest extends TestCase
{
    /** @return object{zone:string, cases:list<object{at:string, day:string, line:string}>} */
    private static function fixture(): object
    {
        return Json::decode((string) file_get_contents(Paths::fixture('ai-day.json')));
    }

    /** @return array<string, array{string, string, string}> */
    public static function instants(): array
    {
        $cases = [];
        foreach (self::fixture()->cases as $case) {
            $cases[$case->at] = [$case->at, $case->day, $case->line];
        }
        return $cases;
    }

    #[DataProvider('instants')]
    public function testTheCanaryIslandsDayOfAnInstant(string $at, string $day, string $line): void
    {
        $days = new AiDay(self::fixture()->zone);
        self::assertSame($day, $days->day($at));
        self::assertSame($line, $days->dateLine($at));
    }

    public function testTheZoneIsTheSharedOne(): void
    {
        self::assertSame(self::fixture()->zone, Shared::fromFile(Paths::schema('shared.json'))->ai()['dayZone']);
    }
}
