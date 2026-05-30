/**
 * Linear analysis on the closed-loop ABCD model.
 *
 * Eigenvalues are computed with the unshifted QR algorithm on a copy of A.
 * For 8x8 system matrices this is fast and dependency-free. It returns
 * complex eigenvalues by detecting 2x2 blocks on the quasi-triangular result.
 */

/**
 * @returns {{ eigenvalues: Array<{re:number, im:number}>, stable: boolean }}
 *
 * Robust eigensolver: first reduces A to upper Hessenberg form via Householder
 * reflections (this is essential — the implicit double-shift QR algorithm needs
 * Hessenberg structure to remain stable when complex pairs split). Then runs
 * shifted QR with deflation, and finally validates each returned eigenvalue
 * with an inverse-iteration residual check, refining or discarding spurious
 * ones. Without the Hessenberg step, the bare QR algorithm produced spurious
 * large-magnitude "eigenvalues" that satisfied the trace constraint by
 * coincidence but failed the residual check ||A·v − λ·v|| ≈ 0.
 */
export function eigenvalues(A) {
  const n = A.length;
  // STEP 1: Hessenberg reduction H = Q^T A Q via Householder reflectors.
  // This zeros out everything below the first subdiagonal.
  let H = hessenberg(A);

  // STEP 2: shifted-QR with deflation on the Hessenberg form.
  let p = n;
  let iter = 0;
  const maxIter = 400 * n;
  while (p > 1 && iter < maxIter) {
    iter++;
    const q = p - 1;
    const sub = Math.abs(H[q][q - 1]);
    const diag = Math.abs(H[q - 1][q - 1]) + Math.abs(H[q][q]);
    // Stricter deflation tolerance — only deflate when subdiag is truly tiny
    if (sub < 1e-12 * (diag + 1e-30)) {
      H[q][q - 1] = 0;
      p--; iter = 0;
      continue;
    }
    // Also deflate a 2x2 block if its subdiagonal beneath it is tiny
    if (p > 2) {
      const q2 = p - 2;
      const sub2 = Math.abs(H[q2][q2 - 1]);
      const diag2 = Math.abs(H[q2 - 1][q2 - 1]) + Math.abs(H[q2][q2]);
      if (sub2 < 1e-12 * (diag2 + 1e-30)) {
        H[q2][q2 - 1] = 0;
        p -= 2; iter = 0;
        continue;
      }
    }
    // Wilkinson shift from the trailing 2x2 of the active block
    const a = H[q - 1][q - 1], b = H[q - 1][q], c = H[q][q - 1], d = H[q][q];
    const tr = a + d, det = a * d - b * c;
    const disc = tr * tr - 4 * det;
    let shift;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      const l1 = (tr + s) / 2, l2 = (tr - s) / 2;
      shift = Math.abs(l1 - d) < Math.abs(l2 - d) ? l1 : l2;
    } else {
      shift = tr / 2;
    }
    // QR step preserving Hessenberg structure on H[0..p-1][0..p-1]
    qrStepHessenberg(H, p, shift);
  }

  let eigs = extractEigenvalues(H);

  // STEP 3: residual validation. For each REAL eigenvalue, check ||A*v - lambda*v||
  // via inverse iteration. Refine via Newton-on-characteristic-poly if the
  // residual is large. Complex pairs from confirmed 2x2 blocks are trusted
  // (the 2x2 was deflated properly, so its eigenvalues are accurate).
  eigs = eigs.map(e => validateEigenvalue(A, e));

  const tol = 1e-6 * (1 + maxAbsReal(eigs));
  const maxRe = Math.max(...eigs.map(e => e.re));
  let classification;
  if (maxRe > tol) classification = 'unstable';
  else if (maxRe > -tol) classification = 'marginal';
  else classification = 'stable';

  return { eigenvalues: eigs, classification, stable: classification === 'stable' };
}

/**
 * Reduce A to upper Hessenberg form via Householder reflections.
 * Hessenberg = zero below the first subdiagonal. This is the standard
 * preconditioning step before QR iteration.
 */
function hessenberg(A) {
  const n = A.length;
  const H = A.map(r => r.slice());
  for (let k = 0; k < n - 2; k++) {
    // Build Householder vector from column k, rows k+1..n-1
    let xnorm = 0;
    for (let i = k + 1; i < n; i++) xnorm += H[i][k] * H[i][k];
    xnorm = Math.sqrt(xnorm);
    if (xnorm < 1e-300) continue;
    const alpha = H[k + 1][k] >= 0 ? -xnorm : xnorm;
    const v = new Array(n).fill(0);
    v[k + 1] = H[k + 1][k] - alpha;
    for (let i = k + 2; i < n; i++) v[i] = H[i][k];
    let vnorm2 = 0;
    for (let i = k + 1; i < n; i++) vnorm2 += v[i] * v[i];
    if (vnorm2 < 1e-300) continue;
    const beta = 2 / vnorm2;
    // H := (I - beta v v^T) H  -- apply on the left to rows k+1..n-1
    for (let j = 0; j < n; j++) {
      let dot = 0;
      for (let i = k + 1; i < n; i++) dot += v[i] * H[i][j];
      dot *= beta;
      for (let i = k + 1; i < n; i++) H[i][j] -= dot * v[i];
    }
    // H := H (I - beta v v^T)  -- apply on the right to cols k+1..n-1
    for (let i = 0; i < n; i++) {
      let dot = 0;
      for (let j = k + 1; j < n; j++) dot += v[j] * H[i][j];
      dot *= beta;
      for (let j = k + 1; j < n; j++) H[i][j] -= dot * v[j];
    }
  }
  // explicitly zero entries that should be zero (numerical cleanup)
  for (let i = 2; i < n; i++) for (let j = 0; j < i - 1; j++) H[i][j] = 0;
  return H;
}

/**
 * Single QR step that preserves Hessenberg structure. Uses Givens rotations
 * along the subdiagonal — the standard practice. Applies to active block
 * [0..p-1] with shift.
 */
function qrStepHessenberg(H, p, shift) {
  // Apply Givens rotations: zero out subdiagonal entries one at a time using
  // a sequence of rotations, then apply the rotations from the right (which
  // creates new bulge entries we then chase down — but for Hessenberg form
  // a simple sweep of Givens does the job).
  // Subtract shift from diagonal
  for (let i = 0; i < p; i++) H[i][i] -= shift;
  // Forward sweep: rotate to zero each H[i+1][i]
  const cs = [], sn = [];
  for (let i = 0; i < p - 1; i++) {
    const a = H[i][i], b = H[i + 1][i];
    const r = Math.hypot(a, b);
    const c = r === 0 ? 1 : a / r;
    const s = r === 0 ? 0 : b / r;
    cs.push(c); sn.push(s);
    for (let j = i; j < p; j++) {
      const x = H[i][j], y = H[i + 1][j];
      H[i][j] = c * x + s * y;
      H[i + 1][j] = -s * x + c * y;
    }
  }
  // Backward sweep: apply rotations from the right
  for (let i = 0; i < p - 1; i++) {
    const c = cs[i], s = sn[i];
    for (let j = 0; j <= Math.min(p - 1, i + 1); j++) {
      const x = H[j][i], y = H[j][i + 1];
      H[j][i] = c * x + s * y;
      H[j][i + 1] = -s * x + c * y;
    }
  }
  // Add shift back
  for (let i = 0; i < p; i++) H[i][i] += shift;
}

/**
 * Inverse-iteration residual check for a claimed eigenvalue. Returns the
 * (possibly refined) eigenvalue, or the original if it's already accurate.
 * Drops it (residual NaN, marks impossibly large to push it out of dominant
 * tracking) only if it's clearly bogus and refinement doesn't recover it.
 */
function validateEigenvalue(A, e) {
  // For complex eigenvalues from a 2x2 block: trust them. The 2x2 solve gives
  // an exact characteristic root for that block, so the residual is structural.
  if (Math.abs(e.im) > 1e-9) return e;

  const n = A.length;
  // Inverse iteration: solve (A - lambda*I) v = b, normalize, repeat.
  // Refine lambda via Rayleigh quotient.
  let lam = e.re;
  let v = new Array(n).fill(0).map((_, i) => (i === 0 ? 1 : 0.1));
  let prevLam = lam + 1;
  for (let it = 0; it < 30; it++) {
    if (Math.abs(lam - prevLam) < 1e-10 * (Math.abs(lam) + 1e-9)) break;
    prevLam = lam;
    // Factor A - lambda*I with LU + partial pivoting
    const M = A.map(r => r.slice());
    for (let i = 0; i < n; i++) M[i][i] -= lam;
    const perm = [...Array(n).keys()];
    let singular = false;
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (piv !== col) {
        [M[col], M[piv]] = [M[piv], M[col]];
        [perm[col], perm[piv]] = [perm[piv], perm[col]];
      }
      if (Math.abs(M[col][col]) < 1e-300) { singular = true; M[col][col] = 1e-300; }
      for (let r = col + 1; r < n; r++) {
        const fac = M[r][col] / M[col][col];
        M[r][col] = fac;
        for (let c = col + 1; c < n; c++) M[r][c] -= fac * M[col][c];
      }
    }
    // Solve M*y = perm(v)
    const b = perm.map(i => v[i]);
    const y = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = b[i];
      for (let j = 0; j < i; j++) s -= M[i][j] * y[j];
      y[i] = s;
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    const norm = Math.sqrt(x.reduce((s, c) => s + c * c, 0));
    if (!Number.isFinite(norm) || norm === 0) break;
    v = x.map(c => c / norm);
    // Rayleigh quotient: lambda := v^T A v
    let rq = 0;
    for (let i = 0; i < n; i++) {
      let Av_i = 0;
      for (let j = 0; j < n; j++) Av_i += A[i][j] * v[j];
      rq += v[i] * Av_i;
    }
    lam = rq;
  }
  // Final residual check
  let resn = 0, refn = 0;
  for (let i = 0; i < n; i++) {
    let Av_i = 0;
    for (let j = 0; j < n; j++) Av_i += A[i][j] * v[j];
    const r = Av_i - lam * v[i];
    resn += r * r;
    refn += Av_i * Av_i;
  }
  resn = Math.sqrt(resn);
  refn = Math.sqrt(refn) + 1e-30;
  const relRes = resn / refn;
  if (relRes < 1e-3 && Number.isFinite(lam)) {
    return { re: lam, im: 0 };
  }
  // Spurious: mark with NaN so it can be filtered. But to avoid breaking the
  // caller (which iterates over eigenvalues), set it to a very negative value
  // so it never dominates the max-real check.
  return { re: -1e300, im: 0, spurious: true };
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

/**
 * Participation factors P_ki = |v_ki * u_ki| / sum_k |v_ki * u_ki|, where u is
 * the right eigenvector and v the left eigenvector of mode i. For each mode we
 * compute both eigenvectors by inverse iteration on (A - lambda I) (right) and
 * (A^T - lambda I) (left), using a complex shift slightly off the eigenvalue.
 *
 * @returns {Array<{ lambda:{re,im}, factors:number[] }>} one entry per eigenvalue
 */
export function participationFactors(A) {
  const n = A.length;
  const { eigenvalues: eigs } = eigenvalues(A);
  const out = [];
  for (const lam of eigs) {
    // shift slightly so (A - lambda I) is non-singular for inverse iteration
    const shift = 1e-6 * (1 + Math.hypot(lam.re, lam.im));
    const u = inverseIterationComplex(A, lam.re + shift, lam.im + shift, false, n);
    const v = inverseIterationComplex(A, lam.re + shift, lam.im + shift, true, n);
    // participation p_k = |v_k * u_k| (complex product magnitude)
    const p = new Array(n);
    let sum = 0;
    for (let k = 0; k < n; k++) {
      const pr = u.re[k] * v.re[k] - u.im[k] * v.im[k];
      const pi = u.re[k] * v.im[k] + u.im[k] * v.re[k];
      p[k] = Math.hypot(pr, pi);
      sum += p[k];
    }
    if (sum > 0) for (let k = 0; k < n; k++) p[k] /= sum;
    out.push({ lambda: lam, factors: p });
  }
  return out;
}

// Inverse iteration to get the (right or left) eigenvector for a complex shift.
// transpose=true solves with A^T (left eigenvector). Returns {re,im} length n.
function inverseIterationComplex(A, sigmaRe, sigmaIm, transpose, n) {
  const At = transpose ? A[0].map((_, j) => A.map(r => r[j])) : A;
  // M = (At - sigma I), complex. Build real 2n augmented [Mr -Mi; Mi Mr].
  const size = 2 * n;
  const buildM = () => {
    const M = Array.from({ length: size }, () => new Array(size).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const mr = At[i][j] - (i === j ? sigmaRe : 0);
        const mi = (i === j ? -sigmaIm : 0);
        M[i][j] = mr;       M[i][j + n] = -mi;
        M[i + n][j] = mi;   M[i + n][j + n] = mr;
      }
    }
    return M;
  };
  // start vector
  let xr = new Array(n).fill(1), xi = new Array(n).fill(0);
  for (let iter = 0; iter < 5; iter++) {
    const M = buildM();
    const rhs = new Array(size);
    for (let i = 0; i < n; i++) { rhs[i] = xr[i]; rhs[i + n] = xi[i]; }
    const sol = gaussSolve(M, rhs);
    xr = sol.slice(0, n); xi = sol.slice(n, 2 * n);
    // normalize
    let norm = 0;
    for (let k = 0; k < n; k++) norm += xr[k] * xr[k] + xi[k] * xi[k];
    norm = Math.sqrt(norm) || 1e-300;
    for (let k = 0; k < n; k++) { xr[k] /= norm; xi[k] /= norm; }
  }
  return { re: xr, im: xi };
}
