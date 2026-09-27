<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Diagnostics;

use NestFlyers\Tests\Support\TempDir;
use PHPUnit\Framework\TestCase;

/**
 * What any reader of release.json must conclude about an app folder. Two
 * readers exist: the app's own (ReleaseCheck, in api/config) and the preflight
 * page's, which has to work before the app is uploaded and so cannot share
 * its code. Each subclass runs every case here against one of them, so they
 * cannot drift into two verdicts. The writer is scripts/php/manifest.ts;
 * tests/cross proves a manifest it wrote reads back through the app.
 */
abstract class ReleaseCheckContractTestCase extends TestCase
{
    /** A small release in the manifest's shape: an ordinary file, a nested one and two of the guard dotfiles. */
    private const FILES = [
        'api.php' => "<?php // the front controller\n",
        'assets/art/spark.png' => "not really a png\n",
        '.htaccess' => "Options -Indexes\nRewriteEngine On\n",
        'data/.htaccess' => "Require all denied\n",
    ];
    private const GUARDS = ['.htaccess', '.user.ini', 'data/.htaccess'];

    private string $root;

    /** @return array<string, mixed> the reader's verdict on $appRoot */
    abstract protected function verdict(string $appRoot): array;

    protected function setUp(): void
    {
        $this->root = TempDir::create('release');
        foreach (self::FILES as $path => $contents) {
            $this->put($path, $contents);
        }
        $files = [];
        foreach (self::FILES as $path => $contents) {
            $files[$path] = ['bytes' => strlen($contents), 'sha256' => hash('sha256', $contents)];
        }
        $this->put('release.json', json_encode([
            'id' => 'abc123def456',
            'builtAt' => '2026-09-23T10:00:00.000Z',
            'commit' => 'b598db3-dirty',
            'guards' => self::GUARDS,
            'files' => $files,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    }

    protected function tearDown(): void
    {
        TempDir::remove($this->root);
    }

    public function testAnIntactReleaseHasNothingToReport(): void
    {
        self::assertSame([
            'id' => 'abc123def456',
            'builtAt' => '2026-09-23T10:00:00.000Z',
            'commit' => 'b598db3-dirty',
            'missing' => [],
            'changed' => [],
            'missingGuards' => [],
            'htaccess' => 'as shipped',
        ], $this->verdict($this->root));
    }

    public function testAMissingFileAndAMissingGuardAreNamedAndNothingElse(): void
    {
        unlink($this->root . '/assets/art/spark.png');
        unlink($this->root . '/data/.htaccess');
        $verdict = $this->verdict($this->root);
        self::assertSame(['assets/art/spark.png', 'data/.htaccess'], $verdict['missing']);
        self::assertSame(['data/.htaccess'], $verdict['missingGuards']);
        self::assertSame([], $verdict['changed']);
    }

    public function testAChangedFileIsNamedEvenAtTheSameSize(): void
    {
        $this->put('api.php', strtoupper(self::FILES['api.php']));
        self::assertSame(['api.php'], $this->verdict($this->root)['changed']);
    }

    public function testFilesTheReleaseNeverShipsAreNotItsBusiness(): void
    {
        $this->put('config.php', "<?php return [];\n");
        $this->put('uploads/2026/09/0123456789abcdef.jpg', 'a photo');
        $this->put('data/meta.json', '{}');
        $verdict = $this->verdict($this->root);
        self::assertSame([], $verdict['missing']);
        self::assertSame([], $verdict['changed']);
    }

    public function testALockPastedAtTheTopOfHtaccessIsNotAChange(): void
    {
        $this->put('.htaccess', "AuthType Basic\nRequire valid-user\n\n" . self::FILES['.htaccess']);
        $verdict = $this->verdict($this->root);
        self::assertSame('block on top', $verdict['htaccess']);
        self::assertSame([], $verdict['changed']);
    }

    public function testAnHtaccessEditedAnywhereElseIsAChange(): void
    {
        $this->put('.htaccess', str_replace('-Indexes', '+Indexes', self::FILES['.htaccess']));
        $verdict = $this->verdict($this->root);
        self::assertSame('changed', $verdict['htaccess']);
        self::assertSame(['.htaccess'], $verdict['changed']);
    }

    public function testAMissingHtaccessIsAMissingGuard(): void
    {
        unlink($this->root . '/.htaccess');
        $verdict = $this->verdict($this->root);
        self::assertSame('missing', $verdict['htaccess']);
        self::assertSame(['.htaccess'], $verdict['missingGuards']);
    }

    public function testAPathOutsideTheFolderIsNeverRead(): void
    {
        $manifest = json_decode((string) file_get_contents($this->root . '/release.json'), true);
        $manifest['files']['../outside.txt'] = ['bytes' => 1, 'sha256' => str_repeat('0', 64)];
        $manifest['files']['C:/Windows/win.ini'] = ['bytes' => 1, 'sha256' => str_repeat('0', 64)];
        $this->put('release.json', (string) json_encode($manifest));
        $verdict = $this->verdict($this->root);
        self::assertSame([], $verdict['missing']);
        self::assertSame([], $verdict['changed']);
    }

    public function testNoManifest(): void
    {
        unlink($this->root . '/release.json');
        self::assertSame(['manifest' => 'missing'], $this->verdict($this->root));
    }

    public function testAnUnreadableManifest(): void
    {
        $this->put('release.json', '{"files": ');
        self::assertStringStartsWith('unreadable', $this->verdict($this->root)['manifest']);
    }

    private function put(string $path, string $contents): void
    {
        $file = $this->root . '/' . $path;
        if (!is_dir(dirname($file))) {
            mkdir(dirname($file), 0775, true);
        }
        file_put_contents($file, $contents);
    }
}
