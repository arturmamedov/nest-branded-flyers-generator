<?php

declare(strict_types=1);

namespace NestFlyers\Http;

/**
 * One API request. `path` is relative to the app root ("/api/flyers/7"),
 * whether the app lives at a domain root or in a subfolder.
 */
final class Request
{
    /**
     * @param array<string, string> $query
     * @param array<string, string> $headers lower-case names
     * @param array<string, mixed> $files $_FILES
     * @param array<string, mixed> $server $_SERVER (REMOTE_ADDR, PHP_AUTH_*, HTTP_AUTHORIZATION, CONTENT_LENGTH, …)
     */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query = [],
        public readonly array $headers = [],
        public readonly string $body = '',
        public readonly array $files = [],
        public readonly array $server = [],
        public readonly array $post = [],
    ) {
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }

    /**
     * The request as PHP received it. The app root is the folder of the front
     * controller: SCRIPT_NAME must end in api.php (router.php pins it for php -S).
     */
    public static function fromGlobals(): self
    {
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (is_string($value) && str_starts_with($key, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr($key, 5)))] = $value;
            }
        }
        foreach (['CONTENT_TYPE' => 'content-type', 'CONTENT_LENGTH' => 'content-length'] as $key => $name) {
            if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
                $headers[$name] = (string) $_SERVER[$key];
            }
        }
        $query = self::parseQuery((string) ($_SERVER['QUERY_STRING'] ?? ''));
        return new self(
            strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')),
            self::appPath((string) ($_SERVER['REQUEST_URI'] ?? '/'), (string) ($_SERVER['SCRIPT_NAME'] ?? '')),
            $query,
            $headers,
            (string) file_get_contents('php://input'),
            $_FILES,
            $_SERVER,
            $_POST,
        );
    }

    /**
     * The query string as Express's default ("simple") parser leaves it for the
     * API: one value per name. A name that appears twice becomes an array there,
     * which `typeof … === 'string'` then rejects, so the filter is simply not
     * applied; dropping it here keeps both backends answering the same list.
     * PHP's own $_GET cannot express this: it keeps the last value.
     *
     * @return array<string, string>
     */
    public static function parseQuery(string $queryString): array
    {
        $values = [];
        $seen = [];
        foreach (explode('&', $queryString) as $pair) {
            if ($pair === '') {
                continue;
            }
            [$name, $value] = array_pad(explode('=', $pair, 2), 2, '');
            $name = urldecode($name);
            $seen[$name] = ($seen[$name] ?? 0) + 1;
            $values[$name] = urldecode($value);
        }
        return array_filter($values, static fn (string $name): bool => $seen[$name] === 1, ARRAY_FILTER_USE_KEY);
    }

    /**
     * The request path relative to the app root: "/sub/api/flyers/7" with
     * SCRIPT_NAME "/sub/api.php" gives "/api/flyers/7". Only a SCRIPT_NAME ending
     * in api.php is trusted; anything else would silently misroute.
     */
    public static function appPath(string $requestUri, string $scriptName): string
    {
        if (!preg_match('~(?:^|/)api\.php$~', $scriptName)) {
            throw new \LogicException("SCRIPT_NAME must end in api.php (got \"$scriptName\")");
        }
        // Kept percent-encoded: the router matches the encoded path and decodes
        // only the captured parameters, as Express 5 does. Decoding first would
        // give every route hidden aliases (/api/flyer%73/1) and let %2F act as a
        // separator, neither of which the Node server accepts.
        $path = (string) parse_url($requestUri, PHP_URL_PATH);
        $root = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
        // The app-root prefix may arrive encoded (a subfolder with a space), so try both spellings.
        $encodedRoot = implode('/', array_map('rawurlencode', explode('/', $root)));
        foreach ([$root, $encodedRoot] as $prefix) {
            if ($prefix !== '' && str_starts_with($path, $prefix . '/')) {
                return substr($path, strlen($prefix));
            }
        }
        return $path === '' ? '/' : $path;
    }
}
