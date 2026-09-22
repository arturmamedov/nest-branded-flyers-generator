<?php

declare(strict_types=1);

namespace NestFlyers\Tests;

use InvalidArgumentException;
use NestFlyers\Config;
use NestFlyers\Tests\Support\TempDir;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ConfigTest extends TestCase
{
    /** A made-up app root: fromArray() never touches the filesystem. */
    private const ROOT = '/srv/www/nest-flyers';

    private ?string $appRoot = null;

    protected function tearDown(): void
    {
        if ($this->appRoot !== null) {
            TempDir::remove($this->appRoot);
        }
    }

    public function testAMissingFileIsNoConfig(): void
    {
        self::assertNull(Config::load($this->tempRoot()));
    }

    public function testTheFileIsLoaded(): void
    {
        $root = $this->tempRoot();
        file_put_contents("$root/config.php", "<?php\nreturn ['access' => ['allowIps' => ['10.0.0.0/8']], 'imageProcessor' => 'gd'];\n");
        $config = Config::load($root);
        self::assertNotNull($config);
        self::assertTrue($config->access->allowsIp('10.1.2.3'));
        self::assertSame('gd', $config->imageProcessor);
        self::assertSame("$root/data", $config->dataDir);
    }

    public function testStrayOutputInTheFileIsSwallowed(): void
    {
        $root = $this->tempRoot();
        // A BOM and a blank line before "<?php", as a Windows editor might leave them.
        file_put_contents("$root/config.php", "\xEF\xBB\xBF\n<?php return ['access' => ['allowPublic' => true]];");
        $level = ob_get_level();
        $this->expectOutputString('');
        self::assertTrue(Config::load($root)?->access->allowPublic);
        self::assertSame($level, ob_get_level());
    }

    /** @return iterable<string, array{string}> */
    public static function brokenFiles(): iterable
    {
        yield 'returns a string' => ["<?php return 'allowPublic';"];
        yield 'returns nothing' => ["<?php \$access = ['allowPublic' => true];"];
        yield 'returns a list' => ["<?php return ['10.0.0.0/8'];"];
        yield 'does not parse' => ["<?php return [;"];
        yield 'throws' => ["<?php throw new RuntimeException('no');"];
    }

    #[DataProvider('brokenFiles')]
    public function testABrokenFileIsInvalid(string $php): void
    {
        $root = $this->tempRoot();
        file_put_contents("$root/config.php", $php);
        $level = ob_get_level();
        try {
            Config::load($root);
            self::fail('The file was accepted');
        } catch (InvalidArgumentException $e) {
            self::assertStringContainsString('config.php', $e->getMessage());
        }
        self::assertSame($level, ob_get_level(), 'no output buffer is left open');
    }

    public function testDefaults(): void
    {
        $config = Config::fromArray([], self::ROOT);
        self::assertFalse($config->access->isConfigured(), 'no rule: the API answers 503');
        self::assertSame(self::ROOT . '/data', $config->dataDir);
        self::assertSame('json', $config->storage);
        self::assertSame('auto', $config->imageProcessor);
    }

    public function testTheSampleShapeIsValid(): void
    {
        $hash = password_hash('pw', PASSWORD_BCRYPT, ['cost' => 4]);
        $config = Config::fromArray([
            'access' => [
                'allowIps' => ['203.0.113.7/32', '2001:db8::/32'],
                'basicAuth' => ['user' => 'staff', 'passwordHash' => $hash],
                'allowPublic' => false,
            ],
            'dataDir' => null,
            'storage' => 'json',
            'imageProcessor' => 'imagick',
        ], self::ROOT);
        self::assertTrue($config->access->isConfigured());
        self::assertSame(['user' => 'staff', 'passwordHash' => $hash], $config->access->basicAuth);
        self::assertCount(2, $config->access->allowIps);
        self::assertSame('imagick', $config->imageProcessor);
    }

    /** @return iterable<string, array{?string, string}> */
    public static function dataDirs(): iterable
    {
        yield 'null is data/ in the app root' => [null, self::ROOT . '/data'];
        yield 'relative, under data/' => ['data/library', self::ROOT . '/data/library'];
        yield 'relative, with dot segments' => ['./data/./x/../library/', self::ROOT . '/data/library'];
        yield 'relative, outside the web root' => ['../nest-flyers-data', '/srv/www/nest-flyers-data'];
        yield 'relative, further out' => ['../../private/nest', '/srv/private/nest'];
        yield 'relative, backslashes' => ['..\\nest-data', '/srv/www/nest-data'];
        yield 'absolute, outside' => ['/home/account/nest-data', '/home/account/nest-data'];
        yield 'absolute, trailing slash' => ['/home/account/nest-data/', '/home/account/nest-data'];
        yield 'absolute, dot segments' => ['/home/account/x/../nest-data', '/home/account/nest-data'];
        yield 'absolute, Windows drive' => ['D:\\nest\\data', 'D:/nest/data'];
        yield 'absolute, Windows drive with forward slashes' => ['D:/nest/data', 'D:/nest/data'];
        yield 'absolute, UNC share' => ['\\\\nas\\share\\nest', '//nas/share/nest'];
        yield 'absolute, the default spelled out' => [self::ROOT . '/data', self::ROOT . '/data'];
    }

    #[DataProvider('dataDirs')]
    public function testDataDirResolution(?string $dataDir, string $expected): void
    {
        self::assertSame($expected, Config::fromArray(['dataDir' => $dataDir], self::ROOT)->dataDir);
    }

    public function testASubfolderInstallCannotPutTheStoreAnywhereUnderTheDocumentRoot(): void
    {
        // The app in public_html/nest-flyers: "../nest-flyers-data" leaves the
        // app folder but is still inside public_html, so it would be served.
        $app = '/home/account/public_html/nest-flyers';
        $web = '/home/account/public_html';
        $this->expectExceptionMessage('inside the web root');
        Config::fromArray(['dataDir' => '../nest-flyers-data'], $app, $web);
    }

    public function testADataDirOutsideTheDocumentRootIsFine(): void
    {
        $app = '/home/account/public_html/nest-flyers';
        $web = '/home/account/public_html';
        self::assertSame('/home/account/nest-flyers-data', Config::fromArray(['dataDir' => '../../nest-flyers-data'], $app, $web)->dataDir);
        // The release denies data/, so the default stays allowed wherever the app lives.
        self::assertSame("$app/data", Config::fromArray([], $app, $web)->dataDir);
    }

    public function testDataDirIsResolvedAgainstAWindowsAppRoot(): void
    {
        self::assertSame('C:/laragon/www/nest/data', Config::fromArray([], 'C:\\laragon\\www\\nest\\')->dataDir);
        self::assertSame('C:/laragon/nest-data', Config::fromArray(['dataDir' => '..\\..\\nest-data'], 'C:\\laragon\\www\\nest')->dataDir);
    }

    /** @return iterable<string, array{mixed}> */
    public static function servedDataDirs(): iterable
    {
        yield 'another folder in the web root' => ['library'];
        yield 'the web root itself' => ['.'];
        yield 'out of data/ and back in' => ['data/../library'];
        yield 'absolute, in the web root' => [self::ROOT . '/static/library'];
        yield 'a sibling that only shares a prefix with data' => ['database'];
    }

    #[DataProvider('servedDataDirs')]
    public function testADataDirThatWouldBeServedIsRefused(mixed $dataDir): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('inside the web root');
        Config::fromArray(['dataDir' => $dataDir], self::ROOT);
    }

    /** @return iterable<string, array{mixed}> */
    public static function invalidConfigs(): iterable
    {
        yield 'a list' => [['json']];
        yield 'not an array' => ['json'];
        yield 'an unknown key' => [['acess' => ['allowPublic' => true]]];
        yield 'another storage' => [['storage' => 'sqlite']];
        yield 'another image library' => [['imageProcessor' => 'vips']];
        yield 'dataDir empty' => [['dataDir' => '']];
        yield 'dataDir not a string' => [['dataDir' => 42]];
        yield 'access not an array' => [['access' => true]];
        yield 'access, unknown key' => [['access' => ['allowIp' => ['10.0.0.0/8']]]];
        yield 'allowIps not a list' => [['access' => ['allowIps' => '10.0.0.0/8']]];
        yield 'allowIps, bad entry' => [['access' => ['allowIps' => ['the office']]]];
        yield 'allowIps, bad prefix' => [['access' => ['allowIps' => ['10.0.0.0/40']]]];
        yield 'allowIps, not a string' => [['access' => ['allowIps' => [10]]]];
        yield 'basicAuth, plain password' => [['access' => ['basicAuth' => ['user' => 'staff', 'passwordHash' => 'hunter2']]]];
        yield 'basicAuth, no user' => [['access' => ['basicAuth' => ['passwordHash' => '$2y$04$abcdefghijklmnopqrstuu5Z0Y2eBvmAqD6Zz0ZtW3J1eXbq5v1eu']]]];
        yield 'basicAuth, user with a colon' => [['access' => ['basicAuth' => ['user' => 'a:b', 'passwordHash' => '$2y$04$abcdefghijklmnopqrstuu5Z0Y2eBvmAqD6Zz0ZtW3J1eXbq5v1eu']]]];
        yield 'basicAuth, extra key' => [['access' => ['basicAuth' => ['user' => 'staff', 'password' => 'hunter2']]]];
        yield 'allowPublic, a string' => [['access' => ['allowPublic' => 'yes']]];
        yield 'allowPublic, a number' => [['access' => ['allowPublic' => 1]]];
    }

    #[DataProvider('invalidConfigs')]
    public function testInvalidConfigsAreRefused(mixed $raw): void
    {
        $this->expectException(InvalidArgumentException::class);
        Config::fromArray($raw, self::ROOT);
    }

    private function tempRoot(): string
    {
        return $this->appRoot = TempDir::create('config');
    }
}
