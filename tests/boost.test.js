/**
 * Boost ABCD test — hybrid (structural + value fixtures).
 *
 * VALUE FIXTURES verified against examples/Boost_closed_V3.m (MATLAB run,
 * 2026-05). Full precision; MATLAB printout rounds to ~4 sig figs after the
 * 1e7 scale factor. Structural checks guard shape / NaN / closed-loop form.
 * Run: node tests/boost.test.js
 */
import { buildABCD } from '../src/core/abcd.js';
import { boost } from '../src/converters/boost.js';

const EXPECTED_A = [
  [ -15708.000, -9264.2937, 0,          0,          1381.0948, -6050.9718,  2788170.0,  24675000 ],
  [ 45079.912,  -1422.1133, -8400.8202, 36806.398,  0,          0,         -1832063.3, -16213560 ],
  [ 0,           690.54742, 0,          157079.63, -5714.2857,  0,          0,          0 ],
  [ 0,          -3025.4859, -157079.63, 0,          0,         -5714.2857,  0,          0 ],
  [ -4200.4101,  0,         34758.429,  0,         -3754.7686,  157079.63,  0,          0 ],
  [ 18403.199,   0,         0,          34758.429, -157079.63, -3754.7686,  0,          0 ],
  [ 0,          -1.0,       0,          0,          0,          0,          0,          0 ],
  [ -1.0,       -0.226,     0,          0,          0,          0,          177.50,     0 ],
];
const EXPECTED_B = [ 9264.2937, -2332.6552, 0, 0, 0, 0, 1.0, 0.226 ];

export function testBoostABCD() {
  const p = Object.fromEntries(boost.parameters.map(x => [x.id, x.default]));
  const { A, B } = buildABCD(boost, p, { autotuneIfMissing: false });

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

  if (fail === 0) console.log('testBoostABCD: passed ✓');
  else throw new Error(`testBoostABCD: ${fail} issue(s)`);
}

testBoostABCD();
