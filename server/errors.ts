import { apiError, type ApiErrorKey } from '../src/shared/errors.js';

/** An error the API answers with, from the shared catalogue (src/shared/errors.ts). */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(key: ApiErrorKey, vars?: Record<string, string | number>, fields?: Record<string, string>) {
    const spec = apiError(key, vars);
    super(spec.message);
    this.status = spec.status;
    this.code = spec.code;
    this.fields = fields ?? spec.fields;
  }
}
