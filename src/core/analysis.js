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

export function transferFunction() {
  throw new Error('transferFunction: not implemented yet');
}
export function stepResponse() {
  throw new Error('stepResponse: not implemented yet');
}
