<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Http;

use InvalidArgumentException;
use NestFlyers\Http\Cidr;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class CidrTest extends TestCase
{
    /** @return iterable<string, array{string, string, bool}> */
    public static function memberships(): iterable
    {
        yield 'IPv4 inside /24' => ['192.168.1.0/24', '192.168.1.77', true];
        yield 'IPv4 outside /24' => ['192.168.1.0/24', '192.168.2.1', false];
        yield 'IPv4 host bits in the network are ignored' => ['192.168.1.99/24', '192.168.1.1', true];
        yield 'IPv4 /32 exact' => ['203.0.113.7/32', '203.0.113.7', true];
        yield 'IPv4 /32 neighbour' => ['203.0.113.7/32', '203.0.113.8', false];
        yield 'IPv4 bare address is a host' => ['203.0.113.7', '203.0.113.7', true];
        yield 'IPv4 bare address, other host' => ['203.0.113.7', '203.0.113.70', false];
        yield 'IPv4 odd prefix inside' => ['10.0.0.0/13', '10.7.255.255', true];
        yield 'IPv4 odd prefix outside' => ['10.0.0.0/13', '10.8.0.0', false];
        yield 'IPv4 /0 is everyone' => ['0.0.0.0/0', '198.51.100.1', true];
        yield 'IPv6 inside /32' => ['2001:db8::/32', '2001:db8:1::5', true];
        yield 'IPv6 outside /32' => ['2001:db8::/32', '2001:db9::1', false];
        yield 'IPv6 loopback' => ['::1/128', '::1', true];
        yield 'IPv6 compressed and expanded forms agree' => ['2001:db8::1/128', '2001:0db8:0000:0000:0000:0000:0000:0001', true];
        yield 'IPv4-mapped client, IPv4 rule' => ['127.0.0.1/32', '::ffff:127.0.0.1', true];
        yield 'IPv4 client, IPv4-mapped rule' => ['::ffff:10.0.0.0/104', '10.1.2.3', true];
        yield 'IPv4 client outside an IPv4-mapped rule' => ['::ffff:10.0.0.0/104', '11.1.2.3', false];
        yield 'IPv6 client never matches an IPv4 rule' => ['0.0.0.0/0', '2001:db8::1', false];
        yield 'IPv4 client never matches an IPv6 rule' => ['::/0', '192.0.2.1', false];
        yield 'garbage client' => ['0.0.0.0/0', 'not-an-ip', false];
        yield 'empty client' => ['0.0.0.0/0', '', false];
        yield 'zone id is not an address' => ['fe80::/10', 'fe80::1%eth0', false];
    }

    #[DataProvider('memberships')]
    public function testContains(string $cidr, string $ip, bool $expected): void
    {
        self::assertSame($expected, Cidr::parse($cidr)->contains($ip));
    }

    /** @return iterable<string, array{string}> */
    public static function invalid(): iterable
    {
        yield 'not an address' => ['office'];
        yield 'empty' => [''];
        yield 'IPv4 prefix too long' => ['10.0.0.0/33'];
        yield 'IPv6 prefix too long' => ['2001:db8::/129'];
        yield 'negative prefix' => ['10.0.0.0/-1'];
        yield 'prefix not a number' => ['10.0.0.0/8a'];
        yield 'empty prefix' => ['10.0.0.0/'];
        yield 'hostname' => ['localhost'];
        yield 'mapped range wider than IPv4' => ['::ffff:1.2.3.4/64'];
        yield 'trailing newline in the prefix' => ["10.0.0.0/8\n1"];
    }

    #[DataProvider('invalid')]
    public function testRefusesInvalidEntries(string $cidr): void
    {
        $this->expectException(InvalidArgumentException::class);
        Cidr::parse($cidr);
    }

    public function testSurroundingWhitespaceIsForgiven(): void
    {
        self::assertTrue(Cidr::parse(' 10.0.0.0/8 ')->contains('10.9.9.9'));
    }
}
