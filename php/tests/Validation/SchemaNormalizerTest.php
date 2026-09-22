<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Validation;

use LogicException;
use NestFlyers\Json;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Validation\SchemaNormalizer;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * The normaliser on small schemas, one rule at a time. FlyerValidatorTest
 * covers it end to end on the real flyer schema.
 */
final class SchemaNormalizerTest extends TestCase
{
    private SchemaNormalizer $normalizer;

    protected function setUp(): void
    {
        $this->normalizer = new SchemaNormalizer();
    }

    private function normalizeJson(string $json, string $schema): string
    {
        return Json::encode($this->normalizer->normalize(Json::decode($json), Json::decode($schema)));
    }

    public function testFillsAbsentKeysWithFreshCopiesOfTheirDefaults(): void
    {
        $schema = Json::decode('{"type":"object","properties":{
            "crop":{"type":"object","default":{"x":0.5,"tags":[{"a":1}]}},
            "week":{"type":"array","default":[]},
            "count":{"type":"number","default":0},
            "name":{"type":"string"}}}');

        $first = $this->normalizer->normalize(new stdClass(), $schema);
        $second = $this->normalizer->normalize(new stdClass(), $schema);

        self::assertSame('{"crop":{"x":0.5,"tags":[{"a":1}]},"week":[],"count":0}', Json::encode($first));
        self::assertNotSame($schema->properties->crop->default, $first->crop);
        $first->crop->x = 9;
        $first->crop->tags[0]->a = 9;
        self::assertSame('{"crop":{"x":0.5,"tags":[{"a":1}]},"week":[],"count":0}', Json::encode($second));
        self::assertSame('{"x":0.5,"tags":[{"a":1}]}', Json::encode($schema->properties->crop->default), 'the schema is never changed');
    }

    public function testAPresentKeyKeepsItsValueOverTheDefault(): void
    {
        self::assertSame(
            '{"show":false,"list":[1]}',
            $this->normalizeJson('{"list":[1],"show":false}', '{"properties":{"show":{"type":"boolean","default":true},"list":{"type":"array","default":[]}}}'),
        );
    }

    public function testDropsUnknownKeysAtEveryLevelAndOrdersKeysByProperties(): void
    {
        $schema = '{"type":"object","properties":{
            "a":{"type":"string"},
            "b":{"type":"object","properties":{"x":{"type":"number"},"y":{"type":"number"}}},
            "c":{"type":"array","items":{"type":"object","properties":{"k":{"type":"string"},"v":{"type":"string"}}}}},
            "required":["a"]}';
        self::assertSame(
            '{"a":"A","b":{"x":1,"y":2},"c":[{"k":"1","v":"one"},{"k":"2"}]}',
            $this->normalizeJson(
                '{"junk":1,"c":[{"v":"one","k":"1","extra":true},{"k":"2","deep":{"x":1}}],"b":{"z":3,"y":2,"x":1},"a":"A"}',
                $schema,
            ),
        );
    }

    public function testStripsEverythingFromAnObjectSchemaWithoutProperties(): void
    {
        // z.object({}) keeps nothing; additionalProperties:false (zod's output mode) strips the same way.
        self::assertSame('{}', $this->normalizeJson('{"a":1}', '{"type":"object"}'));
        self::assertSame('{"k":1}', $this->normalizeJson('{"j":2,"k":1}', '{"properties":{"k":{}},"additionalProperties":false}'));
    }

    public function testKeepsRecordKeysAndShapesTheirValues(): void
    {
        $flyer = Json::decode((string) file_get_contents(Paths::schema('flyer.schema.json')));
        $overrides = $flyer->properties->data->properties->overrides;

        $out = $this->normalizer->normalize(Json::decode('{"headline":{"dy":5},"chips":{"order":["cost"],"junk":1}}'), $overrides);

        self::assertSame(
            '{"headline":{"dx":0,"dy":5,"scale":1},"chips":{"dx":0,"dy":0,"scale":1,"order":["cost"]}}',
            Json::encode($out),
        );
    }

    public function testKeepsRecordKeysThatPhpTreatsSpecially(): void
    {
        self::assertSame(
            '{"":1,"0":2,"b":3}',
            $this->normalizeJson('{"":1,"0":2,"b":3}', '{"type":"object","additionalProperties":{"type":"number"}}'),
        );
    }

    public function testKeepsEmptyObjectsAsObjectsAndEmptyArraysAsArrays(): void
    {
        $schema = '{"properties":{
            "record":{"type":"object","additionalProperties":{"type":"object"}},
            "list":{"type":"array","items":{"type":"string"}},
            "free":true}}';
        self::assertSame(
            '{"record":{},"list":[],"free":{"o":{},"a":[]}}',
            $this->normalizeJson('{"record":{},"list":[],"free":{"o":{},"a":[]}}', $schema),
        );
        $out = $this->normalizer->normalize(Json::decode('{"record":{}}'), Json::decode($schema));
        self::assertInstanceOf(stdClass::class, $out->record);
    }

    public function testFollowsTheAnyOfBranchThatFitsTheValue(): void
    {
        $schema = '{"properties":{"crop":{"anyOf":[
            {"type":"object","properties":{"x":{"type":"number"},"zoom":{"type":"number","default":1}}},
            {"type":"null"}]}}}';
        self::assertSame('{"crop":null}', $this->normalizeJson('{"crop":null}', $schema));
        self::assertSame('{"crop":{"x":0.5,"zoom":1}}', $this->normalizeJson('{"crop":{"junk":1,"x":0.5}}', $schema));
    }

    public function testWritesZeroAsJavaScriptDoes(): void
    {
        $schema = '{"properties":{"n":{"type":"number"},"list":{"type":"array","items":{"type":"number"}},"free":{}}}';
        self::assertSame(
            '{"n":0,"list":[0,0,0.5],"free":{"z":0,"deep":[0]}}',
            $this->normalizeJson('{"n":-0.0,"list":[-0.0,0.0,0.5],"free":{"z":-0.0,"deep":[-0.0]}}', $schema),
        );
        $out = $this->normalizer->normalize(Json::decode('{"n":-0.0}'), Json::decode($schema));
        self::assertSame(0, $out->n);
    }

    public function testMakesIntegralFloatsIntsOnlyWhereTheSchemaSaysInteger(): void
    {
        $schema = Json::decode('{"properties":{
            "id":{"anyOf":[{"type":"integer"},{"type":"null"}]},
            "count":{"type":"integer"},
            "x":{"type":"number"},
            "y":{"type":"number"}}}');
        $out = $this->normalizer->normalize(Json::decode('{"id":7.0,"count":1e3,"x":2.0,"y":2.5}'), $schema);

        self::assertSame(7, $out->id);
        self::assertSame(1000, $out->count);
        self::assertSame(2.0, $out->x, 'a number keeps its float; it writes as 2 all the same');
        self::assertSame(2.5, $out->y);
    }

    public function testNeverChangesItsInputOrSharesObjectsWithIt(): void
    {
        $schema = Json::decode('{"properties":{"a":{"type":"object","properties":{"b":{"type":"string"}}},"free":true,"r":{"additionalProperties":{}}}}');
        $input = Json::decode('{"a":{"b":"x","junk":1},"free":{"k":{"v":1}},"r":{"k":{"v":1}}}');
        $before = Json::encode($input);

        $out = $this->normalizer->normalize($input, $schema);
        $out->a->b = 'changed';
        $out->free->k->v = 2;
        $out->r->k->v = 2;

        self::assertSame($before, Json::encode($input));
    }

    public function testTrimsOnlyFlaggedStringsAndKeepsEverythingElse(): void
    {
        $schema = Json::decode('{"type":"object","properties":{
            "title":{"type":"string","x-nest-trim":true},
            "plain":{"type":"string"},
            "maybe":{"anyOf":[{"type":"string","x-nest-trim":true},{"type":"null"}]},
            "list":{"type":"array","items":{"type":"string","x-nest-trim":true}},
            "rec":{"type":"object","additionalProperties":{"type":"string","x-nest-trim":true}}}}');
        $input = Json::decode('{"junk":" j ","title":"　 T ﻿","plain":" p ","maybe":" m ","list":[" a ",5],"rec":{" k ":" v "}}');
        $before = Json::encode($input);

        $out = $this->normalizer->trimFlagged($input, $schema);

        self::assertSame('{"junk":" j ","title":"T","plain":" p ","maybe":"m","list":["a",5],"rec":{" k ":"v"}}', Json::encode($out));
        self::assertSame($before, Json::encode($input), 'the input is not changed');
        self::assertSame('{"maybe":null}', Json::encode($this->normalizer->trimFlagged(Json::decode('{"maybe":null}'), $schema)));
        self::assertSame(5, $this->normalizer->trimFlagged(5, $schema), 'a value of the wrong type is left for validation to refuse');
    }

    public function testRefusesSchemaKeywordsItCannotFollow(): void
    {
        $this->expectException(LogicException::class);
        $this->expectExceptionMessage('$ref');
        $this->normalizer->normalize(Json::decode('{"a":{}}'), Json::decode('{"properties":{"a":{"$ref":"#/$defs/A"}}}'));
    }
}
