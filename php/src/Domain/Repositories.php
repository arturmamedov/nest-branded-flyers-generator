<?php

declare(strict_types=1);

namespace NestFlyers\Domain;

/** One storage driver's repositories, as the composition root (Bootstrap) hands them out. */
final class Repositories
{
    public function __construct(
        public readonly HostelRepository $hostels,
        public readonly DoodleRepository $doodles,
        public readonly PhotoRepository $photos,
        public readonly FlyerRepository $flyers,
        /** Records which seed file was applied (the Seeder runs inside requests). */
        public readonly SeedState $seedState,
        /** The store's lock, for work that spans repositories (seeding). */
        public readonly Lock $lock,
    ) {
    }
}
