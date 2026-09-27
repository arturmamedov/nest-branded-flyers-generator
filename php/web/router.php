<?php

declare(strict_types=1);

/*
 * For PHP's built-in server only (the contract suite, the smoke test, a quick
 * local run), which reads no .htaccess:
 *
 *     php -S 127.0.0.1:8080 -t <app root> <app root>/router.php
 *
 * It does what the .htaccess files do on Apache: api/… goes to api.php, and
 * everything the release denies answers 404. Apache never runs this file, and
 * the root .htaccess denies it over HTTP.
 */

$path = rawurldecode((string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH));

if (str_starts_with($path, '/api/')) {
    // php -S sets SCRIPT_NAME from its own file lookup, and Request::appPath
    // only trusts one ending in api.php: pin all three to the front controller.
    $_SERVER['SCRIPT_NAME'] = '/api.php';
    $_SERVER['SCRIPT_FILENAME'] = __DIR__ . DIRECTORY_SEPARATOR . 'api.php';
    $_SERVER['PHP_SELF'] = '/api.php';
    require __DIR__ . '/api.php';
    return true;
}

$denied = static function (string $path): bool {
    // Compare the way the filesystem will resolve the name: "\" separates too,
    // and Windows ignores trailing dots and spaces ("data./meta.json" is data/meta.json).
    $segments = [];
    foreach (explode('/', str_replace('\\', '/', $path)) as $segment) {
        $segment = rtrim($segment, '. ');
        if ($segment === '' || $segment === '.') {
            continue;
        }
        if ($segment === '..') {
            array_pop($segments);
            continue;
        }
        $segments[] = $segment;
    }
    if ($segments === []) {
        return false;
    }
    // "name:stream" (NTFS alternate data streams) would read a file's raw source.
    if (str_contains($path, ':')) {
        return true;
    }
    $first = strtolower($segments[0]);
    $name = end($segments);

    // Root .htaccess: code, seed, schema and data folders…
    if (in_array($first, ['src', 'vendor', 'seed', 'schema', 'data'], true)) {
        return true;
    }
    // …config, tooling, the manifest and log files anywhere, and Apache's own .ht* files.
    if (preg_match('/^(config.*\.php|router\.php|composer\..*|\.user\.ini|release\.json|.*\.log|.*\.md|\.ht.*)\z/i', $name) === 1) {
        return true;
    }
    // uploads/.htaccess: photos only, and never anything that looks like PHP (x.php.png too).
    if ($first === 'uploads' && count($segments) > 1) {
        return preg_match('/\.ph(p\d?|tml|ar|ps|t)/i', $name) === 1 || preg_match('/\.(jpe?g|png|webp)\z/i', $name) !== 1;
    }
    return false;
};

if ($denied($path)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo "Not found\n";
    return true;
}

// Anything else is a plain file (index.html, static/, assets/, photos): php -S serves it.
return false;
