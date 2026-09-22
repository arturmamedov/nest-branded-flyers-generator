<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Image;

use GdImage;
use RuntimeException;

/**
 * Test images, drawn with GD and patched by hand where GD can't write what a
 * test needs (Exif segments, PNG colour types, WebP header bits). Byte layouts
 * follow the JPEG (ITU T.81), Exif 2.3/TIFF 6, PNG and WebP container specs.
 */
final class Images
{
    /** The orientation marker's quadrants (tests/fixtures/orientation.json): TL, TR, BL, BR. */
    public const MARKER = ['red' => [255, 0, 0], 'green' => [0, 255, 0], 'blue' => [0, 0, 255], 'white' => [255, 255, 255]];

    /** A single-colour truecolor image. */
    public static function solid(int $width, int $height, array $rgb = [0x88, 0xAA, 0xCC], int $gdAlpha = 0): GdImage
    {
        $image = imagecreatetruecolor($width, $height);
        imagealphablending($image, false);
        imagesavealpha($image, $gdAlpha > 0);
        imagefilledrectangle($image, 0, 0, $width - 1, $height - 1, imagecolorallocatealpha($image, $rgb[0], $rgb[1], $rgb[2], $gdAlpha));
        return $image;
    }

    /** Four quadrants, top-left red, top-right green, bottom-left blue, bottom-right white. */
    public static function marker(int $width, int $height): GdImage
    {
        $image = imagecreatetruecolor($width, $height);
        [$halfW, $halfH] = [intdiv($width, 2), intdiv($height, 2)];
        $boxes = [[0, 0, 'red'], [$halfW, 0, 'green'], [0, $halfH, 'blue'], [$halfW, $halfH, 'white']];
        foreach ($boxes as [$x, $y, $name]) {
            [$r, $g, $b] = self::MARKER[$name];
            imagefilledrectangle($image, $x, $y, $x + $halfW - 1, $y + $halfH - 1, imagecolorallocate($image, $r, $g, $b));
        }
        return $image;
    }

    public static function jpeg(GdImage $image, int $quality = 90): string
    {
        return self::capture(static fn () => imagejpeg($image, null, $quality));
    }

    /** $alpha false writes colour type 2 (RGB); true writes 6 (RGBA), even when every pixel is opaque. */
    public static function png(GdImage $image, bool $alpha): string
    {
        imagesavealpha($image, $alpha);
        return self::capture(static fn () => imagepng($image, null, 6));
    }

    public static function webp(GdImage $image, bool $lossless = false): string
    {
        return self::capture(static fn () => imagewebp($image, null, $lossless ? IMG_WEBP_LOSSLESS : 80));
    }

    public static function gif(GdImage $image): string
    {
        return self::capture(static fn () => imagegif($image));
    }

    /** A palette PNG (colour type 3), with a tRNS chunk when one entry is marked transparent. */
    public static function palettePng(bool $transparent): string
    {
        $image = imagecreate(16, 8);
        $red = imagecolorallocate($image, 255, 0, 0);
        $clear = imagecolorallocate($image, 0, 0, 0);
        imagefilledrectangle($image, 0, 0, 7, 7, $red);
        imagefilledrectangle($image, 8, 0, 15, 7, $clear);
        if ($transparent) {
            imagecolortransparent($image, $clear);
        }
        return self::capture(static fn () => imagepng($image));
    }

    /**
     * A hand-built PNG header: signature, IHDR with the given colour type, then
     * the given chunks (type => data). No pixels: enough for getimagesize and the
     * sniffer, not for a decoder.
     *
     * @param list<array{0:string, 1:string}> $chunks
     */
    public static function pngHeader(int $colourType, array $chunks = [], int $width = 4, int $height = 3): string
    {
        $bytes = "\x89PNG\r\n\x1a\n" . self::pngChunk('IHDR', pack('NNCCCCC', $width, $height, 8, $colourType, 0, 0, 0));
        foreach ($chunks as [$type, $data]) {
            $bytes .= self::pngChunk($type, $data);
        }
        return $bytes;
    }

    public static function pngChunk(string $type, string $data): string
    {
        return pack('N', strlen($data)) . $type . $data . pack('N', crc32($type . $data));
    }

    /** The chunk types of a PNG, in order. @return list<string> */
    public static function pngChunkTypes(string $png): array
    {
        $types = [];
        for ($pos = 8; $pos + 8 <= strlen($png); $pos += 12 + unpack('N', $png, $pos)[1]) {
            $types[] = substr($png, $pos + 4, 4);
        }
        return $types;
    }

    /**
     * A TIFF structure (the body of an Exif segment after "Exif\0\0") whose IFD0
     * holds the given entries, each [tag, type, count, 4-byte value field].
     *
     * @param list<array{0:int, 1:int, 2:int, 3:string}> $entries
     */
    public static function tiff(array $entries, bool $bigEndian = false): string
    {
        [$u16, $u32] = $bigEndian ? ['n', 'N'] : ['v', 'V'];
        $tiff = ($bigEndian ? 'MM' : 'II') . pack($u16, 42) . pack($u32, 8) . pack($u16, count($entries));
        foreach ($entries as [$tag, $type, $count, $value]) {
            $tiff .= pack($u16, $tag) . pack($u16, $type) . pack($u32, $count) . $value;
        }
        return $tiff . pack($u32, 0); // no IFD1
    }

    /** An orientation entry: a SHORT, left-justified in its value field. */
    public static function orientationEntry(int $orientation, bool $bigEndian = false): array
    {
        return [0x0112, 3, 1, pack($bigEndian ? 'n' : 'v', $orientation) . "\0\0"];
    }

    /** A complete APP1 segment (marker, length, payload). */
    public static function app1(string $payload): string
    {
        return "\xFF\xE1" . pack('n', strlen($payload) + 2) . $payload;
    }

    /** An APP1 Exif segment whose IFD0 carries just the orientation. */
    public static function exifApp1(int $orientation, bool $bigEndian = false): string
    {
        return self::app1("Exif\0\0" . self::tiff([self::orientationEntry($orientation, $bigEndian)], $bigEndian));
    }

    /** Inserts a segment right after SOI, or after the JFIF APP0 segment GD writes. */
    public static function withSegment(string $jpeg, string $segment, bool $afterApp0 = false): string
    {
        $at = 2;
        if ($afterApp0 && substr($jpeg, 2, 2) === "\xFF\xE0") {
            $at = 4 + unpack('n', $jpeg, 4)[1];
        }
        return substr($jpeg, 0, $at) . $segment . substr($jpeg, $at);
    }

    /** The marker codes of a JPEG's segments up to the first scan. @return list<int> */
    public static function jpegMarkers(string $jpeg): array
    {
        $markers = [];
        $pos = 2;
        while ($pos + 4 <= strlen($jpeg) && $jpeg[$pos] === "\xFF") {
            $marker = ord($jpeg[$pos + 1]);
            $markers[] = $marker;
            if ($marker === 0xDA) {
                break;
            }
            $pos += 2 + unpack('n', $jpeg, $pos + 2)[1];
        }
        return $markers;
    }

    /** [r, g, b, gdAlpha 0–127] of one pixel of an encoded image. @return array{0:int, 1:int, 2:int, 3:int} */
    public static function pixel(string $encoded, int $x, int $y): array
    {
        $image = imagecreatefromstring($encoded);
        if ($image === false) {
            throw new RuntimeException('Cannot decode the image under test.');
        }
        if (!imageistruecolor($image)) {
            imagepalettetotruecolor($image);
        }
        $c = imagecolorat($image, $x, $y);
        return [($c >> 16) & 0xFF, ($c >> 8) & 0xFF, $c & 0xFF, ($c >> 24) & 0x7F];
    }

    private static function capture(callable $write): string
    {
        ob_start();
        try {
            $ok = $write();
        } finally {
            $bytes = (string) ob_get_clean();
        }
        if ($ok !== true || $bytes === '') {
            throw new RuntimeException('GD could not encode the test image.');
        }
        return $bytes;
    }
}
