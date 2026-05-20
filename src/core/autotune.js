/**
 * Auto-tune dispatcher.
 *
 * The actual formulas live inside each topology descriptor (buck.autotune,
 * boost.autotune, ...). This module just routes the call and merges the
 * result back into the parameter object.
 */

/**
 * Returns ONLY the tuned values (Kp/Ki). Caller merges into the full parameter set.
 *
 * @param {object} topology    Topology descriptor (must expose autotune(parameters))
 * @param {object} parameters  Current parameter values
 * @returns {object}           Object containing the tuned Kp1, Ki1, Kp2, Ki2 (subset)
 */
export function autotune(topology, parameters) {
  // Only run if at least one tunable is missing — saves work and avoids
  // surprising the user when they supplied gains explicitly.
  const tunableIds = topology.parameters
    .filter(p => p.tunable)
    .map(p => p.id);

  const missing = tunableIds.filter(id => parameters[id] == null);
  if (missing.length === 0) return {};

  return topology.autotune(parameters);
}
