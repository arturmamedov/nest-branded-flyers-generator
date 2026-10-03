<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use NestFlyers\Json;

/**
 * The HTTP seam over curl (HostFacts and the preflight page check the extension; IONOS has it). A JSON POST, no
 * redirects, one time limit for connecting and answering alike; a limit passed or a host not reached is a typed
 * failure, so the service records and answers it like any other. The twin of fetchJson in server/ai/http.ts.
 */
final class CurlHttpClient implements HttpClient
{
    public function postJson(string $url, #[\SensitiveParameter] array $headers, string $body, int $timeoutMs): HttpResponse
    {
        $lines = [];
        foreach ($headers as $name => $value) {
            $lines[] = "$name: $value";
        }
        // curl would otherwise send "Expect: 100-continue" for a long prompt and wait up to a second for the go-ahead.
        $lines[] = 'Expect:';

        $handle = curl_init($url);
        curl_setopt_array($handle, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => $lines,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT_MS => $timeoutMs,
            CURLOPT_TIMEOUT_MS => $timeoutMs,
            // Millisecond limits under a second need it on some builds (no SIGALRM-based DNS timeout).
            CURLOPT_NOSIGNAL => true,
        ]);
        $text = curl_exec($handle);
        $errno = curl_errno($handle);
        $host = parse_url($url, PHP_URL_HOST) ?: $url;
        if ($text === false || $errno !== 0) {
            // Only the host is named: the error never carries the headers, and so never the key.
            throw $errno === CURLE_OPERATION_TIMEDOUT
                ? new LlmFailure(LlmFailure::TIMEOUT, "No answer from $host within $timeoutMs ms")
                : new LlmFailure(LlmFailure::NETWORK, "Could not reach $host: " . curl_error($handle));
        }
        return new HttpResponse((int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE), self::utf8((string) $text));
    }

    /** The body as valid UTF-8, a bad byte becoming U+FFFD, as fetch()'s text() decodes it in Node. */
    private static function utf8(string $text): string
    {
        return preg_match('//u', $text) === 1 ? $text : Json::decode(json_encode($text, JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR));
    }
}
