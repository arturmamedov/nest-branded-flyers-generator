<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Image;

use NestFlyers\Image\ExifOrientation;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The parser runs on untrusted bytes, so beyond the happy paths every test here
 * is about damage: PHPUnit fails on any warning (failOnWarning), which proves it
 * never reads past the data.
 */
final class ExifOrientationTest extends TestCase
{
    /** A minimal JPEG around the given segments: SOI, segments, a JFIF-free SOS stub and EOI. */
    private static function jpeg(string ...$segments): string
    {
        return "\xFF\xD8" . implode('', $segments) . "\xFF\xDA\x00\x08\x01\x01\x00\x00\x3F\x00" . "\x12\x34" . "\xFF\xD9";
    }

    private static function app0(): string
    {
        $payload = "JFIF\0\x01\x01\x00\x00\x01\x00\x01\x00\x00";
        return "\xFF\xE0" . pack('n', strlen($payload) + 2) . $payload;
    }

    /** @return iterable<string, array{int, bool}> */
    public static function orientations(): iterable
    {
        foreach ([false, true] as $bigEndian) {
            foreach (range(1, 8) as $orientation) {
                yield ($bigEndian ? 'MM' : 'II') . " $orientation" => [$orientation, $bigEndian];
            }
        }
    }

    #[DataProvider('orientations')]
    public function testReadsTheOrientationInBothByteOrders(int $orientation, bool $bigEndian): void
    {
        self::assertSame($orientation, ExifOrientation::fromJpeg(self::jpeg(Images::exifApp1($orientation, $bigEndian))));
        self::assertSame($orientation, ExifOrientation::fromJpeg(self::jpeg(self::app0(), Images::exifApp1($orientation, $bigEndian))));
    }

    public function testFindsTheTagAmongOtherEntries(): void
    {
        foreach ([false, true] as $big) {
            $u32 = $big ? 'N' : 'V';
            $tiff = Images::tiff([
                [0x010F, 2, 6, pack($u32, 200)],          // Make, ASCII, stored elsewhere
                [0x0110, 2, 4, "abc\0"],                    // Model, ASCII, inline
                Images::orientationEntry(6, $big),
                [0x011A, 5, 1, pack($u32, 210)],            // XResolution, RATIONAL
            ], $big);
            self::assertSame(6, ExifOrientation::fromJpeg(self::jpeg(Images::app1("Exif\0\0" . $tiff))));
            // Some writers store the orientation as a LONG.
            $long = Images::tiff([[0x0112, 4, 1, pack($u32, 8)]], $big);
            self::assertSame(8, ExifOrientation::fromJpeg(self::jpeg(Images::app1("Exif\0\0" . $long))));
        }
    }

    public function testAnEntryCountPastTheEndReadsTheEntriesThatFit(): void
    {
        // libexif (sharp's reader) truncates a short IFD rather than dropping it.
        $tiff = Images::tiff([[0x010F, 2, 4, "abc\0"], Images::orientationEntry(6)]);
        $overstated = substr($tiff, 0, 8) . pack('v', 4000) . substr($tiff, 10);
        self::assertSame(6, ExifOrientation::fromJpeg(self::jpeg(Images::app1("Exif\0\0" . $overstated))));
        $cutBeforeIt = substr($overstated, 0, 8 + 2 + 12 + 6);
        self::assertSame(1, ExifOrientation::fromJpeg(self::jpeg(Images::app1("Exif\0\0" . $cutBeforeIt))));
    }

    public function testSkipsXmpAndOtherSegmentsBeforeTheExifOne(): void
    {
        $xmp = Images::app1("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>");
        $comment = "\xFF\xFE" . pack('n', 7) . 'hello';
        self::assertSame(3, ExifOrientation::fromJpeg(self::jpeg(self::app0(), $comment, $xmp, Images::exifApp1(3))));
        // Fill bytes before a marker are legal.
        self::assertSame(5, ExifOrientation::fromJpeg("\xFF\xD8\xFF\xFF" . substr(Images::exifApp1(5), 1) . "\xFF\xD9"));
    }

    public function testIsOneWithoutExif(): void
    {
        self::assertSame(1, ExifOrientation::fromJpeg(self::jpeg()));
        self::assertSame(1, ExifOrientation::fromJpeg(self::jpeg(self::app0())));
        self::assertSame(1, ExifOrientation::fromJpeg(self::jpeg(Images::app1("Exif\0\0" . Images::tiff([[0x010F, 2, 4, "abc\0"]])))));
    }

    public function testIgnoresExifAfterTheImageData(): void
    {
        self::assertSame(1, ExifOrientation::fromJpeg(self::jpeg() . Images::exifApp1(6)));
    }

    public function testOutOfRangeAndWronglyTypedValuesAreOne(): void
    {
        foreach ([0, 9, 255, 65535] as $value) {
            self::assertSame(1, ExifOrientation::fromJpeg(self::jpeg(Images::exifApp1($value))), "value $value");
        }
        $ascii = Images::tiff([[0x0112, 2, 2, "6\0\0\0"]]);
        self::assertSame(1, ExifOrientation::fromJpeg(self::jpeg(Images::app1("Exif\0\0" . $ascii))));
        $noCount = Images::tiff([[0x0112, 3, 0, "\x06\0\0\0"]]);
        self::assertSame(1, ExifOrientation::fromJpeg(self::jpeg(Images::app1("Exif\0\0" . $noCount))));
    }

    public function testMalformedStructuresAreOne(): void
    {
        $tiff = Images::tiff([Images::orientationEntry(6)]);
        $cases = [
            'not a JPEG' => 'GIF89a' . str_repeat("\0", 40),
            'empty' => '',
            'SOI only' => "\xFF\xD8",
            'garbage after SOI' => "\xFF\xD8" . str_repeat("\xAB", 64),
            'bad byte order' => self::jpeg(Images::app1("Exif\0\0XX" . substr($tiff, 2))),
            'bad magic' => self::jpeg(Images::app1("Exif\0\0II" . pack('v', 43) . substr($tiff, 4))),
            'IFD before the header' => self::jpeg(Images::app1("Exif\0\0II*\0" . pack('V', 4) . substr($tiff, 8))),
            'IFD past the end' => self::jpeg(Images::app1("Exif\0\0II*\0" . pack('V', 5000) . substr($tiff, 8))),
            'IFD offset overflow' => self::jpeg(Images::app1("Exif\0\0II*\0" . pack('V', 0xFFFFFFFF) . substr($tiff, 8))),
            'segment longer than the file' => "\xFF\xD8\xFF\xE1" . pack('n', 60000) . "Exif\0\0" . $tiff,
            'segment length below 2' => "\xFF\xD8\xFF\xE1\x00\x01Exif\0\0" . $tiff,
            'short Exif header' => self::jpeg(Images::app1("Exif\0")),
            'TIFF too short' => self::jpeg(Images::app1("Exif\0\0II*\0")),
            'lost marker sync' => "\xFF\xD8\x00\x00" . Images::exifApp1(6),
        ];
        foreach ($cases as $label => $bytes) {
            self::assertSame(1, ExifOrientation::fromJpeg($bytes), $label);
        }
    }

    public function testEveryTruncationOfAValidFileIsHandled(): void
    {
        $jpeg = self::jpeg(self::app0(), Images::exifApp1(7, true));
        $cut = strpos($jpeg, "\xFF\xE1") + strlen(Images::exifApp1(7, true));
        for ($length = 0; $length <= strlen($jpeg); $length++) {
            self::assertSame($length >= $cut ? 7 : 1, ExifOrientation::fromJpeg(substr($jpeg, 0, $length)), "first $length bytes");
        }
    }

    public function testRandomBytesNeverWarn(): void
    {
        mt_srand(20260918);
        $valid = self::jpeg(Images::exifApp1(6));
        for ($i = 0; $i < 500; $i++) {
            $bytes = $valid;
            // Flip a few bytes anywhere after SOI, including lengths, offsets and counts.
            for ($n = 0; $n < 3; $n++) {
                $bytes[mt_rand(2, strlen($bytes) - 1)] = chr(mt_rand(0, 255));
            }
            $orientation = ExifOrientation::fromJpeg($bytes);
            self::assertGreaterThanOrEqual(1, $orientation);
            self::assertLessThanOrEqual(8, $orientation);
        }
    }

    #[DataProvider('orientations')]
    public function testReadsSegmentsWrittenIntoARealGdJpeg(int $orientation, bool $bigEndian): void
    {
        if (!extension_loaded('gd')) {
            self::markTestSkipped('The sample JPEG is drawn with GD.');
        }
        $jpeg = Images::jpeg(Images::solid(8, 8));
        self::assertSame(1, ExifOrientation::fromJpeg($jpeg));
        self::assertSame($orientation, ExifOrientation::fromJpeg(Images::withSegment($jpeg, Images::exifApp1($orientation, $bigEndian), true)));
    }
}
