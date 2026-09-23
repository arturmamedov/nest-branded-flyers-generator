<?php

declare(strict_types=1);

namespace NestFlyers\Http;

use InvalidArgumentException;
use NestFlyers\Shared;

/**
 * The shared error catalogue (src/shared/errors.ts, generated into
 * schema/shared.json): status, code and message for every error key, with
 * `{placeholders}` filled in — the same words the Node server answers with.
 */
final class ErrorCatalog
{
    /** @param array<string, array{status:int, code:string, message:string, fields?:array<string,string>}> $errors */
    public function __construct(private readonly array $errors)
    {
    }

    public static function fromShared(Shared $shared): self
    {
        return new self($shared->errors());
    }

    /**
     * @param array<string, string|int|float> $vars
     * @param array<string, string>|null $fields overrides the catalogue's own fields (validation errors)
     * @param array<string, string> $headers
     */
    public function make(string $key, array $vars = [], ?array $fields = null, array $headers = []): HttpError
    {
        $spec = $this->errors[$key] ?? throw new InvalidArgumentException("Unknown error key $key");
        $message = preg_replace_callback(
            '/\{(\w+)\}/',
            static fn (array $m): string => array_key_exists($m[1], $vars) ? (string) $vars[$m[1]] : $m[0],
            $spec['message'],
        );
        return new HttpError($spec['status'], $spec['code'], $message, $fields ?? ($spec['fields'] ?? null), $headers);
    }

    /** Megabytes as staff read them: one decimal, rounded down, ".0" dropped (formatMb in src/shared/errors.ts). */
    public static function formatMb(int $bytes): string
    {
        $tenths = intdiv($bytes * 10, 1024 * 1024);
        return $tenths % 10 === 0 ? (string) intdiv($tenths, 10) : sprintf('%d.%d', intdiv($tenths, 10), $tenths % 10);
    }
}
