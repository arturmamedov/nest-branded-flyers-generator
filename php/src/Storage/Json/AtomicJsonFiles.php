<?php

declare(strict_types=1);

namespace NestFlyers\Storage\Json;

use InvalidArgumentException;
use JsonException;
use NestFlyers\Domain\JsonFiles;
use NestFlyers\Json;
use RuntimeException;
use Throwable;

/**
 * JSON documents under one folder, replaced atomically: a reader (or a crash)
 * sees the old file or the new one, never half of one. Never locks; the
 * caller holds the store's Lock.
 */
final class AtomicJsonFiles implements JsonFiles
{
    /**
     * Windows refuses to replace a file another process holds open (antivirus,
     * the search indexer, backup tools), usually for a few milliseconds, so a
     * failed rename is retried briefly before it counts as an error.
     */
    private const RENAME_ATTEMPTS = 10;
    private const RENAME_RETRY_MICROSECONDS = 20_000;

    private readonly string $root;

    /** @param string $root the store's folder; created on the first write when missing */
    public function __construct(string $root)
    {
        $this->root = rtrim(str_replace('\\', '/', $root), '/');
    }

    public function read(string $relativePath): mixed
    {
        $path = $this->path($relativePath);
        error_clear_last();
        $json = @file_get_contents($path);
        if ($json === false) {
            // PHP never caches a missing file's stat, but it may cache an existing one's.
            clearstatcache(true, $path);
            if (!file_exists($path)) {
                return null;
            }
            throw new RuntimeException("Cannot read $path: " . self::lastError());
        }
        try {
            return Json::decode($json);
        } catch (JsonException $e) {
            throw new RuntimeException("$path is not valid JSON: {$e->getMessage()}", 0, $e);
        }
    }

    public function write(string $relativePath, mixed $value): void
    {
        // Encode before touching the disk: a value that can't be encoded (INF, broken UTF-8) throws here and the
        // old file stays exactly as it was.
        $json = Json::encode($value, true);
        $path = $this->path($relativePath);
        $dir = dirname($path);
        self::ensureDir($dir);

        // Same folder as the target, so the rename never crosses a filesystem (which would make it a copy). The
        // leading dot keeps it out of casual listings; the random part keeps concurrent writers apart.
        $temp = $dir . '/.' . basename($path) . '.' . bin2hex(random_bytes(8)) . '.tmp';
        try {
            self::writeNew($temp, $json);
            self::replace($temp, $path);
        } catch (Throwable $e) {
            @unlink($temp);
            throw $e;
        }
    }

    public function exists(string $relativePath): bool
    {
        $path = $this->path($relativePath);
        clearstatcache(true, $path);
        return is_file($path);
    }

    /** Paths are built by the store itself; refusing absolute and ".." paths keeps a bug from writing outside it. */
    private function path(string $relativePath): string
    {
        $relative = str_replace('\\', '/', $relativePath);
        if (
            $relative === ''
            || $relative[0] === '/'
            || preg_match('~^[A-Za-z]:~', $relative) === 1
            || preg_match('~(^|/)\.\.?(/|$)~', $relative) === 1
        ) {
            throw new InvalidArgumentException("Not a path inside the store: $relativePath");
        }
        return $this->root . '/' . $relative;
    }

    private static function ensureDir(string $dir): void
    {
        // A concurrent request may create it between the check and mkdir, hence the second is_dir.
        error_clear_last();
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException("Cannot create the folder $dir: " . self::lastError());
        }
    }

    private static function writeNew(string $path, string $contents): void
    {
        // 'x' fails if the name exists, so a temp name is never shared with another writer.
        error_clear_last();
        $handle = @fopen($path, 'xb');
        if ($handle === false) {
            throw new RuntimeException("Cannot create $path: " . self::lastError());
        }
        try {
            $written = 0;
            while ($written < strlen($contents)) {
                $chunk = fwrite($handle, substr($contents, $written));
                if ($chunk === false || $chunk === 0) {
                    throw new RuntimeException("Cannot write $path (disk full?): " . self::lastError());
                }
                $written += $chunk;
            }
            if (!fflush($handle)) {
                throw new RuntimeException("Cannot write $path: " . self::lastError());
            }
            // Best effort: flush to the disk before the rename makes the file live, so a power cut can't leave an
            // empty file behind. Some network filesystems refuse fsync; the rename is still atomic for PHP's crashes.
            @fsync($handle);
        } finally {
            fclose($handle);
        }
    }

    private static function replace(string $temp, string $path): void
    {
        for ($attempt = 1; ; $attempt++) {
            error_clear_last();
            if (@rename($temp, $path)) {
                return;
            }
            if ($attempt >= self::RENAME_ATTEMPTS) {
                throw new RuntimeException("Cannot replace $path: " . self::lastError());
            }
            usleep(self::RENAME_RETRY_MICROSECONDS);
        }
    }

    private static function lastError(): string
    {
        return error_get_last()['message'] ?? 'unknown error';
    }
}
