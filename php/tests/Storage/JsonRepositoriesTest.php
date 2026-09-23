<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Storage;

use NestFlyers\Domain\Clock;
use NestFlyers\Domain\Repositories;
use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Json;
use NestFlyers\Shared;
use NestFlyers\Storage\Json\JsonRepositories;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Tests\Support\TempDir;
use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Validator;
use stdClass;

/**
 * The JSON driver against the shared repository contract, plus what only a
 * file store can get wrong: file order, id counters, the on-disk format.
 */
final class JsonRepositoriesTest extends RepositoryContractTestCase
{
    private string $dir;
    private Shared $shared;

    protected function openRepositories(Clock $clock): Repositories
    {
        $this->dir = TempDir::create('store');
        $this->shared = Shared::fromFile(Paths::schema('shared.json'));
        return $this->reopen();
    }

    protected function tearDown(): void
    {
        TempDir::remove($this->dir);
    }

    public function testListsIgnoreTheOrderOfRecordsInTheFiles(): void
    {
        $at = '2026-01-01T00:00:00.000Z';
        $hostel = static fn (int $id, string $name, int $sortOrder): array => ['id' => $id, 'slug' => "h-$id", 'name' => $name,
            'island' => 'Tenerife', 'logoPath' => null, 'sortOrder' => $sortOrder];
        $doodle = static fn (int $id): array => ['id' => $id, 'slug' => "d-$id", 'label' => 'Twin', 'path' => 'assets/art/t.png',
            'kind' => 'icon', 'builtin' => true];
        $entry = static fn (int $id): array => ['id' => $id, 'title' => "t$id", 'template' => 'activity', 'hostel' => null,
            'updatedAt' => $at, 'archived' => false];
        $this->putFile('hostels', [$hostel(90, 'Twin', 7), $hostel(30, 'Twin', 7), $hostel(5, 'Zed', 9), $hostel(60, 'Twin', 7)]);
        $this->putFile('doodles', [$doodle(90), $doodle(30), $doodle(60)]);
        $this->putFile('flyerIndex', [$entry(9), $entry(3), $entry(6)]);

        self::assertSame([30, 60, 90, 5], array_column($this->repos->hostels->list(), 'id'));
        self::assertSame([30, 60, 90], array_column($this->repos->doodles->list(), 'id'));
        self::assertSame([9, 6, 3], array_column($this->repos->flyers->list(null, null), 'id'));
    }

    public function testIdsComeFromTheCountersAndAreNeverReused(): void
    {
        foreach (['a', 'b', 'c'] as $slug) {
            $this->repos->hostels->upsert(self::hostel($slug, strtoupper($slug)));
        }
        $this->repos->photos->insert(self::photoPath(1), 10, 10);
        $this->repos->photos->insert(self::photoPath(2), 10, 10);
        $this->repos->flyers->create(self::input());
        $this->repos->flyers->create(self::input());

        // Take the newest record of each kind out by hand: max(id) + 1 would hand its id out again.
        $this->putFile('hostels', array_slice($this->readFile('hostels'), 0, 2));
        $this->putFile('photos', array_slice($this->readFile('photos'), 0, 1));
        $this->putFile('flyerIndex', array_slice($this->readFile('flyerIndex'), 0, 1));
        unlink($this->dir . '/flyers/2.json');

        $this->repos->hostels->upsert(self::hostel('d', 'D'));
        self::assertSame(4, $this->repos->hostels->bySlug('d')['id'] ?? null);
        self::assertSame(3, $this->repos->photos->insert(self::photoPath(3), 10, 10)['id']);
        self::assertSame(3, $this->repos->flyers->create(self::input()));
        $this->repos->doodles->upsert(['slug' => 's', 'label' => 'S', 'path' => 'assets/art/s.png', 'kind' => 'spark', 'builtin' => true]);
        self::assertSame(
            ['hostel' => 4, 'doodle' => 1, 'photo' => 3, 'flyer' => 3],
            (array) $this->readFile('meta')->counters,
        );
    }

    public function testNewIdsSkipRecordsAheadOfAnOutOfDateCounter(): void
    {
        $this->repos->hostels->upsert(self::hostel('a', 'A'));
        $this->repos->photos->insert(self::photoPath(1), 10, 10);
        $this->repos->flyers->create(self::input());
        $this->repos->flyers->create(self::input(['title' => 'second']));
        // meta.json restored from a backup older than the records; flyer 2's index entry lost as well.
        $meta = $this->readFile('meta');
        $meta->counters = (object) ['hostel' => 0, 'doodle' => 0, 'photo' => 0, 'flyer' => 0];
        $this->putFile('meta', $meta);
        $this->putFile('flyerIndex', array_slice($this->readFile('flyerIndex'), 0, 1));

        $this->repos->hostels->upsert(self::hostel('b', 'B'));
        self::assertSame(2, $this->repos->hostels->bySlug('b')['id'] ?? null);
        self::assertSame(2, $this->repos->photos->insert(self::photoPath(2), 10, 10)['id']);
        self::assertSame(3, $this->repos->flyers->create(self::input(['title' => 'third'])), "flyer 2's file is not overwritten");
        self::assertSame('second', $this->readJson('flyers/2.json')->title);
    }

    public function testEveryWrittenFileMatchesTheStorageSchema(): void
    {
        $this->addHostels();
        $this->repos->hostels->upsert(['slug' => 'logo-nest', 'name' => 'Logo', 'island' => 'Gran Canaria', 'logoPath' => 'assets/logos/l.png', 'sortOrder' => 2.5]);
        $this->repos->doodles->upsert(['slug' => 'spark', 'label' => 'Spark', 'path' => 'assets/art/spark.png', 'kind' => 'spark', 'builtin' => true]);
        $this->repos->doodles->upsert(['slug' => 'mine', 'label' => 'Mine', 'path' => 'uploads/doodles/m.png', 'kind' => 'icon', 'builtin' => false]);
        $photo = $this->repos->photos->insert(self::photoPath(0xabc), 3240, 1620);
        $kept = $this->repos->flyers->create(self::input(['hostel' => 'duque-nest', 'photoId' => $photo['id']]));
        $archived = $this->repos->flyers->create(self::input());
        $this->clock->tick(1234);
        $this->repos->flyers->update($kept, self::input(['title' => 'Renamed', 'hostel' => 'flamingo-nest']));
        $this->repos->flyers->archive($archived);
        $this->repos->seedState->recordSeedHash(hash('sha256', 'seed'));

        $files = $this->shared->storageFiles();
        self::assertSame(
            [
                '.htaccess', '.lock', 'doodles.json', 'flyers/1.json', 'flyers/2.json', 'flyers/index.json',
                'hostels.json', 'index.html', 'meta.json', 'photos.json',
            ],
            TempDir::files($this->dir),
            'the store holds exactly its own files: no temp files left behind',
        );
        // Belt and braces wherever the admin pointed dataDir: the store denies itself.
        self::assertStringContainsString('Require all denied', (string) file_get_contents("$this->dir/.htaccess"));
        $this->assertFileMatchesSchema($files['meta'], 'meta');
        $this->assertFileMatchesSchema($files['hostels'], 'hostels');
        $this->assertFileMatchesSchema($files['doodles'], 'doodles');
        $this->assertFileMatchesSchema($files['photos'], 'photos');
        $this->assertFileMatchesSchema($files['flyerIndex'], 'flyerIndex');
        $this->assertFileMatchesSchema("{$files['flyerDir']}/$kept.json", 'flyer');
        $this->assertFileMatchesSchema("{$files['flyerDir']}/$archived.json", 'flyer');
    }

    public function testEmptyObjectsInsideFlyerDataSurviveAWriteAndARead(): void
    {
        $empty = self::sampleData();
        self::assertEquals(new stdClass(), $empty->overrides, 'the sample carries overrides: {}');
        $nested = self::sampleData();
        $nested->overrides = (object) ['headline' => (object) ['dx' => 0, 'dy' => 12.5, 'scale' => 1]];

        $a = $this->repos->flyers->create(self::input(['data' => $empty]));
        $b = $this->repos->flyers->create(self::input(['data' => $nested]));

        self::assertStringContainsString('"overrides": {}', (string) file_get_contents("$this->dir/flyers/$a.json"));
        foreach ([$this->repos, $this->reopen()] as $repos) {
            $readA = $repos->flyers->get($a)['data'] ?? null;
            $readB = $repos->flyers->get($b)['data'] ?? null;
            self::assertInstanceOf(stdClass::class, $readA->overrides ?? null);
            self::assertSame([], get_object_vars($readA->overrides));
            self::assertSame(Json::encode(self::sampleData()), Json::encode($readA));
            self::assertSame(Json::encode($nested), Json::encode($readB));
        }
    }

    public function testFlyerDataIsNormalisedOnEveryReadButStoredAsGiven(): void
    {
        $repos = $this->reopen(static function (stdClass $data): stdClass {
            $copy = clone $data;
            $copy->normalised = true;
            return $copy;
        });
        $id = $repos->flyers->create(self::input());

        self::assertTrue($repos->flyers->get($id)['data']->normalised ?? null);
        self::assertObjectNotHasProperty('normalised', $this->readJson("flyers/$id.json")->data);
        $repos->flyers->archive($id);
        self::assertObjectNotHasProperty('normalised', $this->readJson("flyers/$id.json")->data, 'archive keeps data as stored');
    }

    public function testArchivedFlyersStayOnDiskMarkedArchived(): void
    {
        $id = $this->repos->flyers->create(self::input(['title' => 'gone']));
        $this->clock->tick();
        $this->repos->flyers->archive($id);

        $stored = $this->readJson("flyers/$id.json");
        self::assertTrue($stored->archived);
        self::assertSame('gone', $stored->title);
        self::assertSame('2026-09-18T10:00:00.000Z', $stored->createdAt);
        self::assertSame('2026-09-18T10:00:01.000Z', $stored->updatedAt);
        self::assertEquals(
            [(object) ['id' => $id, 'title' => 'gone', 'template' => 'activity', 'hostel' => null, 'updatedAt' => '2026-09-18T10:00:01.000Z', 'archived' => true]],
            $this->readFile('flyerIndex'),
        );
    }

    public function testAnIndexRowLeftBehindByAHalfFinishedWriteIsRepaired(): void
    {
        // The flyer's own file is written before the index, so a crash (or a
        // disk that fills up) in between can leave the library listing a flyer
        // that is really archived. The flyer can never repair that itself, so
        // the next archive() or update() of that id does it.
        $id = $this->repos->flyers->create(self::input(['title' => 'ghost']));
        $stored = $this->readJson("flyers/$id.json");
        $stored->archived = true;
        file_put_contents("$this->dir/flyers/$id.json", Json::encode($stored, true));
        self::assertSame(['ghost'], array_column($this->repos->flyers->list(null, null), 'title'), 'the stale row still lists it');

        self::assertFalse($this->repos->flyers->archive($id), 'already archived');
        self::assertSame([], $this->repos->flyers->list(null, null), 'the row is back in step');
        self::assertTrue($this->readFile('flyerIndex')[0]->archived);

        // A flyer file that is gone entirely loses its row too.
        unlink("$this->dir/flyers/$id.json");
        self::assertFalse($this->repos->flyers->update($id, self::input()));
        self::assertSame([], $this->readFile('flyerIndex'));
    }

    public function testEverythingSurvivesReopeningTheStore(): void
    {
        $this->addHostels();
        $photo = $this->repos->photos->insert(self::photoPath(7), 20, 10);
        $id = $this->repos->flyers->create(self::input(['hostel' => 'duque-nest', 'photoId' => $photo['id']]));
        $this->repos->seedState->recordSeedHash('abc');

        $again = $this->reopen();

        self::assertSame($this->repos->hostels->list(), $again->hostels->list());
        self::assertSame($photo, $again->photos->get($photo['id']));
        self::assertSame($this->repos->flyers->list(null, null), $again->flyers->list(null, null));
        self::assertSame(Json::encode($this->repos->flyers->get($id)), Json::encode($again->flyers->get($id)));
        self::assertSame('abc', $again->seedState->seedHash());
    }

    public function testConcurrentRequestsNeverShareAnIdOrLoseAWrite(): void
    {
        $workers = 4;
        $each = 8;
        // Separate PHP processes, like simultaneous requests: only the flock and the counters keep them apart.
        $code = sprintf(
            <<<'PHP'
            require %s;
            $shared = \NestFlyers\Shared::fromFile(%s);
            $repos = \NestFlyers\Storage\Json\JsonRepositories::open(%s, $shared, new \NestFlyers\Domain\SystemClock(), \NestFlyers\Http\ErrorCatalog::fromShared($shared));
            for ($i = 0; $i < %d; $i++) {
                $photo = $repos->photos->insert(sprintf('uploads/2026/09/%%016x.jpg', getmypid() * 100 + $i), 10, 10);
                $repos->flyers->create(['title' => 'race', 'hostel' => null, 'template' => 'activity', 'data' => new \stdClass(), 'photoId' => $photo['id']]);
            }
            PHP,
            var_export(Paths::repo() . '/php/vendor/autoload.php', true),
            var_export(Paths::schema('shared.json'), true),
            var_export($this->dir, true),
            $each,
        );
        $processes = [];
        for ($w = 0; $w < $workers; $w++) {
            // Beside the store, not in it: the store must hold only its own files.
            $log = dirname($this->dir) . '/' . basename($this->dir) . "-worker-$w.log";
            $process = proc_open([PHP_BINARY, '-r', $code], [1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $pipes);
            self::assertIsResource($process);
            $processes[$log] = $process;
        }
        foreach ($processes as $log => $process) {
            $exit = proc_close($process);
            $output = (string) file_get_contents($log);
            unlink($log);
            self::assertSame(0, $exit, $output);
        }

        $total = $workers * $each;
        $ids = array_column($this->repos->flyers->list(null, null), 'id');
        sort($ids);
        self::assertSame(range(1, $total), $ids, 'every create landed in the index, each with its own id');
        self::assertSame(range(1, $total), array_map(static fn (stdClass $p): int => $p->id, $this->readFile('photos')));
        self::assertCount($total + 1, glob("$this->dir/flyers/*.json") ?: [], 'one file per flyer, plus the index');
        self::assertSame($total, $this->readFile('meta')->counters->flyer);
    }

    public function testARecordFileDeletedByHandReadsAsEmpty(): void
    {
        $this->addHostels();
        unlink($this->dir . '/' . $this->shared->storageFiles()['hostels']);

        self::assertSame([], $this->repos->hostels->list());
        self::assertNull($this->repos->hostels->bySlug('duque-nest'));
    }

    // ---- helpers ----

    /** @param (callable(stdClass): stdClass)|null $normalizeData */
    private function reopen(?callable $normalizeData = null): Repositories
    {
        return JsonRepositories::open($this->dir, $this->shared, $this->clock, ErrorCatalog::fromShared($this->shared), $normalizeData);
    }

    /** Writes a store file by hand, as an admin or another driver would (no repository, no lock). */
    private function putFile(string $key, mixed $value): void
    {
        file_put_contents($this->dir . '/' . $this->shared->storageFiles()[$key], Json::encode($value, true));
    }

    private function readFile(string $key): mixed
    {
        return $this->readJson($this->shared->storageFiles()[$key]);
    }

    private function readJson(string $relative): mixed
    {
        return Json::decode((string) file_get_contents("$this->dir/$relative"));
    }

    /**
     * The file validates against its $defs entry in schema/storage.schema.json, is in the canonical pretty format,
     * and keeps the schema's key order in every record (flyer data aside: drivers store it as given).
     */
    private function assertFileMatchesSchema(string $relative, string $def): void
    {
        $raw = (string) file_get_contents("$this->dir/$relative");
        $value = Json::decode($raw);
        self::assertSame(Json::encode($value, true), $raw, "$relative: 4-space pretty JSON with a trailing newline");

        $schema = Json::decode((string) file_get_contents(Paths::schema('storage.schema.json')))->{'$defs'}->{$def};
        $result = (new Validator())->validate($value, $schema);
        $errors = $result->isValid() ? [] : (new ErrorFormatter())->format($result->error());
        self::assertSame([], $errors, "$relative matches \$defs.$def");
        self::assertKeyOrder($value, $schema, $relative);
    }

    private static function assertKeyOrder(mixed $value, stdClass $schema, string $where): void
    {
        if (is_array($value) && isset($schema->items)) {
            foreach ($value as $i => $item) {
                self::assertKeyOrder($item, $schema->items, "$where[$i]");
            }
        }
        if ($value instanceof stdClass && isset($schema->properties)) {
            self::assertSame(array_keys(get_object_vars($schema->properties)), array_keys(get_object_vars($value)), "$where: key order");
            foreach (get_object_vars($schema->properties) as $key => $property) {
                if ($key !== 'data') {
                    self::assertKeyOrder($value->{$key}, $property, "$where.$key");
                }
            }
        }
    }
}
