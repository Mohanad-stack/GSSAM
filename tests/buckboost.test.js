/**
 * Reference test: Buck-Boost ABCD against BuckBoost_closedV2.m defaults.
 * Cross-verified against NumPy. Run: node tests/buckboost.test.js
 */
import { buildABCD } from '../src/core/abcd.js';
import { buckboost } from '../src/converters/buckboost.js';

const p = Object.fromEntries(buckboost.parameters.map(x => [x.id, x.default]));
const { A, B } = buildABCD(buckboost, p, { autotuneIfMissing: false });

const checks = [
  ['A[1][0]', A[1][0], 6000.0000],
  ['A[0][1]', A[0][1], -4000.0000],
  ['A[0][4]', A[0][4], 1247.3190],
  ['B[0]',    B[0][0], 4000.0000],
  ['B[2]',    B[2][0], 935.4893],
  ['B[3]',    B[3][0], -2879.1400],
];
let fail = 0;
for (const [name, got, want] of checks) {
  if (Math.abs(got - want) > 1e-2) { console.error(`${name}: got ${got}, want ${want}`); fail++; }
}
if (fail === 0) console.log('testBuckBoostABCD: passed ✓');
else throw new Error(`testBuckBoostABCD: ${fail} mismatch(es)`);
