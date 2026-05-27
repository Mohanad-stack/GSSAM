/**
 * Buck ABCD test — hybrid (structural + value fixtures).
 *
 * VALUE FIXTURES below were verified against examples/Buck_closed_V4.m by
 * running the script in MATLAB and comparing disp(A)/disp(B) to the tool's
 * output (2026-05). They are full-precision; MATLAB's printout rounds to ~4
 * significant figures after factoring the 1e7 scale, so e.g. -666.667 shows
 * there as -0.0001*1e7. The structural checks guard shape / NaN / closed-loop
 * structure independent of the exact numbers.
 *
 * Run: node tests/buck.test.js
 */
import { buildABCD } from '../src/core/abcd.js';
import { buck } from '../src/converters/buck.js';

const EXPECTED_A = [
  [ -25140.000, -11477.780, 0,          0,          0,          0,          2382015.0,  63160000 ],
  [ 6666.6667,  -666.66667, 0,          0,          0,          0,          0,          0 ],
  [ 0,           0,         0,          251327.41, -2000.0000,  0,          0,          0 ],
  [ 0,           0,        -251327.41,  0,          0,         -2000.0000,  0,          0 ],
  [ 0,           0,         6666.6667,  0,         -666.66667,  251327.41,  0,          0 ],
  [ 0,           0,         0,          6666.6667, -251327.41, -666.66667,  0,          0 ],
  [ 0,          -1.0,       0,          0,          0,          0,          0,          0 ],
  [ -1.0,       -0.377,     0,          0,          0,          0,          94.75,      0 ],
];
const EXPECTED_B = [ 9477.7800, 0, -311.82976, -959.71332, 0, 0, 1.0, 0.377 ];

export function testBuckABCD() {
  const parameters = Object.fromEntries(buck.parameters.map(p => [p.id, p.default]));
  const { A, B } = buildABCD(buck, parameters, { autotuneIfMissing: false });

  let failures = 0;
  const fail = (m) => { console.error('  ' + m); failures++; };

  // --- structural checks (never go stale) ---
  if (A.length !== 8 || A.some(r => r.length !== 8)) fail('A is not 8x8');
  if (B.length !== 8 || B.some(r => r.length !== 1)) fail('B is not 8x1');
  if (A.flat().some(v => !Number.isFinite(v))) fail('A has non-finite entries');
  if (B.flat().some(v => !Number.isFinite(v))) fail('B has non-finite entries');
  if (Math.abs(A[0][0]) < 1e-9) fail('A[0][0] is zero (control feedback missing — open-loop?)');

  // --- value fixtures (verified against MATLAB) ---
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const tol = 1e-4 * (1 + Math.abs(EXPECTED_A[i][j]));
      if (Math.abs(A[i][j] - EXPECTED_A[i][j]) > tol)
        fail(`A[${i}][${j}] = ${A[i][j]}, expected ${EXPECTED_A[i][j]}`);
    }
    const tolB = 1e-4 * (1 + Math.abs(EXPECTED_B[i]));
    if (Math.abs(B[i][0] - EXPECTED_B[i]) > tolB)
      fail(`B[${i}] = ${B[i][0]}, expected ${EXPECTED_B[i]}`);
  }

  if (failures === 0) console.log('testBuckABCD: passed ✓');
  else throw new Error(`testBuckABCD: ${failures} issue(s)`);
}

testBuckABCD();
