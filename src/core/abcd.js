/**
 * Generic ABCD assembler.
 *
 * Knows nothing about which converter it's building — it just dispatches
 * to the topology descriptor. Adding a new topology never touches this file.
 *
 *   const { A, B, C, D, op } = buildABCD(buck, parameters);
 */

import { getTopology } from '../converters/index.js';
import { autotune } from './autotune.js';

/**
 * @param {string|object} topologyOrId  Either a topology descriptor or its id
 * @param {object} parameters           Numeric parameter values keyed by parameter id
 * @param {object} [options]
 * @param {boolean} [options.autotuneIfMissing=true]  Run auto-tune for any tunable
 *                                                    parameter whose value is null/undefined
 * @returns {{ A: number[][], B: number[][], C: number[][], D: number[][], op: object, parameters: object }}
 */
export function buildABCD(topologyOrId, parameters, options = {}) {
  const topology = typeof topologyOrId === 'string'
    ? getTopology(topologyOrId)
    : topologyOrId;

  if (!topology) {
    throw new Error(`Unknown topology: ${topologyOrId}`);
  }

  // Step 1: fill in any blank tunable parameters via auto-tune
  const params = { ...parameters };
  if (options.autotuneIfMissing !== false) {
    const tuned = autotune(topology, params);
    for (const key of Object.keys(tuned)) {
      if (params[key] == null) params[key] = tuned[key];
    }
  }

  // Step 2: compute operating point
  const op = topology.operatingPoint(params);

  // Step 3: build A and B from the descriptor
  const { A, B } = topology.buildAB(params, op);

  // C = I_8, D = 0 (all states observable, no feedthrough) — matches the MATLAB
  const n = A.length;
  const C = eye(n);
  const D = zeros(n, 1);

  return { A, B, C, D, op, parameters: params };
}

function eye(n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
}

function zeros(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}
