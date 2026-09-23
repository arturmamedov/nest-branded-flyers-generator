<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Support;

use FilesystemIterator;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;

/**
 * A scratch folder under sys_get_temp_dir(), never inside the repo (Laragon's
 * Apache serves the repo, so test data there would be public).
 *
 *     $dir = TempDir::create('store');   // …/nest-flyers-store-<random>
 *     TempDir::remove($dir);             // in tearDown
 */
final class TempDir
{
    /** A new, empty folder. Forward slashes, no trailing slash. */
    public static function create(string $label = 'test'): string
    {
        $base = rtrim(str_replace('\\', '/', sys_get_temp_dir()), '/');
        $dir = $base . '/nest-flyers-' . $label . '-' . bin2hex(random_bytes(6));
        if (!mkdir($dir, 0775, true)) {
            throw new RuntimeException("Cannot create the temp folder $dir");
        }
        return $dir;
    }

    /** Deletes the folder and everything in it. Missing folders are fine (a test may have removed it). */
    public static function remove(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        $items = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST,
        );
        foreach ($items as $item) {
            /** @var \SplFileInfo $item */
            $path = $item->getPathname();
            $item->isDir() && !$item->isLink() ? rmdir($path) : unlink($path);
        }
        rmdir($dir);
    }

    /**
     * Every file under $dir, as forward-slash paths relative to it, sorted.
     * @return list<string>
     */
    public static function files(string $dir): array
    {
        $files = [];
        $items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
        foreach ($items as $item) {
            /** @var \SplFileInfo $item */
            if ($item->isFile()) {
                $files[] = str_replace('\\', '/', substr($item->getPathname(), strlen($dir) + 1));
            }
        }
        sort($files, SORT_STRING);
        return $files;
    }
}
