<?php

declare(strict_types=1);

namespace NestFlyers;

use JsonException;

/**
 * The one way this backend reads and writes JSON, for API bodies and the JSON
 * store alike, so both come out as the Node server writes them:
 * - unescaped unicode, slashes and line terminators (JS JSON.stringify writes them raw);
 * - floats in shortest round-trip form (serialize_precision -1), whatever the host's ini says;
 * - decoding keeps objects as stdClass, never associative arrays, so {} stays {}.
 */
final class Json
{
    public const FLAGS = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS | JSON_THROW_ON_ERROR;

    /** Pretty output is the store's file format: 4-space indent and a trailing newline. */
    public static function encode(mixed $value, bool $pretty = false): string
    {
        $precision = ini_get('serialize_precision');
        ini_set('serialize_precision', '-1');
        try {
            $json = json_encode($value, self::FLAGS | ($pretty ? JSON_PRETTY_PRINT : 0));
        } finally {
            ini_set('serialize_precision', (string) $precision);
        }
        return $pretty ? $json . "\n" : $json;
    }

    /** @throws JsonException on malformed JSON (including lone UTF-16 surrogates, which PHP refuses). */
    public static function decode(string $json): mixed
    {
        return json_decode($json, false, 512, JSON_THROW_ON_ERROR);
    }
}
