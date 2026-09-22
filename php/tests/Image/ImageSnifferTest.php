<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Image;

use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\HttpError;
use NestFlyers\Image\ImageInfo;
use NestFlyers\Image\ImageSniffer;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ImageSnifferTest extends TestCase
{
    private Shared $shared;
    private ErrorCatalog $errors;
    private ImageSniffer $sniffer;

    protected function setUp(): void
    {
        if (!extension_loaded('gd')) {
            self::markTestSkipped('The sample images are drawn with GD.');
        }
        $this->shared = Shared::fromFile(Paths::schema('shared.json'));
        $this->errors = ErrorCatalog::fromShared($this->shared);
        $this->sniffer = new ImageSniffer($this->shared, $this->errors);
    }

    /** @param array<string, string> $vars */
    private function assertRefused(string $bytes, string $key, array $vars = [], string $label = ''): void
    {
        $expected = $this->errors->make($key, $vars);
        try {
            $this->sniffer->sniff($bytes);
            self::fail(trim("Expected $key $label"));
        } catch (HttpError $e) {
            self::assertSame([$expected->status, $expected->errorCode, $expected->getMessage()], [$e->status, $e->errorCode, $e->getMessage()], $label);
        }
    }

    public function testReadsAJpeg(): void
    {
        $info = $this->sniffer->sniff(Images::jpeg(Images::solid(64, 32)));
        self::assertEquals(new ImageInfo('jpeg', 64, 32, false, 1), $info);
    }

    public function testReadsTheJpegOrientation(): void
    {
        $jpeg = Images::withSegment(Images::jpeg(Images::solid(64, 32)), Images::exifApp1(6), true);
        // The size is the stored one; turning it upright is the processor's job.
        self::assertEquals(new ImageInfo('jpeg', 64, 32, false, 6), $this->sniffer->sniff($jpeg));
    }

    public function testReadsAPng(): void
    {
        self::assertEquals(new ImageInfo('png', 30, 20, false, 1), $this->sniffer->sniff(Images::png(Images::solid(30, 20), false)));
    }

    public function testReadsAWebp(): void
    {
        $this->needsWebp();
        self::assertEquals(new ImageInfo('webp', 30, 20, false, 1), $this->sniffer->sniff(Images::webp(Images::solid(30, 20))));
    }

    public function testOrientationIsOnlyReadFromJpegs(): void
    {
        // Exif-looking bytes inside a PNG chunk don't count (the brief's rule: JPEG only).
        $png = Images::pngHeader(2, [['tEXt', "Exif\0\0" . Images::tiff([Images::orientationEntry(6)])]]);
        self::assertSame(1, $this->sniffer->sniff($png)->orientation);
    }

    /** @return iterable<string, array{string}> */
    public static function heicBrands(): iterable
    {
        foreach (Shared::fromFile(Paths::schema('shared.json'))->heic()['brands'] as $brand) {
            yield $brand => [$brand];
        }
    }

    #[DataProvider('heicBrands')]
    public function testRefusesEveryIphoneBrandAsHeic(string $brand): void
    {
        $this->assertRefused("\0\0\0\x18ftyp" . $brand . str_repeat("\0", 64), 'heic');
    }

    public function testTheBrandListIsTheSharedOne(): void
    {
        self::assertSame(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'], $this->shared->heic()['brands']);
    }

    public function testNamesOtherIsoBmffFilesHeif(): void
    {
        foreach (['avif', 'isom', 'mp42'] as $brand) {
            $this->assertRefused("\0\0\0\x18ftyp" . $brand . str_repeat("\0", 64), 'unsupported_format', ['format' => 'HEIF']);
        }
    }

    public function testNamesGifTiffAndSvg(): void
    {
        $this->assertRefused(Images::gif(Images::solid(8, 8)), 'unsupported_format', ['format' => 'GIF']);
        $this->assertRefused('GIF87a' . str_repeat("\0", 32), 'unsupported_format', ['format' => 'GIF']);
        $this->assertRefused("II*\0" . str_repeat("\0", 32), 'unsupported_format', ['format' => 'TIFF']);
        $this->assertRefused("MM\0*" . str_repeat("\0", 32), 'unsupported_format', ['format' => 'TIFF']);
    }

    public function testFindsSvgBehindPrologsWhitespaceAndABom(): void
    {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
        $variants = [
            'bare' => $svg,
            'upper case' => '<SVG xmlns="http://www.w3.org/2000/svg"/>',
            'xml prolog' => "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n$svg",
            'whitespace' => "\n\t  $svg",
            'BOM' => "\xEF\xBB\xBF$svg",
            'BOM, prolog, doctype, comment' => "\xEF\xBB\xBF <?xml version=\"1.0\"?>\n<!DOCTYPE svg>\n<!-- drawn by hand -->\n$svg",
        ];
        foreach ($variants as $label => $bytes) {
            $this->assertRefused($bytes, 'unsupported_format', ['format' => 'SVG'], $label);
        }
    }

    public function testSvgMustOpenWithATagAndShowItsRootEarly(): void
    {
        $this->assertRefused('hello <svg/>', 'unreadable');
        $this->assertRefused('<?xml version="1.0"?>' . str_repeat(' ', 1100) . '<svg/>', 'unreadable');
    }

    public function testAnythingElseIsUnreadable(): void
    {
        $this->assertRefused('', 'unreadable');
        $this->assertRefused('definitely not an image, just some text in a file', 'unreadable');
        $this->assertRefused("\0\0\0\x18ftyp", 'unreadable'); // too short to carry a brand
        $this->assertRefused(str_repeat("\x00", 100), 'unreadable');
    }

    public function testAKnownSignatureWithoutAReadableHeaderIsUnreadable(): void
    {
        $this->assertRefused("\xFF\xD8\xFF\xE0" . str_repeat("\0", 20), 'unreadable');
        $this->assertRefused("\x89PNG\r\n\x1a\n", 'unreadable');
        $this->assertRefused('RIFF' . pack('V', 4) . 'WEBP', 'unreadable');
    }

    /** @return iterable<string, array{string, bool}> */
    public static function pngAlphaMatrix(): iterable
    {
        yield 'grey' => [Images::pngHeader(0), false];
        yield 'RGB' => [Images::pngHeader(2), false];
        yield 'palette' => [Images::pngHeader(3, [['PLTE', "\xFF\0\0"]]), false];
        yield 'grey + alpha' => [Images::pngHeader(4), true];
        yield 'RGBA' => [Images::pngHeader(6), true];
        yield 'RGB + tRNS' => [Images::pngHeader(2, [['tRNS', "\0\0\0\0\0\0"]]), true];
        yield 'palette + tRNS' => [Images::pngHeader(3, [['PLTE', "\xFF\0\0"], ['tRNS', "\0"]]), true];
        yield 'tRNS after IDAT does not count' => [Images::pngHeader(2, [['IDAT', 'x'], ['tRNS', "\0\0\0\0\0\0"]]), false];
        yield 'chunk length past the end' => [Images::pngHeader(2) . pack('N', 0x7FFFFFFF) . 'tEXt', false];
    }

    #[DataProvider('pngAlphaMatrix')]
    public function testPngAlphaFollowsSharp(string $png, bool $alpha): void
    {
        self::assertSame($alpha, $this->sniffer->sniff($png)->hasAlpha);
    }

    public function testRealGdPngsFollowTheSameAlphaRule(): void
    {
        $opaque = Images::solid(16, 8);
        $see = Images::solid(16, 8, [10, 20, 30], 64);
        self::assertTrue($this->sniffer->sniff(Images::png($opaque, true))->hasAlpha, 'RGBA, every pixel opaque');
        self::assertTrue($this->sniffer->sniff(Images::png($see, true))->hasAlpha, 'RGBA, half transparent');
        self::assertFalse($this->sniffer->sniff(Images::png($opaque, false))->hasAlpha, 'RGB');
        self::assertTrue($this->sniffer->sniff(Images::palettePng(true))->hasAlpha, 'palette + tRNS');
        self::assertFalse($this->sniffer->sniff(Images::palettePng(false))->hasAlpha, 'palette');
        self::assertContains('tRNS', Images::pngChunkTypes(Images::palettePng(true)));
    }

    public function testWebpAlphaFollowsLibwebp(): void
    {
        $this->needsWebp();
        $opaque = Images::solid(16, 8);
        $see = Images::solid(16, 8, [10, 20, 30], 64);
        $cases = [
            'lossy, opaque' => [Images::webp($opaque), 'VP8 ', false],
            'lossy with alpha' => [Images::webp($see), 'VP8X', true],
            'lossless, opaque' => [Images::webp($opaque, true), 'VP8L', false],
            'lossless with alpha' => [Images::webp($see, true), 'VP8L', true],
        ];
        foreach ($cases as $label => [$bytes, $chunk, $alpha]) {
            self::assertSame($chunk, substr($bytes, 12, 4), $label);
            self::assertSame($alpha, $this->sniffer->sniff($bytes)->hasAlpha, $label);
        }
    }

    public function testWebpAlphaBitsAreReadExactly(): void
    {
        $this->needsWebp();
        // Flip only the bits the rule reads: the VP8X alpha flag and the VP8L alpha_is_used bit.
        $vp8x = Images::webp(Images::solid(16, 8, [10, 20, 30], 64));
        $vp8x[20] = chr(ord($vp8x[20]) & ~0x10);
        self::assertFalse($this->sniffer->sniff($vp8x)->hasAlpha, 'VP8X without the flag');

        $vp8l = Images::webp(Images::solid(16, 8), true);
        $vp8l[24] = chr(ord($vp8l[24]) | 0x10); // bit 28 of the little-endian word at 21–24
        self::assertTrue($this->sniffer->sniff($vp8l)->hasAlpha, 'VP8L with alpha_is_used');
    }

    private function needsWebp(): void
    {
        if ((imagetypes() & IMG_WEBP) === 0) {
            self::markTestSkipped('This GD build has no WebP support.');
        }
    }
}
