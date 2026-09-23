<?php

declare(strict_types=1);

namespace NestFlyers\Http;

use Closure;
use InvalidArgumentException;

/**
 * Method + path patterns such as "/api/flyers/{id}", matched the way the Node
 * server's Express 5 router matches them, so both backends answer the same
 * URLs: case-insensitive, an optional trailing slash, a `{param}` is one
 * non-empty path segment, and a GET route also answers HEAD.
 * Anything unmatched (including a known path with the wrong method) is null;
 * the Kernel turns that into 404 no_such_endpoint.
 */
final class Router
{
    /** @var list<array{method:string, regex:string, handler:Closure}> */
    private array $routes = [];

    /**
     * @param Closure(Request, array<string, string>, mixed): Response $handler
     *        called with the request, the path params and the parsed JSON body (null when there is none)
     */
    public function add(string $method, string $pattern, Closure $handler): void
    {
        if (!str_starts_with($pattern, '/')) {
            throw new InvalidArgumentException("Route pattern must start with /: $pattern");
        }
        $segments = array_map(
            static fn (string $segment): string => preg_match('/^\{([A-Za-z_]\w*)\}\z/', $segment, $m) === 1
                ? '(?P<' . $m[1] . '>[^/]+)'
                : preg_quote($segment, '~'),
            explode('/', rtrim($pattern, '/')),
        );
        $this->routes[] = [
            'method' => strtoupper($method),
            'regex' => '~^' . implode('/', $segments) . '/?\z~i',
            'handler' => $handler,
        ];
    }

    /** @return array{handler: Closure, params: array<string, string>}|null */
    public function match(string $method, string $path): ?array
    {
        $method = strtoupper($method);
        foreach ($this->routes as $route) {
            $handles = $route['method'] === $method || ($method === 'HEAD' && $route['method'] === 'GET');
            if ($handles && preg_match($route['regex'], $path, $m) === 1) {
                // The path matches while still percent-encoded, as Express does;
                // only the captured parameters are decoded (its decode_param).
                $params = array_map('rawurldecode', array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY));
                return ['handler' => $route['handler'], 'params' => $params];
            }
        }
        return null;
    }
}
