<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Storage;

use InvalidArgumentException;
use JsonException;
use NestFlyers\Json;
use NestFlyers\Storage\Json\AtomicJsonFiles;
use NestFlyers\Tests\Support\TempDir;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use stdClass;

final class AtomicJsonFilesTest extends TestCase
{
    private string $dir;
    private AtomicJsonFiles $files;

    protected function setUp(): void
    {
        $this->dir = TempDir::create('files');
        $this->files = new AtomicJsonFiles($this->dir);
    }

    protected function tearDown(): void
    {
        TempDir::remove($this->dir);
    }

    public function testWritesThePrettyStoreFormatWithATrailingNewline(): void
    {
        $this->files->write('a.json', ['name' => 'Añaza / Nest', 'n' => 0.1, 'list' => [1, 2]]);

        self::assertSame(
            "{\n    \"name\": \"Añaza / Nest\",\n    \"n\": 0.1,\n    \"list\": [\n        1,\n        2\n    ]\n}\n",
            file_get_contents("$this->dir/a.json"),
        );
    }

    public function testReadsBackObjectsAsStdClassSoEmptyObjectsSurvive(): void
    {
        $this->files->write('a.json', (object) ['empty' => new stdClass(), 'list' => [], 'nested' => (object) ['x' => new stdClass()]]);

        $read = $this->files->read('a.json');

        self::assertInstanceOf(stdClass::class, $read);
        self::assertEquals(new stdClass(), $read->empty);
        self::assertSame([], $read->list);
        self::assertEquals(new stdClass(), $read->nested->x);
        self::assertSame('{"empty":{},"list":[],"nested":{"x":{}}}', Json::encode($read));
    }

    public function testAMissingFileReadsAsNullAndDoesNotExist(): void
    {
        self::assertNull($this->files->read('nope.json'));
        self::assertFalse($this->files->exists('nope.json'));

        $this->files->write('nope.json', []);

        self::assertTrue($this->files->exists('nope.json'));
        self::assertSame([], $this->files->read('nope.json'));
    }

    public function testCreatesParentFolders(): void
    {
        $files = new AtomicJsonFiles($this->dir . '/not/yet');

        $files->write('flyers/deep/7.json', ['id' => 7]);

        self::assertSame(['not/yet/flyers/deep/7.json'], TempDir::files($this->dir));
        self::assertEquals((object) ['id' => 7], $files->read('flyers/deep/7.json'));
    }

    public function testReplacingAFileLeavesNoTempFilesBehind(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->files->write('a.json', ['i' => $i]);
            $this->files->write('sub/b.json', ['i' => $i]);
        }

        self::assertSame(['a.json', 'sub/b.json'], TempDir::files($this->dir));
        self::assertEquals((object) ['i' => 4], $this->files->read('a.json'));
    }

    public function testAValueThatCannotBeEncodedLeavesTheOldFileIntact(): void
    {
        $this->files->write('a.json', ['kept' => true]);
        $before = file_get_contents("$this->dir/a.json");

        foreach ([['bad' => INF], ['bad' => "\xB1\x31"]] as $value) {
            try {
                $this->files->write('a.json', $value);
                self::fail('Expected a JsonException');
            } catch (JsonException) {
                self::assertSame($before, file_get_contents("$this->dir/a.json"));
            }
        }
        self::assertSame(['a.json'], TempDir::files($this->dir));
    }

    public function testAFailedReplaceRemovesTheTempFile(): void
    {
        // A folder where the file should be: every rename attempt fails, on Windows and POSIX alike.
        mkdir("$this->dir/a.json");

        try {
            $this->files->write('a.json', ['x' => 1]);
            self::fail('Expected a RuntimeException');
        } catch (RuntimeException $e) {
            self::assertStringContainsString('a.json', $e->getMessage());
        }

        self::assertSame([], TempDir::files($this->dir));
        self::assertDirectoryExists("$this->dir/a.json");
    }

    public function testInvalidJsonOnDiskFailsNamingTheFile(): void
    {
        file_put_contents("$this->dir/broken.json", '{"half":');

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('broken.json');
        $this->files->read('broken.json');
    }

    public function testRefusesPathsOutsideTheStore(): void
    {
        foreach (['../x.json', 'a/../../x.json', '/etc/x.json', '\\x.json', 'C:/x.json', 'c:x.json', './x.json', ''] as $path) {
            foreach (['read', 'exists', 'write'] as $method) {
                try {
                    $method === 'write' ? $this->files->write($path, []) : $this->files->{$method}($path);
                    self::fail("Expected $method('$path') to be refused");
                } catch (InvalidArgumentException $e) {
                    self::assertStringContainsString('inside the store', $e->getMessage());
                }
            }
        }
        self::assertSame([], TempDir::files($this->dir));
        self::assertFileDoesNotExist(dirname($this->dir) . '/x.json');
    }
}
