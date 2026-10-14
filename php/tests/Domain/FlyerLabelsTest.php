<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Domain;

use NestFlyers\Domain\FlyerLabels;
use NestFlyers\Json;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** The rules for a flyer's labels, against tests/fixtures/flyer-labels.json: the vectors Vitest replays too. */
final class FlyerLabelsTest extends TestCase
{
    private static function fixture(): object
    {
        return Json::decode((string) file_get_contents(Paths::fixture('flyer-labels.json')));
    }

    private static function labels(): FlyerLabels
    {
        $fixture = self::fixture();
        return new FlyerLabels($fixture->list, $fixture->none);
    }

    /** @return array<string, array{object}> */
    private static function cases(string $rule): array
    {
        $cases = [];
        foreach (self::fixture()->{$rule} as $case) {
            $cases[$case->why] = [$case];
        }
        return $cases;
    }

    /** @return array<string, array{object}> */
    public static function tidyCases(): array
    {
        return self::cases('tidy');
    }

    /** @return array<string, array{object}> */
    public static function knownCases(): array
    {
        return self::cases('known');
    }

    /** @return array<string, array{object}> */
    public static function matchCases(): array
    {
        return self::cases('matches');
    }

    /** @return array<string, array{object}> */
    public static function storedCases(): array
    {
        return self::cases('stored');
    }

    #[DataProvider('tidyCases')]
    public function testTidiesWhatIsSaved(object $case): void
    {
        self::assertSame($case->out, self::labels()->tidy($case->labels));
    }

    #[DataProvider('knownCases')]
    public function testShowsTheListedOnesAlone(object $case): void
    {
        self::assertSame($case->out, self::labels()->known($case->labels));
    }

    #[DataProvider('matchCases')]
    public function testMatchesTheLibrarysFilter(object $case): void
    {
        self::assertSame($case->out, self::labels()->matches($case->labels, $case->wanted));
    }

    #[DataProvider('storedCases')]
    public function testReadsAStoredFlyersLabelsLoosely(object $case): void
    {
        // As the store decodes a flyer's file: objects as objects, so a list is told from numbered keys.
        self::assertSame($case->out, FlyerLabels::stored($case->data));
    }

    public function testTheRealListComesFromTheGeneratedFile(): void
    {
        $shared = Shared::fromFile(Paths::schema('shared.json'));
        $block = $shared->labels();
        $slugs = array_column($block['list'], 'slug');

        self::assertNotSame([], $slugs);
        self::assertSame(array_values(array_unique($slugs)), $slugs, 'each slug once');
        self::assertNotContains($block['none'], $slugs, 'the filter’s own word is no label');
        foreach ($block['list'] as $label) {
            self::assertMatchesRegularExpression('~' . $block['slug'] . '~', $label['slug']);
            self::assertLessThanOrEqual($block['slugMax'], strlen($label['slug']));
            self::assertNotSame('', $label['name']);
        }

        // Built from it, the rules know the real list: its order is the order a flyer's labels are saved in.
        $labels = FlyerLabels::fromShared($shared);
        self::assertSame($slugs, $labels->tidy(array_reverse($slugs)));
        self::assertTrue($labels->matches([], $block['none']));
        self::assertFalse($labels->matches([$slugs[0]], $block['none']));
    }
}
