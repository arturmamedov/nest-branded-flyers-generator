/* Every error the API can answer with: status, machine code, the words staff
   see, and (for the two reference checks) the field message. One catalogue for
   the Node server, the PHP backend (via schema/shared.json), the contract
   suite and the error table in docs/api-contract.md. `{name}` is filled in by
   apiError(). */

export interface ApiErrorSpec {
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export const API_ERRORS = {
  malformed: { status: 400, code: 'invalid', message: 'Malformed request.' },
  invalid: { status: 400, code: 'invalid', message: 'Some fields are not valid.' },
  unknown_hostel: { status: 400, code: 'invalid', message: 'Unknown hostel.', fields: { hostel: 'Unknown hostel' } },
  unknown_photo: { status: 400, code: 'invalid', message: 'Unknown photo.', fields: { photoId: 'Unknown photo' } },
  no_photo_field: { status: 400, code: 'invalid', message: 'Attach the photo as the "photo" field.' },
  bad_format: { status: 400, code: 'invalid', message: 'format must be png or jpg.' },
  unauthorized: { status: 401, code: 'unauthorized', message: 'Sign in to use the flyer generator.' },
  forbidden: { status: 403, code: 'forbidden', message: 'Missing X-Nest-Flyers header.' },
  ip_forbidden: { status: 403, code: 'forbidden', message: 'This network is not allowed to use the flyer generator.' },
  no_such_flyer: { status: 404, code: 'not_found', message: 'No such flyer.' },
  no_such_endpoint: { status: 404, code: 'not_found', message: 'No such endpoint.' },
  not_found: { status: 404, code: 'not_found', message: 'Not found.' },
  too_large: { status: 413, code: 'too_large', message: 'That photo is over {mb} MB. Use a smaller JPG.' },
  too_many_pixels: {
    status: 413,
    code: 'too_large',
    message: 'That photo has too many pixels to process here. Use a smaller JPG.',
  },
  heic: {
    status: 415,
    code: 'heic',
    message:
      'iPhone HEIC photos are not supported — export it as JPG (Settings › Camera › Formats › Most Compatible) and try again.',
  },
  unreadable: { status: 415, code: 'unsupported', message: 'That file is not an image we can read. Use a JPG, PNG or WebP.' },
  unsupported_format: { status: 415, code: 'unsupported', message: '{format} files are not supported. Use a JPG, PNG or WebP.' },
  server_error: { status: 500, code: 'server_error', message: 'Something went wrong on the server.' },
  storage_too_new: {
    status: 500,
    code: 'server_error',
    message: 'The data folder was written by a newer version of this app. Update the app before using it.',
  },
  not_configured: {
    status: 503,
    code: 'not_configured',
    message: 'This app is not set up yet: add an access rule to config.php.',
  },
} as const satisfies Record<string, ApiErrorSpec>;

export type ApiErrorKey = keyof typeof API_ERRORS;

/** Megabytes as staff read them: one decimal, rounded down so "over N MB" stays true, ".0" dropped. */
export function formatMb(bytes: number): string {
  return String(Math.floor((bytes / (1024 * 1024)) * 10) / 10);
}

/** The catalogue entry with its `{placeholders}` filled in. */
export function apiError(key: ApiErrorKey, vars: Record<string, string | number> = {}): ApiErrorSpec {
  const spec: ApiErrorSpec = API_ERRORS[key];
  const message = spec.message.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
  return { ...spec, message };
}
