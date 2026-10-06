<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use DateTimeImmutable;
use DateTimeZone;
use NestFlyers\Shared;
use RuntimeException;
use Throwable;

/**
 * The kept pictures as files: <data folder>/ai-pictures/<Canary day>/<16 hex>.jpg|png. The folder's name and the
 * days are shared facts (STORAGE_FILES and AI_PICTURE_DAYS in src/shared/). The twin of createFileAiPictures() in
 * server/ai/pictures.ts.
 */
final class FileAiPictures implements AiPictures
{
    /**
     * What the folder remembers the last sweep's day in. Every PHP request is a new process, so without it each visit
     * would walk the folder again.
     */
    private const SWEPT = '.swept';
    private const DAY = '/^\d{4}-\d{2}-\d{2}$/';

    /** The folder's name, as stored paths start ("ai-pictures"). */
    private readonly string $name;
    private readonly string $dir;
    private readonly int $days;

    /** @param string $dataDir absolute; comes down from the composition root */
    public function __construct(string $dataDir, Shared $shared)
    {
        $this->name = $shared->storageFiles()['aiPicturesDir'];
        $this->dir = rtrim(str_replace('\\', '/', $dataDir), '/') . '/' . $this->name;
        $this->days = $shared->ai()['pictureDays'];
    }

    public function keep(string $day, string $bytes, string $extension): string
    {
        $dir = "$this->dir/$day";
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException("Cannot create the kept pictures' folder $dir.");
        }
        $name = bin2hex(random_bytes(8)) . '.' . $extension;
        if (@file_put_contents("$dir/$name", $bytes, LOCK_EX) !== strlen($bytes)) {
            @unlink("$dir/$name");
            throw new RuntimeException("Cannot keep the picture $dir/$name (disk full?).");
        }
        return "$this->name/$day/$name";
    }

    public function sweep(string $today): void
    {
        try {
            // No folder: this site never read a picture, and a sweep must not be what makes one.
            if (!is_dir($this->dir)) {
                return;
            }
            $marker = $this->dir . '/' . self::SWEPT;
            if (is_file($marker) && @file_get_contents($marker) === $today) {
                return;
            }
            $oldest = self::daysBefore($today, $this->days);
            // Only a day's folder is ever deleted: whatever else someone put here is theirs.
            foreach (array_diff((array) scandir($this->dir), ['.', '..']) as $entry) {
                if (is_dir("$this->dir/$entry") && preg_match(self::DAY, (string) $entry) === 1 && strcmp((string) $entry, $oldest) < 0) {
                    self::remove("$this->dir/$entry");
                }
            }
            if (@file_put_contents($marker, $today) === false) {
                throw new RuntimeException("cannot write $marker");
            }
        } catch (Throwable $e) {
            // Said on every visit until it is mended, since no request remembers the last one's log line.
            error_log("Nest flyers: AI: the kept pictures in $this->name/ could not be cleaned up: {$e->getMessage()}");
        }
    }

    /** The day $days before this one, both YYYY-MM-DD: plain calendar arithmetic, no zone in it. */
    private static function daysBefore(string $day, int $days): string
    {
        return (new DateTimeImmutable($day, new DateTimeZone('UTC')))->modify("-$days days")->format('Y-m-d');
    }

    /** Deletes a day's folder and what it holds. */
    private static function remove(string $dir): void
    {
        foreach (array_diff((array) scandir($dir), ['.', '..']) as $entry) {
            $path = "$dir/$entry";
            if (is_dir($path)) {
                self::remove($path);
            } elseif (!@unlink($path)) {
                throw new RuntimeException("cannot delete $path");
            }
        }
        if (!@rmdir($dir)) {
            throw new RuntimeException("cannot delete $dir");
        }
    }
}
