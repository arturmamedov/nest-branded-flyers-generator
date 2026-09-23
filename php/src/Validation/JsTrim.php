<?php

declare(strict_types=1);

namespace NestFlyers\Validation;

/**
 * JavaScript's String.prototype.trim(), byte for byte, because zod's .trim()
 * uses it and PHP's trim() only knows ASCII. It removes exactly the 25
 * WhiteSpace and LineTerminator code points of ECMA-262 and nothing else:
 * not U+0085 (NEL), U+180E or U+200B, which some Unicode "space" lists include.
 * tests/fixtures/js-trim.json holds the vectors both backends replay.
 *
 * Works on raw UTF-8 bytes (no mb_*, which shared hosts may lack) and scans
 * each end once, so a megabyte of spaces costs linear time, not a regex's
 * quadratic retries.
 */
final class JsTrim
{
    /** UTF-8 encodings of the characters trim() removes, as a set. */
    private const WHITESPACE = [
        "\u{0009}" => true, // CHARACTER TABULATION
        "\u{000A}" => true, // LINE FEED
        "\u{000B}" => true, // LINE TABULATION
        "\u{000C}" => true, // FORM FEED
        "\u{000D}" => true, // CARRIAGE RETURN
        "\u{0020}" => true, // SPACE
        "\u{00A0}" => true, // NO-BREAK SPACE
        "\u{1680}" => true, // OGHAM SPACE MARK
        "\u{2000}" => true, // EN QUAD
        "\u{2001}" => true, // EM QUAD
        "\u{2002}" => true, // EN SPACE
        "\u{2003}" => true, // EM SPACE
        "\u{2004}" => true, // THREE-PER-EM SPACE
        "\u{2005}" => true, // FOUR-PER-EM SPACE
        "\u{2006}" => true, // SIX-PER-EM SPACE
        "\u{2007}" => true, // FIGURE SPACE
        "\u{2008}" => true, // PUNCTUATION SPACE
        "\u{2009}" => true, // THIN SPACE
        "\u{200A}" => true, // HAIR SPACE
        "\u{2028}" => true, // LINE SEPARATOR
        "\u{2029}" => true, // PARAGRAPH SEPARATOR
        "\u{202F}" => true, // NARROW NO-BREAK SPACE
        "\u{205F}" => true, // MEDIUM MATHEMATICAL SPACE
        "\u{3000}" => true, // IDEOGRAPHIC SPACE
        "\u{FEFF}" => true, // ZERO WIDTH NO-BREAK SPACE (BOM)
    ];

    /** Every entry above is 1 to 3 bytes long. */
    private const MAX_BYTES = 3;

    public static function trim(string $value): string
    {
        $start = 0;
        $end = strlen($value);
        while ($start < $end && ($n = self::whitespaceAt($value, $start, $end - $start)) > 0) {
            $start += $n;
        }
        while ($end > $start && ($n = self::whitespaceBefore($value, $end, $end - $start)) > 0) {
            $end -= $n;
        }
        return substr($value, $start, $end - $start);
    }

    /**
     * Byte length of the whitespace character starting at $offset, or 0.
     * UTF-8 encodings are prefix-free, so at most one length can match.
     */
    private static function whitespaceAt(string $value, int $offset, int $available): int
    {
        for ($n = 1; $n <= min(self::MAX_BYTES, $available); $n++) {
            if (isset(self::WHITESPACE[substr($value, $offset, $n)])) {
                return $n;
            }
        }
        return 0;
    }

    /**
     * Byte length of the whitespace character ending at $end, or 0. Matching
     * from the right is safe in valid UTF-8: every entry starts with an ASCII
     * or lead byte, which can never be the continuation of another character.
     */
    private static function whitespaceBefore(string $value, int $end, int $available): int
    {
        for ($n = 1; $n <= min(self::MAX_BYTES, $available); $n++) {
            if (isset(self::WHITESPACE[substr($value, $end - $n, $n)])) {
                return $n;
            }
        }
        return 0;
    }
}
