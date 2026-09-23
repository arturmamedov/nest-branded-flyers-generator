<?php

declare(strict_types=1);

namespace NestFlyers\Image;

use InvalidArgumentException;

/**
 * Photo sizes, shared by the image processors and PhotoService's memory guard.
 * fitLongEdge() is the PHP twin of fitLongEdge() in src/shared/limits.ts; both are
 * held to tests/fixtures/fit-long-edge.json, which Vitest checks against sharp.
 */
final class Geometry
{
    /**
     * The size a photo is stored at: long edge capped at $max, never enlarged, the
     * short edge rounded half up and at least 1 px (sharp's
     * `resize({ fit: 'inside', withoutEnlargement: true })`).
     *
     * @return array{width:int, height:int}
     */
    public static function fitLongEdge(int $width, int $height, int $max): array
    {
        if ($width < 1 || $height < 1 || $max < 1) {
            throw new InvalidArgumentException("Sizes must be positive (got {$width}×{$height}, max $max)");
        }
        $long = max($width, $height);
        if ($long <= $max) {
            return ['width' => $width, 'height' => $height];
        }
        // Round half up in integers: floor(n·max/long + ½) = ⌊(2·n·max + long) / (2·long)⌋. JS computes n·max/long in
        // doubles, but no ratio of these sizes lands close enough to .5 for that to differ, and integers can't drift.
        $scale = static fn (int $n): int => max(1, intdiv(2 * $n * $max + $long, 2 * $long));
        return $width >= $height
            ? ['width' => $max, 'height' => $scale($height)]
            : ['width' => $scale($width), 'height' => $max];
    }

    /** EXIF orientations 5–8 turn the picture a quarter, so the upright image's width is the stored height. */
    public static function swapsAxes(int $orientation): bool
    {
        return $orientation >= 5 && $orientation <= 8;
    }

    /**
     * The size of the stored photo for an upload: fitted after the EXIF orientation
     * is applied, because the long-edge cap is about the picture as people see it.
     *
     * @return array{width:int, height:int}
     */
    public static function storedSize(ImageInfo $info, int $maxEdge): array
    {
        return self::swapsAxes($info->orientation)
            ? self::fitLongEdge($info->height, $info->width, $maxEdge)
            : self::fitLongEdge($info->width, $info->height, $maxEdge);
    }
}
