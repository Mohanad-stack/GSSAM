/**
 * Stability-analysis engine.
 *
 * As of the model update, this engine uses the SAME verified linearized A
 * matrix as the Linearized tab — `buildAB(topology, params).A`. That matrix
 * is the closed-loop linearization at the operating point (control feedback
 * already in A), verified against the MATLAB scripts entry-by-entry. So
 * eigenvalues, parameter sweeps, bifurcation detection, participation
 * factors, and the L/C design study all flow from one source of truth.
 */

import { buildABCD } from './abcd.js';
import { eigenvalues, participationFactors } from './analysis.js';

const STATE_LABELS = ['iL₀', 'vo₀', 'iLR', 'iLI', 'voR', 'voI', 'ξv', 'ξi'];
const STATE_GROUPS = {
  DC: [0, 1],
  Ripple: [2, 3, 4, 5],
  Controller: [6, 7],
};

/** Closed-loop A at parameters p — the verified linearized matrix. */
export function getJacobian(topology, p) {
  return buildABCD(topology, p, { autotuneIfMissing: false }).A;
}

/** Integrate the nonlinear GSSAM to its steady state (equilibrium point). */
export function settleEquilibrium(topology, p, tEnd = 0.08) {
  const f = (x) => topology.gssamNonlinear(x, p);
  const w = 2 * Math.PI * p.fs;
  const h = Math.min((2 * Math.PI / w) / 24, 1.5 / w);
  let n = Math.ceil(tEnd / h);
  if (n > 200000) n = 200000;
  let x = new Array(8).fill(0);
  for (let k = 0; k < n; k++) {
    const k1 = f(x);
    const k2 = f(x.map((v, i) => v + 0.5 * h * k1[i]));
    const k3 = f(x.map((v, i) => v + 0.5 * h * k2[i]));
    const k4 = f(x.map((v, i) => v + h * k3[i]));
    x = x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  return x;
}

function numericJacobian(f, x) {
  const n = x.length;
  const J = Array.from({ length: n }, () => new Array(n).fill(0));
  const f0 = f(x);
  for (let j = 0; j < n; j++) {
    const h = 1e-6 * (Math.abs(x[j]) + 1e-3);
    const xp = x.slice(); xp[j] += h;
    const fp = f(xp);
    for (let i = 0; i < n; i++) J[i][j] = (fp[i] - f0[i]) / h;
  }
  return J;
}

/**
 * Sweep one parameter across a range. At each value: rebuild the Jacobian,
 * compute eigenvalues, record max(real) and the dominant complex pair.
 * Detect the bifurcation where max(real) crosses zero, classify Hopf vs real.
 *
 * @returns {{
 *   values:number[], maxReal:number[], eigs:Array<Array<{re,im}>>,
 *   bifurcation: null | { value:number, type:'Hopf'|'real', freqHz:number },
 *   stableAtNominal: boolean
 * }}
 */
export function sweepParameter(topology, baseParams, paramId, range) {
  const { min, max, points = 60, log = false } = range;
  const values = [];
  const maxReal = [];
  const eigsAll = [];

  for (let i = 0; i < points; i++) {
    const frac = i / (points - 1);
    const val = log
      ? Math.pow(10, Math.log10(min) + frac * (Math.log10(max) - Math.log10(min)))
      : min + frac * (max - min);
    const p = { ...baseParams, [paramId]: val };
    let eigs;
    try {
      const J = getJacobian(topology, p);
      eigs = eigenvalues(J).eigenvalues;
    } catch {
      eigs = [];
    }
    const mr = eigs.length ? Math.max(...eigs.map(e => e.re)) : NaN;
    values.push(val);
    maxReal.push(mr);
    eigsAll.push(eigs);
  }

  // detect first zero-crossing of maxReal (ignoring marginal integrator poles
  // that sit at ~0 throughout — we look for a real crossing into clearly +).
  let bifurcation = null;
  const tol = 1; // rad/s; treat |re|<1 as on-axis
  for (let i = 1; i < points; i++) {
    if (maxReal[i - 1] < -tol && maxReal[i] > tol) {
      // linear interpolate the crossing value
      const t = (-maxReal[i - 1]) / (maxReal[i] - maxReal[i - 1]);
      const vCross = values[i - 1] + t * (values[i] - values[i - 1]);
      // classify using the dominant mode at i: complex => Hopf
      const dom = [...eigsAll[i]].sort((a, b) => b.re - a.re)[0];
      const isComplex = Math.abs(dom.im) > tol;
      bifurcation = {
        value: vCross,
        type: isComplex ? 'Hopf' : 'real',
        freqHz: isComplex ? Math.abs(dom.im) / (2 * Math.PI) : 0,
      };
      break;
    }
  }

  return {
    values, maxReal, eigs: eigsAll, bifurcation,
    stableAtNominal: maxReal[0] < tol,
  };
}

/**
 * Bifurcation diagram: settle the nonlinear model at each parameter value and
 * record the steady-state vo (min/max of the last cycles → shows the limit
 * cycle fanning out after a Hopf).
 * @returns {{ values:number[], voMin:number[], voMax:number[], voMean:number[] }}
 */
export function bifurcationDiagram(topology, baseParams, paramId, range) {
  const { min, max, points = 40, log = false } = range;
  const values = [], voMin = [], voMax = [], voMean = [];
  for (let i = 0; i < points; i++) {
    const frac = i / (points - 1);
    const val = log
      ? Math.pow(10, Math.log10(min) + frac * (Math.log10(max) - Math.log10(min)))
      : min + frac * (max - min);
    const p = { ...baseParams, [paramId]: val };
    const tail = settleAndSampleVo(topology, p);
    values.push(val);
    voMin.push(tail.min); voMax.push(tail.max); voMean.push(tail.mean);
  }
  return { values, voMin, voMax, voMean };
}

// Settle then sample vo over the final stretch (full reconstruction).
function settleAndSampleVo(topology, p) {
  const f = (x) => topology.gssamNonlinear(x, p);
  const w = 2 * Math.PI * p.fs;
  const h = Math.min((2 * Math.PI / w) / 24, 1.5 / w);
  const tEnd = 0.05;
  let n = Math.ceil(tEnd / h);
  if (n > 120000) n = 120000;
  const sampleStart = Math.floor(n * 0.7);
  let x = new Array(8).fill(0);
  let mn = Infinity, mx = -Infinity, sum = 0, cnt = 0;
  for (let k = 0; k < n; k++) {
    if (k >= sampleStart) {
      const tk = k * h, c = Math.cos(w * tk), s = Math.sin(w * tk);
      const vo = x[1] + 2 * x[4] * c - 2 * x[5] * s;
      if (vo < mn) mn = vo; if (vo > mx) mx = vo; sum += vo; cnt++;
    }
    const k1 = f(x);
    const k2 = f(x.map((v, i) => v + 0.5 * h * k1[i]));
    const k3 = f(x.map((v, i) => v + 0.5 * h * k2[i]));
    const k4 = f(x.map((v, i) => v + h * k3[i]));
    x = x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  return { min: mn, max: mx, mean: cnt ? sum / cnt : NaN };
}

/**
 * Participation factors of the dominant (largest-real-part, non-integrator)
 * mode at the given parameters, grouped into DC / Ripple / Controller.
 * @returns {{ lambda, perState:number[], groups:{DC,Ripple,Controller}, labels }}
 */
export function modeParticipation(topology, p) {
  const J = getJacobian(topology, p);
  const { eigenvalues: eigs } = eigenvalues(J);
  const pf = participationFactors(J);
  // dominant oscillatory mode = largest real part among complex eigenvalues
  let idx = -1, best = -Infinity;
  for (let i = 0; i < eigs.length; i++) {
    if (Math.abs(eigs[i].im) > 1 && eigs[i].re > best) { best = eigs[i].re; idx = i; }
  }
  if (idx < 0) { // fall back to overall largest real part
    idx = 0; for (let i = 1; i < eigs.length; i++) if (eigs[i].re > eigs[idx].re) idx = i;
  }
  const perState = pf[idx].factors;
  const groups = {};
  for (const [g, idxs] of Object.entries(STATE_GROUPS)) {
    groups[g] = idxs.reduce((s, k) => s + perState[k], 0);
  }
  return { lambda: eigs[idx], perState, groups, labels: STATE_LABELS };
}

/**
 * 2D stability map: for two swept parameters, mark stable/unstable by sign of
 * max(real eigenvalue). Returns a grid for a heatmap/region plot.
 * @returns {{ xVals:number[], yVals:number[], grid:number[][] }}  grid[iy][ix] = maxReal
 */
export function stabilityMap2D(topology, baseParams, xSpec, ySpec) {
  const xVals = axis(xSpec), yVals = axis(ySpec);
  const grid = [];
  for (let iy = 0; iy < yVals.length; iy++) {
    const row = [];
    for (let ix = 0; ix < xVals.length; ix++) {
      const p = { ...baseParams, [xSpec.id]: xVals[ix], [ySpec.id]: yVals[iy] };
      let mr;
      try {
        mr = Math.max(...eigenvalues(getJacobian(topology, p)).eigenvalues.map(e => e.re));
      } catch { mr = NaN; }
      row.push(mr);
    }
    grid.push(row);
  }
  return { xVals, yVals, grid };
}

function axis({ min, max, points = 30, log = false }) {
  const out = [];
  for (let i = 0; i < points; i++) {
    const frac = i / (points - 1);
    out.push(log
      ? Math.pow(10, Math.log10(min) + frac * (Math.log10(max) - Math.log10(min)))
      : min + frac * (max - min));
  }
  return out;
}

/**
 * Find the critical value of `paramId` where max(real eig) first crosses 0,
 * by bisection. Returns null if the system is unstable at min or stable at max
 * (no crossing in range). `direction` = +1 if increasing the parameter
 * destabilizes (the usual case), found automatically.
 */
export function criticalValue(topology, baseParams, paramId, range) {
  const { min, max } = range;
  const maxReAt = (val) => {
    try {
      return Math.max(...eigenvalues(getJacobian(topology, { ...baseParams, [paramId]: val })).eigenvalues.map(e => e.re));
    } catch { return NaN; }
  };
  let lo = min, hi = max;
  let flo = maxReAt(lo), fhi = maxReAt(hi);
  // need a sign change (stable at lo, unstable at hi)
  if (!(flo < 0 && fhi > 0)) {
    // try reverse (decreasing destabilizes)
    if (flo > 0 && fhi < 0) { [lo, hi] = [hi, lo]; [flo, fhi] = [fhi, flo]; }
    else return null;
  }
  for (let i = 0; i < 22; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = maxReAt(mid);
    if (fm < 0) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; }
    if (Math.abs(hi - lo) < 1e-4 * (Math.abs(hi) + 1e-9)) break;
  }
  const crit = 0.5 * (lo + hi);
  // frequency of the crossing mode
  const eigs = eigenvalues(getJacobian(topology, { ...baseParams, [paramId]: crit })).eigenvalues;
  const dom = [...eigs].sort((a, b) => b.re - a.re)[0];
  return { value: crit, freqHz: Math.abs(dom.im) / (2 * Math.PI), type: Math.abs(dom.im) > 1 ? 'Hopf' : 'real' };
}

/**
 * Effect of a power-stage parameter (L or C) on the critical Ki1: for each
 * value of `effectId`, bisect to find Ki1_crit. Reveals the scaling law
 * (Ki1_crit · L ≈ const for L; weak dependence for C).
 * @returns {{ values:number[], critKi1:number[], product:number[] }}
 */
export function criticalScaling(topology, baseParams, effectId, effectRange, ki1Range) {
  const vals = axis(effectRange);
  const critKi1 = [], product = [];
  for (const v of vals) {
    const bp = { ...baseParams, [effectId]: v };
    const c = criticalValue(topology, bp, 'Ki1', ki1Range);
    const k = c ? c.value : NaN;
    critKi1.push(k);
    product.push(k * v);
  }
  return { values: vals, critKi1, product };
}

/**
 * 3D design surface: Ki1_crit over a grid of (xId, yId). Returns grid for a
 * heatmap / contour (engineer's lookup chart).
 * @returns {{ xVals:number[], yVals:number[], grid:number[][] }} grid[iy][ix] = Ki1_crit
 */
export function designSurface(topology, baseParams, xSpec, ySpec, ki1Range) {
  const xVals = axis(xSpec), yVals = axis(ySpec);
  const grid = [];
  for (let iy = 0; iy < yVals.length; iy++) {
    const row = [];
    for (let ix = 0; ix < xVals.length; ix++) {
      const bp = { ...baseParams, [xSpec.id]: xVals[ix], [ySpec.id]: yVals[iy] };
      const c = criticalValue(topology, bp, 'Ki1', ki1Range);
      row.push(c ? c.value : NaN);
    }
    grid.push(row);
  }
  return { xVals, yVals, grid };
}

/**
 * Eigenvalue table: all eigenvalues at a handful of parameter values (paper
 * Tables 2/3). @returns {{ values:number[], rows:Array<Array<{re,im}>> }}
 */
export function eigenvalueTable(topology, baseParams, paramId, range, nRows = 6) {
  const vals = axis({ ...range, points: nRows });
  const rows = vals.map(v => {
    try { return eigenvalues(getJacobian(topology, { ...baseParams, [paramId]: v })).eigenvalues; }
    catch { return []; }
  });
  return { values: vals, rows };
}

/** LC resonance frequency in Hz: 1/(2*pi*sqrt(LC)). */
export function lcResonanceHz(p) {
  return 1 / (2 * Math.PI * Math.sqrt(p.L * p.C));
}

export { STATE_LABELS, STATE_GROUPS };
