<?php

declare(strict_types=1);

namespace NestFlyers\Photos;

use Closure;
use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\HttpError;
use NestFlyers\Http\Request;
use NestFlyers\Image\ImageProcessor;
use NestFlyers\Image\ImageSniffer;
use NestFlyers\Image\StoredImage;
use RuntimeException;

/**
 * The photo intake, written once for both routes that take a picture (docs/api-contract.md, "Photos"): the upload
 * handling multer does in Node, the checks, and the preparing. Checks run in the order the contract lists: size (as
 * PHP reports it, then ours), then what the bytes are, then whether this host can afford to decode them.
 * `POST api/photos` then stores the prepared picture (PhotoService); the AI's picture read prepares at its own edge
 * and never writes to uploads/. The twin of photoUpload, uploadedPhoto() and preparePhoto() in
 * server/services/photos.ts.
 */
final class PhotoIntake
{
    /** The multipart field both routes read the picture from. */
    public const FIELD = 'photo';

    /** What the rest of the request may still allocate once the photo is encoded: the store's JSON, the answer. */
    private const MEMORY_HEADROOM_BYTES = 2 * 1024 * 1024;

    /** @var Closure(): ?int */
    private readonly Closure $freeMemory;

    /**
     * @param (callable(): ?int)|null $freeMemory bytes PHP may still allocate, null for no limit; defaults to
     *        memory_limit minus what the request already holds (tests pass a tiny budget)
     */
    public function __construct(
        private readonly ImageSniffer $sniffer,
        private readonly ImageProcessor $processor,
        private readonly UploadLimits $limits,
        private readonly ErrorCatalog $errors,
        ?callable $freeMemory = null,
    ) {
        $this->freeMemory = $freeMemory !== null ? Closure::fromCallable($freeMemory) : function (): ?int {
            $limit = $this->limits->memoryLimitBytes();
            // memory_limit is enforced on the memory PHP has reserved from the system (true), not on what is in use.
            return $limit === null ? null : $limit - memory_get_usage(true);
        };
    }

    /**
     * The upload in field "photo", checked and prepared: upright, its long edge at most $maxEdge (never enlarged),
     * metadata stripped, PNG when it has an alpha channel, else JPEG at $jpegQuality. Nothing is written.
     *
     * @throws HttpError too_large, no_photo_field, malformed, heic, unsupported_format, unreadable, too_many_pixels
     */
    public function prepare(Request $request, int $maxEdge, int $jpegQuality): StoredImage
    {
        $bytes = $this->readUpload($request);
        $info = $this->sniffer->sniff($bytes);

        $free = ($this->freeMemory)();
        if ($free !== null && $this->processor->peakMemoryBytes($info, $maxEdge) + self::MEMORY_HEADROOM_BYTES > $free) {
            throw $this->errors->make('too_many_pixels');
        }

        $image = $this->processor->process($bytes, $info, $maxEdge, $jpegQuality);
        unset($bytes); // the upload can go before the picture is written, recorded or sent
        return $image ?? throw $this->errors->make('unreadable');
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
}
