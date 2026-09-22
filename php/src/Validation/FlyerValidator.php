<?php

declare(strict_types=1);

namespace NestFlyers\Validation;

use InvalidArgumentException;
use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\HttpError;
use stdClass;

/**
 * The PHP twin of FlyerInputSchema.parse() (src/shared/schema.ts), for the
 * bodies of POST and PUT api/flyers, driven by the generated
 * schema/flyer.schema.json. It answers exactly what the Node server keeps:
 * the title trimmed, defaults filled, unknown keys dropped, keys in zod's order.
 * normalizeFlyerInput's rules (empty hostel, template column) stay with the
 * flyer handler, as they do in server/app.ts.
 */
final class FlyerValidator
{
    private readonly SchemaValidator $validator;
    private readonly object $dataSchema;

    /** @param object $flyerSchema the decoded schema/flyer.schema.json */
    public function __construct(
        private readonly object $flyerSchema,
        private readonly SchemaNormalizer $normalizer,
        private readonly ErrorCatalog $errors,
    ) {
        $this->validator = new SchemaValidator($normalizer);
        $data = $flyerSchema->properties->data ?? null;
        if (!is_object($data)) {
            throw new InvalidArgumentException('The flyer schema has no properties.data; regenerate schema/flyer.schema.json.');
        }
        $this->dataSchema = $data;
    }

    /**
     * @param mixed $body the decoded request body (Json::decode)
     * @return array{title:string, hostel:?string, template:string, data:stdClass, photoId:?int}
     * @throws HttpError 400 `invalid`, with every bad field's dotted path in `fields`
     */
    public function validate(mixed $body): array
    {
        try {
            $input = $this->validator->validate($body, $this->flyerSchema);
        } catch (InvalidData $e) {
            throw $this->errors->make('invalid', [], $e->fields);
        }
        return [
            'title' => $input->title,
            'hostel' => $input->hostel,
            'template' => $input->template,
            'data' => $input->data,
            'photoId' => $input->photoId,
        ];
    }

    /**
     * What FlyerDataSchema.parse() makes of stored data: the flyer store runs
     * every read through this, so files written before a default was added, or
     * by another backend, come out in today's shape.
     */
    public function normalizeData(stdClass $data): stdClass
    {
        $normalized = $this->normalizer->normalize($data, $this->dataSchema);
        if (!$normalized instanceof stdClass) {
            throw new InvalidArgumentException('The flyer schema\'s data is not an object schema.');
        }
        return $normalized;
    }
}
