<?php

declare(strict_types=1);

namespace NestFlyers\Domain;

/**
 * One lock over a whole store. Re-entrant within a request: a shared() or an
 * exclusive() inside an exclusive() just runs. Asking for exclusive() while
 * only shared() is held throws a LogicException — flock can't upgrade
 * atomically, so every read-modify-write must take exclusive() up front.
 */
interface Lock
{
    /**
     * @template T
     * @param callable(): T $fn
     * @return T
     */
    public function shared(callable $fn): mixed;

    /**
     * @template T
     * @param callable(): T $fn
     * @return T
     */
    public function exclusive(callable $fn): mixed;
}
