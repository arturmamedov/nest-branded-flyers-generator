<?php

declare(strict_types=1);

namespace NestFlyers\Photos;

use Closure;
use LogicException;
use NestFlyers\Domain\Clock;
use NestFlyers\Domain\PhotoRepository;
use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\HttpError;
use NestFlyers\Http\Request;
use NestFlyers\Image\ImageProcessor;
use NestFlyers\Image\ImageSniffer;
use NestFlyers\Shared;
use RuntimeException;
use Throwable;

/**
 * POST api/photos: the PHP twin of processPhoto() in server/services/photos.ts
 * plus the upload handling multer does there. Checks run in the order
 * docs/api-contract.md lists: size (as PHP reports it, then ours), then what the
 * bytes are, then whether this host can afford to decode them.
 */
final class PhotoService
{
    public const FIELD = 'photo';

    /** What the rest of the request may still allocate once the photo is encoded: the store's JSON, the answer. */
    private const MEMORY_HEADROOM_BYTES = 2 * 1024 * 1024;

    private const RENAME_ATTEMPTS = 10;
    private const RENAME_RETRY_MICROSECONDS = 20_000;

    /** @var Closure(): ?int */
    private readonly Closure $freeMemory;

    private readonly string $uploadsDir;

    /**
     * @param string $uploadsDir <appRoot>/uploads, where stored paths ("uploads/YYYY/MM/…") point
     * @param (callable(): ?int)|null $freeMemory bytes PHP may still allocate, null for no limit; defaults to
     *        memory_limit minus what the request already holds (tests pass a tiny budget)
     */
    public function __construct(
        private readonly PhotoRepository $photos,
        private readonly ImageSniffer $sniffer,
        private readonly ImageProcessor $processor,
        private readonly UploadLimits $limits,
        private readonly ErrorCatalog $errors,
        private readonly Shared $shared,
        private readonly Clock $clock,
        string $uploadsDir,
        ?callable $freeMemory = null,
    ) {
        $this->uploadsDir = rtrim(str_replace('\\', '/', $uploadsDir), '/');
        $this->freeMemory = $freeMemory !== null ? Closure::fromCallable($freeMemory) : function (): ?int {
            $limit = $this->limits->memoryLimitBytes();
            // memory_limit is enforced on the memory PHP has reserved from the system (true), not on what is in use.
            return $limit === null ? null : $limit - memory_get_usage(true);
        };
    }

    /**
     * Stores the upload in field "photo" and records it.
     *
     * @return array{id:int, path:string, width:int, height:int, createdAt:string}
     * @throws HttpError too_large, no_photo_field, malformed, heic, unsupported_format, unreadable, too_many_pixels
     */
    public function store(Request $request): array
    {
        $bytes = $this->readUpload($request);
        $info = $this->sniffer->sniff($bytes);

        $maxEdge = $this->shared->maxPhotoEdge();
        $free = ($this->freeMemory)();
        if ($free !== null && $this->processor->peakMemoryBytes($info, $maxEdge) + self::MEMORY_HEADROOM_BYTES > $free) {
            throw $this->errors->make('too_many_pixels');
        }

        $image = $this->processor->process($bytes, $info, $maxEdge, $this->shared->photoJpegQuality());
        unset($bytes); // the upload can go before the file is written and recorded
        if ($image === null) {
            throw $this->errors->make('unreadable');
        }

        [$file, $path] = $this->newName($image->extension);
        $this->writeNew($file, $image->bytes);
        try {
            return $this->photos->insert($path, $image->width, $image->height);
        } catch (Throwable $e) {
            @unlink($file); // an unrecorded photo is litter nobody can reach or clean up
            throw $e;
        }
    }

    /** The uploaded file's bytes, after every size and presence check. */
    private function readUpload(Request $request): string
    {
        $maxBytes = $this->limits->maxUploadBytes();
        $tooLarge = fn (): HttpError => $this->errors->make('too_large', ['mb' => ErrorCatalog::formatMb($maxBytes)]);

        // Over post_max_size PHP drops the whole body, so the request looks empty rather than failing.
        $postMax = $this->limits->postMaxBytes();
        $contentLength = (int) ($request->server['CONTENT_LENGTH'] ?? $request->header('content-length') ?? 0);
        if ($request->method === 'POST' && $postMax !== null && $contentLength > $postMax
            && $request->files === [] && $request->post === []) {
            throw $tooLarge();
        }

        $upload = $request->files[self::FIELD] ?? null;
        // "photo[]" arrives as arrays of names and errors: not the single file the contract asks for.
        if (!is_array($upload) || !is_int($upload['error'] ?? null)) {
            throw $this->errors->make('no_photo_field');
        }
        switch ($upload['error']) {
            case UPLOAD_ERR_OK:
                break;
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                throw $tooLarge();
            case UPLOAD_ERR_NO_FILE:
                throw $this->errors->make('no_photo_field');
            case UPLOAD_ERR_PARTIAL:
                throw $this->errors->make('malformed'); // the client stopped sending half way
            default:
                // No temp folder, a failed write, an extension veto: the host's problem, logged as a 500.
                throw new RuntimeException("The photo upload failed on the server (PHP upload error {$upload['error']}).");
        }

        // Only PHP fills $_FILES (it can't come from the request since register_globals is gone), so tmp_name is
        // trusted; is_uploaded_file() would also refuse the files tests hand in.
        $tmp = $upload['tmp_name'] ?? null;
        if (!is_string($tmp) || $tmp === '' || !is_file($tmp)) {
            throw new RuntimeException('The photo upload has no temporary file.');
        }
        $size = filesize($tmp);
        if ($size === false) {
            throw new RuntimeException("Cannot read the size of the uploaded photo $tmp.");
        }
        if ($size > $maxBytes) {
            throw $tooLarge();
        }
        $bytes = @file_get_contents($tmp);
        if ($bytes === false) {
            throw new RuntimeException("Cannot read the uploaded photo $tmp.");
        }
        return $bytes;
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
