<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use JsonException;
use NestFlyers\Json;
use stdClass;

/**
 * What the two HTTPS adapters share: reading a provider's answer without letting the key out. The twin of
 * server/ai/providers/common.ts.
 */
final class ProviderAnswer
{
    /** How much of a body that is not the provider's own error goes into a message. */
    private const SAID_MAX = 200;

    private function __construct()
    {
    }

    /** Whatever the provider echoed, without the key: nothing that leaves an adapter may carry it (a 401 quotes it). */
    public static function redact(string $text, #[\SensitiveParameter] string $key): string
    {
        return $key === '' ? $text : str_replace($key, '[key]', $text);
    }

    /**
     * The provider's answer as the JSON object every answer is. A status other than 200, or a body that is no JSON
     * object (a captive proxy's page, a bare null), is the provider's failure, said in its own words.
     *
     * @throws LlmFailure provider
     */
    public static function body(string $who, HttpResponse $res, #[\SensitiveParameter] string $key): stdClass
    {
        $body = $res->status === 200 ? self::decode($res->text) : null;
        if (!$body instanceof stdClass) {
            throw self::failure($who, $res->status, $res->text, $key);
        }
        return $body;
    }

    /**
     * The model's text as the JSON it was asked for; anything else is bad output, kept raw for the ledger.
     *
     * @throws LlmFailure bad_output
     */
    public static function answerJson(string $text, #[\SensitiveParameter] string $key): mixed
    {
        try {
            return Json::decode($text);
        } catch (JsonException) {
            throw new LlmFailure(LlmFailure::BAD_OUTPUT, 'The model did not answer with JSON', self::redact($text, $key));
        }
    }

    /** The message a provider gave in an `error` object, when it gave one. */
    public static function message(mixed $error): ?string
    {
        return $error instanceof stdClass && is_string($error->message ?? null) ? $error->message : null;
    }

    /** The token counts, when the provider reported both. */
    public static function usage(mixed $input, mixed $output): ?LlmUsage
    {
        return is_int($input) && is_int($output) ? new LlmUsage($input, $output) : null;
    }

    /** A status the provider gave instead of an answer, with its own words when it sent any, the key taken out. */
    private static function failure(string $who, int $status, string $text, #[\SensitiveParameter] string $key): LlmFailure
    {
        $body = self::decode($text);
        $said = self::message($body instanceof stdClass ? ($body->error ?? null) : null) ?? self::cut($text);
        return new LlmFailure(LlmFailure::PROVIDER, self::redact("$who answered $status: $said", $key));
    }

    /** The text as JSON, or null when it is not (a bare JSON null reads the same: neither is an answer). */
    private static function decode(string $text): mixed
    {
        try {
            return Json::decode($text);
        } catch (JsonException) {
            return null;
        }
    }

    /** The first SAID_MAX characters (code points; Node counts UTF-16 units, which differ only past the BMP). */
    private static function cut(string $text): string
    {
        return preg_match('/^.{0,' . self::SAID_MAX . '}/su', $text, $m) === 1 ? $m[0] : substr($text, 0, self::SAID_MAX);
    }
}
