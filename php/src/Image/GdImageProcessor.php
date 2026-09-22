<?php

declare(strict_types=1);

namespace NestFlyers\Image;

use GdImage;
use RuntimeException;

/**
 * The default processor: GD ships with nearly every PHP build. Decoding and
 * re-encoding drops every metadata block (Exif, GPS, XMP, ICC), which is the
 * "strip" part of the contract.
 *
 * GD images count against memory_limit, which is why PhotoService guards memory
 * before calling this. Images are freed by dropping the last reference:
 * imagedestroy() is a no-op since PHP 8.0 (and deprecated in 8.5).
 */
final class GdImageProcessor implements ImageProcessor
{
    /** zlib level for PNG output: sharp's default compression level too. */
    private const PNG_LEVEL = 6;

    /** GD's image structs and the codecs' row buffers, on top of the rasters peakMemoryBytes() counts. */
    private const BOOKKEEPING_BYTES = 1024 * 1024;

    /**
     * EXIF orientation → [anticlockwise quarter turn for imagerotate, then flip],
     * matching tests/fixtures/orientation.json (sharp's rotate()). 5 is the
     * transpose and 7 the transverse: a clockwise quarter turn, then a mirror.
     *
     * @var array<int, array{0:int, 1:int|null}>
     */
    private const ORIENT = [
        1 => [0, null],
        2 => [0, IMG_FLIP_HORIZONTAL],
        3 => [0, IMG_FLIP_BOTH],
        4 => [0, IMG_FLIP_VERTICAL],
        5 => [270, IMG_FLIP_HORIZONTAL],
        6 => [270, null],
        7 => [270, IMG_FLIP_VERTICAL],
        8 => [90, null],
    ];

    public function name(): string
    {
        return 'gd';
    }

    /**
     * GD's peak, measured phase by phase on PHP 8.4 (decode, resize/turn, encode):
     * - the decoded source raster is alive throughout;
     * - PNG decodes through libpng's whole-image buffer (up to 4 bytes a pixel) before GD copies it;
     * - resizing or turning allocates a second raster at the stored size, next to the source;
     * - encoding holds the compressed file about 1.5 times (the growing output buffer, then the string),
     *   and for PNG libpng's 4-byte copy of every row too. For photos that stays under 1 byte a pixel
     *   for JPEG at quality 88 and under 8 for PNG. Pixel noise compresses worse and can exceed it:
     *   that is a 500 instead of a 413 for a crafted file, while a bound for noise would refuse
     *   ordinary photos on 64 MB hosts.
     * Only the largest of the three extras counts: each is freed before the next phase allocates.
     */
    public function peakMemoryBytes(ImageInfo $info, int $maxEdge): int
    {
        $out = Geometry::storedSize($info, $maxEdge);
        $outPixels = $out['width'] * $out['height'];
        $upright = Geometry::swapsAxes($info->orientation) ? [$info->height, $info->width] : [$info->width, $info->height];
        $changed = $info->orientation !== 1 || $upright !== [$out['width'], $out['height']];
        return self::BOOKKEEPING_BYTES + self::rasterBytes($info->width, $info->height) + max(
            $info->format === 'png' ? 4 * $info->width * $info->height : 0,
            $changed ? self::rasterBytes($out['width'], $out['height']) : 0,
            $info->hasAlpha ? 8 * $outPixels : $outPixels,
        );
    }

    /**
     * A truecolor image is one emalloc'd row of 4-byte pixels per line, plus a
     * pointer to it. PHP's allocator hands out anything over 3 KiB in whole 4 KiB
     * pages, so a 3240 px row (12 960 bytes) really takes 16 384: 5.06 bytes a pixel.
     */
    private static function rasterBytes(int $width, int $height): int
    {
        return $height * (intdiv(4 * $width + 4095, 4096) * 4096 + 8);
    }

    public function process(string $bytes, ImageInfo $info, int $maxEdge, int $jpegQuality): ?StoredImage
    {
        if ($bytes === '') {
            return null; // imagecreatefromstring throws a ValueError on '' rather than returning false
        }
        // GD reports undecodable data as warnings ("not a valid JPEG", libpng errors); false is the answer we use.
        $image = @imagecreatefromstring($bytes);
        if ($image === false) {
            return null;
        }
        if (!imageistruecolor($image)) {
            imagepalettetotruecolor($image); // keeps a palette's transparent entry as alpha
        }

        // Fit the upright picture, then resize before turning it: the bound is square, so resizing first gives the
        // same size and turns the smaller image.
        $width = imagesx($image);
        $height = imagesy($image);
        $swap = Geometry::swapsAxes($info->orientation);
        $fit = $swap
            ? Geometry::fitLongEdge($height, $width, $maxEdge)
            : Geometry::fitLongEdge($width, $height, $maxEdge);
        [$targetWidth, $targetHeight] = $swap ? [$fit['height'], $fit['width']] : [$fit['width'], $fit['height']];
        if ($targetWidth !== $width || $targetHeight !== $height) {
            $image = self::resample($image, $targetWidth, $targetHeight);
        }
        $image = self::orient($image, $info->orientation);

        return new StoredImage(
            self::encode($image, $info->hasAlpha, $jpegQuality),
            $info->hasAlpha ? 'png' : 'jpg',
            imagesx($image),
            imagesy($image),
        );
    }

    private static function resample(GdImage $source, int $width, int $height): GdImage
    {
        $target = self::canvas($width, $height);
        if (!imagecopyresampled($target, $source, 0, 0, 0, 0, $width, $height, imagesx($source), imagesy($source))) {
            throw new RuntimeException('GD could not resize the photo.');
        }
        return $target;
    }

    private static function orient(GdImage $image, int $orientation): GdImage
    {
        [$turn, $flip] = self::ORIENT[$orientation] ?? self::ORIENT[1];
        if ($turn !== 0) {
            // Quarter turns take GD's exact pixel-copy path, so the background colour never shows.
            $turned = imagerotate($image, $turn, 0);
            if ($turned === false) {
                throw new RuntimeException('GD could not rotate the photo.');
            }
            $image = $turned;
        }
        if ($flip !== null && !imageflip($image, $flip)) {
            throw new RuntimeException('GD could not mirror the photo.');
        }
        return $image;
    }

    /** A truecolor canvas that takes source alpha as it is, instead of blending it onto black. */
    private static function canvas(int $width, int $height): GdImage
    {
        $canvas = imagecreatetruecolor($width, $height);
        if ($canvas === false) {
            throw new RuntimeException("GD could not allocate a {$width}×{$height} image.");
        }
        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);
        return $canvas;
    }

    /** PNG when the upload has an alpha channel, else a progressive JPEG (as sharp's mozjpeg writes). */
    private static function encode(GdImage $image, bool $alpha, int $jpegQuality): string
    {
        if ($alpha) {
            imagealphablending($image, false);
            imagesavealpha($image, true);
        } else {
            imageinterlace($image, true);
        }
        // GD writes only to a file or the output stream; the buffer captures it without touching the disk.
        ob_start();
        try {
            $ok = $alpha ? imagepng($image, null, self::PNG_LEVEL) : imagejpeg($image, null, $jpegQuality);
        } finally {
            $encoded = ob_get_clean();
        }
        if (!$ok || !is_string($encoded) || $encoded === '') {
            throw new RuntimeException('GD could not encode the photo.');
        }
        return $encoded;
    }
}
