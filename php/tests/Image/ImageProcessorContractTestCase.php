<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Image;

use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Image\ImageInfo;
use NestFlyers\Image\ImageProcessor;
use NestFlyers\Image\ImageSniffer;
use NestFlyers\Image\StoredImage;
use NestFlyers\Json;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * What every ImageProcessor promises (the interface's contract), so GD and
 * Imagick are interchangeable behind config.php's imageProcessor. The expected
 * sizes and orientations are the shared vectors sharp is checked against in
 * tests/unit/shared-vectors.test.ts. Inputs go through the real ImageSniffer,
 * as they do in PhotoService. The fixtures are drawn with GD, so GD is needed
 * to run the suite for any processor.
 */
abstract class ImageProcessorContractTestCase extends TestCase
{
    /** Larger inputs take seconds each and add nothing the smaller vectors don't cover. */
    private const MAX_FIT_PIXELS = 16_000_000;

    /** Per-channel tolerance for colours that went through two JPEG encodings (Node's check uses the same). */
    private const COLOUR_TOLERANCE = 40;

    /** Alpha after a PNG round trip, on GD's 0–127 scale. */
    private const ALPHA_TOLERANCE = 2;

    private ImageProcessor $processor;
    private ImageSniffer $sniffer;
    private Shared $shared;

    /** The processor under test; skip here when its library is missing. */
    abstract protected function createProcessor(): ImageProcessor;

    abstract protected function expectedName(): string;

    protected function setUp(): void
    {
        if (!extension_loaded('gd')) {
            self::markTestSkipped('The contract fixtures are drawn with GD.');
        }
        $this->processor = $this->createProcessor();
        $this->shared = Shared::fromFile(Paths::schema('shared.json'));
        $this->sniffer = new ImageSniffer($this->shared, ErrorCatalog::fromShared($this->shared));
    }

    private function store(string $bytes, ?int $maxEdge = null): StoredImage
    {
        $stored = $this->processor->process(
            $bytes,
            $this->sniffer->sniff($bytes),
            $maxEdge ?? $this->shared->maxPhotoEdge(),
            $this->shared->photoJpegQuality(),
        );
        self::assertNotNull($stored);
        return $stored;
    }

    /** The stored size is the file's real size, and the file is the format the extension says. */
    private static function assertWellFormed(StoredImage $stored): void
    {
        $size = getimagesizefromstring($stored->bytes);
        self::assertNotFalse($size);
        self::assertSame([$stored->width, $stored->height], [$size[0], $size[1]]);
        self::assertSame($stored->extension === 'png' ? IMAGETYPE_PNG : IMAGETYPE_JPEG, $size[2]);
    }

    public function testHasItsDiagnosticName(): void
    {
        self::assertSame($this->expectedName(), $this->processor->name());
    }

    /** @return iterable<string, array{int, int, int, int, int}> */
    public static function fitVectors(): iterable
    {
        $fixture = Json::decode((string) file_get_contents(Paths::fixture('fit-long-edge.json')));
        foreach ($fixture->cases as $case) {
            if ($case->in[0] * $case->in[1] <= self::MAX_FIT_PIXELS) {
                yield "{$case->in[0]}×{$case->in[1]}" => [$case->in[0], $case->in[1], $fixture->maxEdge, $case->out[0], $case->out[1]];
            }
        }
    }

    #[DataProvider('fitVectors')]
    public function testFitsTheLongEdgeLikeSharp(int $width, int $height, int $maxEdge, int $outWidth, int $outHeight): void
    {
        $stored = $this->store(Images::jpeg(Images::solid($width, $height), 50), $maxEdge);
        self::assertSame([$outWidth, $outHeight], [$stored->width, $stored->height]);
        self::assertSame('jpg', $stored->extension);
        self::assertWellFormed($stored);
    }

    public function testNeverEnlarges(): void
    {
        foreach ([[1, 1], [800, 600], [17, 3000]] as [$width, $height]) {
            $stored = $this->store(Images::jpeg(Images::solid($width, $height)));
            self::assertSame([$width, $height], [$stored->width, $stored->height]);
        }
    }

    /** @return iterable<string, array{int, int, int, list<string>}> */
    public static function orientationVectors(): iterable
    {
        $fixture = Json::decode((string) file_get_contents(Paths::fixture('orientation.json')));
        foreach ($fixture->cases as $case) {
            yield "orientation $case->orientation" => [$case->orientation, $case->out[0], $case->out[1], $case->quadrants];
        }
    }

    /** @param list<string> $quadrants colour names at the centres of the TL, TR, BL and BR quarters */
    #[DataProvider('orientationVectors')]
    public function testAppliesTheExifOrientationLikeSharp(int $orientation, int $outWidth, int $outHeight, array $quadrants): void
    {
        $fixture = Json::decode((string) file_get_contents(Paths::fixture('orientation.json')));
        self::assertSame(array_keys(Images::MARKER), array_keys((array) $fixture->marker->colors));
        $jpeg = Images::withSegment(Images::jpeg(Images::marker($fixture->marker->width, $fixture->marker->height), 95), Images::exifApp1($orientation));
        self::assertSame($orientation, $this->sniffer->sniff($jpeg)->orientation);

        $stored = $this->store($jpeg);
        self::assertSame([$outWidth, $outHeight], [$stored->width, $stored->height]);
        $centres = [[1, 1], [3, 1], [1, 3], [3, 3]]; // in quarters of the output
        foreach ($quadrants as $i => $name) {
            [$qx, $qy] = $centres[$i];
            $got = array_slice(Images::pixel($stored->bytes, intdiv($outWidth * $qx, 4), intdiv($outHeight * $qy, 4)), 0, 3);
            foreach (Images::MARKER[$name] as $channel => $want) {
                self::assertLessThan(self::COLOUR_TOLERANCE, abs($got[$channel] - $want), "quadrant $i should be $name, got " . implode(',', $got));
            }
        }
    }

    public function testMalformedExifDoesNotStopTheUpload(): void
    {
        $jpeg = Images::jpeg(Images::solid(40, 20));
        $damaged = [
            'garbage Exif' => Images::app1("Exif\0\0" . str_repeat("\xA5", 40)),
            'IFD past the end' => Images::app1("Exif\0\0II*\0" . pack('V', 999) . "\0\0"),
            'orientation 9' => Images::exifApp1(9),
        ];
        foreach ($damaged as $label => $segment) {
            $stored = $this->store(Images::withSegment($jpeg, $segment));
            self::assertSame([40, 20], [$stored->width, $stored->height], $label);
            self::assertWellFormed($stored);
        }
    }

    public function testStripsExifAndEveryOtherAppSegment(): void
    {
        $exif = Images::app1("Exif\0\0" . Images::tiff([
            [0x010F, 2, 4, "GPS\0"],
            Images::orientationEntry(1),
        ]));
        $xmp = Images::app1("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>");
        $stored = $this->store(Images::withSegment(Images::withSegment(Images::jpeg(Images::solid(64, 32)), $exif), $xmp));
        $markers = Images::jpegMarkers($stored->bytes);
        self::assertContains(0xDA, $markers, 'the walk reached the image data');
        foreach ($markers as $marker) {
            self::assertFalse($marker >= 0xE1 && $marker <= 0xEF, sprintf('APP%d segment in the output', $marker - 0xE0));
        }
        self::assertSame(1, $this->sniffer->sniff($stored->bytes)->orientation);
    }

    public function testStoresOpaqueImagesAsJpeg(): void
    {
        $inputs = ['RGB PNG' => Images::png(Images::solid(64, 32), false), 'JPEG' => Images::jpeg(Images::solid(64, 32))];
        if ((imagetypes() & IMG_WEBP) !== 0) {
            $inputs['lossy WebP'] = Images::webp(Images::solid(64, 32));
        }
        foreach ($inputs as $label => $bytes) {
            $stored = $this->store($bytes);
            self::assertSame('jpg', $stored->extension, $label);
            self::assertWellFormed($stored);
            $pixel = Images::pixel($stored->bytes, 10, 10);
            foreach ([0x88, 0xAA, 0xCC] as $channel => $want) {
                self::assertEqualsWithDelta($want, $pixel[$channel], 6, "$label: the colour survives");
            }
        }
    }

    public function testKeepsTransparencyAsPng(): void
    {
        $image = Images::solid(64, 32, [10, 20, 30], 64);
        imagefilledrectangle($image, 32, 0, 63, 31, imagecolorallocatealpha($image, 200, 100, 50, 127));
        imagefilledrectangle($image, 0, 24, 63, 31, imagecolorallocatealpha($image, 0, 128, 0, 0));
        $inputs = ['RGBA PNG' => Images::png($image, true)];
        if ((imagetypes() & IMG_WEBP) !== 0) {
            $inputs['lossless WebP with alpha'] = Images::webp($image, true);
        }
        foreach ($inputs as $label => $bytes) {
            $stored = $this->store($bytes);
            self::assertSame('png', $stored->extension, $label);
            self::assertWellFormed($stored);
            self::assertEqualsWithDelta(64, Images::pixel($stored->bytes, 8, 8)[3], self::ALPHA_TOLERANCE, "$label: half transparent");
            self::assertEqualsWithDelta(127, Images::pixel($stored->bytes, 40, 8)[3], self::ALPHA_TOLERANCE, "$label: clear");
            self::assertEqualsWithDelta(0, Images::pixel($stored->bytes, 8, 28)[3], self::ALPHA_TOLERANCE, "$label: opaque");
        }
    }

    public function testKeepsAPaletteTransparentEntryTransparent(): void
    {
        $stored = $this->store(Images::palettePng(true));
        self::assertSame('png', $stored->extension);
        self::assertEqualsWithDelta(0, Images::pixel($stored->bytes, 3, 3)[3], self::ALPHA_TOLERANCE);
        self::assertEqualsWithDelta(127, Images::pixel($stored->bytes, 12, 3)[3], self::ALPHA_TOLERANCE);
    }

    public function testAnOpaqueRgbaPngStaysPngAsSharpKeepsIt(): void
    {
        $stored = $this->store(Images::png(Images::solid(16, 8), true));
        self::assertSame('png', $stored->extension);
        self::assertEqualsWithDelta(0, Images::pixel($stored->bytes, 4, 4)[3], self::ALPHA_TOLERANCE);
    }

    public function testTurningKeepsTheAlphaChannel(): void
    {
        // PNGs carry no orientation the sniffer reads, but the contract holds for any ImageInfo.
        $image = Images::solid(40, 20, [10, 20, 30], 127);
        imagefilledrectangle($image, 0, 0, 19, 9, imagecolorallocatealpha($image, 255, 0, 0, 0));
        $bytes = Images::png($image, true);
        $stored = $this->processor->process($bytes, new ImageInfo('png', 40, 20, true, 6), 3240, 88);
        self::assertNotNull($stored);
        self::assertSame(['png', 20, 40], [$stored->extension, $stored->width, $stored->height]);
        // Orientation 6 turns clockwise: the opaque top-left block ends up top-right.
        self::assertEqualsWithDelta(0, Images::pixel($stored->bytes, 15, 5)[3], self::ALPHA_TOLERANCE);
        self::assertEqualsWithDelta(127, Images::pixel($stored->bytes, 5, 5)[3], self::ALPHA_TOLERANCE);
    }

    public function testUndecodableBytesGiveNull(): void
    {
        // A PNG header with no pixel data passes the sniffer but not a decoder.
        $header = Images::pngHeader(2, [], 8, 8);
        self::assertNull($this->processor->process($header, new ImageInfo('png', 8, 8, false, 1), 3240, 88));
        self::assertNull($this->processor->process('', new ImageInfo('jpeg', 8, 8, false, 1), 3240, 88));
    }

    public function testTheMemoryEstimateGrowsWithThePhoto(): void
    {
        $small = $this->processor->peakMemoryBytes(new ImageInfo('jpeg', 800, 600, false, 1), 3240);
        $large = $this->processor->peakMemoryBytes(new ImageInfo('jpeg', 4000, 3000, false, 1), 3240);
        self::assertGreaterThan(0, $small);
        self::assertGreaterThan($small, $large);
    }

    /**
     * The estimate is a promise about memory_limit: process() must not exceed it
     * for photo-like input. memory_reset_peak_usage() only exists from PHP 8.2.
     *
     * @return iterable<string, array{string, int, int, int}>
     */
    public static function memoryCases(): iterable
    {
        yield 'JPEG kept as is' => ['jpeg', 1600, 1200, 1];
        yield 'JPEG downscaled' => ['jpeg', 4000, 3000, 1];
        yield 'JPEG turned' => ['jpeg', 3240, 2000, 6];
        yield 'narrow JPEG' => ['jpeg', 1025, 5000, 1];
        yield 'RGBA PNG' => ['png', 2400, 1800, 1];
        yield 'RGBA PNG downscaled' => ['png', 3600, 2400, 1];
    }

    #[DataProvider('memoryCases')]
    public function testStaysWithinItsMemoryEstimate(string $format, int $width, int $height, int $orientation): void
    {
        if (!function_exists('memory_reset_peak_usage')) {
            self::markTestSkipped('Measuring the peak needs memory_reset_peak_usage() (PHP 8.2+).');
        }
        $image = Images::solid($width, $height, [120, 130, 140], $format === 'png' ? 30 : 0);
        // Some structure, so the encoders do real work.
        for ($i = 0; $i < 200; $i++) {
            $colour = imagecolorallocatealpha($image, ($i * 37) % 256, ($i * 91) % 256, ($i * 53) % 256, $format === 'png' ? $i % 128 : 0);
            imagefilledellipse($image, ($i * 7919) % $width, ($i * 104729) % $height, 40 + $i % 300, 40 + $i % 200, $colour);
        }
        $bytes = $format === 'png' ? Images::png($image, true) : Images::jpeg($image, 92);
        unset($image);
        if ($orientation !== 1) {
            $bytes = Images::withSegment($bytes, Images::exifApp1($orientation));
        }
        $info = $this->sniffer->sniff($bytes);
        $estimate = $this->processor->peakMemoryBytes($info, 3240);

        memory_reset_peak_usage();
        $before = memory_get_usage();
        $stored = $this->processor->process($bytes, $info, 3240, 88);
        $peak = memory_get_peak_usage() - $before;
        self::assertNotNull($stored);
        self::assertLessThanOrEqual($estimate, $peak, sprintf('peak %.1f MB over the %.1f MB estimate', $peak / 1048576, $estimate / 1048576));
    }
}
