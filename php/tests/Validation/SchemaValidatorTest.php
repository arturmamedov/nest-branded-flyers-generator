<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Validation;

use NestFlyers\Json;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Validation\InvalidData;
use NestFlyers\Validation\SchemaNormalizer;
use NestFlyers\Validation\SchemaValidator;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * The shared pipeline (finite numbers → trim → opis → normalise), here on the
 * seed file's schema; FlyerValidatorTest drives it through the flyer schema.
 */
final class SchemaValidatorTest extends TestCase
{
    private SchemaValidator $validator;
    private object $seedSchema;

    protected function setUp(): void
    {
        $this->validator = new SchemaValidator(new SchemaNormalizer());
        $this->seedSchema = Json::decode((string) file_get_contents(Paths::schema('seed.schema.json')));
    }

    private static function seed(): stdClass
    {
        return Json::decode((string) file_get_contents(Paths::seed('hostels.json')));
    }

    /** @return array<string, string> */
    private function fieldsOf(mixed $value, object $schema): array
    {
        try {
            $this->validator->validate($value, $schema);
        } catch (InvalidData $e) {
            return $e->fields;
        }
        self::fail('expected InvalidData');
    }

    public function testTheRealSeedFileValidatesAndKeepsOnlyWhatTheSchemaDescribes(): void
    {
        $file = self::seed();

        $seed = $this->validator->validate($file, $this->seedSchema);

        // _note and islands are for people; the schema describes hostels and doodles only.
        self::assertSame(['hostels', 'doodles'], array_keys(get_object_vars($seed)));
        self::assertCount(count($file->hostels), $seed->hostels);
        self::assertCount(count($file->doodles), $seed->doodles);
        foreach ($seed->hostels as $i => $hostel) {
            self::assertSame(['slug', 'name', 'island', 'logo_path', 'sort_order'], array_keys(get_object_vars($hostel)));
            self::assertSame($file->hostels[$i]->slug, $hostel->slug);
            self::assertSame($file->hostels[$i]->name, $hostel->name);
        }
        foreach ($seed->doodles as $doodle) {
            self::assertSame(['slug', 'label', 'path', 'kind'], array_keys(get_object_vars($doodle)));
        }
    }

    public function testFillsTheSeedDefaults(): void
    {
        $file = self::seed();
        unset($file->hostels[0]->logo_path, $file->hostels[0]->sort_order);
        $file->hostels[0]->extra = 'dropped';

        $hostel = $this->validator->validate($file, $this->seedSchema)->hostels[0];

        // SeedFileSchema: logo_path defaults to null, sort_order to 0.
        self::assertNull($hostel->logo_path);
        self::assertSame(0, $hostel->sort_order);
        self::assertFalse(property_exists($hostel, 'extra'));
    }

    public function testReportsEveryBadSeedField(): void
    {
        $file = self::seed();
        $file->hostels[0]->slug = 'Duque Nest';
        $file->hostels[1]->name = '';
        unset($file->doodles[2]->kind);

        self::assertSame(
            ['hostels.0.slug', 'hostels.1.name', 'doodles.2.kind'],
            array_map('strval', array_keys($this->fieldsOf($file, $this->seedSchema))),
        );
        self::assertSame(['doodles'], array_keys($this->fieldsOf((object) ['hostels' => []], $this->seedSchema)));
    }

    public function testReportsNonFiniteNumbersAlongsideEveryOtherBadField(): void
    {
        $file = Json::decode('{"hostels":[{"slug":"a","name":"A","island":"I","sort_order":1e400}],"doodles":"not a list"}');

        // Both, in one answer, as zod reports every issue (docs/api-contract.md).
        self::assertSame(
            ['hostels.0.sort_order' => 'Must be a finite number.', 'doodles' => 'The data (string) must match the type: array'],
            $this->fieldsOf($file, $this->seedSchema),
        );
        self::assertSame(['_'], array_keys($this->fieldsOf(-INF, $this->seedSchema)));
    }

    public function testIgnoresNonFiniteNumbersUnderKeysTheSchemaStrips(): void
    {
        // zod never validates what z.object() strips, so neither do we: a junk
        // key carrying 1e400 is dropped, exactly as on the Node server.
        $file = Json::decode('{"hostels":[{"slug":"a","name":"A","island":"I","junk":1e400}],"doodles":[],"junk":1e400}');

        $normalised = $this->validator->validate($file, $this->seedSchema);
        self::assertSame(['slug', 'name', 'island', 'logo_path', 'sort_order'], array_keys((array) $normalised->hostels[0]));
        self::assertFalse(property_exists($normalised, 'junk'));
    }

    public function testTheValueItselfIsCalledUnderscore(): void
    {
        self::assertSame('_', SchemaValidator::dotted([]));
        self::assertSame('data.chips.0.label', SchemaValidator::dotted(['data', 'chips', 0, 'label']));
        self::assertSame(['_'], array_keys($this->fieldsOf('x', $this->seedSchema)));
    }
}
