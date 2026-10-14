<?php

declare(strict_types=1);

namespace NestFlyers\Http;

use NestFlyers\Diagnostics\HostFacts;
use NestFlyers\Photos\UploadLimits;
use NestFlyers\Shared;

/**
 * The answer to GET api/config (ApiConfigSchema in src/shared/schema.ts): what
 * this backend can do. The editor picks its exporter from `exporters` (PHP has
 * no headless browser, so only the client exporter) and prepares photos to fit
 * `limits`. `server` is diagnostics for whoever sets the host up (HostFacts).
 * `ai` is the asking actor's (AiService::status), so the route hands it in.
 * `looks` is what the editor offers (config.php's 'looks', SiteLooks), never
 * what a save accepts.
 */
final class ApiConfig
{
    public function __construct(
        private readonly string $storage,
        private readonly Shared $shared,
        private readonly UploadLimits $limits,
        private readonly HostFacts $hostFacts,
        /** @var list<string> the site's looks, in its order: the first is a new flyer's */
        private readonly array $looks,
    ) {
    }

    /**
     * @param array{enabled:false}|array{enabled:true, features:list<array{name:string, limit:int, remaining:int}>} $ai the AI for the actor asking
     * @return array{backend:string, storage:string, exporters:list<string>,
     *     limits:array{maxUploadBytes:int, maxPhotoEdge:int}, server:array<string, mixed>, ai:array<string, mixed>,
     *     looks:list<string>}
     */
    public function toArray(array $ai): array
    {
        return [
            'backend' => 'php',
            'storage' => $this->storage,
            'exporters' => ['client'],
            'limits' => [
                'maxUploadBytes' => $this->limits->maxUploadBytes(),
                'maxPhotoEdge' => $this->shared->maxPhotoEdge(),
            ],
            'server' => $this->hostFacts->toArray(),
            'ai' => $ai,
            'looks' => $this->looks,
        ];
    }
}
