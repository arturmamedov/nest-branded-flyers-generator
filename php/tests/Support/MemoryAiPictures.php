<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Support;

use NestFlyers\Ai\AiPictures;
use RuntimeException;

/** The AI's kept pictures in memory, for tests of what sits above them (FileAiPicturesTest proves the files). */
final class MemoryAiPictures implements AiPictures
{
    /** @var array<string, string> path => bytes */
    public array $kept = [];

    /** @param bool $full a disk that takes nothing */
    public function __construct(private readonly bool $full = false)
    {
    }

    public function keep(string $day, string $bytes, string $extension): string
    {
        if ($this->full) {
            throw new RuntimeException('No space left on device');
        }
        $path = "ai-pictures/$day/" . bin2hex(random_bytes(8)) . ".$extension";
        $this->kept[$path] = $bytes;
        return $path;
    }

    public function sweep(string $today): void
    {
    }
}
