<?php

declare(strict_types=1);

namespace NestFlyers\Http;

use JsonException;
use NestFlyers\Json;
use stdClass;

/**
 * The request body as the Node server's `express.json()` (body-parser 2,
 * strict mode) leaves `req.body`, so both backends answer odd bodies alike:
 *
 * - null (Node's `undefined`) when the request has no body, or its media type
 *   is not exactly application/json: the handler then reports the body at "_";
 * - an empty body is {} ("a common client-side mistake", says body-parser), so
 *   a handler reports every required field instead;
 * - a leading UTF-8 BOM is dropped, as body-parser's decoder does;
 * - only an object or an array is accepted: a bare primitive, or anything that
 *   is not JSON, is 400 malformed.
 *
 * A bare JSON `null` is refused, so null can safely stand for "no body".
 */
final class JsonBody
{
    /** @throws HttpError malformed (400) */
    public static function parse(Request $request, ErrorCatalog $errors): mixed
    {
        if (!self::hasBody($request) || self::mediaType($request) !== 'application/json') {
            return null;
        }
        $body = str_starts_with($request->body, "\xEF\xBB\xBF") ? substr($request->body, 3) : $request->body;
        if ($body === '') {
            return new stdClass();
        }
        // JSON whitespace only (RFC 8259): body-parser looks at the first other character.
        if (preg_match('/^[\x20\x09\x0a\x0d]*([{\[])/', $body) !== 1) {
            throw $errors->make('malformed');
        }
        try {
            return Json::decode($body);
        } catch (JsonException) {
            throw $errors->make('malformed');
        }
    }

    /** type-is's hasBody(): a Transfer-Encoding header, or a numeric Content-Length (0 included). */
    private static function hasBody(Request $request): bool
    {
        $length = $request->header('content-length');
        return $request->header('transfer-encoding') !== null || ($length !== null && is_numeric(trim($length)));
    }

    /** "Application/JSON; charset=utf-8" → "application/json". */
    private static function mediaType(Request $request): string
    {
        return strtolower(trim(explode(';', $request->header('content-type') ?? '', 2)[0]));
    }
}
