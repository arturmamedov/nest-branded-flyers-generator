<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Photos;

use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\HttpError;
use NestFlyers\Http\Request;
use NestFlyers\Image\ImageProcessorFactory;
use NestFlyers\Image\ImageSniffer;
use NestFlyers\Photos\PhotoIntake;
use NestFlyers\Photos\UploadLimits;
use NestFlyers\Shared;
use NestFlyers\Tests\Image\Images;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Tests\Support\TempDir;
use PHPUnit\Framework\TestCase;

/**
 * The photo intake, written once for both routes that take a picture (docs/api-contract.md, "Photos"): the upload as
 * PHP hands it over, its checks in their order with their messages, and the preparing at the edge the route asks for.
 * `POST api/photos` then stores the picture (PhotoService); the AI's picture read prepares at its own edge and stores
 * nothing in uploads/. The twin of preparePhoto() in server/services/photos.ts. What the route answers over HTTP is
 * the contract suite's (tests/contract/photos.test.ts).
 */
final class PhotoIntakeTest extends TestCase
{
    private Shared $shared;
    private ErrorCatalog $errors;
    private string $dir;

    protected function setUp(): void
    {
        if (!extension_loaded('gd')) {
            self::markTestSkipped('The sample images are drawn with GD.');
        }
        $this->shared = Shared::fromFile(Paths::schema('shared.json'));
        $this->errors = ErrorCatalog::fromShared($this->shared);
        $this->dir = TempDir::create('intake');
    }

    protected function tearDown(): void
    {
        if (isset($this->dir)) {
            TempDir::remove($this->dir);
        }
    }

    public function testItShrinksToTheEdgeItIsGivenAndStoresNothing(): void
    {
        $image = $this->intake()->prepare($this->upload(Images::jpeg(Images::solid(400, 200))), 100, 88);
        self::assertSame([100, 50, 'jpg'], [$image->width, $image->height, $image->extension]);
        self::assertSame([100, 50], array_slice((array) getimagesizefromstring($image->bytes), 0, 2));
        self::assertSame(['upload'], array_values(array_diff((array) scandir($this->dir), ['.', '..'])), 'nothing but the upload itself is on disk');
    }

    public function testItNeverEnlargesATinyPicture(): void
    {
        $image = $this->intake()->prepare($this->upload(Images::png(Images::solid(12, 8), false)), 2048, 88);
        self::assertSame([12, 8], [$image->width, $image->height]);
    }

    public function testItIsAPngWhenThePictureHasAnAlphaChannelElseAJpeg(): void
    {
        $alpha = $this->intake()->prepare($this->upload(Images::png(Images::solid(16, 16, gdAlpha: 60), true)), 2048, 88);
        self::assertSame('png', $alpha->extension);
        $opaque = $this->intake()->prepare($this->upload(Images::png(Images::solid(16, 16), false)), 2048, 88);
        self::assertSame('jpg', $opaque->extension);
    }

    public function testItMakesThePhotoRoutesChecksInTheirOrderWithItsMessages(): void
    {
        $intake = $this->intake();
        $mb = ['mb' => ErrorCatalog::formatMb(2 * 1024 * 1024)];
        $this->assertRefused(fn () => $intake->prepare($this->request([]), 2048, 88), 'no_photo_field');
        $this->assertRefused(fn () => $intake->prepare($this->request(['photo' => ['error' => UPLOAD_ERR_NO_FILE]]), 2048, 88), 'no_photo_field');
        $this->assertRefused(fn () => $intake->prepare($this->request(['photo' => ['error' => UPLOAD_ERR_INI_SIZE]]), 2048, 88), 'too_large', $mb);
        $this->assertRefused(fn () => $intake->prepare($this->request(['photo' => ['error' => UPLOAD_ERR_PARTIAL]]), 2048, 88), 'malformed');
        // Over post_max_size PHP drops the whole body: the request looks empty.
        $this->assertRefused(fn () => $intake->prepare($this->request([], (string) (9 * 1024 * 1024)), 2048, 88), 'too_large', $mb);
        $this->assertRefused(fn () => $intake->prepare($this->upload(str_repeat('x', 2 * 1024 * 1024 + 1)), 2048, 88), 'too_large', $mb);
        $this->assertRefused(fn () => $intake->prepare($this->upload("\0\0\0\x18ftypheic" . str_repeat("\0", 64)), 2048, 88), 'heic');
        $this->assertRefused(fn () => $intake->prepare($this->upload(Images::gif(Images::solid(8, 8))), 2048, 88), 'unsupported_format', ['format' => 'GIF']);
        $this->assertRefused(fn () => $intake->prepare($this->upload('not an image'), 2048, 88), 'unreadable');
        // The order, with two faults at once: its size before what it is, and what it is before what it would cost.
        $this->assertRefused(fn () => $intake->prepare($this->upload(str_repeat('not an image ', 200_000)), 2048, 88), 'too_large', $mb);
        $tight = $this->intake(static fn (): int => 1024);
        $this->assertRefused(fn () => $tight->prepare($this->upload("\0\0\0\x18ftypheic" . str_repeat("\0", 64)), 2048, 88), 'heic');
        $this->assertRefused(fn () => $tight->prepare($this->upload('not an image'), 2048, 88), 'unreadable');
    }

    public function testAPictureThisHostCannotAffordToDecodeIsTooManyPixels(): void
    {
        $tight = $this->intake(static fn (): int => 1024);
        $this->assertRefused(fn () => $tight->prepare($this->upload(Images::jpeg(Images::solid(400, 200))), 2048, 88), 'too_many_pixels');
        $roomy = $this->intake(static fn (): ?int => null);
        self::assertSame(400, $roomy->prepare($this->upload(Images::jpeg(Images::solid(400, 200))), 2048, 88)->width);
    }

    /** @param (callable(): ?int)|null $freeMemory */
    private function intake(?callable $freeMemory = null): PhotoIntake
    {
        return new PhotoIntake(
            new ImageSniffer($this->shared, $this->errors),
            ImageProcessorFactory::create('gd'),
            new UploadLimits($this->shared->maxUploadBytes(), '2M', '8M', '128M'),
            $this->errors,
            $freeMemory,
        );
    }

    /** A request whose "photo" field holds these bytes, as PHP would hand it over. */
    private function upload(string $bytes): Request
    {
        $tmp = "$this->dir/upload";
        file_put_contents($tmp, $bytes);
        clearstatcache(); // one test uploads several files under this name, and PHP remembers a file's size
        return $this->request(['photo' => ['name' => 'photo', 'type' => 'application/octet-stream', 'tmp_name' => $tmp, 'error' => UPLOAD_ERR_OK, 'size' => strlen($bytes)]]);
    }

    /** @param array<string, mixed> $files */
    private function request(array $files, string $contentLength = '500'): Request
    {
        return new Request('POST', '/api/anything', [], ['content-type' => 'multipart/form-data; boundary=x', 'content-length' => $contentLength], '', $files, ['CONTENT_LENGTH' => $contentLength]);
    }

    /** @param array<string, string> $vars */
    private function assertRefused(callable $act, string $key, array $vars = []): void
    {
        $expected = $this->errors->make($key, $vars);
        try {
            $act();
            self::fail("Expected $key");
        } catch (HttpError $e) {
            self::assertSame([$expected->status, $expected->errorCode, $expected->getMessage()], [$e->status, $e->errorCode, $e->getMessage()], $key);
        }
    }
}
