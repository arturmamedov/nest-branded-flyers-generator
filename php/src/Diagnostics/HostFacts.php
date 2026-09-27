<?php

declare(strict_types=1);

namespace NestFlyers\Diagnostics;

use Closure;
use Imagick;
use NestFlyers\Http\AccessRule;
use NestFlyers\Image\ImageProcessor;
use NestFlyers\Photos\UploadLimits;
use NestFlyers\Shared;
use RuntimeException;

/**
 * What this host is, in one place: api/config's `server` block. It is
 * diagnostics for whoever sets the host up (docs/deploy.md) and nothing reads
 * it to decide anything. The first six keys are pinned in order by ApiTest
 * and tests/contract/php.test.ts; everything after them is free-form.
 */
final class HostFacts
{
    /** The extensions the app cares about: json always, gd or imagick for photos, exif for rotation, fileinfo for sniffing. */
    public const EXTENSIONS = ['json', 'gd', 'imagick', 'exif', 'fileinfo'];

    /**
     * @param Closure(): ImageProcessor $imageProcessor built on first use, so a host without an image library still answers
     */
    public function __construct(
        private readonly Shared $shared,
        private readonly UploadLimits $limits,
        private readonly Closure $imageProcessor,
        private readonly AccessRule $access,
        private readonly string $appRoot,
        private readonly string $dataDir,
        private readonly string $uploadsDir,
    ) {
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        $extensions = [];
        foreach (self::EXTENSIONS as $name) {
            $extensions[$name] = extension_loaded($name);
        }
        return ['php' => PHP_VERSION]
            + $this->limits->diagnostics()
            + $this->imageDiagnostics()
            + [
                'sapi' => PHP_SAPI,
                'extensions' => $extensions,
                'openBasedir' => self::iniOrNull('open_basedir'),
                // Flyers sort by updatedAt, which is stored in UTC; the zone matters only for the log's timestamps.
                'timezone' => date_default_timezone_get(),
                'dataDir' => self::folder($this->dataDir),
                'uploadsDir' => self::folder($this->uploadsDir),
                // Bootstrap moves it into the data folder when that is writable; otherwise it is the host's.
                'errorLog' => self::iniOrNull('error_log'),
                'release' => ReleaseCheck::run($this->appRoot),
                'accessRule' => $this->access->kind(),
            ];
    }

    /**
     * The image library, and which of the accepted photo types it can actually decode.
     * A host without an image library still answers (everything but uploads
     * works), and says so here instead of failing the whole config request.
     *
     * @return array{imageProcessor: ?string, formats: list<string>, imageProcessorError?: string}
     */
    private function imageDiagnostics(): array
    {
        try {
            $name = ($this->imageProcessor)()->name();
        } catch (RuntimeException $e) {
            return ['imageProcessor' => null, 'formats' => [], 'imageProcessorError' => $e->getMessage()];
        }
        $formats = [];
        foreach ($this->shared->acceptedPhotoTypes() as $type) {
            $format = substr($type, strlen('image/'));
            if (self::canRead($name, $format)) {
                $formats[] = $format;
            }
        }
        return ['imageProcessor' => $name, 'formats' => $formats];
    }

    private static function canRead(string $processor, string $format): bool
    {
        return match ($processor) {
            'gd' => function_exists('imagetypes') && defined('IMG_' . strtoupper($format))
                && (imagetypes() & constant('IMG_' . strtoupper($format))) !== 0,
            'imagick' => class_exists(Imagick::class) && Imagick::queryFormats(strtoupper($format)) !== [],
            default => false,
        };
    }

    /**
     * A folder the app writes to, proven by writing: is_writable() is wrong often
     * enough on shared hosts (ACLs, open_basedir, a full quota) that only a real
     * write, removed at once, says it. The error text is PHP's own, which is what
     * the host's support will ask for.
     *
     * @return array{path: string, writable: bool, error?: string}
     */
    private static function folder(string $dir): array
    {
        $probe = $dir . '/.write-probe-' . bin2hex(random_bytes(6));
        error_clear_last();
        if (@file_put_contents($probe, '') === false) {
            return ['path' => $dir, 'writable' => false, 'error' => error_get_last()['message'] ?? 'the write failed'];
        }
        @unlink($probe);
        return ['path' => $dir, 'writable' => true];
    }

    private static function iniOrNull(string $key): ?string
    {
        $value = ini_get($key);
        return $value === false || $value === '' ? null : $value;
    }
}
