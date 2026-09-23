<?php
/*
 * Nest flyers: preflight.
 *
 * One file you upload ALONE into the folder the app will live in, before the
 * release, and open in a browser. It says whether this hosting account can run
 * the app, and what to fix first. Reload it at each step of docs/deploy.md: once
 * the release is up it also checks every file arrived, looks at the site from
 * the outside the way a stranger would, and fetches the flyer fonts. Delete it
 * when the app is live (step 6). Apache or LiteSpeed only.
 *
 * It writes nothing and keeps nothing. The password box turns a password into
 * the lines config.php and .htaccess need and prints them; the password itself
 * is never stored or logged. There is deliberately no "write config.php for me"
 * button: it would only work while no lock exists, so whoever found this page
 * first would choose the password.
 *
 * It uses no file, class or library from the app, because it has to answer on
 * an account that has none of them yet. It is written in PHP 7.0 syntax so that
 * a folder still on old PHP gets a red line here rather than a blank page. What
 * it repeats from the app (the PHP minimum, the 15 MiB limit, the size parser,
 * the release check, the config and .htaccess blocks) is pinned to the app's
 * own copy by php/tests/Preflight.
 */

namespace NestFlyersPreflight;

/** php/composer.json's require.php. */
const MIN_PHP = '8.1';
/** src/shared/limits.ts MAX_UPLOAD_BYTES: 15 MiB. */
const MAX_UPLOAD_BYTES = 15728640;
/** UploadLimits::POST_OVERHEAD_BYTES: the multipart envelope's share of post_max_size. */
const POST_OVERHEAD_BYTES = 65536;
/** Enough to decode a phone photo with GD. */
const MIN_MEMORY_BYTES = 134217728;
/** HostFacts::EXTENSIONS. */
const EXTENSIONS = ['json', 'gd', 'imagick', 'exif', 'fileinfo'];
/** AccessGuard::REALM. */
const REALM = 'Nest flyers';
/** ReleaseCheck::FILE and ::EDITABLE_TOP. */
const MANIFEST = 'release.json';
const EDITABLE_TOP = '.htaccess';
/** Apache checks .htpasswd on every file a page loads, so the Apache-side hash uses htpasswd's own default cost. */
const HTPASSWD_COST = 5;

/* ---- the pure parts (php/tests/Preflight drives these with injected values) ---- */

/** One line of the report: pass, warn, fail or info, what it is, what it found, and what to do. */
function check($id, $status, $title, $says, $todo = '')
{
    return ['id' => $id, 'status' => $status, 'title' => $title, 'says' => $says, 'todo' => $todo];
}

/** A php.ini size in bytes, read as PHP reads it (UploadLimits::parseQuantity). */
function parseQuantity($value)
{
    $value = trim((string) $value);
    if (preg_match('/^([+-]?\d+)\s*([kmg])?$/i', $value, $m) !== 1) {
        return preg_match('/^[+-]?\d+/', $value, $digits) === 1 ? (int) $digits[0] : 0;
    }
    $shifts = ['k' => 10, 'm' => 20, 'g' => 30];
    $unit = isset($m[2]) ? strtolower($m[2]) : '';
    return (int) $m[1] << (isset($shifts[$unit]) ? $shifts[$unit] : 0);
}

/** The largest photo the app will accept under these ini values (UploadLimits::maxUploadBytes). */
function maxUploadBytes($uploadMaxFilesize, $postMaxSize)
{
    $limits = [MAX_UPLOAD_BYTES];
    $upload = parseQuantity($uploadMaxFilesize);
    if ($upload > 0) {
        $limits[] = $upload;
    }
    $post = parseQuantity($postMaxSize);
    if ($post > 0) {
        $limits[] = max(1, $post - POST_OVERHEAD_BYTES);
    }
    return min($limits);
}

function mb($bytes)
{
    return rtrim(rtrim(number_format($bytes / 1048576, 1, '.', ''), '0'), '.') . ' MB';
}

function phpCheck($version, $sapi)
{
    if (version_compare($version, MIN_PHP, '<')) {
        return check('php', 'fail', "PHP $version", 'The app needs PHP ' . MIN_PHP . ' or newer.',
            'Pick PHP 8.3 or newer for this domain in the hosting panel (IONOS: the PHP version setting of the webspace), then reload this page.');
    }
    $cgi = strpos($sapi, 'cgi') !== false || strpos($sapi, 'fpm') !== false || strpos($sapi, 'litespeed') !== false;
    return check('php', 'pass', "PHP $version ($sapi)", $cgi
        ? 'PHP runs as a separate process (CGI/FastCGI), so the staff password reaches it only through the Authorization hand-off in .htaccess: the Login line below shows whether that works.'
        : 'PHP runs inside the web server.');
}

/** @param array<string, bool> $loaded extension name => loaded */
function extensionsCheck(array $loaded)
{
    $has = function ($name) use ($loaded) {
        return !empty($loaded[$name]);
    };
    if (!$has('json')) {
        return check('extensions', 'fail', 'PHP extensions', 'json is missing: the app cannot answer at all.', 'Ask the host to enable the json extension.');
    }
    $list = [];
    foreach (EXTENSIONS as $name) {
        $list[] = $name . ($has($name) ? ' yes' : ' no');
    }
    $found = implode(', ', $list) . '.';
    if (!$has('gd') && !$has('imagick')) {
        return check('extensions', 'fail', 'PHP extensions', $found . ' Neither gd nor imagick: photos cannot be uploaded (everything else works).',
            'Enable gd for this PHP version in the hosting panel, or ask the host.');
    }
    return check('extensions', 'pass', 'PHP extensions', $found . ' exif and fileinfo are not needed: the app reads photo orientation and types itself.');
}

/** @param array<string, string> $ini upload_max_filesize, post_max_size, memory_limit */
function limitsCheck(array $ini)
{
    $max = maxUploadBytes($ini['upload_max_filesize'], $ini['post_max_size']);
    $memory = parseQuantity($ini['memory_limit']);
    $says = sprintf('upload_max_filesize %s, post_max_size %s, memory_limit %s: photos up to %s are accepted.',
        $ini['upload_max_filesize'], $ini['post_max_size'], $ini['memory_limit'], mb($max));
    $raise = 'Raise them in a .user.ini in this folder (upload_max_filesize = 16M, post_max_size = 20M, memory_limit = 256M); the release ships one you can add these lines to. PHP reads it within 5 minutes.';
    if ($memory >= 0 && $memory < MIN_MEMORY_BYTES) {
        return check('limits', 'warn', 'Upload and memory limits', $says . ' memory_limit is under 128M, so large photos may fail to decode.', $raise);
    }
    if ($max < MAX_UPLOAD_BYTES) {
        return check('limits', 'warn', 'Upload and memory limits', $says . ' The editor shrinks photos to fit, so this works, at some cost in quality.', $raise);
    }
    return check('limits', 'pass', 'Upload and memory limits', $says);
}

function openBasedirCheck($value)
{
    if ($value === '' || $value === false || $value === null) {
        return check('open_basedir', 'pass', 'open_basedir', 'Not set: PHP may use any folder the account can reach.');
    }
    return check('open_basedir', 'info', 'open_basedir', "PHP may only use: $value.",
        'If config.php points dataDir outside this folder, it must be under one of these paths.');
}

function timezoneCheck($value)
{
    if ($value === '' || $value === false || $value === null) {
        return check('timezone', 'info', 'date.timezone', 'Not set, so PHP uses UTC. Fine: the app stores every time in UTC anyway.');
    }
    return check('timezone', 'pass', 'date.timezone', "$value. The app stores every time in UTC regardless.");
}

function displayErrorsCheck($value)
{
    $on = in_array(strtolower(trim((string) $value)), ['1', 'on', 'yes', 'true', 'stdout', 'stderr'], true);
    if ($on) {
        return check('display_errors', 'warn', 'display_errors', 'On: a PHP warning would be printed into the app\'s answers.',
            'The release\'s .user.ini turns it off; PHP rereads that file within 5 minutes of the upload. If this still says On after that, the host ignores .user.ini: ask them to set display_errors = Off.');
    }
    return check('display_errors', 'pass', 'display_errors', 'Off.');
}

/** Tries a real write in each folder, because is_writable() is wrong often enough on shared hosts. */
function writableCheck(array $dirs)
{
    $bad = [];
    foreach ($dirs as $label => $dir) {
        $probe = $dir . '/.nest-preflight-probe-' . bin2hex(random_bytes(6));
        if (@file_put_contents($probe, '') === false) {
            $e = error_get_last();
            $bad[] = "$label ($dir): " . ($e ? $e['message'] : 'the write failed');
            continue;
        }
        @unlink($probe);
    }
    if ($bad !== []) {
        return check('writable', 'fail', 'Folders PHP writes to', 'PHP cannot write here: ' . implode('; ', $bad) . '.',
            'Set the folder permissions to 755 (or 775) in the file manager, or ask the host which user PHP runs as.');
    }
    return check('writable', 'pass', 'Folders PHP writes to', 'PHP can write to ' . implode(', ', array_keys($dirs)) . '.');
}

/** @param array<string, mixed> $server */
function isHttps(array $server)
{
    $https = isset($server['HTTPS']) ? strtolower((string) $server['HTTPS']) : '';
    $proto = isset($server['HTTP_X_FORWARDED_PROTO']) ? strtolower((string) $server['HTTP_X_FORWARDED_PROTO']) : '';
    return ($https !== '' && $https !== 'off') || $proto === 'https';
}

/** The app folder's URL path, ending in '/'. */
function appPath(array $server)
{
    $script = isset($server['SCRIPT_NAME']) ? str_replace('\\', '/', (string) $server['SCRIPT_NAME']) : '/';
    return rtrim(str_replace('\\', '/', dirname($script)), '/') . '/';
}

/**
 * The app folder's own URL, or null when the Host header is not one this page
 * should fetch from (it only ever fetches fixed paths on its own site).
 */
function selfBase(array $server)
{
    $host = isset($server['HTTP_HOST']) ? (string) $server['HTTP_HOST'] : '';
    if (preg_match('/^[a-z0-9.\-]+(:\d+)?$|^\[[0-9a-f:.]+\](:\d+)?$/i', $host) !== 1) {
        return null;
    }
    $name = isset($server['SERVER_NAME']) ? strtolower((string) $server['SERVER_NAME']) : '';
    if ($name !== '' && strtolower(preg_replace('/:\d+$/', '', $host)) !== $name) {
        return null;
    }
    return (isHttps($server) ? 'https' : 'http') . '://' . $host . appPath($server);
}

/**
 * How this request arrived, and whether http:// sends visitors to https://.
 *
 * @param callable|null $fetch see defaultFetch()
 */
function httpsCheck(array $server, $base, $fetch)
{
    $signal = !empty($server['HTTPS']) && strtolower((string) $server['HTTPS']) !== 'off' ? 'HTTPS=' . $server['HTTPS']
        : (isset($server['HTTP_X_FORWARDED_PROTO']) ? 'X-Forwarded-Proto: ' . $server['HTTP_X_FORWARDED_PROTO'] : 'no HTTPS signal');
    if (!isHttps($server)) {
        return check('https', 'fail', 'HTTPS', "This page arrived over plain http ($signal). The staff password would cross the wire unencrypted.",
            'Open this page as https://… . If you did and it still says http, the host ends TLS before PHP without telling it: ask them, because the lock refuses anything that does not look like https.');
    }
    if ($fetch === null || $base === null) {
        return check('https', 'pass', 'HTTPS', "This page arrived over https ($signal).", 'Open the http:// address in a private window: it should switch to https:// (or answer 403), never ask for the password.');
    }
    $http = 'http://' . substr($base, strlen('https://'));
    $r = $fetch($http, []);
    if (isset($r['error'])) {
        return check('https', 'pass', 'HTTPS', "This page arrived over https ($signal). Could not ask the http:// address from here ({$r['error']}).",
            "Open $http in a private window: it should switch to https:// (or answer 403), never ask for the password.");
    }
    $location = isset($r['headers']['location']) ? $r['headers']['location'] : '';
    if (in_array($r['status'], [301, 302, 303, 307, 308], true) && stripos($location, 'https://') === 0) {
        return check('https', 'pass', 'HTTPS', "This page arrived over https ($signal), and http:// sends visitors to $location.");
    }
    if ($r['status'] === 401) {
        return check('https', 'fail', 'HTTPS', 'http:// asks for the password: it would be sent unencrypted.',
            'Use the https-only lock block this page prints (Require expr … HTTPS), and the force-https block.');
    }
    if ($r['status'] === 403) {
        return check('https', 'warn', 'HTTPS', 'http:// is refused (403) without asking for the password: safe, but visitors typing http:// see an error.',
            'Add the force-https block this page prints, which turns that 403 into a redirect.');
    }
    return check('https', 'warn', 'HTTPS', "This page arrived over https ($signal), but http:// answers {$r['status']} instead of switching to https://.",
        'Add the force-https block this page prints, at the top of .htaccess.');
}

/** Which of the three places PHP can find a Basic login in carried one: names only, never the values. */
function loginCheck(array $server)
{
    $carriers = [];
    foreach (['PHP_AUTH_USER', 'HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $key) {
        if (!empty($server[$key])) {
            $carriers[] = $key;
        }
    }
    if ($carriers === []) {
        return check('login', 'info', 'Login', 'No login reached PHP with this request. That is expected until the lock is on and your browser has asked for the password.',
            'Reload this page after step 3. If it still says this while the browser did ask you for the password, the host drops the Authorization header on its way to PHP, and config.php\'s basicAuth will refuse everyone: ask the host to pass it (CGIPassAuth On), or lock the API with allowIps instead.');
    }
    return check('login', 'pass', 'Login', 'The login reaches PHP, carried by ' . implode(' and ', $carriers) . '. config.php\'s basicAuth will see it.');
}

/** The login this request came with, as a header to pass on (the fonts are behind the same lock). */
function forwardedLogin(array $server)
{
    if (isset($server['PHP_AUTH_USER'])) {
        $pw = isset($server['PHP_AUTH_PW']) ? $server['PHP_AUTH_PW'] : '';
        return ['Authorization: Basic ' . base64_encode($server['PHP_AUTH_USER'] . ':' . $pw)];
    }
    foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $key) {
        if (!empty($server[$key])) {
            return ['Authorization: ' . $server[$key]];
        }
    }
    return [];
}

/**
 * The folder against release.json: ReleaseCheck::run's verdict, word for word
 * (ReleaseCheckContractTestCase runs the same cases against both).
 */
function releaseVerdict($appRoot)
{
    $file = $appRoot . '/' . MANIFEST;
    if (!is_file($file)) {
        return ['manifest' => 'missing'];
    }
    $manifest = json_decode((string) file_get_contents($file), true, 64);
    if (json_last_error() !== JSON_ERROR_NONE) {
        return ['manifest' => 'unreadable: ' . json_last_error_msg()];
    }
    if (!is_array($manifest) || !isset($manifest['files']) || !is_array($manifest['files'])) {
        return ['manifest' => 'unreadable: no files list'];
    }
    $missing = [];
    $changed = [];
    $htaccess = 'missing';
    foreach ($manifest['files'] as $path => $entry) {
        if (!is_string($path) || !safePath($path) || !is_array($entry)) {
            continue;
        }
        $actual = $appRoot . '/' . $path;
        if (!is_file($actual)) {
            $missing[] = $path;
            continue;
        }
        $bytes = isset($entry['bytes']) ? (int) $entry['bytes'] : -1;
        $sha256 = isset($entry['sha256']) ? (string) $entry['sha256'] : '';
        $same = filesize($actual) === $bytes && hash_file('sha256', $actual) === $sha256;
        if ($path === EDITABLE_TOP) {
            $htaccess = $same ? 'as shipped' : (endsWith($actual, $bytes, $sha256) ? 'block on top' : 'changed');
            if ($htaccess !== 'changed') {
                continue;
            }
        }
        if (!$same) {
            $changed[] = $path;
        }
    }
    $guards = isset($manifest['guards']) && is_array($manifest['guards']) ? array_values(array_filter($manifest['guards'], 'is_string')) : [];
    return [
        'id' => isset($manifest['id']) && is_string($manifest['id']) ? $manifest['id'] : null,
        'builtAt' => isset($manifest['builtAt']) && is_string($manifest['builtAt']) ? $manifest['builtAt'] : null,
        'commit' => isset($manifest['commit']) && is_string($manifest['commit']) ? $manifest['commit'] : null,
        'missing' => $missing,
        'changed' => $changed,
        'missingGuards' => array_values(array_intersect($guards, $missing)),
        'htaccess' => $htaccess,
    ];
}

function endsWith($file, $bytes, $sha256)
{
    $size = filesize($file);
    if ($bytes < 0 || $size === false || $size < $bytes) {
        return false;
    }
    $tail = file_get_contents($file, false, null, $size - $bytes, $bytes);
    return $tail !== false && hash('sha256', $tail) === $sha256;
}

function safePath($path)
{
    return $path !== '' && $path[0] !== '/' && strpos($path, '\\') === false && strpos($path, ':') === false
        && !in_array('..', explode('/', $path), true);
}

/** @return list<array> the release lines of the report */
function releaseChecks(array $verdict)
{
    if (isset($verdict['manifest'])) {
        return [$verdict['manifest'] === 'missing'
            ? check('release', 'info', 'The release', 'Not uploaded yet (no release.json here).', 'Fix anything red above first, then upload the release (docs/deploy.md, step 2) and reload.')
            : check('release', 'fail', 'The release', 'release.json is ' . $verdict['manifest'] . '.', 'Upload the release again.')];
    }
    $id = $verdict['id'] . ($verdict['commit'] ? " ({$verdict['commit']})" : '') . ($verdict['builtAt'] ? ", built {$verdict['builtAt']}" : '');
    $checks = [];
    if ($verdict['missingGuards'] !== []) {
        $checks[] = check('guards', 'fail', 'Security files', 'Missing: ' . implode(', ', $verdict['missingGuards']) . '. Without them code, config or the library can be downloaded.',
            'Your FTP client or file manager hid files whose names start with a dot. Show hidden files, and upload these again.');
    } else {
        $checks[] = check('guards', 'pass', 'Security files', 'All the dotfiles that keep code, config and the library private arrived.');
    }
    $others = array_values(array_diff($verdict['missing'], $verdict['missingGuards']));
    if ($others !== [] || $verdict['changed'] !== []) {
        $says = [];
        if ($others !== []) {
            $says[] = 'missing ' . listed($others);
        }
        if ($verdict['changed'] !== []) {
            $says[] = 'different from the release: ' . listed($verdict['changed']);
        }
        $checks[] = check('release', 'fail', "Release $id", ucfirst(implode('; ', $says)) . '.',
            'Upload the release again (additively, hidden files shown). An FTP transfer that stopped halfway, or a text-mode transfer, leaves files like these.');
    } else {
        $checks[] = check('release', 'pass', "Release $id", 'Every file the release shipped is here, unchanged.');
    }
    $htaccess = [
        'as shipped' => ['info', 'No lock pasted into .htaccess yet: the editor page, the art and the photos are open to anyone who finds the address.'],
        'block on top' => ['pass', 'The shipped rules are intact, with a block pasted above them (the lock).'],
        'changed' => ['warn', 'Edited somewhere other than the top. Paste blocks above the shipped rules, and leave those as they are.'],
        'missing' => ['fail', 'Missing: nothing keeps code and config private.'],
    ];
    $h = $htaccess[$verdict['htaccess']];
    $checks[] = check('htaccess', $h[0], '.htaccess', $h[1]);
    return $checks;
}

function listed(array $paths)
{
    $shown = array_slice($paths, 0, 12);
    return implode(', ', $shown) . (count($paths) > count($shown) ? ' and ' . (count($paths) - count($shown)) . ' more' : '');
}

/** The first photo on disk, so the outside probe asks for a real one; a made-up name otherwise (the lock answers first). */
function firstPhoto($appRoot)
{
    // No GLOB_BRACE: some C libraries lack it. Photos live in uploads/YYYY/MM/.
    foreach (glob($appRoot . '/uploads/*/*/*') ?: [] as $file) {
        if (preg_match('/\.(jpe?g|png|webp)$/i', $file) === 1 && is_file($file)) {
            return substr(str_replace('\\', '/', $file), strlen($appRoot) + 1);
        }
    }
    return 'uploads/2000/01/0000000000000000.jpg';
}

/**
 * The site as a stranger sees it: no login. Anything but a refusal on the
 * editor page or a photo means the .htaccess lock is missing or does not reach.
 *
 * @return list<array>
 */
function outsideChecks($base, $fetch, $photo)
{
    $probes = [
        ['outside-shell', 'The editor page', 'index.html'],
        ['outside-photo', 'A photo', $photo],
        ['outside-api', 'The API', 'api/config'],
        ['outside-denied', 'The release manifest (always denied)', MANIFEST],
    ];
    $checks = [];
    foreach ($probes as $probe) {
        list($id, $title, $path) = $probe;
        $url = $base . $path;
        $r = $fetch($url, []);
        if (isset($r['error'])) {
            $checks[] = check($id, 'warn', $title, "Could not ask $url from the server ({$r['error']}).", 'Open it in a private window yourself (list below).');
            continue;
        }
        $checks[] = outsideVerdict($id, $title, $url, $r['status']);
    }
    return $checks;
}

function outsideVerdict($id, $title, $url, $status)
{
    if ($status === 401) {
        return check($id, 'pass', $title, "$url asks for the login (401).");
    }
    if ($id === 'outside-api' && $status === 503) {
        return check($id, 'pass', $title, "$url refuses a stranger (503: config.php has no access rule yet).");
    }
    if ($status >= 500) {
        return check($id, 'fail', $title, "$url answers $status.", 'If every page does, the host rejects a line of .htaccess: see docs/deploy.md, step 1b.');
    }
    if ($id === 'outside-denied') {
        return $status === 200
            ? check($id, 'fail', $title, "$url is served to anyone.", 'The shipped .htaccess is missing or not read: upload it again, hidden files shown.')
            : check($id, 'pass', $title, "$url is refused ($status).");
    }
    if ($id === 'outside-api') {
        return $status === 403
            ? check($id, 'pass', $title, "$url refuses a stranger (403).")
            : check($id, 'fail', $title, "$url answers $status to a stranger.", 'config.php must set basicAuth (or allowIps), never allowPublic.');
    }
    if ($status === 403) {
        return check($id, 'pass', $title, "$url is refused (403).");
    }
    if ($status === 200 || $status === 404) {
        return check($id, 'fail', $title, "$url answers $status to a stranger: it is not behind the lock.",
            'Paste the lock block this page prints at the top of .htaccess (docs/deploy.md, step 3).');
    }
    return check($id, 'warn', $title, "$url answers $status.");
}

/** Every .woff2 the built stylesheets ask for, as paths under the app folder. The browser never fetches the .woff fallbacks. */
function fontPaths($appRoot)
{
    $paths = [];
    foreach (glob($appRoot . '/static/*.css') ?: [] as $css) {
        if (preg_match_all('/url\(\s*[\'"]?(\.\/)?([^\'")\/:]+\.woff2)[\'"]?\s*\)/i', (string) file_get_contents($css), $m) > 0) {
            foreach ($m[2] as $name) {
                $paths[] = 'static/' . $name;
            }
        }
    }
    return array_values(array_unique($paths));
}

/**
 * The fonts, fetched the way the staff member's browser will, because the
 * deliverable is the exported flyer: a host that 404s them produces a flyer
 * that renders, fits and downloads at exactly 1080 × 1920 in the wrong typeface.
 */
function fontsCheck($base, $fetch, array $paths, array $login)
{
    if ($paths === []) {
        return check('fonts', 'fail', 'Flyer fonts', 'No .woff2 fonts are referenced from static/*.css.', 'Upload the release again: static/ is incomplete.');
    }
    $bad = [];
    $untyped = [];
    foreach ($paths as $path) {
        $r = $fetch($base . $path, $login);
        if (isset($r['error'])) {
            return check('fonts', 'warn', 'Flyer fonts', 'Could not fetch them from the server (' . $r['error'] . ').', 'Open ' . $base . $paths[0] . ' in your browser: it should download, not show a page.');
        }
        $type = isset($r['headers']['content-type']) ? strtolower($r['headers']['content-type']) : '';
        if ($r['status'] !== 200 || strpos($type, 'text/html') === 0) {
            $bad[] = "$path ({$r['status']}" . ($type !== '' ? ", $type" : '') . ')';
        } elseif (strpos($type, 'font/') !== 0 && strpos($type, 'woff') === false) {
            $untyped[] = $path;
        }
    }
    if ($bad !== []) {
        return check('fonts', 'fail', 'Flyer fonts', count($bad) . ' of ' . count($paths) . ' fonts do not load: ' . listed($bad) . '. Flyers would export in the wrong typeface.',
            'Upload static/ again. If they are there, the host refuses .woff2 files: ask it to serve them.');
    }
    if ($untyped !== []) {
        return check('fonts', 'warn', 'Flyer fonts', 'All ' . count($paths) . ' fonts load, but ' . count($untyped) . ' come back without a font type. Browsers load them anyway.',
            'Optional: ask the host to serve .woff2 as font/woff2.');
    }
    return check('fonts', 'pass', 'Flyer fonts', 'All ' . count($paths) . ' fonts load as fonts.');
}

/** A PHP string literal. */
function phpString($value)
{
    return "'" . str_replace(['\\', "'"], ['\\\\', "\\'"], $value) . "'";
}

/** config.php with this login, complete: everything else as config.sample.php ships it. */
function configPhp($user, $passwordHash)
{
    return "<?php\n\n"
        . "// Nest flyers settings, printed by the preflight page. Upload it as config.php next to api.php.\n"
        . "// The hash is not the password: the password itself was never stored anywhere.\n"
        . "return [\n"
        . "    'access' => [\n"
        . "        'allowIps' => [],\n"
        . "        'basicAuth' => ['user' => " . phpString($user) . ", 'passwordHash' => " . phpString($passwordHash) . "],\n"
        . "        'allowPublic' => false,\n"
        . "    ],\n"
        . "    'dataDir' => null,\n"
        . "    'storage' => 'json',\n"
        . "    'imageProcessor' => 'auto',\n"
        . "];\n";
}

/** The staff-login block for the top of .htaccess (access-examples/htaccess-basic-auth.txt). */
function lockBlock($authUserFile)
{
    return "# Nest flyers: the staff login, over https only (docs/deploy.md, step 3).\n"
        . "AuthType Basic\n"
        . 'AuthName "' . REALM . "\"\n"
        . "AuthUserFile $authUserFile\n"
        . "<RequireAll>\n"
        . "    Require valid-user\n"
        . "    Require expr \"%{HTTPS} == 'on' || %{HTTP:X-Forwarded-Proto} == 'https'\"\n"
        . "</RequireAll>\n";
}

/** The block that sends http:// to https:// (access-examples/htaccess-force-https.txt). */
function forceHttpsBlock()
{
    return "# Nest flyers: http:// goes to https://.\n"
        . "<If \"%{HTTPS} != 'on' && %{HTTP:X-Forwarded-Proto} != 'https'\">\n"
        . "    ErrorDocument 403 https://%{HTTP_HOST}%{REQUEST_URI}\n"
        . "</If>\n"
        . "<IfModule mod_rewrite.c>\n"
        . "    RewriteEngine On\n"
        . "    RewriteCond %{HTTPS} !=on\n"
        . "    RewriteCond %{HTTP:X-Forwarded-Proto} !=https\n"
        . "    RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]\n"
        . "</IfModule>\n";
}

/** Where the password file should go: next to the web root rather than in it, when there is a web root to go next to. */
function passwordFilePaths(array $server, $appRoot)
{
    $paths = [];
    $root = isset($server['DOCUMENT_ROOT']) ? rtrim(str_replace('\\', '/', (string) $server['DOCUMENT_ROOT']), '/') : '';
    if ($root !== '' && dirname($root) !== $root) {
        $paths['outside'] = dirname($root) . '/nest-flyers.htpasswd';
    }
    $paths['inside'] = $appRoot . '/.htpasswd';
    return $paths;
}

/**
 * The password box's answer: one password in, the lines to paste out.
 *
 * @return array{error?: string, configPhp?: string, htpasswd?: string, lock?: string, forceHttps?: string, authUserFile?: string}
 */
function passwordBlocks($user, $password, array $passwordFiles)
{
    if ($user === '' || strpos($user, ':') !== false) {
        return ['error' => 'The user name must not be empty or contain ":".'];
    }
    if ($password === '') {
        return ['error' => 'Type a password.'];
    }
    $file = isset($passwordFiles['outside']) ? $passwordFiles['outside'] : $passwordFiles['inside'];
    return [
        'configPhp' => configPhp($user, password_hash($password, PASSWORD_BCRYPT)),
        'htpasswd' => $user . ':' . password_hash($password, PASSWORD_BCRYPT, ['cost' => HTPASSWD_COST]) . "\n",
        'lock' => lockBlock($file),
        'forceHttps' => forceHttpsBlock(),
        'authUserFile' => $file,
    ];
}

/* ---- the page ---- */

/**
 * The server-side fetch, or null when the host allows neither curl nor URL
 * fopen (common on shared hosting: then the page lists URLs to open by hand).
 *
 * @return callable|null function (string $url, list<string> $headers): array{status:int, headers:array<string,string>, body:string}|array{error:string}
 */
function defaultFetch()
{
    if (function_exists('curl_init')) {
        return function ($url, array $headers) {
            $got = [];
            $handle = curl_init($url);
            curl_setopt_array($handle, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_TIMEOUT => 10,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_HEADERFUNCTION => function ($h, $line) use (&$got) {
                    $colon = strpos($line, ':');
                    if ($colon !== false) {
                        $got[strtolower(trim(substr($line, 0, $colon)))] = trim(substr($line, $colon + 1));
                    }
                    return strlen($line);
                },
            ]);
            $body = curl_exec($handle);
            if ($body === false) {
                return ['error' => curl_error($handle)];
            }
            return ['status' => (int) curl_getinfo($handle, CURLINFO_HTTP_CODE), 'headers' => $got, 'body' => (string) $body];
        };
    }
    if (filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN)) {
        return function ($url, array $headers) {
            $context = stream_context_create(['http' => [
                'method' => 'GET',
                'header' => implode("\r\n", $headers),
                'ignore_errors' => true,
                'follow_location' => 0,
                'timeout' => 10,
            ]]);
            $body = @file_get_contents($url, false, $context);
            $lines = function_exists('http_get_last_response_headers') ? http_get_last_response_headers() : (isset(${'http_response_header'}) ? ${'http_response_header'} : null);
            if (!is_array($lines) || $lines === [] || preg_match('#^HTTP/\S+\s+(\d{3})#', $lines[0], $m) !== 1) {
                $e = error_get_last();
                return ['error' => $e ? $e['message'] : 'no answer'];
            }
            $got = [];
            foreach (array_slice($lines, 1) as $line) {
                $colon = strpos($line, ':');
                if ($colon !== false) {
                    $got[strtolower(trim(substr($line, 0, $colon)))] = trim(substr($line, $colon + 1));
                }
            }
            return ['status' => (int) $m[1], 'headers' => $got, 'body' => (string) $body];
        };
    }
    return null;
}

/** Every line of the report, in the order a deploy meets them. */
function report(array $server, $appRoot, $fetch)
{
    $base = selfBase($server);
    $released = is_file($appRoot . '/' . MANIFEST);
    $ini = [
        'upload_max_filesize' => (string) ini_get('upload_max_filesize'),
        'post_max_size' => (string) ini_get('post_max_size'),
        'memory_limit' => (string) ini_get('memory_limit'),
    ];
    $loaded = [];
    foreach (EXTENSIONS as $name) {
        $loaded[$name] = extension_loaded($name);
    }
    $dirs = ['this folder' => $appRoot];
    foreach (['data', 'uploads'] as $dir) {
        if (is_dir("$appRoot/$dir")) {
            $dirs["$dir/"] = "$appRoot/$dir";
        }
    }

    $sections = [];
    $sections['This hosting account'] = [
        phpCheck(PHP_VERSION, PHP_SAPI),
        extensionsCheck($loaded),
        limitsCheck($ini),
        writableCheck($dirs),
        openBasedirCheck(ini_get('open_basedir')),
        timezoneCheck(ini_get('date.timezone')),
        displayErrorsCheck(ini_get('display_errors')),
    ];
    $sections['Connection and login'] = [httpsCheck($server, $base, $fetch), loginCheck($server)];
    $sections['The release'] = releaseChecks(releaseVerdict($appRoot));

    $noFetch = $fetch === null ? 'This host lets PHP fetch nothing (no curl, no allow_url_fopen).'
        : ($base === null ? 'The Host header is not this site\'s name, so this page fetches nothing.' : null);
    if (!$released) {
        $sections['From the outside'] = [check('outside', 'info', 'From the outside', 'Checked once the release is uploaded.')];
    } elseif ($noFetch !== null) {
        $sections['From the outside'] = [check('outside', 'warn', 'From the outside', $noFetch, 'Open the addresses below in a private window yourself.')];
        $sections['Flyer fonts'] = [check('fonts', 'warn', 'Flyer fonts', $noFetch, 'Open the app and export a flyer: compare the typeface with a known-good one.')];
    } else {
        $sections['From the outside'] = outsideChecks($base, $fetch, firstPhoto($appRoot));
        $sections['Flyer fonts'] = [fontsCheck($base, $fetch, fontPaths($appRoot), forwardedLogin($server))];
    }
    return ['sections' => $sections, 'base' => $base, 'released' => $released];
}

function h($text)
{
    return htmlspecialchars((string) $text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function render(array $report, $password, array $passwordFiles, $appRoot, $https)
{
    $count = ['fail' => 0, 'warn' => 0];
    foreach ($report['sections'] as $checks) {
        foreach ($checks as $c) {
            if (isset($count[$c['status']])) {
                $count[$c['status']]++;
            }
        }
    }
    $summary = $count['fail'] > 0 ? "{$count['fail']} to fix before going on" . ($count['warn'] ? ", {$count['warn']} to look at" : '')
        : ($count['warn'] > 0 ? "Nothing blocking; {$count['warn']} to look at" : 'Nothing to fix');
    $base = $report['base'] !== null ? $report['base'] : '(this folder\'s address)';

    $html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<meta name="robots" content="noindex, nofollow"><title>Nest flyers preflight</title><style>'
        . ':root{color-scheme:light dark;--bg:#fbf8f1;--ink:#1d2a30;--muted:#5b6b72;--line:#e3ddd0;--pass:#1f7a4d;--warn:#9a6700;--fail:#b42318;--info:#0d6f82;--card:#fff}'
        . '@media (prefers-color-scheme:dark){:root{--bg:#141a1d;--ink:#e8eef0;--muted:#9fb0b7;--line:#2b353a;--card:#1b2327;--pass:#4cc38a;--warn:#e0b341;--fail:#ff8a7a;--info:#53ced1}}'
        . 'body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}'
        . 'main{max-width:860px;margin:0 auto;padding:24px 16px 64px}h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.1rem;margin:32px 0 8px}'
        . '.lead{color:var(--muted);margin:0 0 16px}.summary{padding:12px 16px;border-radius:10px;background:var(--card);border:1px solid var(--line);font-weight:600}'
        . 'ul{list-style:none;margin:0;padding:0}li.check{background:var(--card);border:1px solid var(--line);border-left-width:6px;border-radius:8px;padding:10px 14px;margin:8px 0}'
        . 'li.pass{border-left-color:var(--pass)}li.warn{border-left-color:var(--warn)}li.fail{border-left-color:var(--fail)}li.info{border-left-color:var(--info)}'
        . '.badge{font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-right:8px}.pass .badge{color:var(--pass)}.warn .badge{color:var(--warn)}.fail .badge{color:var(--fail)}.info .badge{color:var(--info)}'
        . '.todo{color:var(--muted);margin-top:4px}code,pre{font:13px/1.45 ui-monospace,Consolas,monospace}pre{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;overflow-x:auto;white-space:pre}'
        . 'form{display:grid;gap:8px;max-width:420px}input{font:inherit;padding:8px 10px;border-radius:6px;border:1px solid var(--line);background:var(--card);color:var(--ink)}'
        . 'button{font:inherit;font-weight:600;padding:8px 14px;border-radius:6px;border:0;background:var(--info);color:#fff;cursor:pointer;justify-self:start}'
        . '.alert{border-left:6px solid var(--fail);background:var(--card);padding:10px 14px;border-radius:8px}#protocol{display:none}'
        . '</style></head><body><main>'
        . '<h1>Nest flyers preflight</h1><p class="lead">Is this hosting account ready for the flyer app? App folder: <code>' . h($appRoot) . '</code></p>'
        . '<p class="summary" id="summary">' . h($summary) . '.</p>'
        . '<p class="alert" id="protocol">Your browser is on https, but PHP thinks this request came over http. The login refuses anything that does not look like https: ask the host how it tells PHP about https.</p>';
    foreach ($report['sections'] as $title => $checks) {
        $html .= '<h2>' . h($title) . '</h2><ul>';
        foreach ($checks as $c) {
            $html .= '<li class="check ' . h($c['status']) . '" data-check="' . h($c['id']) . '" data-status="' . h($c['status']) . '">'
                . '<span class="badge">' . h($c['status']) . '</span><strong>' . h($c['title']) . '</strong> ' . h($c['says'])
                . ($c['todo'] !== '' ? '<div class="todo">' . h($c['todo']) . '</div>' : '') . '</li>';
        }
        $html .= '</ul>';
    }
    if ($report['released']) {
        $html .= '<h2>By hand, in a private window</h2><p class="lead">Nothing here should open without asking for the login (a stranger has none):</p><ul>';
        foreach (['index.html', firstPhoto($appRoot), 'api/config'] as $path) {
            $html .= '<li><code>' . h($base . $path) . '</code></li>';
        }
        $html .= '</ul>';
    }

    $html .= '<h2>The staff password</h2><p class="lead">Type the password once. You get the lines to paste; nothing is stored. Use the same login in config.php and .htaccess.</p>';
    if (!$https) {
        $html .= '<p class="alert">This page is on plain http: whatever you type crosses the wire unencrypted. Open it as https:// first.</p>';
    }
    $html .= '<form method="post" autocomplete="off"><label>User <input name="user" value="staff" autocomplete="username"></label>'
        . '<label>Password <input name="password" type="password" autocomplete="new-password" required></label><button>Make the lines</button></form>';
    if ($password !== null) {
        if (isset($password['error'])) {
            $html .= '<p class="alert">' . h($password['error']) . '</p>';
        } else {
            $html .= '<h2>1. config.php</h2><p class="lead">Upload as <code>config.php</code> next to <code>api.php</code>. It locks the API.</p><pre id="config-php">' . h($password['configPhp']) . '</pre>'
                . '<h2>2. The password file</h2><p class="lead">One line, saved as <code>' . h($password['authUserFile']) . '</code>'
                . (isset($passwordFiles['outside']) ? ' (outside the web root). If your FTP login cannot reach that folder, use <code>' . h($passwordFiles['inside']) . '</code> instead, and change AuthUserFile below to match.' : '.')
                . '</p><pre id="htpasswd">' . h($password['htpasswd']) . '</pre>'
                . '<h2>3. The top of .htaccess</h2><p class="lead">Paste both blocks above everything else in the app folder\'s <code>.htaccess</code>. They lock the editor page, the art and the photos, over https only.</p>'
                . '<pre id="htaccess">' . h($password['lock'] . "\n" . $password['forceHttps']) . '</pre>'
                . '<p class="lead">Locked out? Delete config.php and remove these blocks over FTP: everything then answers 503 "not set up yet", which is safe. Never use allowPublic.</p>';
        }
    }
    $html .= '<script>if(location.protocol==="https:"&&' . ($https ? 'false' : 'true') . ')document.getElementById("protocol").style.display="block";</script>'
        . '</main></body></html>';
    return $html;
}

function main()
{
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
    header('Referrer-Policy: no-referrer');
    header('X-Frame-Options: DENY');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");

    $appRoot = rtrim(str_replace('\\', '/', __DIR__), '/');
    $passwordFiles = passwordFilePaths($_SERVER, $appRoot);
    $password = null;
    if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $password = passwordBlocks(
            trim(isset($_POST['user']) ? (string) $_POST['user'] : ''),
            isset($_POST['password']) ? (string) $_POST['password'] : '',
            $passwordFiles
        );
    }
    echo render(report($_SERVER, $appRoot, defaultFetch()), $password, $passwordFiles, $appRoot, isHttps($_SERVER));
}

// Only as a web page: php/tests/Preflight requires this file for its functions.
if (PHP_SAPI !== 'cli') {
    main();
}
