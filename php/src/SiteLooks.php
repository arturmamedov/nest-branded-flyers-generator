<?php

declare(strict_types=1);

namespace NestFlyers;

use InvalidArgumentException;

/**
 * config.php's `looks`: the looks this site's staff may pick, in the site's order; the first is what a new flyer
 * starts in (the owner's answers 3 and 11). The twin of namedLooks in server/config.ts, held to it by
 * tests/fixtures/looks-settings.json.
 *
 * It decides what the editor offers, never what a save accepts (M2): that is the generated schema's, held to the
 * looks the release has.
 */
final class SiteLooks
{
    /**
     * Not set (missing or null): the first look alone, so a site shows no switch until it names a second. Otherwise a
     * list of looks this release has, none twice, at least one, spelt exactly. Anything else is refused by the key's
     * name and the looks there are, never what was written (M3).
     *
     * @param list<string> $known the looks this release has, the first look first (schema/shared.json)
     * @return list<string>
     * @throws InvalidArgumentException
     */
    public static function fromConfig(mixed $value, array $known): array
    {
        if ($value === null) {
            return array_slice($known, 0, 1);
        }
        $valid = is_array($value) && $value !== [] && array_is_list($value)
            && array_reduce($value, static fn (bool $ok, mixed $name): bool => $ok && is_string($name) && in_array($name, $known, true), true)
            && count(array_unique($value)) === count($value);
        if (!$valid) {
            throw new InvalidArgumentException('looks must be null or a list of: ' . implode(', ', $known) . ', each once');
        }
        return $value;
    }
}
