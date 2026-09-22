<?php

declare(strict_types=1);

namespace NestFlyers;

use InvalidArgumentException;
use NestFlyers\Http\AccessRule;
use Throwable;

/**
 * config.php, the one file an admin edits (config.sample.php shows the shape),
 * checked and with its paths resolved. Anything unexpected makes the whole file
 * invalid, and the app then answers 503 not_configured: a half-understood
 * access rule must never open the API.
 */
final class Config
{
    public const FILE = 'config.php';

    /** Where the JSON store lives unless config.php says otherwise; the release's data/.htaccess denies it. */
    public const DEFAULT_DATA_DIR = 'data';

    private const KEYS = ['access', 'dataDir', 'storage', 'imageProcessor'];
    private const STORAGES = ['json'];
    private const IMAGE_PROCESSORS = ['auto', 'gd', 'imagick'];

    private function __construct(
        public readonly AccessRule $access,
        /** Absolute, forward slashes, no trailing slash, `.`/`..` resolved. */
        public readonly string $dataDir,
        /** 'json': the only driver PHP has; the Bootstrap picks the repositories by it. */
        public readonly string $storage,
        /** 'auto' | 'gd' | 'imagick' */
        public readonly string $imageProcessor,
    ) {
    }

    /**
     * Reads <appRoot>/config.php. null when there is none (a fresh install).
     *
     * @throws InvalidArgumentException when the file does not parse or return a valid array
     */
    public static function load(string $appRoot, ?string $documentRoot = null): ?self
    {
        $file = self::join($appRoot, self::FILE);
        if (!is_file($file)) {
            return null;
        }
        // Stray output (a UTF-8 BOM, whitespace before "<?php") would otherwise land in front of the JSON answer.
        ob_start();
        try {
            $raw = (static fn (string $path): mixed => require $path)($file);
        } catch (Throwable $e) {
            throw new InvalidArgumentException(self::FILE . ' could not be loaded: ' . $e->getMessage(), 0, $e);
        } finally {
            ob_end_clean();
        }
        return self::fromArray($raw, $appRoot, $documentRoot);
    }

    /**
     * @param mixed $raw what config.php returned
     * @throws InvalidArgumentException naming the offending key
     */
    public static function fromArray(mixed $raw, string $appRoot, ?string $documentRoot = null): self
    {
        if (!is_array($raw) || ($raw !== [] && array_is_list($raw))) {
            throw new InvalidArgumentException(self::FILE . ' must return an array (see config.sample.php)');
        }
        $unknown = array_diff(array_keys($raw), self::KEYS);
        if ($unknown !== []) {
            throw new InvalidArgumentException(self::FILE . ' has unknown keys: ' . implode(', ', $unknown));
        }
        $storage = $raw['storage'] ?? 'json';
        if (!in_array($storage, self::STORAGES, true)) {
            throw new InvalidArgumentException('storage must be one of: ' . implode(', ', self::STORAGES));
        }
        $imageProcessor = $raw['imageProcessor'] ?? 'auto';
        if (!in_array($imageProcessor, self::IMAGE_PROCESSORS, true)) {
            throw new InvalidArgumentException('imageProcessor must be one of: ' . implode(', ', self::IMAGE_PROCESSORS));
        }
        return new self(
            AccessRule::fromArray($raw['access'] ?? null),
            self::dataDir($raw['dataDir'] ?? null, $appRoot, $documentRoot),
            $storage,
            $imageProcessor,
        );
    }

    /**
     * null → <appRoot>/data; relative → against the app root (not the working
     * directory, which differs between Apache, FPM and php -S); absolute → as
     * given. Inside the app root only data/ (and below) is accepted: it is the
     * one folder the release denies over HTTP, so anywhere else the JSON store
     * would be downloadable. The same goes for anywhere else under the web
     * server's document root, which matters when the app lives in a subfolder:
     * "../nest-flyers-data" is then still inside public_html and served.
     */
    private static function dataDir(mixed $value, string $appRoot, ?string $documentRoot = null): string
    {
        if ($value !== null && (!is_string($value) || trim($value) === '')) {
            throw new InvalidArgumentException('dataDir must be null or a folder path');
        }
        $root = self::normalize($appRoot);
        $dir = match (true) {
            $value === null => self::join($root, self::DEFAULT_DATA_DIR),
            self::isAbsolute($value) => self::normalize($value),
            default => self::normalize(self::join($root, $value)),
        };
        $denied = self::join($root, self::DEFAULT_DATA_DIR);
        if (self::within($dir, $denied)) {
            return $dir; // the folder the release's data/.htaccess denies
        }
        $web = $documentRoot !== null && trim($documentRoot) !== '' ? self::normalize($documentRoot) : null;
        if (self::within($dir, $root) || ($web !== null && self::within($dir, $web))) {
            throw new InvalidArgumentException(
                "dataDir \"$dir\" is inside the web root, so the JSON store would be downloadable; "
                . 'use ' . self::DEFAULT_DATA_DIR . '/ or a folder outside the web root',
            );
        }
        return $dir;
    }

    private static function isAbsolute(string $path): bool
    {
        return preg_match('~^([A-Za-z]:)?[/\\\\]~', $path) === 1;
    }

    private static function join(string $base, string $relative): string
    {
        return rtrim(str_replace('\\', '/', $base), '/') . '/' . ltrim(str_replace('\\', '/', $relative), '/');
    }

    /** $path equals $dir or lies below it. Windows paths compare without case, as the filesystem does. */
    private static function within(string $path, string $dir): bool
    {
        if (PHP_OS_FAMILY === 'Windows') {
            [$path, $dir] = [strtolower($path), strtolower($dir)];
        }
        return $path === $dir || str_starts_with($path, rtrim($dir, '/') . '/');
    }

    /**
     * Forward slashes, `.` and `..` resolved lexically (the folder may not exist
     * yet, so realpath() can't be used), no trailing slash. Keeps the root:
     * "/", "C:/" or "//server/share/".
     */
    private static function normalize(string $path): string
    {
        $path = str_replace('\\', '/', $path);
        preg_match('~^(//[^/]+/[^/]+/|[A-Za-z]:/|/)?~', $path, $m);
        $root = $m[1] ?? '';
        $segments = [];
        foreach (explode('/', substr($path, strlen($root))) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }
            if ($segment === '..' && $segments !== [] && end($segments) !== '..') {
                array_pop($segments);
            } elseif ($segment !== '..' || $root === '') {
                $segments[] = $segment;
            }
        }
        $joined = implode('/', $segments);
        return $root === '' ? $joined : rtrim($root . $joined, '/') . ($joined === '' ? '/' : '');
    }
}
