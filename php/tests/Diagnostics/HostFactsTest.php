<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Diagnostics;

use NestFlyers\Diagnostics\HostFacts;
use NestFlyers\Http\AccessRule;
use NestFlyers\Image\ImageProcessor;
use NestFlyers\Photos\UploadLimits;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Tests\Support\TempDir;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/** api/config's host facts. The first six keys are ApiTest's; these are the ones deploy night reads. */
final class HostFactsTest extends TestCase
{
    private string $root;

    protected function setUp(): void
    {
        $this->root = TempDir::create('hostfacts');
        mkdir($this->root . '/data');
    }

    protected function tearDown(): void
    {
        TempDir::remove($this->root);
    }

    public function testAWritableFolderIsProvenByAWriteThatLeavesNothingBehind(): void
    {
        $facts = $this->facts($this->root . '/data', $this->root . '/data');
        self::assertSame(['path' => $this->root . '/data', 'writable' => true], $facts['dataDir']);
        self::assertSame([], TempDir::files($this->root . '/data'));
    }

    public function testAFolderThatCannotBeWrittenSaysWhyInPhpsOwnWords(): void
    {
        $facts = $this->facts($this->root . '/data', $this->root . '/no-such-folder');
        self::assertFalse($facts['uploadsDir']['writable']);
        self::assertNotSame('', $facts['uploadsDir']['error']);
    }

    public function testItNamesTheRuleTheReleaseAndTheExtensions(): void
    {
        $facts = $this->facts($this->root . '/data', $this->root . '/data');
        self::assertSame('allowIps', $facts['accessRule']);
        self::assertSame(['manifest' => 'missing'], $facts['release']);
        self::assertSame(HostFacts::EXTENSIONS, array_keys($facts['extensions']));
        self::assertTrue($facts['extensions']['json']);
    }

    /** @return array<string, mixed> */
    private function facts(string $dataDir, string $uploadsDir): array
    {
        $shared = Shared::fromFile(Paths::schema('shared.json'));
        return (new HostFacts(
            $shared,
            new UploadLimits($shared->maxUploadBytes(), '2M', '8M', '128M'),
            static fn (): ImageProcessor => throw new RuntimeException('no image library here'),
            AccessRule::fromArray(['allowIps' => ['127.0.0.1/32']]),
            $this->root,
            $dataDir,
            $uploadsDir,
        ))->toArray();
    }
}
