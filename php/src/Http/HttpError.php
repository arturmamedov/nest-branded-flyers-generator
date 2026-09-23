<?php

declare(strict_types=1);

namespace NestFlyers\Http;

use RuntimeException;

/** An error the API answers with: {error:{code,message,fields?}}. Build one with ErrorCatalog::make(). */
final class HttpError extends RuntimeException
{
    /**
     * @param array<string, string>|null $fields
     * @param array<string, string> $headers extra response headers (e.g. WWW-Authenticate)
     */
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly ?array $fields = null,
        public readonly array $headers = [],
    ) {
        parent::__construct($message);
    }

    public function toResponse(): Response
    {
        $error = ['code' => $this->errorCode, 'message' => $this->getMessage()];
        if ($this->fields !== null) {
            $error['fields'] = (object) $this->fields;
        }
        return Response::json(['error' => $error], $this->status, $this->headers);
    }
}
