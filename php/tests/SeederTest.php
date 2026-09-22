<?php

declare(strict_types=1);

namespace NestFlyers\Tests;

use Closure;
use NestFlyers\Domain\DoodleRepository;
use NestFlyers\Domain\HostelRepository;
use NestFlyers\Domain\Lock;
use NestFlyers\Domain\SeedState;
use NestFlyers\Json;
use NestFlyers\Seeder;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Tests\Support\TempDir;
use NestFlyers\Validation\SchemaNormalizer;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/**
 * The Seeder against in-memory fakes of the Domain interfaces, so these tests
 * pin its own rules (when it works, what it writes, what it refuses) whatever
 * the storage driver. The fakes are anonymous classes: named extra classes in
 * a test file would break `composer dump-autoload --strict-psr`.
 */
final class SeederTest extends TestCase
{
    private string $dir;
    private string $log;
    private string $previousLog;
    private object $schema;

    /** @var HostelRepository&object{rows: array<string, array<string, mixed>>, upserts: list<array<string, mixed>>, failOn: ?string} */
    private HostelRepository $hostels;
    /** @var DoodleRepository&object{upserts: list<array<string, mixed>>} */
    private DoodleRepository $doodles;
    /** @var SeedState&object{hash: ?string, recorded: list<string>} */
    private SeedState $state;
    /** @var Lock&object{exclusive: int, before: ?Closure} */
    private Lock $lock;

    protected function setUp(): void
    {
        $this->dir = TempDir::create('seeder');
        // error_log() goes to a file we can read, and stays off the test runner's stderr.
        $this->log = $this->dir . '/php-errors.log';
        $this->previousLog = (string) ini_get('error_log');
        ini_set('error_log', $this->log);
        $this->schema = Json::decode((string) file_get_contents(Paths::schema('seed.schema.json')));

        $this->hostels = new class () implements HostelRepository {
            /** @var array<string, array<string, mixed>> by slug */
            public array $rows = [];
            /** @var list<array<string, mixed>> */
            public array $upserts = [];
            public ?string $failOn = null;

            public function list(): array
            {
                return array_values($this->rows);
            }

            public function bySlug(string $slug): ?array
            {
                return $this->rows[$slug] ?? null;
            }

            public function upsert(array $hostel): void
            {
                if ($hostel['slug'] === $this->failOn) {
                    throw new RuntimeException('disk full');
                }
                $this->upserts[] = $hostel;
                $id = $this->rows[$hostel['slug']]['id'] ?? count($this->rows) + 1;
                $this->rows[$hostel['slug']] = ['id' => $id] + $hostel;
            }
        };
        $this->doodles = new class () implements DoodleRepository {
            /** @var list<array<string, mixed>> */
            public array $upserts = [];

            public function list(): array
            {
                return [];
            }

            public function upsert(array $doodle): void
            {
                $this->upserts[] = $doodle;
            }
        };
        $this->state = new class () implements SeedState {
            public ?string $hash = null;
            /** @var list<string> */
            public array $recorded = [];

            public function seedHash(): ?string
            {
                return $this->hash;
            }

            public function recordSeedHash(string $hash): void
            {
                $this->hash = $hash;
                $this->recorded[] = $hash;
            }
        };
        $this->lock = new class () implements Lock {
            public int $exclusive = 0;
            /** Runs when the lock is granted, to play another request that got there first. */
            public ?Closure $before = null;

            public function shared(callable $fn): mixed
            {
                return $fn();
            }

            public function exclusive(callable $fn): mixed
            {
                $this->exclusive++;
                if ($this->before !== null) {
                    ($this->before)();
                }
                return $fn();
            }
        };
    }

    protected function tearDown(): void
    {
        ini_set('error_log', $this->previousLog);
        TempDir::remove($this->dir);
    }

    private function seeder(string $file): Seeder
    {
        return new Seeder($this->hostels, $this->doodles, $this->state, $this->lock, $file, $this->schema, new SchemaNormalizer());
    }

    private function writeSeed(string $json): string
    {
        $file = $this->dir . '/hostels.json';
        file_put_contents($file, $json);
        return $file;
    }

    private function logged(): string
    {
        return is_file($this->log) ? (string) file_get_contents($this->log) : '';
    }

    private function assertNothingWritten(): void
    {
        self::assertSame([], $this->hostels->upserts);
        self::assertSame([], $this->doodles->upserts);
        self::assertSame([], $this->state->recorded);
    }

    public function testAppliesTheRealSeedFile(): void
    {
        $file = Paths::seed('hostels.json');
        $seed = Json::decode((string) file_get_contents($file));

        $this->seeder($file)->ensureSeeded();

        $hostels = [];
        foreach ($seed->hostels as $h) {
            $hostels[] = ['slug' => $h->slug, 'name' => $h->name, 'island' => $h->island, 'logoPath' => $h->logo_path ?? null, 'sortOrder' => $h->sort_order ?? 0];
        }
        $doodles = [];
        foreach ($seed->doodles as $d) {
            $doodles[] = ['slug' => $d->slug, 'label' => $d->label, 'path' => $d->path, 'kind' => $d->kind, 'builtin' => true];
        }
        self::assertSame($hostels, $this->hostels->upserts);
        self::assertSame($doodles, $this->doodles->upserts);
        self::assertSame([hash_file('sha256', $file)], $this->state->recorded);
        self::assertSame(1, $this->lock->exclusive);
        self::assertSame('', $this->logged());
    }

    public function testDoesNoWorkWhenTheHashIsTheOneRecorded(): void
    {
        $file = Paths::seed('hostels.json');
        $this->state->hash = hash_file('sha256', $file);

        $this->seeder($file)->ensureSeeded();

        $this->assertNothingWritten();
        self::assertSame(0, $this->lock->exclusive, 'the common case takes no write lock');
    }

    public function testAppliesTheFileAgainWhenItChanges(): void
    {
        $first = '{"hostels":[{"slug":"duque-nest","name":"Duque Nest","island":"Tenerife"}],"doodles":[]}';
        $second = '{"hostels":[{"slug":"duque-nest","name":"Duque Nest Hostel","island":"Tenerife","sort_order":5},'
            . '{"slug":"new-nest","name":"New Nest","island":"Ibiza"}],"doodles":[]}';
        $file = $this->writeSeed($first);
        $seeder = $this->seeder($file);

        $seeder->ensureSeeded();
        $seeder->ensureSeeded();
        self::assertCount(1, $this->hostels->upserts, 'the same file is applied once');

        file_put_contents($file, $second);
        $seeder->ensureSeeded();

        self::assertSame(
            [
                ['slug' => 'duque-nest', 'name' => 'Duque Nest', 'island' => 'Tenerife', 'logoPath' => null, 'sortOrder' => 0],
                ['slug' => 'duque-nest', 'name' => 'Duque Nest Hostel', 'island' => 'Tenerife', 'logoPath' => null, 'sortOrder' => 5],
                ['slug' => 'new-nest', 'name' => 'New Nest', 'island' => 'Ibiza', 'logoPath' => null, 'sortOrder' => 0],
            ],
            $this->hostels->upserts,
        );
        self::assertSame([hash('sha256', $first), hash('sha256', $second)], $this->state->recorded);
        self::assertSame(1, $this->hostels->bySlug('duque-nest')['id'], 'an upsert keeps the id');
    }

    public function testChecksTheHashAgainOnceItHoldsTheLock(): void
    {
        $file = Paths::seed('hostels.json');
        $this->lock->before = function () use ($file): void {
            $this->state->hash = hash_file('sha256', $file); // another request seeded while this one waited
        };

        $this->seeder($file)->ensureSeeded();

        self::assertSame(1, $this->lock->exclusive);
        self::assertSame([], $this->hostels->upserts);
        self::assertSame([], $this->state->recorded);
    }

    public function testNeverDeletesHostelsMissingFromTheFile(): void
    {
        $this->hostels->rows['old-nest'] = ['id' => 1, 'slug' => 'old-nest', 'name' => 'Old Nest', 'island' => 'Tenerife', 'logoPath' => null, 'sortOrder' => 0];

        $this->seeder(Paths::seed('hostels.json'))->ensureSeeded();

        self::assertNotNull($this->hostels->bySlug('old-nest'));
        self::assertNotSame([], $this->state->recorded);
    }

    public function testFillsDefaultsAndPassesOnlyTheRepositoryFields(): void
    {
        $file = $this->writeSeed('{"_note":"x","islands":["Ibiza"],"hostels":[{"slug":"a-nest","name":"A","island":"Ibiza","extra":1}],'
            . '"doodles":[{"slug":"s","label":"S","path":"assets/art/s.png","kind":"spark","builtin":false}]}');

        $this->seeder($file)->ensureSeeded();

        self::assertSame([['slug' => 'a-nest', 'name' => 'A', 'island' => 'Ibiza', 'logoPath' => null, 'sortOrder' => 0]], $this->hostels->upserts);
        self::assertSame([['slug' => 's', 'label' => 'S', 'path' => 'assets/art/s.png', 'kind' => 'spark', 'builtin' => true]], $this->doodles->upserts);
    }

    public function testAnInvalidSeedIsLoggedAndNothingIsWritten(): void
    {
        $file = $this->writeSeed('{"hostels":[{"slug":"Bad Slug","name":"","island":"Tenerife"}],"doodles":[]}');
        $seeder = $this->seeder($file);

        $seeder->ensureSeeded();

        $this->assertNothingWritten();
        self::assertStringContainsString($file, $this->logged());
        self::assertStringContainsString('hostels.0.slug', $this->logged());
        self::assertStringContainsString('hostels.0.name', $this->logged());

        $seeder->ensureSeeded();
        self::assertSame(2, $this->lock->exclusive, 'it tries again on the next request, until the file is fixed');
    }

    public function testMalformedJsonIsLoggedAndNothingIsWritten(): void
    {
        $file = $this->writeSeed('{"hostels": [');

        $this->seeder($file)->ensureSeeded();

        $this->assertNothingWritten();
        self::assertStringContainsString('not valid JSON', $this->logged());
    }

    public function testAMissingFileIsLoggedAndNothingIsWritten(): void
    {
        $file = $this->dir . '/missing.json';

        $this->seeder($file)->ensureSeeded();

        $this->assertNothingWritten();
        self::assertSame(0, $this->lock->exclusive);
        self::assertStringContainsString($file, $this->logged());
    }

    public function testAFailedWriteLeavesTheHashUnrecordedSoTheNextRequestRetries(): void
    {
        $file = $this->writeSeed('{"hostels":[{"slug":"a-nest","name":"A","island":"Ibiza"},{"slug":"b-nest","name":"B","island":"Ibiza"}],"doodles":[]}');
        $this->hostels->failOn = 'b-nest';

        try {
            $this->seeder($file)->ensureSeeded();
            self::fail('the storage error reaches the caller');
        } catch (RuntimeException $e) {
            self::assertSame('disk full', $e->getMessage());
        }

        self::assertSame([], $this->state->recorded);
    }
}
