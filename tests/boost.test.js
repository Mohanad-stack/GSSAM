/**
 * Reference test: Boost ABCD against Boost_closed_V3.m defaults.
 * Cross-verified against NumPy. Run: node tests/boost.test.js
 */
import { buildABCD } from '../src/core/abcd.js';
import { boost } from '../src/converters/boost.js';

const p = Object.fromEntries(boost.parameters.map(x => [x.id, x.default]));
const { A, B } = buildABCD(boost, p, { autotuneIfMissing: false });

const checks = [
  ['A[1][0]', A[1][0], 40551.5004],
  ['A[0][1]', A[0][1], -6666.6667],
  ['A[0][4]', A[0][4], 2756.6445],
  ['B[0]',    B[0][0], 6666.6667],
  ['A[7][7]', A[7][7], 0],
];
let fail = 0;
for (const [name, got, want] of checks) {
  if (Math.abs(got - want) > 1e-2) { console.error(`${name}: got ${got}, want ${want}`); fail++; }
}
if (fail === 0) console.log('testBoostABCD: passed ✓');
else throw new Error(`testBoostABCD: ${fail} mismatch(es)`);
