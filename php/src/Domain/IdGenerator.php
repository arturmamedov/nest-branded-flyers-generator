<?php

declare(strict_types=1);

namespace NestFlyers\Domain;

/** Integer ids per record type ("hostel", "doodle", "photo", "flyer"), never reused. Called under an exclusive lock. */
interface IdGenerator
{
    /**
     * The next id, always above every id handed out before.
     *
     * $atLeast lets the caller raise the counter in one step when the records
     * are ahead of it (meta.json restored from an older backup than the data):
     * the result is above $atLeast too.
     */
    public function next(string $entity, int $atLeast = 0): int;
}
