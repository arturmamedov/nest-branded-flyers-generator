<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Storage;

use InvalidArgumentException;
use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\HttpError;
use NestFlyers\Json;
use NestFlyers\Shared;
use NestFlyers\Storage\Json\AtomicJsonFiles;
use NestFlyers\Storage\Json\FlockLock;
use NestFlyers\Storage\Json\JsonRepositories;
use NestFlyers\Storage\Json\JsonStore;
use NestFlyers\Tests\Support\FakeClock;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Tests\Support\TempDir;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/** meta.json: creating a store, the version checks, the id counters and the seed hash. */
final class JsonStoreTest extends TestCase
{
    private string $tmp;
    private string $dir;
    private Shared $shared;

    protected function setUp(): void
    {
        $this->tmp = TempDir::create('meta');
        // Not created up front: opening a store creates its folder.
        $this->dir = $this->tmp . '/data/store';
        $this->shared = Shared::fromFile(Paths::schema('shared.json'));
    }

    protected function tearDown(): void
    {
        TempDir::remove($this->tmp);
    }

    public function testAFreshStoreGetsItsFolderEveryFileAndAnEmptyMeta(): void
    {
        $this->store()->open();

        self::assertSame(
            ['.lock', 'doodles.json', 'flyers/index.json', 'hostels.json', 'meta.json', 'photos.json'],
            TempDir::files($this->dir),
        );
        self::assertSame(Json::encode([
            'formatVersion' => $this->shared->storageFormatVersion(),
            'migrations' => $this->shared->storageMigrations(),
            'counters' => ['hostel' => 0, 'doodle' => 0, 'photo' => 0, 'flyer' => 0],
            'seedHash' => null,
        ], true), file_get_contents("$this->dir/meta.json"));
        foreach (['hostels.json', 'doodles.json', 'photos.json', 'flyers/index.json'] as $file) {
            self::assertSame("[]\n", file_get_contents("$this->dir/$file"), $file);
        }
    }

    public function testOpeningAnExistingStoreChangesNothing(): void
    {
        $this->store()->open();
        $this->store()->next('flyer');
        $before = $this->snapshot();

        $this->store()->open();

        self::assertSame($before, $this->snapshot());
    }

    public function testAStoreMissingSomeFilesGetsOnlyTheMissingOnes(): void
    {
        mkdir($this->dir, 0775, true);
        $hostels = Json::encode([['id' => 3, 'slug' => 'h', 'name' => 'H', 'island' => 'Tenerife', 'logoPath' => null, 'sortOrder' => 1]], true);
        file_put_contents("$this->dir/hostels.json", $hostels);

        $this->store()->open();

        self::assertSame($hostels, file_get_contents("$this->dir/hostels.json"));
        self::assertSame("[]\n", file_get_contents("$this->dir/photos.json"));
    }

    public function testCountersCountPerEntityAndPersist(): void
    {
        $store = $this->store();
        $store->open();

        self::assertSame([1, 2, 1, 1, 3], [
            $store->next('hostel'),
            $store->next('hostel'),
            $store->next('flyer'),
            $store->next('photo'),
            $store->next('hostel'),
        ]);
        self::assertSame(2, $this->store()->next('flyer'), 'a new instance reads the saved counter');
        self::assertEquals(
            (object) ['hostel' => 3, 'doodle' => 0, 'photo' => 1, 'flyer' => 2],
            Json::decode((string) file_get_contents("$this->dir/meta.json"))->counters,
        );
    }

    public function testAnUnknownCounterIsABug(): void
    {
        $store = $this->store();
        $store->open();

        $this->expectException(InvalidArgumentException::class);
        $store->next('user');
    }

    public function testTheSeedHashIsNullUntilRecordedAndThenPersists(): void
    {
        $store = $this->store();
        $store->open();
        self::assertNull($store->seedHash());

        $store->recordSeedHash(str_repeat('ab', 32));

        self::assertSame(str_repeat('ab', 32), $this->store()->seedHash());
    }

    public function testAStoreWithANewerFormatVersionIsRefused(): void
    {
        // Whatever else a newer format changed, the answer is "update the app", not "damaged".
        $meta = Json::encode(['formatVersion' => $this->shared->storageFormatVersion() + 1, 'somethingNew' => true], true);
        $this->writeMeta($meta);

        $this->assertStorageTooNew();
        self::assertSame($meta, file_get_contents("$this->dir/meta.json"), 'the store is left alone');
    }

    public function testAStoreWithAMigrationThisBuildDoesNotKnowIsRefused(): void
    {
        $this->writeMeta(Json::encode([
            'formatVersion' => $this->shared->storageFormatVersion(),
            'migrations' => [...$this->shared->storageMigrations(), '2099-01-01-from-the-future'],
            'counters' => ['hostel' => 0, 'doodle' => 0, 'photo' => 0, 'flyer' => 0],
            'seedHash' => null,
        ], true));

        $this->assertStorageTooNew();
    }

    public function testAnOlderStoreThisBuildCannotMigrateIsRefusedLoudly(): void
    {
        $this->store()->open(); // written with today's (empty) migration list
        $withMigration = $this->sharedWithMigrations(['2026-10-01-example']);

        try {
            $this->store($withMigration)->open();
            self::fail('Expected the store to be refused');
        } catch (RuntimeException $e) {
            self::assertNotInstanceOf(HttpError::class, $e);
            self::assertStringContainsString('2026-10-01-example', $e->getMessage());
        }
    }

    public function testAFreshStoreRecordsEveryKnownMigrationAsApplied(): void
    {
        $withMigration = $this->sharedWithMigrations(['2026-10-01-example']);

        $this->store($withMigration)->open();
        $this->store($withMigration)->open();

        self::assertSame(['2026-10-01-example'], Json::decode((string) file_get_contents("$this->dir/meta.json"))->migrations);
    }

    public function testADamagedMetaFailsNamingTheFile(): void
    {
        $damaged = [
            'null',
            '"not an object"',
            '{"formatVersion": 1, "migrations": []}',
            '{"formatVersion": 1, "migrations": [], "counters": {"hostel": 0, "doodle": 0, "photo": -1, "flyer": 0}, "seedHash": null}',
            '{"formatVersion": 1, "migrations": [], "counters": {"hostel": 0, "doodle": 0, "photo": 0, "flyer": 0}}',
            '{"formatVersion": "1", "migrations": [], "counters": {"hostel": 0, "doodle": 0, "photo": 0, "flyer": 0}, "seedHash": null}',
        ];
        foreach ($damaged as $meta) {
            $this->writeMeta($meta);
            try {
                $this->store()->open();
                self::fail("Expected $meta to be refused");
            } catch (RuntimeException $e) {
                self::assertStringContainsString('meta.json', $e->getMessage(), $meta);
            }
        }
    }

    public function testJsonRepositoriesOpenChecksTheStoreToo(): void
    {
        $this->writeMeta(Json::encode(['formatVersion' => $this->shared->storageFormatVersion() + 1], true));

        $this->expectException(HttpError::class);
        JsonRepositories::open($this->dir, $this->shared, new FakeClock(), ErrorCatalog::fromShared($this->shared));
    }

    // ---- helpers ----

    private function store(?Shared $shared = null): JsonStore
    {
        $shared ??= $this->shared;
        return new JsonStore(
            new AtomicJsonFiles($this->dir),
            new FlockLock($this->dir . '/' . $shared->storageFiles()['lock']),
            $shared,
            ErrorCatalog::fromShared($shared),
        );
    }

    private function writeMeta(string $json): void
    {
        if (!is_dir($this->dir)) {
            mkdir($this->dir, 0775, true);
        }
        file_put_contents("$this->dir/meta.json", $json);
    }

    private function assertStorageTooNew(): void
    {
        try {
            $this->store()->open();
            self::fail('Expected storage_too_new');
        } catch (HttpError $e) {
            $spec = $this->shared->errors()['storage_too_new'];
            self::assertSame([$spec['status'], $spec['code'], $spec['message']], [$e->status, $e->errorCode, $e->getMessage()]);
            self::assertSame(500, $e->status);
        }
    }

    /**
     * A copy of shared.json whose storage lists $migrations, standing in for a future build.
     * @param list<string> $migrations
     */
    private function sharedWithMigrations(array $migrations): Shared
    {
        $data = Json::decode((string) file_get_contents(Paths::schema('shared.json')));
        $data->storage->migrations = $migrations;
        $path = $this->tmp . '/shared.json';
        file_put_contents($path, Json::encode($data, true));
        return Shared::fromFile($path);
    }

    /** @return array<string, string> every file's contents, by path */
    private function snapshot(): array
    {
        $files = [];
        foreach (TempDir::files($this->dir) as $file) {
            $files[$file] = (string) file_get_contents("$this->dir/$file");
        }
        return $files;
    }
}
