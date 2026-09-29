<?php

declare(strict_types=1);

namespace NestFlyers\Http;

use NestFlyers\Shared;

/**
 * No login by design, so cross-site writes are blocked: every method except
 * GET, HEAD and OPTIONS needs `X-Nest-Flyers: 1`. A custom header can't be sent
 * from another origin without a CORS preflight, and preflights are never
 * granted. The header and the methods come from schema/shared.json
 * (src/shared/writeGuard.ts); same rule as the Node server (server/app.ts).
 */
final class WriteGuard
{
    public function __construct(
        private readonly Shared $shared,
        private readonly ErrorCatalog $errors,
    ) {
    }

    /** @throws HttpError forbidden (403) */
    public function check(Request $request): void
    {
        $guard = $this->shared->writeGuard();
        if (!in_array($request->method, $guard['safeMethods'], true) && $request->header($guard['header']) !== $guard['value']) {
            throw $this->errors->make('forbidden');
        }
    }
}
