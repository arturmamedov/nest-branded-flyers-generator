<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/** Picks the HTTP client the providers call through: curl where the host has it, a typed failure where it does not. */
final class HttpClientFactory
{
    private function __construct()
    {
    }

    /**
     * HostFacts and the preflight page report a missing curl; this is what a generation meets on such a host.
     *
     * @param (callable(string): bool)|null $extensionLoaded extension_loaded, replaceable in tests
     */
    public static function create(?callable $extensionLoaded = null): HttpClient
    {
        return ($extensionLoaded ?? 'extension_loaded')('curl') ? new CurlHttpClient() : new MissingCurlHttpClient();
    }
}
