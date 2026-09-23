<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Image;

use InvalidArgumentException;
use NestFlyers\Image\Geometry;
use NestFlyers\Image\ImageInfo;
use NestFlyers\Json;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class GeometryTest extends TestCase
{
    /** @return iterable<string, array{int, int, int, int, int}> */
    public static function fitVectors(): iterable
    {
        $fixture = Json::decode((string) file_get_contents(Paths::fixture('fit-long-edge.json')));
        foreach ($fixture->cases as $case) {
            yield "{$case->in[0]}×{$case->in[1]}" => [$case->in[0], $case->in[1], $fixture->maxEdge, $case->out[0], $case->out[1]];
        }
    }

    #[DataProvider('fitVectors')]
    public function testFitsTheLongEdgeExactlyAsSharpDoes(int $width, int $height, int $max, int $outWidth, int $outHeight): void
    {
        self::assertSame(['width' => $outWidth, 'height' => $outHeight], Geometry::fitLongEdge($width, $height, $max));
    }

    public function testTheFixtureUsesTheSharedPhotoEdge(): void
    {
        $fixture = Json::decode((string) file_get_contents(Paths::fixture('fit-long-edge.json')));
        self::assertSame(Shared::fromFile(Paths::schema('shared.json'))->maxPhotoEdge(), $fixture->maxEdge);
    }

    public function testRoundsHalfUp(): void
    {
        // 3 × 10 / 20 = 1.5 → 2, and 1 × 10 / 20 = 0.5 → 1 (never 0).
        self::assertSame(['width' => 10, 'height' => 2], Geometry::fitLongEdge(20, 3, 10));
        self::assertSame(['width' => 1, 'height' => 10], Geometry::fitLongEdge(1, 20, 10));
    }

    public function testRefusesSizesThatAreNotPositive(): void
    {
        $this->expectException(InvalidArgumentException::class);
        Geometry::fitLongEdge(0, 10, 10);
    }

    public function testQuarterTurnOrientationsSwapTheAxes(): void
    {
        self::assertSame([false, false, false, false, true, true, true, true], array_map(Geometry::swapsAxes(...), range(1, 8)));
        self::assertFalse(Geometry::swapsAxes(0));
        self::assertFalse(Geometry::swapsAxes(9));
    }

    public function testTheStoredSizeIsFittedUpright(): void
    {
        $sideways = new ImageInfo('jpeg', 4000, 2000, false, 6);
        self::assertSame(['width' => 1620, 'height' => 3240], Geometry::storedSize($sideways, 3240));
        $level = new ImageInfo('jpeg', 4000, 2000, false, 3);
        self::assertSame(['width' => 3240, 'height' => 1620], Geometry::storedSize($level, 3240));
    }
}
