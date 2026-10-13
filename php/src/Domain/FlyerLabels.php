<?php

declare(strict_types=1);

namespace NestFlyers\Domain;

use NestFlyers\Shared;

/**
 * The rules for a flyer's labels: the twin of src/shared/labels.ts, held to it by tests/fixtures/flyer-labels.json.
 * The list itself comes from schema/shared.json and is never written here.
 *
 * A label is held to a shape, never to the list: one taken off the list stays stored on its flyers, is on no
 * screen, and shows again if it comes back.
 */
final class FlyerLabels
{
    /**
     * @param list<string> $slugs the list's slugs, in the order every screen shows them
     * @param string $none what the library's filter asks for to get the flyers that carry no label
     */
    public function __construct(private readonly array $slugs, private readonly string $none)
    {
    }

    public static function fromShared(Shared $shared): self
    {
        $labels = $shared->labels();
        return new self(array_column($labels['list'], 'slug'), $labels['none']);
    }

    /**
     * The labels of a flyer that are on the list, in the list's order, once each: what every screen shows.
     *
     * @param list<string> $labels
     * @return list<string>
     */
    public function known(array $labels): array
    {
        return array_values(array_filter($this->slugs, static fn (string $slug): bool => in_array($slug, $labels, true)));
    }

    /**
     * A flyer's labels as they are saved: the listed ones in the list's order, then the ones off the list as they
     * were stored, each once.
     *
     * @param list<string> $labels
     * @return list<string>
     */
    public function tidy(array $labels): array
    {
        $hidden = [];
        foreach ($labels as $label) {
            if (!in_array($label, $this->slugs, true) && !in_array($label, $hidden, true)) {
                $hidden[] = $label;
            }
        }
        return [...$this->known($labels), ...$hidden];
    }

    /**
     * Whether a flyer with these labels is among the ones the library's filter asks for: a slug it carries, or
     * the filter's word for a flyer on which staff see none.
     *
     * @param list<string> $labels
     */
    public function matches(array $labels, string $wanted): bool
    {
        return $wanted === $this->none ? $this->known($labels) === [] : in_array($wanted, $labels, true);
    }

    /**
     * A stored flyer's labels, read loosely by the storage driver, which lists a flyer whatever its data holds: a
     * flyer saved before labels has none, and a file edited by hand never stops the list.
     *
     * @param mixed $data the flyer's data as decoded: an object, an array, or anything else
     * @return list<string>
     */
    public static function stored(mixed $data): array
    {
        $labels = match (true) {
            is_object($data) => $data->labels ?? null,
            is_array($data) => $data['labels'] ?? null,
            default => null,
        };
        return is_array($labels) && array_is_list($labels) ? array_values(array_filter($labels, is_string(...))) : [];
    }
}
