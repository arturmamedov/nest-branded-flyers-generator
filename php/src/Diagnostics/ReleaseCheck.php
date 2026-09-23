<?php

declare(strict_types=1);

namespace NestFlyers\Diagnostics;

use Throwable;

/**
 * The app folder against the release.json it shipped with (scripts/php/manifest.ts):
 * which shipped files are missing or differ. It is the one upload failure that
 * announces nothing: an FTP client that hid the dotfiles leaves a working app
 * whose data/ is downloadable. Files the release never carries (config.php, the
 * library, photos) are not its business.
 *
 * The preflight page (php/preflight/nest-preflight.php) must answer before the
 * app exists, so it carries its own copy of this comparison;
 * tests/Diagnostics/ReleaseCheckContractTestCase.php holds the two to one verdict.
 */
final class ReleaseCheck
{
    public const FILE = 'release.json';

    /** The one shipped file the owner is told to edit: the lock block is pasted at the top of the root .htaccess. */
    public const EDITABLE_TOP = '.htaccess';

    /**
     * @return array{manifest: string}|array{
     *     id: ?string, builtAt: ?string, commit: ?string,
     *     missing: list<string>, changed: list<string>, missingGuards: list<string>, htaccess: string
     * }
     */
    public static function run(string $appRoot): array
    {
        $file = $appRoot . '/' . self::FILE;
        if (!is_file($file)) {
            return ['manifest' => 'missing'];
        }
        try {
            $manifest = json_decode((string) file_get_contents($file), true, 64, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            return ['manifest' => 'unreadable: ' . $e->getMessage()];
        }
        if (!is_array($manifest) || !is_array($manifest['files'] ?? null)) {
            return ['manifest' => 'unreadable: no files list'];
        }

        $missing = [];
        $changed = [];
        $htaccess = 'missing';
        foreach ($manifest['files'] as $path => $entry) {
            if (!is_string($path) || !self::safe($path) || !is_array($entry)) {
                continue;
            }
            $actual = $appRoot . '/' . $path;
            if (!is_file($actual)) {
                $missing[] = $path;
                continue;
            }
            $bytes = (int) ($entry['bytes'] ?? -1);
            $sha256 = (string) ($entry['sha256'] ?? '');
            $same = filesize($actual) === $bytes && hash_file('sha256', $actual) === $sha256;
            if ($path === self::EDITABLE_TOP) {
                $htaccess = $same ? 'as shipped' : (self::endsWith($actual, $bytes, $sha256) ? 'block on top' : 'changed');
                if ($htaccess !== 'changed') {
                    continue;
                }
            }
            if (!$same) {
                $changed[] = $path;
            }
        }
        $guards = array_values(array_filter($manifest['guards'] ?? [], 'is_string'));
        return [
            'id' => is_string($manifest['id'] ?? null) ? $manifest['id'] : null,
            'builtAt' => is_string($manifest['builtAt'] ?? null) ? $manifest['builtAt'] : null,
            'commit' => is_string($manifest['commit'] ?? null) ? $manifest['commit'] : null,
            'missing' => $missing,
            'changed' => $changed,
            'missingGuards' => array_values(array_intersect($guards, $missing)),
            'htaccess' => $htaccess,
        ];
    }

    /** True when the file's last $bytes bytes are exactly the shipped file: something was added above it, nothing changed. */
    private static function endsWith(string $file, int $bytes, string $sha256): bool
    {
        $size = filesize($file);
        if ($bytes < 0 || $size === false || $size < $bytes) {
            return false;
        }
        $tail = file_get_contents($file, false, null, $size - $bytes, $bytes);
        return $tail !== false && hash('sha256', $tail) === $sha256;
    }

    /** A path the release could have shipped: relative, no "..", no drive or stream. The manifest is ours, but it is a file anyone with FTP can edit. */
    private static function safe(string $path): bool
    {
        return $path !== '' && $path[0] !== '/' && !str_contains($path, '\\') && !str_contains($path, ':')
            && !in_array('..', explode('/', $path), true);
    }
}
