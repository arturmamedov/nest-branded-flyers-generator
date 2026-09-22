<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Validation;

use NestFlyers\Json;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Validation\JsTrim;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class JsTrimTest extends TestCase
{
    /** @return list<object{input:string, trimmed:string}> tests/fixtures/js-trim.json, shared with Vitest */
    private static function fixture(): array
    {
        return Json::decode((string) file_get_contents(Paths::fixture('js-trim.json')))->cases;
    }

    /** @return array<string, array{string, string}> */
    public static function fixtureCases(): array
    {
        $cases = [];
        foreach (self::fixture() as $i => $case) {
            $cases[sprintf('#%02d %s', $i, bin2hex($case->input))] = [$case->input, $case->trimmed];
        }
        return $cases;
    }

    #[DataProvider('fixtureCases')]
    public function testMatchesJavaScriptTrim(string $input, string $trimmed): void
    {
        self::assertSame($trimmed, JsTrim::trim($input));
    }

    /**
     * The fixture's "c + 'x y' + c" cases name the characters trim() removes;
     * scanning every BMP code point proves JsTrim removes those and no others.
     */
    public function testTrimsExactlyTheFixtureCharactersAcrossTheWholeBmp(): void
    {
        $expected = [];
        foreach (self::fixture() as $case) {
            if ($case->trimmed === 'x y' && preg_match('/\A(.+)x y\1\z/s',$case->input, $m) === 1) {
                $expected[] = bin2hex($m[1]);
            }
        }
        sort($expected);

        $removed = [];
        for ($cp = 0; $cp <= 0xFFFF; $cp++) {
            if ($cp >= 0xD800 && $cp <= 0xDFFF) {
                continue; // surrogates are not characters in UTF-8
            }
            $c = self::utf8($cp);
            if (JsTrim::trim($c . 'x' . $c) === 'x') {
                $removed[] = bin2hex($c);
            }
        }
        sort($removed);

        self::assertCount(25, $expected, 'the fixture lists the 25 WhiteSpace and LineTerminator code points');
        self::assertSame($expected, $removed);
    }

    public function testLeavesCharactersOutsideTheBmpAlone(): void
    {
        foreach ([0x1F600, 0xE0020, 0x10FFFF] as $cp) {
            $c = self::utf8($cp);
            self::assertSame($c . 'x' . $c, JsTrim::trim($c . 'x' . $c));
        }
    }

    public function testKeepsInnerWhitespaceAndEmptiesBlankStrings(): void
    {
        self::assertSame("a \u{3000}\n b", JsTrim::trim("\u{2028} a \u{3000}\n b \u{FEFF}"));
        self::assertSame('', JsTrim::trim(''));
        self::assertSame('', JsTrim::trim("\u{00A0}\u{FEFF}\t\u{3000}"));
    }

    public function testNeverBreaksBytesThatAreNotValidUtf8(): void
    {
        self::assertSame("\xFF", JsTrim::trim(" \xFF\u{3000}"));
        self::assertSame("\xE2\x80", JsTrim::trim("\xE2\x80"), 'a truncated U+2000 is not whitespace');
        self::assertSame("x\x80\x80", JsTrim::trim("x\x80\x80"), 'bare continuation bytes are not whitespace');
    }

    public function testLongRunsOfWhitespaceTakeLinearTime(): void
    {
        $spaces = str_repeat(' ', 300000);
        $ideographic = str_repeat("\u{3000}", 100000);
        self::assertSame('x', JsTrim::trim($spaces . 'x' . $ideographic));
        self::assertSame('x' . $spaces . 'y', JsTrim::trim('x' . $spaces . 'y'));
    }

    /** UTF-8 by hand: tests must not lean on mbstring or intl either. */
    private static function utf8(int $cp): string
    {
        return match (true) {
            $cp < 0x80 => chr($cp),
            $cp < 0x800 => chr(0xC0 | $cp >> 6) . chr(0x80 | $cp & 0x3F),
            $cp < 0x10000 => chr(0xE0 | $cp >> 12) . chr(0x80 | $cp >> 6 & 0x3F) . chr(0x80 | $cp & 0x3F),
            default => chr(0xF0 | $cp >> 18) . chr(0x80 | $cp >> 12 & 0x3F) . chr(0x80 | $cp >> 6 & 0x3F) . chr(0x80 | $cp & 0x3F),
        };
    }
}
