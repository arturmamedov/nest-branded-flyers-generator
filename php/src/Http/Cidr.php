<?php

declare(strict_types=1);

namespace NestFlyers\Http;

use InvalidArgumentException;

/**
 * One entry of config.php's `access.allowIps`: an IPv4 or IPv6 network in CIDR
 * form ("203.0.113.0/24", "2001:db8::/32"), or a bare address (a single host).
 *
 * IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) are treated as the IPv4 address
 * they carry, on both sides: a dual-stack server reports an IPv4 client that
 * way, and an admin who lists "203.0.113.7/32" means that client.
 */
final class Cidr
{
    private function __construct(
        /** The network address, packed (4 or 16 bytes). */
        private readonly string $network,
        private readonly int $prefix,
    ) {
    }

    /** @throws InvalidArgumentException when the entry is not an address or a network */
    public static function parse(string $cidr): self
    {
        $parts = explode('/', trim($cidr), 2);
        $packed = self::pack($parts[0]);
        if ($packed === null) {
            throw new InvalidArgumentException("\"$cidr\" is not an IP address or CIDR network");
        }
        $bits = strlen($packed) * 8;
        $prefix = $bits;
        if (isset($parts[1])) {
            if (preg_match('/^\d{1,3}\z/', $parts[1]) !== 1 || (int) $parts[1] > self::rawBits($parts[0])) {
                throw new InvalidArgumentException("\"$cidr\" has an invalid prefix length");
            }
            // A mapped network (::ffff:0:0/96 and longer) became IPv4 in pack(), so its prefix loses the 96 mapped bits.
            $prefix = (int) $parts[1] - (self::rawBits($parts[0]) - $bits);
            if ($prefix < 0) {
                throw new InvalidArgumentException("\"$cidr\" is wider than the IPv4-mapped range; list the IPv4 network instead");
            }
        }
        return new self($packed, $prefix);
    }

    public function contains(string $ip): bool
    {
        $packed = self::pack($ip);
        if ($packed === null || strlen($packed) !== strlen($this->network)) {
            return false;
        }
        $whole = intdiv($this->prefix, 8);
        if (strncmp($packed, $this->network, $whole) !== 0) {
            return false;
        }
        $rest = $this->prefix % 8;
        if ($rest === 0) {
            return true;
        }
        $mask = (0xFF << (8 - $rest)) & 0xFF;
        return (ord($packed[$whole]) & $mask) === (ord($this->network[$whole]) & $mask);
    }

    /** inet_pton, with ::ffff:a.b.c.d unwrapped to its 4 IPv4 bytes; null for anything that is not an IP address. */
    private static function pack(string $ip): ?string
    {
        if (filter_var($ip, FILTER_VALIDATE_IP) === false) {
            return null;
        }
        $packed = inet_pton($ip);
        if ($packed === false) {
            return null;
        }
        if (strlen($packed) === 16 && str_starts_with($packed, str_repeat("\0", 10) . "\xFF\xFF")) {
            return substr($packed, 12);
        }
        return $packed;
    }

    /** The address length as written (32 or 128), before any mapped-IPv4 unwrapping. */
    private static function rawBits(string $ip): int
    {
        return str_contains($ip, ':') ? 128 : 32;
    }
}
