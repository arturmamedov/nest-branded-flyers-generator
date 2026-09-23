<?php

declare(strict_types=1);

namespace NestFlyers\Domain;

use RuntimeException;

/** A hostel slug or photo id that does not exist. The HTTP layer checks first, so this guards against bugs. */
final class MissingReference extends RuntimeException
{
}
