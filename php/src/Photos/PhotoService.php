<?php

declare(strict_types=1);

namespace NestFlyers\Photos;

use LogicException;
use NestFlyers\Domain\Clock;
use NestFlyers\Domain\PhotoRepository;
use NestFlyers\Http\HttpError;
use NestFlyers\Http\Request;
use NestFlyers\Shared;
use RuntimeException;
use Throwable;

/**
 * POST api/photos: the PHP twin of processPhoto() in server/services/photos.ts. The upload, its checks and the
 * preparing are PhotoIntake's, which the AI's picture read uses too; this stores the prepared picture in uploads/
 * and records it.
 */
final class PhotoService
{
    private const RENAME_ATTEMPTS = 10;
    private const RENAME_RETRY_MICROSECONDS = 20_000;

    private readonly string $uploadsDir;

    /** @param string $uploadsDir <appRoot>/uploads, where stored paths ("uploads/YYYY/MM/…") point */
    public function __construct(
        private readonly PhotoRepository $photos,
        private readonly PhotoIntake $intake,
        private readonly Shared $shared,
        private readonly Clock $clock,
        string $uploadsDir,
    ) {
        $this->uploadsDir = rtrim(str_replace('\\', '/', $uploadsDir), '/');
    }

    /**
     * Stores the upload in field "photo" and records it.
     *
     * @return array{id:int, path:string, width:int, height:int, createdAt:string}
     * @throws HttpError too_large, no_photo_field, malformed, heic, unsupported_format, unreadable, too_many_pixels
     */
    public function store(Request $request): array
    {
        $image = $this->intake->prepare($request, $this->shared->maxPhotoEdge(), $this->shared->photoJpegQuality());

        [$file, $path] = $this->newName($image->extension);
        $this->writeNew($file, $image->bytes);
        try {
            return $this->photos->insert($path, $image->width, $image->height);
        } catch (Throwable $e) {
            @unlink($file); // an unrecorded photo is litter nobody can reach or clean up
            throw $e;
        }
    }

    /**
     * A fresh, unguessable name in this UTC month's folder.
     *
     * @return array{0:string, 1:string} the file on disk and the stored path ("uploads/2026/09/<16 hex>.jpg")
     */
    private function newName(string $extension): array
    {
        $now = $this->clock->now();
        if (preg_match('/^(\d{4})-(\d{2})-/', $now, $m) !== 1) {
            throw new LogicException("The clock gave \"$now\", not an ISO timestamp.");
        }
        $month = "$m[1]/$m[2]";
        $dir = "$this->uploadsDir/$month";
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException("Cannot create the photo folder $dir.");
        }
        do {
            $name = bin2hex(random_bytes(8)) . '.' . $extension;
        } while (file_exists("$dir/$name")); // 2⁻⁶⁴ odds, but a clash would silently replace someone's photo

        $path = $this->shared->uploadsDir() . "/$month/$name";
        if (preg_match($this->shared->photoPathPattern(), $path) !== 1) {
            throw new LogicException("$path does not match the stored photo path pattern.");
        }
        return ["$dir/$name", $path];
    }

    /**
     * Writes next to the target, then renames: the web server serves uploads/
     * directly, so it must never see half a photo, and a crash leaves only a
     * .tmp file, which uploads/.htaccess refuses to serve.
     */
    private function writeNew(string $file, string $bytes): void
    {
        $temp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
        try {
            if (@file_put_contents($temp, $bytes, LOCK_EX) !== strlen($bytes)) {
                throw new RuntimeException("Cannot write the photo $temp (disk full?).");
            }
            // Windows refuses a rename while a scanner or indexer holds the new file for a moment.
            for ($attempt = 1; !@rename($temp, $file); $attempt++) {
                if ($attempt >= self::RENAME_ATTEMPTS) {
                    throw new RuntimeException("Cannot move the photo into place at $file.");
                }
                usleep(self::RENAME_RETRY_MICROSECONDS);
            }
        } catch (Throwable $e) {
            @unlink($temp);
            throw $e;
        }
    }
}
