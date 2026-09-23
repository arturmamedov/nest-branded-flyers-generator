<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Storage;

use NestFlyers\Domain\Clock;
use NestFlyers\Domain\MissingReference;
use NestFlyers\Domain\Repositories;
use NestFlyers\Json;
use NestFlyers\Tests\Support\FakeClock;
use NestFlyers\Tests\Support\Paths;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * One behaviour for every PHP storage driver (Liskov): each driver's test
 * extends this with a factory for a fresh, empty store. It mirrors
 * tests/storage/repositories.contract.ts for the methods PHP has (no all/put:
 * the copy tool is Node's). Rules the HTTP layer owns (trim, the template
 * column, an empty hostel) live in the HTTP contract suite; drivers store
 * exactly what they are given.
 */
abstract class RepositoryContractTestCase extends TestCase
{
    protected Repositories $repos;
    protected FakeClock $clock;

    /** A fresh, empty store whose repositories stamp time with $clock and return flyer data untouched. */
    abstract protected function openRepositories(Clock $clock): Repositories;

    protected function setUp(): void
    {
        $this->clock = new FakeClock();
        $this->repos = $this->openRepositories($this->clock);
    }

    // ---- hostels ----

    public function testHostelsListBySortOrderThenNameInCodePointOrderThenId(): void
    {
        foreach (['B', 'a', 'Á', '10', '9'] as $name) {
            $this->repos->hostels->upsert(self::hostel('h-' . bin2hex($name), $name));
        }
        $this->repos->hostels->upsert(self::hostel('first', 'Zed', 5));
        // Equal sortOrder and name: the id decides.
        foreach (['twin-c', 'twin-a', 'twin-b'] as $slug) {
            $this->repos->hostels->upsert(self::hostel($slug, 'Twin', 7));
        }

        $list = $this->repos->hostels->list();

        self::assertSame(['Zed', 'Twin', 'Twin', 'Twin', '10', '9', 'B', 'a', 'Á'], array_column($list, 'name'));
        $twins = array_values(array_filter($list, static fn (array $h): bool => $h['name'] === 'Twin'));
        self::assertSame(['twin-c', 'twin-a', 'twin-b'], array_column($twins, 'slug'), 'upsert order is id order');
        $ids = array_column($twins, 'id');
        $sorted = $ids;
        sort($sorted);
        self::assertSame($sorted, $ids);
    }

    public function testHostelUpsertBySlugKeepsTheIdAndUpdatesTheRest(): void
    {
        $this->repos->hostels->upsert(self::hostel('duque-nest', 'Duque'));
        $before = $this->repos->hostels->bySlug('duque-nest');
        self::assertNotNull($before);

        $this->repos->hostels->upsert([
            'slug' => 'duque-nest',
            'name' => 'Duque Nest',
            'island' => 'Tenerife South',
            'logoPath' => 'assets/x.png',
            'sortOrder' => 3,
        ]);

        self::assertSame([
            'id' => $before['id'],
            'slug' => 'duque-nest',
            'name' => 'Duque Nest',
            'island' => 'Tenerife South',
            'logoPath' => 'assets/x.png',
            'sortOrder' => 3,
        ], $this->repos->hostels->bySlug('duque-nest'));
        self::assertNull($this->repos->hostels->bySlug('nowhere'));
        self::assertCount(1, $this->repos->hostels->list());
    }

    public function testNewHostelsGetHigherIds(): void
    {
        $this->repos->hostels->upsert(self::hostel('flamingo-nest', 'Flamingo'));
        $this->repos->hostels->upsert(self::hostel('flamingo-nest', 'Flamingo Nest'));
        $this->repos->hostels->upsert(self::hostel('new-nest', 'New'));

        $first = $this->repos->hostels->bySlug('flamingo-nest');
        $second = $this->repos->hostels->bySlug('new-nest');
        self::assertNotNull($first);
        self::assertNotNull($second);
        self::assertSame('Flamingo Nest', $first['name']);
        self::assertGreaterThan($first['id'], $second['id']);
    }

    // ---- doodles ----

    public function testDoodlesListBuiltInsFirstThenKindThenLabelThenId(): void
    {
        $doodles = $this->repos->doodles;
        $doodles->upsert(['slug' => 'staff', 'label' => 'Aardvark', 'path' => 'uploads/doodles/a.png', 'kind' => 'icon', 'builtin' => false]);
        $doodles->upsert(['slug' => 'b', 'label' => 'Spark', 'path' => 'assets/art/b.png', 'kind' => 'spark', 'builtin' => true]);
        $doodles->upsert(['slug' => 'a', 'label' => 'Pin', 'path' => 'assets/art/a.png', 'kind' => 'icon', 'builtin' => true]);
        $doodles->upsert(['slug' => 'c', 'label' => 'Clock', 'path' => 'assets/art/c.png', 'kind' => 'icon', 'builtin' => true]);
        foreach (['twin-z', 'twin-x', 'twin-y'] as $slug) {
            $doodles->upsert(['slug' => $slug, 'label' => 'Twin', 'path' => 'assets/art/t.png', 'kind' => 'icon', 'builtin' => true]);
        }

        self::assertSame(
            ['c', 'a', 'twin-z', 'twin-x', 'twin-y', 'b', 'staff'],
            array_column($doodles->list(), 'slug'),
        );
    }

    public function testDoodleUpsertKeepsTheIdUpdatesLabelPathKindAndNeverFlipsBuiltin(): void
    {
        $doodles = $this->repos->doodles;
        $doodles->upsert(['slug' => 'spark', 'label' => 'Spark', 'path' => 'assets/art/spark.png', 'kind' => 'spark', 'builtin' => true]);
        $doodles->upsert(['slug' => 'mine', 'label' => 'Mine', 'path' => 'uploads/doodles/m.png', 'kind' => 'icon', 'builtin' => false]);
        [$spark, $mine] = $doodles->list();

        $doodles->upsert(['slug' => 'spark', 'label' => 'Teal spark', 'path' => 'assets/art/spark-teal.png', 'kind' => 'sparks', 'builtin' => false]);
        $doodles->upsert(['slug' => 'mine', 'label' => 'Mine', 'path' => 'uploads/doodles/m.png', 'kind' => 'icon', 'builtin' => true]);

        self::assertSame([
            ['id' => $spark['id'], 'slug' => 'spark', 'label' => 'Teal spark', 'path' => 'assets/art/spark-teal.png', 'kind' => 'sparks', 'builtin' => true],
            ['id' => $mine['id'], 'slug' => 'mine', 'label' => 'Mine', 'path' => 'uploads/doodles/m.png', 'kind' => 'icon', 'builtin' => false],
        ], $doodles->list());
    }

    // ---- photos ----

    public function testPhotoInsertStampsCreatedAtAndHandsOutNewIds(): void
    {
        $a = $this->repos->photos->insert(self::photoPath(1), 3240, 1620);
        $this->clock->tick();
        $b = $this->repos->photos->insert(self::photoPath(2), 800, 600);

        self::assertSame(
            ['id' => $a['id'], 'path' => self::photoPath(1), 'width' => 3240, 'height' => 1620, 'createdAt' => '2026-09-18T10:00:00.000Z'],
            $a,
        );
        self::assertSame('2026-09-18T10:00:01.000Z', $b['createdAt']);
        self::assertGreaterThan($a['id'], $b['id']);
        self::assertSame($b, $this->repos->photos->get($b['id']));
        self::assertSame($a, $this->repos->photos->get($a['id']));
        self::assertNull($this->repos->photos->get(9999));
    }

    // ---- flyers ----

    public function testFlyerCreateStoresTheInputAsGivenStampedCreatedAtEqualsUpdatedAt(): void
    {
        $this->addHostels();
        $photo = $this->repos->photos->insert(self::photoPath(1), 100, 50);

        $id = $this->repos->flyers->create(self::input(['hostel' => 'duque-nest', 'photoId' => $photo['id'], 'title' => 'Pool party']));

        self::assertSameRecord([
            'id' => $id,
            'hostel' => 'duque-nest',
            'template' => 'activity',
            'title' => 'Pool party',
            'data' => self::sampleData(),
            'photoId' => $photo['id'],
            'createdAt' => '2026-09-18T10:00:00.000Z',
            'updatedAt' => '2026-09-18T10:00:00.000Z',
        ], $this->repos->flyers->get($id));
    }

    public function testFlyerCreateAndUpdateRejectAHostelOrPhotoThatDoesNotExist(): void
    {
        $this->addHostels();
        self::assertThrowsMissingReference(fn () => $this->repos->flyers->create(self::input(['hostel' => 'nowhere'])));
        self::assertThrowsMissingReference(fn () => $this->repos->flyers->create(self::input(['photoId' => 404])));
        self::assertSame([], $this->repos->flyers->list(null, null));

        $id = $this->repos->flyers->create(self::input(['title' => 'kept']));
        self::assertThrowsMissingReference(fn () => $this->repos->flyers->update($id, self::input(['hostel' => 'nowhere'])));
        self::assertThrowsMissingReference(fn () => $this->repos->flyers->update($id, self::input(['photoId' => 404])));
        self::assertSame('kept', $this->repos->flyers->get($id)['title'] ?? null);
    }

    public function testFlyerUpdateBumpsUpdatedAtKeepsCreatedAtAndMissesMissingFlyers(): void
    {
        $this->addHostels();
        $id = $this->repos->flyers->create(self::input());
        $this->clock->tick();

        self::assertTrue($this->repos->flyers->update($id, self::input(['title' => 'Renamed', 'hostel' => 'flamingo-nest'])));

        $flyer = $this->repos->flyers->get($id);
        self::assertNotNull($flyer);
        self::assertSame('Renamed', $flyer['title']);
        self::assertSame('flamingo-nest', $flyer['hostel']);
        self::assertSame('2026-09-18T10:00:00.000Z', $flyer['createdAt']);
        self::assertSame('2026-09-18T10:00:01.000Z', $flyer['updatedAt']);
        self::assertFalse($this->repos->flyers->update(9999, self::input()));
    }

    public function testFlyerArchiveIsASoftDeleteThatHidesTheFlyer(): void
    {
        $this->addHostels();
        $id = $this->repos->flyers->create(self::input());
        $this->clock->tick();

        self::assertTrue($this->repos->flyers->archive($id));

        self::assertNull($this->repos->flyers->get($id));
        self::assertSame([], $this->repos->flyers->list(null, null));
        self::assertFalse($this->repos->flyers->archive($id));
        self::assertFalse($this->repos->flyers->update($id, self::input()));
        self::assertFalse($this->repos->flyers->archive(9999));
    }

    public function testFlyerListIsNewestFirstWithCurrentHostelNames(): void
    {
        $this->addHostels();
        $a = $this->repos->flyers->create(self::input(['title' => 'a', 'hostel' => 'duque-nest']));
        $b = $this->repos->flyers->create(self::input(['title' => 'b'])); // same timestamp as a
        $this->clock->tick();
        $c = $this->repos->flyers->create(self::input(['title' => 'c', 'hostel' => 'flamingo-nest']));
        $this->clock->tick();
        $this->repos->flyers->update($a, self::input(['title' => 'a2', 'hostel' => 'duque-nest']));
        $this->repos->hostels->upsert(self::hostel('duque-nest', 'Duque Nest Hostel'));

        self::assertSame([
            ['id' => $a, 'title' => 'a2', 'template' => 'activity', 'hostel' => 'duque-nest', 'hostelName' => 'Duque Nest Hostel', 'updatedAt' => '2026-09-18T10:00:02.000Z'],
            ['id' => $c, 'title' => 'c', 'template' => 'activity', 'hostel' => 'flamingo-nest', 'hostelName' => 'Flamingo Nest', 'updatedAt' => '2026-09-18T10:00:01.000Z'],
            ['id' => $b, 'title' => 'b', 'template' => 'activity', 'hostel' => null, 'hostelName' => null, 'updatedAt' => '2026-09-18T10:00:00.000Z'],
        ], $this->repos->flyers->list(null, null));
    }

    public function testFlyerListBreaksUpdatedAtTiesById(): void
    {
        $ids = [];
        foreach (['x', 'y', 'z'] as $title) {
            $ids[] = $this->repos->flyers->create(self::input(['title' => $title]));
        }
        rsort($ids);

        self::assertSame($ids, array_column($this->repos->flyers->list(null, null), 'id'));
    }

    public function testFlyerListFiltersByHostelChainWideAndTemplate(): void
    {
        $this->addHostels();
        $week = self::sampleData();
        $week->template = 'week';
        $duque = $this->repos->flyers->create(self::input(['title' => 'duque', 'hostel' => 'duque-nest']));
        $chain = $this->repos->flyers->create(self::input(['title' => 'chain']));
        $weekly = $this->repos->flyers->create(self::input(['title' => 'week', 'template' => 'week', 'data' => $week]));
        $ids = function (?string $hostel, ?string $template): array {
            $ids = array_column($this->repos->flyers->list($hostel, $template), 'id');
            sort($ids);
            return $ids;
        };

        self::assertSame([$duque], $ids('duque-nest', null));
        self::assertSame([$chain, $weekly], $ids('none', null));
        self::assertSame([], $ids('nowhere', null));
        self::assertSame([$weekly], $ids(null, 'week'));
        self::assertSame([], $ids(null, 'nope'));
        self::assertSame([$duque, $chain, $weekly], $ids('', ''));
        self::assertSame([$duque, $chain, $weekly], $ids(null, null));
        self::assertSame([$chain], $ids('none', 'activity'));
    }

    // ---- helpers ----

    /** @return array{slug:string, name:string, island:string, logoPath:?string, sortOrder:int} */
    protected static function hostel(string $slug, string $name, int $sortOrder = 10): array
    {
        return ['slug' => $slug, 'name' => $name, 'island' => 'Tenerife', 'logoPath' => null, 'sortOrder' => $sortOrder];
    }

    protected static function photoPath(int $n): string
    {
        return sprintf('uploads/2026/09/%016x.jpg', $n);
    }

    /** The first sample flyer's data (SAMPLE_FLYERS[0].data in the Node suite), freshly decoded on every call. */
    protected static function sampleData(): stdClass
    {
        $samples = Json::decode((string) file_get_contents(Paths::seed('samples.json')));
        return $samples[0]->data;
    }

    /**
     * @param array<string, mixed> $over
     * @return array{title:string, hostel:?string, template:string, data:stdClass, photoId:?int}
     */
    protected static function input(array $over = []): array
    {
        return $over + ['title' => 'A flyer', 'hostel' => null, 'template' => 'activity', 'data' => self::sampleData(), 'photoId' => null];
    }

    protected function addHostels(): void
    {
        $this->repos->hostels->upsert(self::hostel('duque-nest', 'Duque Nest'));
        $this->repos->hostels->upsert(self::hostel('flamingo-nest', 'Flamingo Nest', 20));
    }

    /**
     * Same keys in the same order with the same JSON types, data included: comparing the encodings is stricter
     * than assertEquals, which would accept 1 for 1.0, or [] for {}.
     * @param array<string, mixed> $expected
     * @param array<string, mixed>|null $actual
     */
    protected static function assertSameRecord(array $expected, ?array $actual): void
    {
        self::assertNotNull($actual);
        self::assertSame(Json::encode($expected, true), Json::encode($actual, true));
    }

    protected static function assertThrowsMissingReference(callable $fn): void
    {
        try {
            $fn();
        } catch (MissingReference $e) {
            self::assertInstanceOf(MissingReference::class, $e);
            return;
        }
        self::fail('Expected a MissingReference');
    }
}
