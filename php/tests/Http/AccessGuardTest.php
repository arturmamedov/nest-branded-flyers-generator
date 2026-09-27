<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Http;

use NestFlyers\Http\AccessGuard;
use NestFlyers\Http\AccessRule;
use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\HttpError;
use NestFlyers\Http\Request;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Decision 10 / docs/api-contract.md "Access rule": the table, row by row. */
final class AccessGuardTest extends TestCase
{
    private const OFFICE = '203.0.113.7';
    private const OUTSIDER = '198.51.100.20';
    private const CHALLENGE = 'Basic realm="Nest flyers"';

    private static ErrorCatalog $errors;
    private static string $hash;

    public static function setUpBeforeClass(): void
    {
        self::$errors = ErrorCatalog::fromShared(Shared::fromFile(Paths::schema('shared.json')));
        // Cost 4 keeps the suite fast; password_verify reads the cost from the hash.
        self::$hash = password_hash('s3cret:with colon', PASSWORD_BCRYPT, ['cost' => 4]);
    }

    public function testNoRuleIsNotConfigured(): void
    {
        foreach ([AccessRule::none(), AccessRule::fromArray(null), AccessRule::fromArray([])] as $rule) {
            $error = $this->refused($rule, ['REMOTE_ADDR' => '127.0.0.1']);
            self::assertSame(503, $error->status);
            self::assertSame('not_configured', $error->errorCode);
        }
    }

    public function testAnEmptyRuleIsNotConfiguredEvenWithCredentials(): void
    {
        $rule = AccessRule::fromArray(['allowIps' => [], 'basicAuth' => null, 'allowPublic' => false]);
        $error = $this->refused($rule, ['REMOTE_ADDR' => '127.0.0.1', 'PHP_AUTH_USER' => 'staff', 'PHP_AUTH_PW' => 'x']);
        self::assertSame(503, $error->status);
    }

    public function testAllowPublicLetsEveryoneIn(): void
    {
        $rule = AccessRule::fromArray(['allowPublic' => true]);
        $this->allowed($rule, ['REMOTE_ADDR' => self::OUTSIDER]);
        $this->allowed($rule, []);
    }

    public function testIpv4AllowListMatchAndMismatch(): void
    {
        $rule = AccessRule::fromArray(['allowIps' => ['203.0.113.0/24']]);
        $this->allowed($rule, ['REMOTE_ADDR' => self::OFFICE]);
        $error = $this->refused($rule, ['REMOTE_ADDR' => self::OUTSIDER]);
        self::assertSame(403, $error->status);
        self::assertSame('forbidden', $error->errorCode);
        self::assertSame(self::$errors->make('ip_forbidden')->getMessage(), $error->getMessage());
        self::assertSame([], $error->headers, 'an IP-only rule has nothing to sign in with, so no challenge');
    }

    public function testIpv6AllowListMatchAndMismatch(): void
    {
        $rule = AccessRule::fromArray(['allowIps' => ['2001:db8:1234::/48', '::1']]);
        $this->allowed($rule, ['REMOTE_ADDR' => '2001:db8:1234:5::9']);
        $this->allowed($rule, ['REMOTE_ADDR' => '::1']);
        self::assertSame(403, $this->refused($rule, ['REMOTE_ADDR' => '2001:db8:1235::1'])->status);
    }

    public function testIpv4MappedAddressesAreNormalised(): void
    {
        $this->allowed(AccessRule::fromArray(['allowIps' => ['127.0.0.1/32']]), ['REMOTE_ADDR' => '::ffff:127.0.0.1']);
        $this->allowed(AccessRule::fromArray(['allowIps' => ['::ffff:203.0.113.0/120']]), ['REMOTE_ADDR' => self::OFFICE]);
        self::assertSame(403, $this->refused(AccessRule::fromArray(['allowIps' => ['127.0.0.1/32']]), ['REMOTE_ADDR' => '::ffff:127.0.0.2'])->status);
    }

    public function testOnlyRemoteAddrCounts(): void
    {
        $rule = AccessRule::fromArray(['allowIps' => [self::OFFICE]]);
        $error = $this->refused($rule, [
            'REMOTE_ADDR' => self::OUTSIDER,
            'HTTP_X_FORWARDED_FOR' => self::OFFICE,
            'HTTP_X_REAL_IP' => self::OFFICE,
            'HTTP_CLIENT_IP' => self::OFFICE,
        ]);
        self::assertSame(403, $error->status);
        self::assertSame(403, $this->refused($rule, [])->status, 'no REMOTE_ADDR at all');
    }

    public function testBasicAuthFromPhpAuthVariables(): void
    {
        $this->allowed($this->basicOnly(), ['REMOTE_ADDR' => self::OUTSIDER, 'PHP_AUTH_USER' => 'staff', 'PHP_AUTH_PW' => 's3cret:with colon']);
    }

    public function testBasicAuthFromTheAuthorizationHeader(): void
    {
        $header = 'Basic ' . base64_encode('staff:s3cret:with colon');
        $this->allowed($this->basicOnly(), ['REMOTE_ADDR' => self::OUTSIDER, 'HTTP_AUTHORIZATION' => $header]);
        $this->allowed($this->basicOnly(), ['REMOTE_ADDR' => self::OUTSIDER, 'HTTP_AUTHORIZATION' => 'basic  ' . base64_encode('staff:s3cret:with colon')]);
    }

    public function testBasicAuthFromTheRewrittenHeader(): void
    {
        // What CGI/FPM sees after .htaccess copies the header and rewrites to api.php.
        $header = 'Basic ' . base64_encode('staff:s3cret:with colon');
        $this->allowed($this->basicOnly(), ['REMOTE_ADDR' => self::OUTSIDER, 'HTTP_AUTHORIZATION' => '', 'REDIRECT_HTTP_AUTHORIZATION' => $header]);
    }

    public function testMissingCredentialsGetAChallenge(): void
    {
        $error = $this->refused($this->basicOnly(), ['REMOTE_ADDR' => self::OUTSIDER]);
        self::assertSame(401, $error->status);
        self::assertSame('unauthorized', $error->errorCode);
        self::assertSame(['WWW-Authenticate' => self::CHALLENGE], $error->headers);
        self::assertSame(self::CHALLENGE, $error->toResponse()->headers['WWW-Authenticate']);
    }

    /** @return iterable<string, array{array<string, string>}> */
    public static function wrongCredentials(): iterable
    {
        yield 'wrong password' => [['PHP_AUTH_USER' => 'staff', 'PHP_AUTH_PW' => 's3cret']];
        yield 'wrong user' => [['PHP_AUTH_USER' => 'Staff', 'PHP_AUTH_PW' => 's3cret:with colon']];
        yield 'no password' => [['PHP_AUTH_USER' => 'staff']];
        yield 'header, wrong password' => [['HTTP_AUTHORIZATION' => 'Basic ' . base64_encode('staff:nope')]];
        yield 'header without a colon' => [['HTTP_AUTHORIZATION' => 'Basic ' . base64_encode('staff')]];
        yield 'header not base64' => [['HTTP_AUTHORIZATION' => 'Basic ***']];
        yield 'another scheme' => [['HTTP_AUTHORIZATION' => 'Bearer ' . base64_encode('staff:s3cret:with colon')]];
        yield 'rewritten header, wrong password' => [['REDIRECT_HTTP_AUTHORIZATION' => 'Basic ' . base64_encode('staff:nope')]];
    }

    /** @param array<string, string> $credentials */
    #[DataProvider('wrongCredentials')]
    public function testWrongCredentialsGetAChallenge(array $credentials): void
    {
        $error = $this->refused($this->basicOnly(), ['REMOTE_ADDR' => self::OUTSIDER] + $credentials);
        self::assertSame(401, $error->status);
        self::assertSame(['WWW-Authenticate' => self::CHALLENGE], $error->headers);
    }

    public function testIpOrBasicAuth(): void
    {
        $rule = AccessRule::fromArray([
            'allowIps' => ['203.0.113.0/24'],
            'basicAuth' => ['user' => 'staff', 'passwordHash' => self::$hash],
        ]);
        $this->allowed($rule, ['REMOTE_ADDR' => self::OFFICE]); // the office needs no password
        $this->allowed($rule, ['REMOTE_ADDR' => self::OUTSIDER, 'PHP_AUTH_USER' => 'staff', 'PHP_AUTH_PW' => 's3cret:with colon']);
        $error = $this->refused($rule, ['REMOTE_ADDR' => self::OUTSIDER]);
        self::assertSame(401, $error->status, 'an outsider may still sign in, so they get a challenge, not a 403');
        self::assertSame(['WWW-Authenticate' => self::CHALLENGE], $error->headers);
        self::assertSame(401, $this->refused($rule, ['REMOTE_ADDR' => self::OUTSIDER, 'PHP_AUTH_USER' => 'staff', 'PHP_AUTH_PW' => 'x'])->status);
    }

    public function testKindNamesTheRuleForDiagnostics(): void
    {
        $basicAuth = ['user' => 'staff', 'passwordHash' => self::$hash];
        self::assertSame('none', AccessRule::none()->kind());
        self::assertSame('allowIps', AccessRule::fromArray(['allowIps' => ['203.0.113.0/24']])->kind());
        self::assertSame('basicAuth', AccessRule::fromArray(['basicAuth' => $basicAuth])->kind());
        self::assertSame('allowIps+basicAuth', AccessRule::fromArray(['allowIps' => ['203.0.113.0/24'], 'basicAuth' => $basicAuth])->kind());
        // allowPublic lets anyone in whatever else is set, so it is the only word that matters.
        self::assertSame('allowPublic', AccessRule::fromArray(['allowPublic' => true, 'basicAuth' => $basicAuth])->kind());
    }

    private function basicOnly(): AccessRule
    {
        return AccessRule::fromArray(['basicAuth' => ['user' => 'staff', 'passwordHash' => self::$hash]]);
    }

    /** @param array<string, string> $server */
    private function allowed(AccessRule $rule, array $server): void
    {
        // check() throws when it refuses; getting past it is the assertion.
        (new AccessGuard($rule, self::$errors))->check(self::request($server));
        $this->addToAssertionCount(1);
    }

    /** @param array<string, string> $server */
    private function refused(AccessRule $rule, array $server): HttpError
    {
        try {
            (new AccessGuard($rule, self::$errors))->check(self::request($server));
        } catch (HttpError $e) {
            return $e;
        }
        self::fail('The request was let in');
    }

    /** @param array<string, string> $server */
    private static function request(array $server): Request
    {
        return new Request('GET', '/api/config', [], [], '', [], $server);
    }
}
