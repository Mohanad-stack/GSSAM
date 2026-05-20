/**
 * Validate raw parameter inputs (strings from the form) against a topology's
 * parameter spec. Returns either { ok: true, values } or { ok: false, errors }.
 *
 * Rules:
 *   - non-tunable parameter must be a finite positive number
 *   - tunable parameter may be empty (means "auto-tune")
 *   - Vref must be physically consistent (e.g. Boost: Vref > Vin)
 */

export function validate(topology, rawValues) {
  // TODO: implement
  throw new Error('validate: not implemented yet');
}
