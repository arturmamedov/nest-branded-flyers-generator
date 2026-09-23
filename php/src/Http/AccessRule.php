<?php

declare(strict_types=1);

namespace NestFlyers\Http;

use InvalidArgumentException;

/**
 * config.php's `access` block, checked: who may use the API (docs/api-contract.md,
 * "Access rule"). An empty rule is valid here and means "not set up yet": the
 * AccessGuard answers 503 until one is added.
 */
final class AccessRule
{
    private const KEYS = ['allowIps', 'basicAuth', 'allowPublic'];

    /**
     * @param list<Cidr> $allowIps
     * @param array{user:string, passwordHash:string}|null $basicAuth
     */
    public function __construct(
        public readonly array $allowIps,
        public readonly ?array $basicAuth,
        public readonly bool $allowPublic,
    ) {
    }

    public static function none(): self
    {
        return new self([], null, false);
    }

    /**
     * Unknown keys are refused rather than ignored: a typo such as "allowIp"
     * would otherwise silently leave the app closed (or, worse, open) without
     * saying why.
     *
     * @throws InvalidArgumentException naming the offending key
     */
    public static function fromArray(mixed $access): self
    {
        if ($access === null) {
            return self::none();
        }
        if (!is_array($access) || ($access !== [] && array_is_list($access))) {
            throw new InvalidArgumentException('access must be an array with allowIps, basicAuth and/or allowPublic');
        }
        $unknown = array_diff(array_keys($access), self::KEYS);
        if ($unknown !== []) {
            throw new InvalidArgumentException('access has unknown keys: ' . implode(', ', $unknown));
        }
        return new self(
            self::allowIps($access['allowIps'] ?? []),
            self::basicAuth($access['basicAuth'] ?? null),
            self::allowPublic($access['allowPublic'] ?? false),
        );
    }

    /** Any one rule opens the API to someone; none at all means "not configured". */
    public function isConfigured(): bool
    {
        return $this->allowPublic || $this->allowIps !== [] || $this->basicAuth !== null;
    }

    public function allowsIp(string $ip): bool
    {
        foreach ($this->allowIps as $network) {
            if ($network->contains($ip)) {
                return true;
            }
        }
        return false;
    }

    /** @return list<Cidr> */
    private static function allowIps(mixed $value): array
    {
        if (!is_array($value) || !array_is_list($value)) {
            throw new InvalidArgumentException('access.allowIps must be a list of IP addresses or CIDR networks');
        }
        $networks = [];
        foreach ($value as $i => $entry) {
            if (!is_string($entry)) {
                throw new InvalidArgumentException("access.allowIps.$i must be a string");
            }
            try {
                $networks[] = Cidr::parse($entry);
            } catch (InvalidArgumentException $e) {
                throw new InvalidArgumentException("access.allowIps.$i: " . $e->getMessage(), 0, $e);
            }
        }
        return $networks;
    }

    /** @return array{user:string, passwordHash:string}|null */
    private static function basicAuth(mixed $value): ?array
    {
        if ($value === null) {
            return null;
        }
        if (!is_array($value) || array_diff(array_keys($value), ['user', 'passwordHash']) !== []) {
            throw new InvalidArgumentException('access.basicAuth must be null or [\'user\' => …, \'passwordHash\' => …]');
        }
        $user = $value['user'] ?? null;
        $hash = $value['passwordHash'] ?? null;
        if (!is_string($user) || $user === '' || str_contains($user, ':')) {
            throw new InvalidArgumentException('access.basicAuth.user must be a non-empty string without ":"');
        }
        // A plain password pasted here would never verify; say so instead of locking everyone out silently.
        if (!is_string($hash) || password_get_info($hash)['algo'] === null) {
            throw new InvalidArgumentException('access.basicAuth.passwordHash must come from password_hash() (or htpasswd -B)');
        }
        return ['user' => $user, 'passwordHash' => $hash];
    }

    private static function allowPublic(mixed $value): bool
    {
        if (!is_bool($value)) {
            throw new InvalidArgumentException('access.allowPublic must be true or false');
        }
        return $value;
    }
}
