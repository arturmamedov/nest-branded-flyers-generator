<?php

declare(strict_types=1);

namespace NestFlyers\Http;

/**
 * Who may use the API at all: there is no login by design, so on a shared host
 * config.php's access rule is the lock (docs/api-contract.md, "Access rule").
 *
 * - No rule: 503 not_configured, for everyone.
 * - Any configured rule grants access (like Apache's RequireAny): allowPublic,
 *   a REMOTE_ADDR inside allowIps, or the right Basic credentials.
 * - Otherwise 401 with a Basic challenge when Basic auth is configured (so a
 *   browser outside the office network can still sign in), else 403 ip_forbidden.
 *
 * Only REMOTE_ADDR counts. X-Forwarded-For and friends are set by the client,
 * so trusting them would let anyone claim an allowed address.
 */
final class AccessGuard
{
    public const REALM = 'Nest flyers';

    public function __construct(
        private readonly AccessRule $rule,
        private readonly ErrorCatalog $errors,
    ) {
    }

    /** @throws HttpError not_configured (503), unauthorized (401) or ip_forbidden (403) */
    public function check(Request $request): void
    {
        if (!$this->rule->isConfigured()) {
            throw $this->errors->make('not_configured');
        }
        if ($this->rule->allowPublic) {
            return;
        }
        $ip = $request->server['REMOTE_ADDR'] ?? null;
        if (is_string($ip) && $this->rule->allowsIp($ip)) {
            return;
        }
        if ($this->rule->basicAuth === null) {
            throw $this->errors->make('ip_forbidden');
        }
        if (!$this->validCredentials($request, $this->rule->basicAuth)) {
            throw $this->errors->make('unauthorized', [], null, ['WWW-Authenticate' => 'Basic realm="' . self::REALM . '"']);
        }
    }

    /** @param array{user:string, passwordHash:string} $basicAuth */
    private function validCredentials(Request $request, array $basicAuth): bool
    {
        $credentials = self::credentials($request->server);
        if ($credentials === null) {
            return false;
        }
        [$user, $password] = $credentials;
        // Both checks always run, so the answer time does not tell a wrong user from a wrong password.
        $userMatches = hash_equals($basicAuth['user'], $user);
        $passwordMatches = password_verify($password, $basicAuth['passwordHash']);
        return $userMatches && $passwordMatches;
    }

    /**
     * mod_php fills PHP_AUTH_USER/PW. CGI and FPM don't pass the Authorization
     * header on, so the root .htaccess copies it into HTTP_AUTHORIZATION, which
     * arrives as REDIRECT_HTTP_AUTHORIZATION after the rewrite to api.php.
     *
     * @param array<string, mixed> $server
     * @return array{0:string, 1:string}|null
     */
    private static function credentials(array $server): ?array
    {
        if (isset($server['PHP_AUTH_USER']) && is_string($server['PHP_AUTH_USER'])) {
            $password = $server['PHP_AUTH_PW'] ?? '';
            return [$server['PHP_AUTH_USER'], is_string($password) ? $password : ''];
        }
        foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $key) {
            $header = $server[$key] ?? '';
            if (is_string($header) && trim($header) !== '') {
                return self::parseBasic($header);
            }
        }
        return null;
    }

    /** @return array{0:string, 1:string}|null "Basic base64(user:password)", else null */
    private static function parseBasic(string $header): ?array
    {
        if (preg_match('~^\s*Basic\s+([A-Za-z0-9+/]+=*)\s*\z~i', $header, $m) !== 1) {
            return null;
        }
        $decoded = base64_decode($m[1], true);
        if ($decoded === false || !str_contains($decoded, ':')) {
            return null;
        }
        [$user, $password] = explode(':', $decoded, 2);
        return [$user, $password];
    }
}
