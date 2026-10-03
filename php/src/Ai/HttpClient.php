<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/**
 * The one place the backend touches the network for the AI: a JSON POST with a time limit. The adapters take it
 * injected, so the shared vectors run against a stub and no test reaches a provider (CurlHttpClient is the real one).
 * The twin of server/ai/http.ts.
 */
interface HttpClient
{
    /**
     * Whatever came back, status and text, within the time limit; the adapter reads it.
     *
     * @param array<string, string> $headers name => value; they carry the key, hence #[\SensitiveParameter]
     * @param string $body already serialised, so what is sent is exactly what the vectors pin
     * @throws LlmFailure timeout when the limit passed, network when the host was not reached
     */
    public function postJson(string $url, #[\SensitiveParameter] array $headers, string $body, int $timeoutMs): HttpResponse;
}
