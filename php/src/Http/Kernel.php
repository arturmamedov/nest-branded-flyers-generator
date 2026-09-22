<?php

declare(strict_types=1);

namespace NestFlyers\Http;

use Closure;
use Throwable;

/**
 * One API request, checked in the contract's order (docs/api-contract.md,
 * "Order of checks"):
 *
 * 1. access (config.php's rule): before anything touches storage;
 * 2. boot: open the store and apply seed/hostels.json when it changed;
 * 3. parse the JSON body (400 malformed);
 * 4. the X-Nest-Flyers write guard (403);
 * 5. route (404 no_such_endpoint, wrong methods included);
 * 6. the handler, which runs the route's own checks (id, validation, references).
 *
 * Non-finite numbers (a JSON 1e400) are part of validation, as in Node, where
 * zod rejects them: the flyer validator reports them at their dotted path
 * along with every other bad field, after the id check.
 *
 * Every failure is JSON: an HttpError answers as itself, anything else is
 * logged and answered with 500 server_error.
 */
final class Kernel
{
    /**
     * @param Closure(): Router $boot opens the store, seeds it and hands back
     *        the routes; runs after the access check, so an outsider never
     *        touches storage (and never sees a storage error)
     */
    public function __construct(
        private readonly ErrorCatalog $errors,
        private readonly AccessGuard $access,
        private readonly WriteGuard $writeGuard,
        private readonly Closure $boot,
    ) {
    }

    public function handle(Request $request): Response
    {
        try {
            $this->access->check($request);
            $router = ($this->boot)();
            $body = JsonBody::parse($request, $this->errors);
            $this->writeGuard->check($request);
            $route = $router->match($request->method, $request->path) ?? throw $this->errors->make('no_such_endpoint');
            return ($route['handler'])($request, $route['params'], $body);
        } catch (HttpError $e) {
            return $e->toResponse();
        } catch (Throwable $e) {
            error_log('Nest flyers: ' . $e);
            return $this->errors->make('server_error')->toResponse();
        }
    }
}
