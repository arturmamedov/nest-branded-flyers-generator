<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use Closure;
use DateTimeImmutable;
use DateTimeZone;
use NestFlyers\Shared;
use RuntimeException;
use Throwable;

/**
 * The kept pictures as files: <data folder>/ai-pictures/<Canary day>/<16 hex>.jpg|png. The folder's name, the marker's
 * and the days are shared facts (STORAGE_FILES and AI_PICTURE_DAYS in src/shared/). The twin of createFileAiPictures()
 * in server/ai/pictures.ts.
 */
final class FileAiPictures implements AiPictures
{
    /** A day's folder, and nothing more: `\z`, since `$` also matches before a last line break. */
    public const DAY = '/^\d{4}-\d{2}-\d{2}\z/';

    /** The folder's name, as stored paths start ("ai-pictures"). */
    private readonly string $name;
    private readonly string $dir;
    /**
     * What the folder remembers the last sweep's day in. Every PHP request is a new process, so without it each visit
     * would walk the folder again.
     */
    private readonly string $marker;
    private readonly int $days;
    /** @var Closure(string): void */
    private readonly Closure $remove;

    /**
     * @param string $dataDir absolute; comes down from the composition root
     * @param (callable(string): void)|null $remove deletes one day's folder; the tests hand in one that fails
     */
    public function __construct(string $dataDir, Shared $shared, ?callable $remove = null)
    {
        $files = $shared->storageFiles();
        $this->name = $files['aiPicturesDir'];
        $this->dir = rtrim(str_replace('\\', '/', $dataDir), '/') . '/' . $this->name;
        $this->marker = $this->dir . '/' . $files['aiPicturesSwept'];
        $this->days = $shared->ai()['pictureDays'];
        $this->remove = $remove !== null ? Closure::fromCallable($remove) : self::remove(...);
    }

    public function keep(string $day, #[\SensitiveParameter] string $bytes, string $extension): string
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
            if (is_file($this->marker) && @file_get_contents($this->marker) === $today) {
                return;
            }
            $oldest = self::daysBefore($today, $this->days);
            $stuck = [];
            // Only a day's folder is ever deleted: whatever else someone put here is theirs, and a link is no folder.
            foreach (self::entries($this->dir) as $entry) {
                $path = "$this->dir/$entry";
                if (is_link($path) || !is_dir($path) || preg_match(self::DAY, $entry) !== 1 || strcmp($entry, $oldest) >= 0) {
                    continue;
                }
                // One day that will not go must not keep the others, or the marker: the next try is tomorrow's.
                try {
                    ($this->remove)($path);
                } catch (Throwable $e) {
                    $stuck[] = "$entry ({$e->getMessage()})";
                }
            }
            if (@file_put_contents($this->marker, $today) === false) {
                throw new RuntimeException("cannot write $this->marker");
            }
            if ($stuck !== []) {
                error_log("Nest flyers: AI: the kept pictures in $this->name/ could not all be cleaned up: " . implode('; ', $stuck));
            }
        } catch (Throwable $e) {
            // Only when the folder cannot be listed or its marker written: said on every visit until it is mended,
            // since no request remembers the last one's log line.
            error_log("Nest flyers: AI: the kept pictures in $this->name/ could not be cleaned up: {$e->getMessage()}");
        }
    }

    /** The day $days before this one, both YYYY-MM-DD: plain calendar arithmetic, no zone in it. */
    private static function daysBefore(string $day, int $days): string
    {
        return (new DateTimeImmutable($day, new DateTimeZone('UTC')))->modify("-$days days")->format('Y-m-d');
    }

    /**
     * What a folder holds. A folder that cannot be listed is an error here: scandir's `false`, cast to a list, would
     * read as one entry with no name, which is the folder itself.
     *
     * @return list<string>
     */
    private static function entries(string $dir): array
    {
        $entries = @scandir($dir);
        if ($entries === false) {
            throw new RuntimeException("cannot list $dir");
        }
        return array_values(array_diff($entries, ['.', '..']));
    }

    /** Deletes a day's folder and what it holds. A link is unlinked, never followed. */
    private static function remove(string $dir): void
    {
        foreach (self::entries($dir) as $entry) {
            $path = "$dir/$entry";
            if (is_dir($path) && !is_link($path)) {
                self::remove($path);
            } elseif (!@unlink($path) && !@rmdir($path)) { // Windows removes a link to a folder as a folder
                throw new RuntimeException("cannot delete $path");
            }
        }
        if (!@rmdir($dir)) {
            throw new RuntimeException("cannot delete $dir");
        }
    }
}
