<?php

declare(strict_types=1);

namespace NestFlyers\Http;

/**
 * No login by design, so cross-site writes are blocked: every method except
 * GET, HEAD and OPTIONS needs `X-Nest-Flyers: 1`. A custom header can't be sent
 * from another origin without a CORS preflight, and preflights are never
 * granted. Same rule as the Node server (server/app.ts).
 */
final class WriteGuard
{
    public const HEADER = 'X-Nest-Flyers';
    private const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

    public function __construct(private readonly ErrorCatalog $errors)
    {
    }

    /** @throws HttpError forbidden (403) */
    public function check(Request $request): void
    {
        if (!in_array($request->method, self::SAFE_METHODS, true) && $request->header(self::HEADER) !== '1') {
            throw $this->errors->make('forbidden');
        }
    }
}
