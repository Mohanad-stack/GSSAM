/**
 * Buck-Boost ABCD test — hybrid (structural + value fixtures).
 *
 * VALUE FIXTURES verified against examples/BuckBoost_closedV2.m (MATLAB run,
 * 2026-05). Full precision; MATLAB printout rounds to ~4 sig figs after the
 * 1e6 scale factor. Structural checks guard shape / NaN / closed-loop form.
 * Run: node tests/buckboost.test.js
 */
import { buildABCD } from '../src/core/abcd.js';
import { buckboost } from '../src/converters/buckboost.js';

const EXPECTED_A = [
  [ -968.00000, -4000.9680, 0,          0,          1247.3190, -3838.8533,  81989.600,  5740000.0 ],
  [ 6096.8000,  -999.90320, -1870.9786, 5758.2799,  0,          0,         -8198.9600, -574000.00 ],
  [ 0,           623.65952, 0,          251327.41, -4000.0000,  0,          0,          0 ],
  [ 0,          -1919.4266, -251327.41, 0,          0,         -4000.0000,  0,          0 ],
  [ -935.48928,  0,         6000.0000,  0,         -1000.0000,  251327.41,  0,          0 ],
  [ 2879.1400,   0,         0,          6000.0000, -251327.41, -1000.0000,  0,          0 ],
  [ 0,          -1.0,       0,          0,          0,          0,          0,          0 ],
  [ -1.0,       -0.001,     0,          0,          0,          0,          84.700,     0 ],
];
const EXPECTED_B = [ 4000.9680, -0.0968, 935.48928, -2879.1400, 0, 0, 1.0, 0.001 ];

export function testBuckBoostABCD() {
  const p = Object.fromEntries(buckboost.parameters.map(x => [x.id, x.default]));
  const { A, B } = buildABCD(buckboost, p, { autotuneIfMissing: false });

  let fail = 0;
  const bad = (m) => { console.error('  ' + m); fail++; };

  if (A.length !== 8 || A.some(r => r.length !== 8)) bad('A is not 8x8');
  if (B.length !== 8 || B.some(r => r.length !== 1)) bad('B is not 8x1');
  if (A.flat().some(v => !Number.isFinite(v))) bad('A has non-finite entries');
  if (B.flat().some(v => !Number.isFinite(v))) bad('B has non-finite entries');
  if (Math.abs(A[0][0]) < 1e-9) bad('A[0][0] zero (open-loop?)');
  if (Math.abs(A[1][6]) < 1e-9) bad('A[1][6] zero (Ki1 path missing in cap row)');

  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const tol = 1e-4 * (1 + Math.abs(EXPECTED_A[i][j]));
      if (Math.abs(A[i][j] - EXPECTED_A[i][j]) > tol)
        bad(`A[${i}][${j}] = ${A[i][j]}, expected ${EXPECTED_A[i][j]}`);
    }
    const tolB = 1e-4 * (1 + Math.abs(EXPECTED_B[i]));
    if (Math.abs(B[i][0] - EXPECTED_B[i]) > tolB)
      bad(`B[${i}] = ${B[i][0]}, expected ${EXPECTED_B[i]}`);
  }

  if (fail === 0) console.log('testBuckBoostABCD: passed ✓');
  else throw new Error(`testBuckBoostABCD: ${fail} issue(s)`);
}

testBuckBoostABCD();
