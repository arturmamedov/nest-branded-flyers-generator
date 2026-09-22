<?php

declare(strict_types=1);

namespace NestFlyers\Storage\Json;

use LogicException;
use NestFlyers\Domain\Lock;
use RuntimeException;

/**
 * The store's lock: flock() on one lock file, LOCK_SH for reads and LOCK_EX
 * for read-modify-writes, across every PHP process serving the app. The OS
 * drops it when a process dies, so there is no stale lock to clean up.
 *
 * Re-entrant inside one request: nested calls only move depth counters, and
 * only the outermost call takes and releases the OS lock. An exclusive()
 * nested in a shared() can't be honoured (flock has no atomic upgrade: it
 * would drop the shared lock first, letting a writer in between the caller's
 * read and write), so it throws instead of silently losing the guarantee.
 */
final class FlockLock implements Lock
{
    /** @var resource|null the lock file, open only while the OS lock is held */
    private $handle = null;
    private int $sharedDepth = 0;
    private int $exclusiveDepth = 0;

    /** @param string $path the lock file (created when missing, never deleted) */
    public function __construct(private readonly string $path)
    {
    }

    public function shared(callable $fn): mixed
    {
        // Inside an exclusive() (or another shared()) the lock we hold already covers a read.
        $outermost = $this->sharedDepth === 0 && $this->exclusiveDepth === 0;
        if ($outermost) {
            $this->acquire(LOCK_SH);
        }
        $this->sharedDepth++;
        try {
            return $fn();
        } finally {
            $this->sharedDepth--;
            if ($outermost) {
                $this->release();
            }
        }
    }

    public function exclusive(callable $fn): mixed
    {
        if ($this->exclusiveDepth === 0 && $this->sharedDepth > 0) {
            throw new LogicException(
                'exclusive() inside shared(): flock cannot upgrade atomically. Take exclusive() before the first read.',
            );
        }
        $outermost = $this->exclusiveDepth === 0;
        if ($outermost) {
            $this->acquire(LOCK_EX);
        }
        $this->exclusiveDepth++;
        try {
            return $fn();
        } finally {
            $this->exclusiveDepth--;
            if ($outermost) {
                $this->release();
            }
        }
    }

    private function acquire(int $operation): void
    {
        $dir = dirname($this->path);
        error_clear_last();
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException("Cannot create the data folder $dir: " . self::lastError());
        }
        // 'c+' creates the file when missing and never truncates it; flock needs a handle, not the contents.
        $handle = @fopen($this->path, 'c+');
        if ($handle === false) {
            throw new RuntimeException("Cannot open the lock file {$this->path}: " . self::lastError());
        }
        // Blocking: requests are short, and the OS releases the lock of a process that dies.
        if (!flock($handle, $operation)) {
            fclose($handle);
            throw new RuntimeException("Cannot lock {$this->path}");
        }
        $this->handle = $handle;
    }

    private function release(): void
    {
        if ($this->handle === null) {
            return;
        }
        flock($this->handle, LOCK_UN);
        // Closed, not kept open: Windows can't delete or move a folder while a handle inside it is open.
        fclose($this->handle);
        $this->handle = null;
    }

    private static function lastError(): string
    {
        return error_get_last()['message'] ?? 'unknown error';
    }
}
