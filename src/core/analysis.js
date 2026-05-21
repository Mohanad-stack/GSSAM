/**
 * Linear analysis on the closed-loop ABCD model.
 *
 * Eigenvalues are computed with the unshifted QR algorithm on a copy of A.
 * For 8x8 system matrices this is fast and dependency-free. It returns
 * complex eigenvalues by detecting 2x2 blocks on the quasi-triangular result.
 */

/**
 * @returns {{ eigenvalues: Array<{re:number, im:number}>, stable: boolean }}
 */
export function eigenvalues(A) {
  const n = A.length;
  let H = A.map(row => row.slice());

  const maxIter = 1000;
  for (let iter = 0; iter < maxIter; iter++) {
    const { Q, R } = qrDecompose(H);
    H = matMul(R, Q);
    if (isQuasiTriangular(H)) break;
  }

  const eigs = extractEigenvalues(H);

  // Classify by largest real part. A small tolerance treats integrator poles
  // sitting on the imaginary axis as "marginal" rather than "unstable".
  const tol = 1e-6 * (1 + maxAbsReal(eigs));
  const maxRe = Math.max(...eigs.map(e => e.re));
  let classification;
  if (maxRe > tol) classification = 'unstable';
  else if (maxRe > -tol) classification = 'marginal';
  else classification = 'stable';

  return {
    eigenvalues: eigs,
    classification,
    stable: classification === 'stable',
  };
}

function maxAbsReal(eigs) {
  return eigs.reduce((m, e) => Math.max(m, Math.abs(e.re)), 0);
}

function qrDecompose(A) {
  const n = A.length;
  const Q = identity(n);
  const R = A.map(row => row.slice());

  for (let j = 0; j < n - 1; j++) {
    for (let i = n - 1; i > j; i--) {
      const a = R[i - 1][j];
      const b = R[i][j];
      const r = Math.hypot(a, b);
      if (r < 1e-300) continue;
      const c = a / r;
      const s = b / r;
      for (let k = 0; k < n; k++) {
        const t1 = R[i - 1][k];
        const t2 = R[i][k];
        R[i - 1][k] = c * t1 + s * t2;
        R[i][k] = -s * t1 + c * t2;
        const q1 = Q[i - 1][k];
        const q2 = Q[i][k];
        Q[i - 1][k] = c * q1 + s * q2;
        Q[i][k] = -s * q1 + c * q2;
      }
    }
  }
  return { Q: transpose(Q), R };
}

function extractEigenvalues(H) {
  const n = H.length;
  const eigs = [];
  let i = 0;
  while (i < n) {
    if (i === n - 1 || Math.abs(H[i + 1][i]) < 1e-9 * (Math.abs(H[i][i]) + Math.abs(H[i + 1][i + 1]) + 1e-30)) {
      eigs.push({ re: H[i][i], im: 0 });
      i += 1;
    } else {
      const a = H[i][i], b = H[i][i + 1];
      const c = H[i + 1][i], d = H[i + 1][i + 1];
      const tr = a + d;
      const det = a * d - b * c;
      const disc = tr * tr - 4 * det;
      if (disc < 0) {
        const re = tr / 2;
        const im = Math.sqrt(-disc) / 2;
        eigs.push({ re, im }, { re, im: -im });
      } else {
        const s = Math.sqrt(disc);
        eigs.push({ re: (tr + s) / 2, im: 0 }, { re: (tr - s) / 2, im: 0 });
      }
      i += 2;
    }
  }
  return eigs;
}

function isQuasiTriangular(H) {
  const n = H.length;
  for (let i = 2; i < n; i++) {
    for (let j = 0; j < i - 1; j++) {
      if (Math.abs(H[i][j]) > 1e-8) return false;
    }
  }
  return true;
}

function identity(n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}
function transpose(M) {
  return M[0].map((_, j) => M.map(row => row[j]));
}
function matMul(A, B) {
  const n = A.length, m = B[0].length, p = B.length;
  const out = Array.from({ length: n }, () => Array(m).fill(0));
  for (let i = 0; i < n; i++)
    for (let k = 0; k < p; k++)
      for (let j = 0; j < m; j++)
        out[i][j] += A[i][k] * B[k][j];
  return out;
}

/**
 * Step response of output state `outputIdx` to a unit step on the single
 * input (B is 8x1).
 *
 * The closed-loop A is STIFF: slow control modes (~10^3 rad/s) coexist with
 * fast switching-harmonic modes (~10^5 rad/s). An explicit method (RK4) would
 * need thousands of tiny steps to stay stable. We use backward Euler, which is
 * A-stable (unconditionally stable) so the step size is chosen for accuracy of
 * the slow modes, not stability of the fast ones.
 *
 *   (I - dt*A) x_{k+1} = x_k + dt*B*u
 *
 * @returns {{ t: number[], y: number[] }}
 */
export function stepResponse(A, B, { outputIdx = 1, stepValue = 1, tEnd = null, n = 800 } = {}) {
  const dim = A.length;

  if (tEnd == null) {
    const { eigenvalues: eigs } = eigenvalues(A);
    const damped = eigs.map(e => e.re).filter(re => re < -1e-3);
    const slowest = damped.length ? Math.min(...damped.map(Math.abs)) : 100;
    tEnd = 8 / slowest;            // ~8 time constants of the slowest mode
  }

  const dt = tEnd / n;

  // Factor (I - dt*A) once, reuse each step (it's constant).
  const M = Array.from({ length: dim }, (_, i) =>
    Array.from({ length: dim }, (_, j) => (i === j ? 1 : 0) - dt * A[i][j]));
  const lu = luDecompose(M);

  const t = new Array(n + 1);
  const y = new Array(n + 1);
  let x = new Array(dim).fill(0);

  for (let k = 0; k <= n; k++) {
    t[k] = k * dt;
    y[k] = x[outputIdx];
    if (k === n) break;
    const rhs = x.map((v, i) => v + dt * B[i][0] * stepValue);
    x = luSolve(lu, rhs);
  }

  return { t, y };
}

// LU factorization with partial pivoting (reused across step-response steps).
function luDecompose(Ain) {
  const n = Ain.length;
  const A = Ain.map(r => r.slice());
  const piv = Array.from({ length: n }, (_, i) => i);
  for (let col = 0; col < n; col++) {
    let p = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[p][col])) p = r;
    if (p !== col) { [A[col], A[p]] = [A[p], A[col]]; [piv[col], piv[p]] = [piv[p], piv[col]]; }
    const d = A[col][col] || 1e-300;
    for (let r = col + 1; r < n; r++) {
      A[r][col] /= d;
      for (let c = col + 1; c < n; c++) A[r][c] -= A[r][col] * A[col][c];
    }
  }
  return { A, piv };
}

function luSolve({ A, piv }, b) {
  const n = b.length;
  const x = piv.map(i => b[i]);
  for (let r = 1; r < n; r++)
    for (let c = 0; c < r; c++) x[r] -= A[r][c] * x[c];
  for (let r = n - 1; r >= 0; r--) {
    for (let c = r + 1; c < n; c++) x[r] -= A[r][c] * x[c];
    x[r] /= A[r][r] || 1e-300;
  }
  return x;
}

/**
 * Frequency response from the single input to output state `outputIdx`,
 * i.e. the (outputIdx) entry of  C(jw I - A)^-1 B  with C = I.
 * Returns magnitude in dB and phase in degrees across a log sweep.
 *
 * @returns {{ w: number[], magDb: number[], phaseDeg: number[] }}
 */
export function frequencyResponse(A, B, { outputIdx = 1, wMin = 1, wMax = 1e7, points = 400 } = {}) {
  const dim = A.length;
  const w = new Array(points);
  const magDb = new Array(points);
  const phaseDeg = new Array(points);

  const logMin = Math.log10(wMin);
  const logMax = Math.log10(wMax);

  for (let p = 0; p < points; p++) {
    const wp = Math.pow(10, logMin + (logMax - logMin) * (p / (points - 1)));
    // Solve (jw I - A) X = B  for complex X, then take row outputIdx.
    const { re, im } = solveResolvent(A, B, wp, dim);
    const mag = Math.hypot(re[outputIdx], im[outputIdx]);
    w[p] = wp;
    magDb[p] = 20 * Math.log10(mag);
    phaseDeg[p] = Math.atan2(im[outputIdx], re[outputIdx]) * 180 / Math.PI;
  }
  return { w, magDb, phaseDeg };
}

// Solve (jw I - A) x = B for complex x using a real-valued 2N augmented system.
// Returns {re: number[], im: number[]} of length N.
function solveResolvent(A, B, w, n) {
  // M = jw I - A  (complex). Write as Mr + j Mi.
  // Real system: [Mr -Mi; Mi Mr] [xr; xi] = [Br; Bi]
  const Mr = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => -A[i][j]));
  const Mi = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? w : 0)));

  const size = 2 * n;
  const M = Array.from({ length: size }, () => new Array(size).fill(0));
  const rhs = new Array(size).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      M[i][j] = Mr[i][j];
      M[i][j + n] = -Mi[i][j];
      M[i + n][j] = Mi[i][j];
      M[i + n][j + n] = Mr[i][j];
    }
    rhs[i] = B[i][0];      // Br
    rhs[i + n] = 0;        // Bi
  }

  const sol = gaussSolve(M, rhs);
  return { re: sol.slice(0, n), im: sol.slice(n, 2 * n) };
}

// Gaussian elimination with partial pivoting. Solves M x = b.
function gaussSolve(Min, bin) {
  const n = bin.length;
  const M = Min.map(r => r.slice());
  const b = bin.slice();
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (piv !== col) { [M[col], M[piv]] = [M[piv], M[col]]; [b[col], b[piv]] = [b[piv], b[col]]; }
    const d = M[col][col] || 1e-300;
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / d;
      if (f === 0) continue;
      for (let c = col; c < n; c++) M[r][c] -= f * M[col][c];
      b[r] -= f * b[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / (M[r][r] || 1e-300);
  }
  return x;
}
