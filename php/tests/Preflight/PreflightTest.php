<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Preflight;

use NestFlyers\Config;
use NestFlyers\Diagnostics\HostFacts;
use NestFlyers\Diagnostics\ReleaseCheck;
use NestFlyers\Http\AccessGuard;
use NestFlyers\Photos\UploadLimits;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Tests\Support\TempDir;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

use function NestFlyersPreflight\configPhp;
use function NestFlyersPreflight\displayErrorsCheck;
use function NestFlyersPreflight\extensionsCheck;
use function NestFlyersPreflight\fontPaths;
use function NestFlyersPreflight\fontsCheck;
use function NestFlyersPreflight\forceHttpsBlock;
use function NestFlyersPreflight\httpsCheck;
use function NestFlyersPreflight\limitsCheck;
use function NestFlyersPreflight\lockBlock;
use function NestFlyersPreflight\loginCheck;
use function NestFlyersPreflight\maxUploadBytes;
use function NestFlyersPreflight\outsideVerdict;
use function NestFlyersPreflight\parseQuantity;
use function NestFlyersPreflight\passwordBlocks;
use function NestFlyersPreflight\phpCheck;
use function NestFlyersPreflight\selfBase;

/**
 * The preflight page (php/preflight/nest-preflight.php): its pure parts with
 * the server, ini values and fetch injected, so nothing here touches the
 * network. It cannot use the app's code, so every fact it repeats is pinned
 * here to the app's own copy; the release check is pinned separately, as a
 * contract (PreflightReleaseCheckTest).
 */
final class PreflightTest extends TestCase
{
    public static function setUpBeforeClass(): void
    {
        require_once self::file();
    }

    private static function file(): string
    {
        return Paths::repo() . '/php/preflight/nest-preflight.php';
    }

    // ---- what it repeats from the app ----

    public function testTheFactsItRepeatsAreTheAppsOwn(): void
    {
        $composer = json_decode((string) file_get_contents(Paths::repo() . '/php/composer.json'), true);
        self::assertSame('>=' . \NestFlyersPreflight\MIN_PHP, $composer['require']['php']);
        self::assertSame(Shared::fromFile(Paths::schema('shared.json'))->maxUploadBytes(), \NestFlyersPreflight\MAX_UPLOAD_BYTES);
        self::assertSame(UploadLimits::POST_OVERHEAD_BYTES, \NestFlyersPreflight\POST_OVERHEAD_BYTES);
        self::assertSame(HostFacts::EXTENSIONS, \NestFlyersPreflight\EXTENSIONS);
        self::assertSame(AccessGuard::REALM, \NestFlyersPreflight\REALM);
        self::assertSame(ReleaseCheck::FILE, \NestFlyersPreflight\MANIFEST);
        self::assertSame(ReleaseCheck::EDITABLE_TOP, \NestFlyersPreflight\EDITABLE_TOP);
    }

    /** @return iterable<array{string}> */
    public static function quantities(): iterable
    {
        foreach (['2M', '512k', '1G', '8388608', '-1', '0', '', ' 16M ', '15 M', '3X', 'garbage', '+4K', '128M'] as $value) {
            yield $value => [$value];
        }
    }

    #[DataProvider('quantities')]
    public function testItReadsIniSizesTheWayTheAppDoes(string $value): void
    {
        self::assertSame(UploadLimits::parseQuantity($value), parseQuantity($value));
    }

    /** @return iterable<array{string, string}> */
    public static function limitPairs(): iterable
    {
        yield 'a small host' => ['2M', '3M'];
        yield 'generous' => ['64M', '64M'];
        yield 'post under upload' => ['20M', '8M'];
        yield 'unlimited post' => ['10M', '0'];
        yield 'post eaten by the envelope' => ['2M', '64K'];
    }

    #[DataProvider('limitPairs')]
    public function testItWorksOutTheLargestPhotoTheWayTheAppDoes(string $upload, string $post): void
    {
        $shared = Shared::fromFile(Paths::schema('shared.json'));
        self::assertSame((new UploadLimits($shared->maxUploadBytes(), $upload, $post, '128M'))->maxUploadBytes(), maxUploadBytes($upload, $post));
    }

    // ---- the password step: what it prints is exactly what the app and Apache accept ----

    public function testThePrintedConfigPhpIsWhatTheAppAccepts(): void
    {
        $blocks = passwordBlocks('staff', "correct horse:battery 'staple'", ['inside' => '/app/.htpasswd']);
        $root = TempDir::create('preflight-config');
        try {
            file_put_contents("$root/config.php", $blocks['configPhp']);
            $config = Config::load($root);
            self::assertNotNull($config);
            self::assertSame('basicAuth', $config->access->kind());
            self::assertSame('staff', $config->access->basicAuth['user']);
            self::assertTrue(password_verify("correct horse:battery 'staple'", $config->access->basicAuth['passwordHash']));
            self::assertFalse(password_verify('correct horse', $config->access->basicAuth['passwordHash']));
            self::assertSame("$root/data", $config->dataDir);
        } finally {
            TempDir::remove($root);
        }
    }

    public function testAUserNameIsQuotedSafelyIntoPhp(): void
    {
        $root = TempDir::create('preflight-quote');
        try {
            file_put_contents("$root/config.php", configPhp("o'brien\\", password_hash('x', PASSWORD_BCRYPT, ['cost' => 4])));
            self::assertSame("o'brien\\", Config::load($root)?->access->basicAuth['user']);
        } finally {
            TempDir::remove($root);
        }
    }

    public function testTheHtpasswdLineIsBcryptAtApachesOwnCost(): void
    {
        $line = passwordBlocks('staff', 'pa:ss', ['inside' => '/app/.htpasswd'])['htpasswd'];
        self::assertMatchesRegularExpression('/^staff:\$2y\$05\$[.\/A-Za-z0-9]{53}\n\z/', $line);
        self::assertTrue(password_verify('pa:ss', substr(trim($line), strlen('staff:'))));
    }

    public function testThePasswordFileGoesOutsideTheWebRootWhenThereIsOne(): void
    {
        $blocks = passwordBlocks('staff', 'x', ['outside' => '/homepages/12/d34/nest-flyers.htpasswd', 'inside' => '/homepages/12/d34/htdocs/activities/.htpasswd']);
        self::assertSame('/homepages/12/d34/nest-flyers.htpasswd', $blocks['authUserFile']);
        self::assertStringContainsString('AuthUserFile /homepages/12/d34/nest-flyers.htpasswd', $blocks['lock']);
    }

    public function testItRefusesALoginTheAppWouldRefuse(): void
    {
        self::assertArrayHasKey('error', passwordBlocks('', 'x', ['inside' => '/a']));
        self::assertArrayHasKey('error', passwordBlocks('staff:1', 'x', ['inside' => '/a']));
        self::assertArrayHasKey('error', passwordBlocks('staff', '', ['inside' => '/a']));
    }

    public function testThePrintedHtaccessBlocksAreTheAccessExamples(): void
    {
        $examples = Paths::repo() . '/php/web/access-examples';
        self::assertSame(
            self::directives(str_replace('/home/ACCOUNT/nest-flyers.htpasswd', '/srv/x.htpasswd', (string) file_get_contents("$examples/htaccess-basic-auth.txt"))),
            self::directives(lockBlock('/srv/x.htpasswd')),
        );
        self::assertSame(self::directives((string) file_get_contents("$examples/htaccess-force-https.txt")), self::directives(forceHttpsBlock()));
    }

    // ---- the checks ----

    public function testPhp(): void
    {
        self::assertSame('fail', phpCheck('7.4.33', 'cgi-fcgi')['status']);
        self::assertSame('fail', phpCheck('8.0.30', 'apache2handler')['status']);
        $cgi = phpCheck('8.3.4', 'cgi-fcgi');
        self::assertSame('pass', $cgi['status']);
        self::assertStringContainsString('Authorization hand-off', $cgi['says']);
        self::assertStringNotContainsString('hand-off', phpCheck('8.4.25', 'apache2handler')['says']);
    }

    public function testExtensions(): void
    {
        $all = array_fill_keys(\NestFlyersPreflight\EXTENSIONS, true);
        self::assertSame('pass', extensionsCheck($all)['status']);
        self::assertSame('pass', extensionsCheck(['gd' => false] + $all)['status'], 'imagick is enough');
        self::assertSame('fail', extensionsCheck(['gd' => false, 'imagick' => false] + $all)['status']);
        self::assertSame('fail', extensionsCheck(['json' => false] + $all)['status']);
        self::assertSame('pass', extensionsCheck(['exif' => false, 'fileinfo' => false] + $all)['status'], 'the app needs neither');
    }

    public function testLimits(): void
    {
        self::assertSame('pass', limitsCheck(['upload_max_filesize' => '64M', 'post_max_size' => '64M', 'memory_limit' => '256M'])['status']);
        self::assertSame('warn', limitsCheck(['upload_max_filesize' => '2M', 'post_max_size' => '8M', 'memory_limit' => '256M'])['status']);
        self::assertSame('warn', limitsCheck(['upload_max_filesize' => '64M', 'post_max_size' => '64M', 'memory_limit' => '64M'])['status']);
        self::assertSame('pass', limitsCheck(['upload_max_filesize' => '64M', 'post_max_size' => '64M', 'memory_limit' => '-1'])['status']);
    }

    public function testDisplayErrors(): void
    {
        self::assertSame('warn', displayErrorsCheck('1')['status']);
        self::assertSame('warn', displayErrorsCheck('stdout')['status']);
        self::assertSame('pass', displayErrorsCheck('0')['status']);
        self::assertSame('pass', displayErrorsCheck('')['status']);
    }

    public function testLoginNamesTheCarrierButNeverTheValue(): void
    {
        self::assertSame('info', loginCheck([])['status']);
        $cgi = loginCheck(['REDIRECT_HTTP_AUTHORIZATION' => 'Basic c3RhZmY6c2VjcmV0']);
        self::assertSame('pass', $cgi['status']);
        self::assertStringContainsString('REDIRECT_HTTP_AUTHORIZATION', $cgi['says']);
        self::assertStringNotContainsString('c3RhZmY6c2VjcmV0', $cgi['says']);
        self::assertStringContainsString('PHP_AUTH_USER and HTTP_AUTHORIZATION', loginCheck(['PHP_AUTH_USER' => 'staff', 'PHP_AUTH_PW' => 'x', 'HTTP_AUTHORIZATION' => 'Basic x'])['says']);
    }

    public function testHttps(): void
    {
        $https = ['HTTPS' => 'on', 'HTTP_HOST' => 'nestpass.ai', 'SERVER_NAME' => 'nestpass.ai', 'SCRIPT_NAME' => '/activities/nest-preflight-x.php'];
        $base = selfBase($https);
        self::assertSame('https://nestpass.ai/activities/', $base);
        $asked = [];
        $answer = static function (int $status, string $location = '') use (&$asked): \Closure {
            return static function (string $url, array $headers) use ($status, $location, &$asked): array {
                $asked[] = $url;
                return ['status' => $status, 'headers' => $location !== '' ? ['location' => $location] : [], 'body' => ''];
            };
        };
        self::assertSame('pass', httpsCheck($https, $base, $answer(301, 'https://nestpass.ai/activities/'))['status']);
        self::assertSame(['http://nestpass.ai/activities/'], $asked);
        self::assertSame('fail', httpsCheck($https, $base, $answer(401))['status'], 'a challenge over http sends the password in clear');
        self::assertSame('warn', httpsCheck($https, $base, $answer(403))['status']);
        self::assertSame('warn', httpsCheck($https, $base, $answer(200))['status']);
        self::assertSame('pass', httpsCheck(['HTTP_X_FORWARDED_PROTO' => 'https'] + $https, $base, null)['status']);
        self::assertSame('fail', httpsCheck(['HTTPS' => 'off'] + $https, $base, $answer(301))['status']);
    }

    public function testItFetchesOnlyFromItsOwnSite(): void
    {
        self::assertSame('http://127.0.0.1:8080/', selfBase(['HTTP_HOST' => '127.0.0.1:8080', 'SERVER_NAME' => '127.0.0.1', 'SCRIPT_NAME' => '/nest-preflight-x.php']));
        self::assertNull(selfBase(['HTTP_HOST' => 'internal.example:8080', 'SERVER_NAME' => 'nestpass.ai', 'SCRIPT_NAME' => '/x.php']));
        self::assertNull(selfBase(['HTTP_HOST' => 'evil/path', 'SCRIPT_NAME' => '/x.php']));
    }

    public function testTheOutsideVantage(): void
    {
        $url = 'https://nestpass.ai/activities/';
        self::assertSame('pass', outsideVerdict('outside-shell', 'The editor page', $url, 401)['status']);
        self::assertSame('fail', outsideVerdict('outside-shell', 'The editor page', $url, 200)['status']);
        self::assertSame('fail', outsideVerdict('outside-photo', 'A photo', $url, 404)['status'], 'a 404 means the lock does not reach uploads/');
        self::assertSame('pass', outsideVerdict('outside-photo', 'A photo', $url, 403)['status']);
        self::assertSame('pass', outsideVerdict('outside-api', 'The API', $url, 503)['status']);
        self::assertSame('fail', outsideVerdict('outside-api', 'The API', $url, 200)['status']);
        self::assertSame('pass', outsideVerdict('outside-denied', 'The manifest', $url, 404)['status']);
        self::assertSame('fail', outsideVerdict('outside-denied', 'The manifest', $url, 200)['status']);
        self::assertSame('fail', outsideVerdict('outside-shell', 'The editor page', $url, 500)['status']);
    }

    public function testFontsAreReadFromTheBuiltCssAndFetchedWithTheLogin(): void
    {
        $root = TempDir::create('preflight-fonts');
        try {
            mkdir("$root/static");
            // The shape Vite writes: a woff2 and a woff fallback per face, relative to the stylesheet.
            file_put_contents("$root/static/main-abc.css", '@font-face{font-family:Caveat;src:url(./caveat-latin-400-normal-X1.woff2) format("woff2"),url(./caveat-latin-400-normal-X2.woff) format("woff")}'
                . '@font-face{font-family:Montserrat;src:url("./montserrat-latin-500-normal-Y1.woff2") format("woff2")}');
            $paths = fontPaths($root);
            self::assertSame(['static/caveat-latin-400-normal-X1.woff2', 'static/montserrat-latin-500-normal-Y1.woff2'], $paths);

            $headersSeen = [];
            $serve = static function (array $answers) use (&$headersSeen): \Closure {
                return static function (string $url, array $headers) use ($answers, &$headersSeen): array {
                    $headersSeen[] = $headers;
                    $path = substr($url, strlen('https://h/'));
                    return $answers[$path] ?? ['status' => 404, 'headers' => ['content-type' => 'text/html'], 'body' => ''];
                };
            };
            $font = ['status' => 200, 'headers' => ['content-type' => 'font/woff2'], 'body' => ''];
            $login = ['Authorization: Basic c3RhZmY6eA=='];
            self::assertSame('pass', fontsCheck('https://h/', $serve(array_fill_keys($paths, $font)), $paths, $login)['status']);
            self::assertSame([$login, $login], $headersSeen);
            self::assertSame('fail', fontsCheck('https://h/', $serve([$paths[0] => $font]), $paths, [])['status'], 'one font 404s');
            $soft404 = ['status' => 200, 'headers' => ['content-type' => 'text/html; charset=UTF-8'], 'body' => '<html>'];
            self::assertSame('fail', fontsCheck('https://h/', $serve(array_fill_keys($paths, $soft404)), $paths, [])['status'], 'a host that answers 200 with a page');
            $untyped = ['status' => 200, 'headers' => ['content-type' => 'application/octet-stream'], 'body' => ''];
            self::assertSame('warn', fontsCheck('https://h/', $serve(array_fill_keys($paths, $untyped)), $paths, [])['status']);
            self::assertSame('fail', fontsCheck('https://h/', $serve([]), [], [])['status'], 'no fonts referenced at all');
        } finally {
            TempDir::remove($root);
        }
    }

    // ---- it must parse where the app cannot run ----

    /**
     * A folder still on PHP 7 must get the page's red "PHP too old" line, not a
     * parse error. PHPUnit runs on 8.x, so this refuses the syntax that came later.
     */
    public function testItUsesNoSyntaxNewerThanPhp70(): void
    {
        $newer = [
            'T_FN' => 'arrow functions (7.4)',
            'T_COALESCE_EQUAL' => '??= (7.4)',
            'T_MATCH' => 'match (8.0)',
            'T_NULLSAFE_OBJECT_OPERATOR' => '?-> (8.0)',
            'T_ATTRIBUTE' => 'attributes (8.0)',
            'T_ENUM' => 'enum (8.1)',
            'T_READONLY' => 'readonly (8.1)',
        ];
        $source = '';
        foreach (token_get_all((string) file_get_contents(self::file())) as $token) {
            if (!is_array($token)) {
                $source .= $token;
                continue;
            }
            $name = token_name($token[0]);
            self::assertArrayNotHasKey($name, $newer, "line {$token[2]} uses " . ($newer[$name] ?? $name));
            // The code alone, for the checks below: a docblock may well describe a signature in modern syntax.
            if ($token[0] !== T_COMMENT && $token[0] !== T_DOC_COMMENT) {
                $source .= $token[1];
            }
        }
        // Typed declarations (7.1 nullable, 7.4 properties, 8.0 unions): none at all, so none can be too new.
        self::assertDoesNotMatchRegularExpression('/function\s+\w*\s*\([^)]*\b(int|string|bool|float|iterable|object|mixed|callable)\s+\$/', $source);
        self::assertDoesNotMatchRegularExpression('/\)\s*:\s*\??\w+\s*\{/', $source, 'return types');
    }

    /** The lines Apache acts on: comments and blank lines dropped, indentation kept. @return list<string> */
    private static function directives(string $text): array
    {
        return array_values(array_filter(
            array_map('rtrim', explode("\n", str_replace("\r\n", "\n", $text))),
            static fn (string $line): bool => $line !== '' && !str_starts_with(ltrim($line), '#'),
        ));
    }
}
