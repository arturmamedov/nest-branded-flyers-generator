<?php

declare(strict_types=1);

namespace NestFlyers\Http;

use Closure;
use Imagick;
use NestFlyers\Image\ImageProcessor;
use NestFlyers\Photos\UploadLimits;
use NestFlyers\Shared;
use RuntimeException;

/**
 * The answer to GET api/config (ApiConfigSchema in src/shared/schema.ts): what
 * this backend can do. The editor picks its exporter from `exporters` (PHP has
 * no headless browser, so only the client exporter) and prepares photos to fit
 * `limits`. `server` is diagnostics for whoever sets the host up.
 */
final class ApiConfig
{
    /**
     * @param Closure(): ImageProcessor $imageProcessor built on demand; throws a RuntimeException that
     *        says what to install when the host has neither GD nor Imagick
     */
    public function __construct(
        private readonly string $storage,
        private readonly Shared $shared,
        private readonly UploadLimits $limits,
        private readonly Closure $imageProcessor,
    ) {
    }

    /**
     * @return array{backend:string, storage:string, exporters:list<string>,
     *     limits:array{maxUploadBytes:int, maxPhotoEdge:int}, server:array<string, mixed>}
     */
    public function toArray(): array
    {
        return [
            'backend' => 'php',
            'storage' => $this->storage,
            'exporters' => ['client'],
            'limits' => [
                'maxUploadBytes' => $this->limits->maxUploadBytes(),
                'maxPhotoEdge' => $this->shared->maxPhotoEdge(),
            ],
            'server' => ['php' => PHP_VERSION] + $this->limits->diagnostics() + $this->imageDiagnostics(),
        ];
    }

    /**
     * The processor in use and which of the accepted photo types it can decode.
     * A host without an image library still answers (everything but uploads
     * works), and says so here instead of failing the whole config request.
     *
     * @return array{imageProcessor:?string, formats:list<string>, imageProcessorError?:string}
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

    /** Asks the library itself: builds differ (GD without WebP is common on older hosts). */
    private static function canRead(string $processor, string $format): bool
    {
        return match ($processor) {
            'gd' => function_exists('imagetypes') && defined('IMG_' . strtoupper($format))
                && (imagetypes() & constant('IMG_' . strtoupper($format))) !== 0,
            'imagick' => class_exists(Imagick::class) && Imagick::queryFormats(strtoupper($format)) !== [],
            default => false,
        };
    }
}
