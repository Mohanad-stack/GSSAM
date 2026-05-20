/**
 * Reference test: verify the Buck ABCD matches Buck_closed_V4.m.
 *
 * The fixture below is hand-copied from a known-good MATLAB run with the
 * default parameters in examples/Buck_closed_V4.m. When buck.buildAB is
 * implemented, this test must pass to numerical tolerance.
 *
 * Run with: npm test  (once a test runner is wired in — vitest recommended)
 */

import { buildABCD } from '../src/core/abcd.js';
import { buck } from '../src/converters/buck.js';

// TODO: paste the expected A matrix from MATLAB after running Buck_closed_V4.m
// with the default parameters listed in buck.js.
const EXPECTED_A = null;

export function testBuckABCD() {
  if (EXPECTED_A === null) {
    console.warn('testBuckABCD: skipped — fixture not filled in yet');
    return;
  }

  const parameters = Object.fromEntries(
    buck.parameters.map(p => [p.id, p.default])
  );
  const { A } = buildABCD(buck, parameters, { autotuneIfMissing: false });

  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const got = A[i][j];
      const want = EXPECTED_A[i][j];
      if (Math.abs(got - want) > 1e-6) {
        throw new Error(`A[${i}][${j}] mismatch: got ${got}, expected ${want}`);
      }
    }
  }
  console.log('testBuckABCD: passed');
}
