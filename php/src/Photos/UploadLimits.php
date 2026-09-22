<?php

declare(strict_types=1);

namespace NestFlyers\Photos;

use NestFlyers\Shared;

/**
 * The upload limits PHP itself enforces, read from php.ini, and the one number
 * the API promises (limits.maxUploadBytes in /api/config): the smallest of the
 * shared 15 MiB, upload_max_filesize, and post_max_size minus room for the rest
 * of the multipart body. The browser shrinks photos to fit it before uploading,
 * so on a host with a 2 MB limit staff still get their photo in.
 */
final class UploadLimits
{
    /** Multipart boundaries, part headers and any other fields share post_max_size with the file. */
    public const POST_OVERHEAD_BYTES = 64 * 1024;

    public function __construct(
        private readonly int $sharedMaxBytes,
        private readonly string $uploadMaxFilesize,
        private readonly string $postMaxSize,
        private readonly string $memoryLimit,
    ) {
    }

    public static function fromIni(Shared $shared): self
    {
        return new self(
            $shared->maxUploadBytes(),
            (string) ini_get('upload_max_filesize'),
            (string) ini_get('post_max_size'),
            (string) ini_get('memory_limit'),
        );
    }

    /** The largest photo this backend accepts, in bytes; always positive, because the shared limit always applies. */
    public function maxUploadBytes(): int
    {
        $limits = [$this->sharedMaxBytes];
        $upload = self::parseQuantity($this->uploadMaxFilesize);
        if ($upload > 0) {
            $limits[] = $upload;
        }
        $post = $this->postMaxBytes();
        if ($post !== null) {
            // A post_max_size at or under the overhead leaves no room for a file; 1 byte keeps the promise honest
            // (every photo is refused as too large) without turning into "0 = unlimited".
            $limits[] = max(1, $post - self::POST_OVERHEAD_BYTES);
        }
        return min($limits);
    }

    /** post_max_size in bytes, or null when PHP doesn't limit the body (0 or less). */
    public function postMaxBytes(): ?int
    {
        $post = self::parseQuantity($this->postMaxSize);
        return $post > 0 ? $post : null;
    }

    /** memory_limit in bytes, or null for -1 (no limit). */
    public function memoryLimitBytes(): ?int
    {
        $memory = self::parseQuantity($this->memoryLimit);
        return $memory < 0 ? null : $memory;
    }

    /**
     * The raw ini strings, for /api/config's server diagnostics.
     *
     * @return array{upload_max_filesize:string, post_max_size:string, memory_limit:string}
     */
    public function diagnostics(): array
    {
        return [
            'upload_max_filesize' => $this->uploadMaxFilesize,
            'post_max_size' => $this->postMaxSize,
            'memory_limit' => $this->memoryLimit,
        ];
    }

    /**
     * A php.ini size ("2M", "512k", "1G", "8388608", "-1") in bytes, read the way
     * PHP reads it: a decimal integer, optionally followed by K, M or G as the last
     * character (case-insensitive, powers of 1024). An unknown last character is
     * ignored and anything unparseable is 0, which is what PHP falls back to too.
     * Written here because ini_parse_quantity only exists from PHP 8.2.
     */
    public static function parseQuantity(string $value): int
    {
        $value = trim($value);
        if (preg_match('/^([+-]?\d+)\s*([kmg])?$/i', $value, $m) !== 1) {
            return preg_match('/^[+-]?\d+/', $value, $digits) === 1 ? (int) $digits[0] : 0;
        }
        $shift = match (strtolower($m[2] ?? '')) {
            'k' => 10,
            'm' => 20,
            'g' => 30,
            default => 0,
        };
        return (int) $m[1] << $shift;
    }
}
