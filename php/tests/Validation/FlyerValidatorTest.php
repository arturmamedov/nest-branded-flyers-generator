<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Validation;

use Closure;
use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\HttpError;
use NestFlyers\Json;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Validation\FlyerValidator;
use NestFlyers\Validation\SchemaNormalizer;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * The PHP side of tests/contract/validation.test.ts, without HTTP: the same
 * bodies must come out the same way zod (FlyerInputSchema) treats them.
 */
final class FlyerValidatorTest extends TestCase
{
    private FlyerValidator $validator;
    private ErrorCatalog $errors;

    protected function setUp(): void
    {
        $this->errors = ErrorCatalog::fromShared(Shared::fromFile(Paths::schema('shared.json')));
        $this->validator = new FlyerValidator(
            Json::decode((string) file_get_contents(Paths::schema('flyer.schema.json'))),
            new SchemaNormalizer(),
            $this->errors,
        );
    }

    /** @return list<stdClass> seed/samples.json, generated from src/shared/samples.ts; a fresh copy per call */
    private static function samples(): array
    {
        return Json::decode((string) file_get_contents(Paths::seed('samples.json')));
    }

    /** A valid body, as the contract client's flyerInput() builds it: the first sample's data. */
    private static function body(): stdClass
    {
        return (object) [
            'title' => 'contract flyer',
            'hostel' => null,
            'template' => 'activity',
            'data' => self::samples()[0]->data,
            'photoId' => null,
        ];
    }

    /** @return list<string> the sorted field keys of the 400 `invalid` the body gets */
    private function invalidFields(mixed $body): array
    {
        try {
            $this->validator->validate($body);
        } catch (HttpError $e) {
            self::assertSame(400, $e->status);
            self::assertSame('invalid', $e->errorCode);
            self::assertSame($this->errors->make('invalid')->getMessage(), $e->getMessage());
            $fields = array_map('strval', array_keys($e->fields ?? []));
            sort($fields, SORT_STRING);
            return $fields;
        }
        self::fail('expected 400 invalid for ' . Json::encode($body));
    }

    /** @return array<string, array{int}> */
    public static function sampleIndexes(): array
    {
        $cases = [];
        foreach (self::samples() as $i => $sample) {
            $cases[$sample->title] = [$i];
        }
        return $cases;
    }

    #[DataProvider('sampleIndexes')]
    public function testEverySampleValidatesAndNormalisesToExactlyItself(int $index): void
    {
        $sample = self::samples()[$index];
        $expected = Json::encode($sample->data);
        // samples.json also carries a `photo` file name, which is not part of FlyerInput: it is dropped.
        $body = (object) ['title' => $sample->title, 'hostel' => $sample->hostel, 'template' => $sample->template, 'data' => $sample->data, 'photoId' => null, 'photo' => 'x.png'];

        $input = $this->validator->validate($body);

        self::assertSame(['title', 'hostel', 'template', 'data', 'photoId'], array_keys($input));
        self::assertSame($sample->title, $input['title']);
        self::assertSame($sample->hostel, $input['hostel']);
        self::assertSame($sample->template, $input['template']);
        self::assertNull($input['photoId']);
        self::assertInstanceOf(stdClass::class, $input['data']);
        self::assertSame($expected, Json::encode($input['data']), 'same keys, same order, same values');
    }

    public function testTrimsTheTitleTheWayJavaScriptDoes(): void
    {
        $body = self::body();
        $body->title = " \u{FEFF}  Pool party  \n";
        self::assertSame('Pool party', $this->validator->validate($body)['title']);

        // U+0085 (NEL) and U+200B are not whitespace to trim().
        $body->title = "Pool\u{200B}";
        self::assertSame("Pool\u{200B}", $this->validator->validate($body)['title']);
        $body->title = "\u{0085}Pool";
        self::assertSame("\u{0085}Pool", $this->validator->validate($body)['title']);
    }

    public function testTheTitleLengthIsCheckedAfterTrimming(): void
    {
        $body = self::body();
        $body->title = '   ' . str_repeat('x', 80) . "\u{3000}";
        self::assertSame(str_repeat('x', 80), $this->validator->validate($body)['title']);
    }

    public function testFillsDefaultsStripsUnknownKeysAtEveryLevelAndKeepsRecordKeys(): void
    {
        $sample = self::samples()[0]->data;
        $data = clone $sample;
        unset($data->v, $data->photoCrop, $data->showPill, $data->week, $data->overrides);
        $data->junk = (object) ['deep' => true];
        $data->text = (object) ((array) $sample->text + ['junk' => 'x']);
        $data->doodles = [(object) ['slug' => 'spark-teal', 'x' => 1, 'y' => 2, 'w' => 50, 'extra' => true]];
        $data->overrides = Json::decode('{"headline":{"dy":5},"chips":{"order":["cost"],"junk":1}}');
        $body = self::body();
        $body->junk = 1;
        $body->data = $data;

        $input = $this->validator->validate($body);

        // The first sample holds the default v, photoCrop, showPill and week, so it is what zod would give back.
        $expected = self::samples()[0]->data;
        $expected->doodles = Json::decode('[{"slug":"spark-teal","x":1,"y":2,"w":50,"rot":0}]');
        $expected->overrides = Json::decode('{"headline":{"dx":0,"dy":5,"scale":1},"chips":{"dx":0,"dy":0,"scale":1,"order":["cost"]}}');
        self::assertSame(Json::encode($expected), Json::encode($input['data']));
        self::assertSame(['title', 'hostel', 'template', 'data', 'photoId'], array_keys($input));
    }

    public function testDefaultsAreTheOnesZodFills(): void
    {
        $body = self::body();
        unset($body->data->v, $body->data->photoCrop, $body->data->showPill, $body->data->week, $body->data->overrides);

        $data = $this->validator->validate($body)['data'];

        // newFlyerData()'s values in src/shared/defaults.ts, as the contract test expects them.
        self::assertSame(1, $data->v);
        self::assertSame('{"x":0.5,"y":0.5,"zoom":1}', Json::encode($data->photoCrop));
        self::assertTrue($data->showPill);
        self::assertSame([], $data->week);
        self::assertInstanceOf(stdClass::class, $data->overrides);
        self::assertSame('{}', Json::encode($data->overrides));
    }

    public function testKeepsAnEmptyObjectAsAnObjectAndAnEmptyArrayAsAnArray(): void
    {
        $body = self::body();
        $body->data->overrides = new stdClass();
        $body->data->week = [];
        $body->data->extras = [];

        $data = $this->validator->validate($body)['data'];

        self::assertStringContainsString('"extras":[],"week":[],', Json::encode($data));
        self::assertStringContainsString('"overrides":{},', Json::encode($data));
    }

    public function testAnIntegralPhotoIdComesBackAsAnInt(): void
    {
        $body = self::body();
        $body->photoId = Json::decode('7.0');
        self::assertSame(7, $this->validator->validate($body)['photoId']);
        $body->photoId = 7;
        self::assertSame(7, $this->validator->validate($body)['photoId']);
    }

    public function testNeverChangesTheBodyItIsGiven(): void
    {
        $body = self::body();
        $body->title = '  Spaced  ';
        $body->junk = (object) ['x' => 1];
        unset($body->data->photoCrop);
        $before = Json::encode($body);

        $input = $this->validator->validate($body);
        $input['data']->text->headline1 = 'changed';

        self::assertSame($before, Json::encode($body));
    }

    public function testCountsCharactersAsCodePoints(): void
    {
        $body = self::body();
        $body->data->text->headline1 = str_repeat("\u{1F600}", 21);
        self::assertSame(str_repeat("\u{1F600}", 21), $this->validator->validate($body)['data']->text->headline1);

        $body->data->text->headline1 = str_repeat("\u{1F600}", 41);
        self::assertSame(['data.text.headline1'], $this->invalidFields($body));
    }

    /** @return array<string, array{Closure(stdClass): void, list<string>}> */
    public static function invalidBodies(): array
    {
        return [
            'empty title' => [static function (stdClass $b): void { $b->title = ''; }, ['title']],
            'blank title' => [static function (stdClass $b): void { $b->title = " \t "; }, ['title']],
            'JS-blank title' => [static function (stdClass $b): void { $b->title = "\u{3000}\u{FEFF}\u{2028}"; }, ['title']],
            '81-character title' => [static function (stdClass $b): void { $b->title = str_repeat('x', 81); }, ['title']],
            'title not a string' => [static function (stdClass $b): void { $b->title = 5; }, ['title']],
            'missing photoId' => [static function (stdClass $b): void { unset($b->photoId); }, ['photoId']],
            'missing data' => [static function (stdClass $b): void { unset($b->data); }, ['data']],
            'unknown template' => [static function (stdClass $b): void { $b->template = 'poster'; }, ['template']],
            'hostel over 60' => [static function (stdClass $b): void { $b->hostel = str_repeat('h', 61); }, ['hostel']],
            'chip label over 12' => [static function (stdClass $b): void { $b->data->chips[0]->label = str_repeat('x', 13); }, ['data.chips.0.label']],
            'colour with a trailing newline' => [static function (stdClass $b): void { $b->data->colors->bg = "#aabbcc\n"; }, ['data.colors.bg']],
            'zoom 5' => [static function (stdClass $b): void { $b->data->photoCrop = (object) ['x' => 0.5, 'y' => 0.5, 'zoom' => 5]; }, ['data.photoCrop.zoom']],
            'photoCrop null' => [static function (stdClass $b): void { $b->data->photoCrop = null; }, ['data.photoCrop']],
            'five extras' => [static function (stdClass $b): void { $b->data->extras = ['a', 'b', 'c', 'd', 'e']; }, ['data.extras']],
            'missing nested key' => [static function (stdClass $b): void { unset($b->data->text->eyebrow); }, ['data.text.eyebrow']],
            'override scale out of range' => [static function (stdClass $b): void { $b->data->overrides = Json::decode('{"headline":{"scale":3}}'); }, ['data.overrides.headline.scale']],
            'photoId 1.5' => [static function (stdClass $b): void { $b->photoId = 1.5; }, ['photoId']],
            'photoId "1"' => [static function (stdClass $b): void { $b->photoId = '1'; }, ['photoId']],
            'photoId 0' => [static function (stdClass $b): void { $b->photoId = 0; }, ['photoId']],
            'every bad field at once' => [static function (stdClass $b): void {
                $b->title = '';
                $b->data->chips[1]->value = str_repeat('x', 91);
                $b->data->colors->ink = 'red';
            }, ['data.chips.1.value', 'data.colors.ink', 'title']],
        ];
    }

    /**
     * @param Closure(stdClass): void $spoil
     * @param list<string> $fields
     */
    #[DataProvider('invalidBodies')]
    public function testNamesEachBadFieldByItsDottedPath(Closure $spoil, array $fields): void
    {
        $body = self::body();
        $spoil($body);
        self::assertSame($fields, $this->invalidFields($body));
    }

    /** @return array<string, array{mixed}> */
    public static function nonObjectBodies(): array
    {
        return ['array' => [[]], 'list' => [[1, 2]], 'null' => [null], 'string' => ['x'], 'number' => [42], 'boolean' => [true]];
    }

    #[DataProvider('nonObjectBodies')]
    public function testABodyThatIsNotAnObjectIsReportedAtUnderscore(mixed $body): void
    {
        self::assertSame(['_'], $this->invalidFields($body));
    }

    public function testRejectsNumbersJsonCanCarryButJavaScriptCannot(): void
    {
        $body = self::body();
        $body->data->doodles = [(object) ['slug' => 'spark-teal', 'x' => 7, 'y' => 2, 'w' => 50, 'rot' => 0]];
        $json = str_replace('"x":7', '"x":1e400', Json::encode($body));
        self::assertSame(['data.doodles.0.x'], $this->invalidFields(Json::decode($json)));

        $json = str_replace(['"x":7', '"y":2'], ['"x":1e400', '"y":-1e400'], Json::encode($body));
        self::assertSame(['data.doodles.0.x', 'data.doodles.0.y'], $this->invalidFields(Json::decode($json)));
    }

    public function testNormalizeDataShapesStoredDataLikeZod(): void
    {
        $stored = self::samples()[1]->data;
        self::assertSame(Json::encode($stored), Json::encode($this->validator->normalizeData($stored)));

        $old = self::samples()[1]->data;
        unset($old->v, $old->showPill, $old->overrides);
        $old->legacy = 'x';
        $before = Json::encode($old);

        $data = $this->validator->normalizeData($old);

        self::assertSame(Json::encode($stored), Json::encode($data));
        self::assertSame($before, Json::encode($old), 'the stored tree is not changed');
    }
}
