<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Storage;

use LogicException;
use NestFlyers\Storage\Json\FlockLock;
use NestFlyers\Tests\Support\TempDir;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/**
 * Re-entrancy and the real OS lock. A second handle on the lock file stands in
 * for another request: flock conflicts between handles even in one process
 * (per handle on Windows, per open file description on Linux).
 */
final class FlockLockTest extends TestCase
{
    private string $dir;
    private string $path;
    private FlockLock $lock;

    protected function setUp(): void
    {
        $this->dir = TempDir::create('lock');
        $this->path = $this->dir . '/nested/.lock';
        $this->lock = new FlockLock($this->path);
    }

    protected function tearDown(): void
    {
        TempDir::remove($this->dir);
    }

    public function testReturnsWhatTheCallbackReturnsAndCreatesTheLockFile(): void
    {
        self::assertSame('read', $this->lock->shared(static fn (): string => 'read'));
        self::assertSame(42, $this->lock->exclusive(static fn (): int => 42));
        self::assertFileExists($this->path);
    }

    public function testExclusiveKeepsEveryoneElseOut(): void
    {
        $this->lock->exclusive(function (): void {
            self::assertFalse($this->otherCanLock(LOCK_SH));
            self::assertFalse($this->otherCanLock(LOCK_EX));
        });
        self::assertTrue($this->otherCanLock(LOCK_EX), 'released afterwards');
    }

    public function testSharedLetsOtherReadersInButNotWriters(): void
    {
        $this->lock->shared(function (): void {
            self::assertTrue($this->otherCanLock(LOCK_SH));
            self::assertFalse($this->otherCanLock(LOCK_EX));
        });
        self::assertTrue($this->otherCanLock(LOCK_EX));
    }

    public function testSharedInsideExclusiveRunsAndKeepsTheExclusiveLock(): void
    {
        $trace = $this->lock->exclusive(function (): array {
            $inner = $this->lock->shared(fn (): string => 'shared ran');
            // The inner shared() must not have released (or downgraded) the outer lock.
            return [$inner, $this->otherCanLock(LOCK_SH)];
        });

        self::assertSame(['shared ran', false], $trace);
        self::assertTrue($this->otherCanLock(LOCK_EX));
    }

    public function testNestedCallsOfTheSameKindRunAndReleaseOnlyAtTheOutermost(): void
    {
        $this->lock->exclusive(function (): void {
            $this->lock->exclusive(function (): void {
                // An exclusive() inside a shared() inside an exclusive() is still covered by the outer lock.
                $this->lock->shared(fn (): mixed => $this->lock->exclusive(static fn (): mixed => null));
            });
            self::assertFalse($this->otherCanLock(LOCK_SH), 'still held after the inner calls return');
        });
        $this->lock->shared(function (): void {
            $this->lock->shared(static fn (): mixed => null);
            self::assertFalse($this->otherCanLock(LOCK_EX), 'still held after the inner shared returns');
        });
        self::assertTrue($this->otherCanLock(LOCK_EX));
    }

    public function testExclusiveInsideSharedThrowsInsteadOfUpgrading(): void
    {
        $ran = false;
        try {
            $this->lock->shared(function () use (&$ran): void {
                $this->lock->exclusive(function () use (&$ran): void {
                    $ran = true;
                });
            });
            self::fail('Expected a LogicException');
        } catch (LogicException $e) {
            self::assertStringContainsString('upgrade', $e->getMessage());
        }

        self::assertFalse($ran);
        self::assertTrue($this->otherCanLock(LOCK_EX), 'the shared lock was released');
        self::assertSame('ok', $this->lock->exclusive(static fn (): string => 'ok'), 'the lock is usable again');
    }

    public function testAThrowingCallbackReleasesTheLock(): void
    {
        foreach (['shared', 'exclusive'] as $method) {
            try {
                $this->lock->{$method}(static function (): never {
                    throw new RuntimeException('boom');
                });
                self::fail('Expected the exception to propagate');
            } catch (RuntimeException $e) {
                self::assertSame('boom', $e->getMessage());
            }
            self::assertTrue($this->otherCanLock(LOCK_EX), "$method released");
        }
        // Depth counters are back to zero: a shared() now takes a real lock again, so a writer is kept out.
        $this->lock->shared(fn () => self::assertFalse($this->otherCanLock(LOCK_EX)));
    }

    /** Whether another handle (another request) could take the lock right now. */
    private function otherCanLock(int $operation): bool
    {
        $handle = fopen($this->path, 'c+');
        self::assertIsResource($handle);
        try {
            $locked = flock($handle, $operation | LOCK_NB);
            if ($locked) {
                flock($handle, LOCK_UN);
            }
            return $locked;
        } finally {
            fclose($handle);
        }
    }
}
