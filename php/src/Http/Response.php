<?php

declare(strict_types=1);

namespace NestFlyers\Http;

use NestFlyers\Json;

/** An HTTP answer. API bodies go through Json::encode, like everything this backend writes. */
final class Response
{
    /** @param array<string, string> $headers */
    public function __construct(
        public readonly int $status,
        public readonly array $headers,
        public readonly string $body,
    ) {
    }

    /** @param array<string, string> $headers */
    public static function json(mixed $data, int $status = 200, array $headers = []): self
    {
        return new self(
            $status,
            ['Content-Type' => 'application/json; charset=utf-8', 'Cache-Control' => 'no-store', 'X-Content-Type-Options' => 'nosniff'] + $headers,
            Json::encode($data),
        );
    }

    public static function noContent(): self
    {
        return new self(204, ['Cache-Control' => 'no-store'], '');
    }

    public function send(): void
    {
        http_response_code($this->status);
        foreach ($this->headers as $name => $value) {
            header("$name: $value");
        }
        echo $this->body;
    }
}
