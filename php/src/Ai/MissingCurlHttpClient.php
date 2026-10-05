<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/**
 * The HTTP seam on a host whose PHP has no curl extension (HttpClientFactory picks it). Every call is a typed failure,
 * so the service records the attempt and answers ai_failed like any other, with one log line that names curl, where
 * calling curl_init() would be an undefined function: a 500 and a logged trace.
 */
final class MissingCurlHttpClient implements HttpClient
{
    public function postJson(string $url, #[\SensitiveParameter] array $headers, string $body, int $timeoutMs): HttpResponse
    {
        throw new LlmFailure(LlmFailure::NETWORK, 'PHP has no curl extension, so the provider cannot be reached: enable curl for this PHP version');
    }
}
