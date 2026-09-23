import type { FlyerInput } from './schema.js';

/** Applied once by each backend right after validation, so storage drivers keep
    exactly what they are given: an empty hostel means chain-wide, and the
    template column wins over data.template. */
export function normalizeFlyerInput(input: FlyerInput): FlyerInput {
  return { ...input, hostel: input.hostel || null, data: { ...input.data, template: input.template } };
}
