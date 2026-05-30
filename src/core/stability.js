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
/**
 * Sweep one parameter across a range. At each value: rebuild A, compute
 * eigenvalues, record TWO max-real-part trackers:
 *
 *   • `maxReal`     — over ALL eigenvalues. Catches any crossing, including
 *                     fast switching-mode modes and real-axis crossings.
 *   • `maxRealSlow` — over only the SLOW eigenvalues (|im|/2π below a
 *                     fraction of fs, default 0.3·fs). This isolates the
 *                     controller/LC-scale Hopf the paper tracks (Zhang fig 7B,
 *                     Buck report Ki1=13709 / 1566 Hz) from incidental fast
 *                     crossings.
 *
 * Both crossings are reported. The slow-Hopf is the primary bifurcation
 * (engineering-relevant); any other crossing is reported as `firstCrossing`.
 *
 * @returns {{
 *   values:number[], maxReal:number[], maxRealSlow:number[],
 *   eigs:Array<Array<{re,im}>>,
 *   bifurcation: null | { value:number, type:'Hopf'|'real', freqHz:number, lambda:{re,im} },
 *   firstCrossing: null | { value:number, type:'Hopf'|'real', freqHz:number },
 *   stableAtNominal: boolean
 * }}
 */
export function sweepParameter(topology, baseParams, paramId, range) {
  const { min, max, points = 60, log = false } = range;
  const fs = baseParams.fs || 40e3;
  const slowCutoff = 2 * Math.PI * 0.3 * fs;   // anything above 0.3*fs is "fast"

  const values = [];
  const maxReal = [];
  const maxRealSlow = [];
  const slowLambda = [];   // the slow eigenvalue with largest real part at each point
  const eigsAll = [];

  for (let i = 0; i < points; i++) {
    const frac = points === 1 ? 0 : i / (points - 1);
    const val = log
      ? Math.pow(10, Math.log10(min) + frac * (Math.log10(max) - Math.log10(min)))
      : min + frac * (max - min);
    const p = { ...baseParams, [paramId]: val };
    let eigs;
    try {
      eigs = eigenvalues(getJacobian(topology, p)).eigenvalues
        .filter(e => !e.spurious && Number.isFinite(e.re) && Number.isFinite(e.im));
    }
    catch { eigs = []; }

    const mr = eigs.length ? Math.max(...eigs.map(e => e.re)) : NaN;
    // slow subset: |im| < slowCutoff
    const slow = eigs.filter(e => Math.abs(e.im) < slowCutoff);
    let slowMax = NaN, slowDom = null;
    if (slow.length) {
      slowDom = slow.reduce((a, b) => b.re > a.re ? b : a);
      slowMax = slowDom.re;
    }
    values.push(val); maxReal.push(mr); maxRealSlow.push(slowMax);
    slowLambda.push(slowDom); eigsAll.push(eigs);
  }

  // Helper: find first zero-crossing of an array, in either direction
  const tol = 1;
  const findCross = (arr) => {
    for (let i = 1; i < points; i++) {
      const a = arr[i - 1], b = arr[i];
      if ((a < -tol && b > tol) || (a > tol && b < -tol)) {
        const t = (-a) / (b - a);
        return { i, val: arr[i - 1] < arr[i] ? values[i - 1] + t * (values[i] - values[i - 1])
                                              : values[i - 1] + t * (values[i] - values[i - 1]) };
      }
    }
    return null;
  };

  // primary bifurcation: slow-mode crossing (the engineering Hopf)
  let bifurcation = null;
  const slowCross = findCross(maxRealSlow);
  if (slowCross) {
    const dom = slowLambda[slowCross.i];
    const isComplex = dom && Math.abs(dom.im) > tol;
    bifurcation = {
      value: slowCross.val,
      type: isComplex ? 'Hopf' : 'real',
      freqHz: isComplex ? Math.abs(dom.im) / (2 * Math.PI) : 0,
      lambda: dom ? { re: dom.re, im: dom.im } : null,
    };
  }

  // first overall crossing (may be the same, may be earlier)
  let firstCrossing = null;
  const overall = findCross(maxReal);
  if (overall && (!slowCross || Math.abs(overall.val - slowCross.val) / Math.max(1, slowCross.val) > 0.02)) {
    const dom = [...eigsAll[overall.i]].sort((a, b) => b.re - a.re)[0];
    const isComplex = dom && Math.abs(dom.im) > tol;
    firstCrossing = {
      value: overall.val,
      type: isComplex ? 'Hopf' : 'real',
      freqHz: isComplex ? Math.abs(dom.im) / (2 * Math.PI) : 0,
    };
  }

  return {
    values, maxReal, maxRealSlow, eigs: eigsAll, bifurcation, firstCrossing,
    stableAtNominal: (maxRealSlow[0] < tol) && (maxReal[0] < tol),
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
 * Participation factors of the dominant SLOW mode at the given parameters.
 *
 * "Dominant slow" = the eigenvalue with largest real part among those with
 * |im|/(2π) < 0.3·fs (so we exclude the ~40 kHz ripple modes). This mode is
 * what drives instability at the engineering scale — whether it is a complex
 * pair (Hopf) or a real eigenvalue (real bifurcation). Real-mode crossings
 * are not "wrong"; they are a different (non-oscillatory) failure mode.
 *
 * @returns {{ lambda, perState:number[], groups:{DC,Ripple,Controller}, labels,
 *             allEigenvalues:Array<{re,im}>, allFactors:number[][] }}
 */
export function modeParticipation(topology, p) {
  const J = getJacobian(topology, p);
  const result = eigenvalues(J);
  // Keep the spurious flag alongside the eigenvalue: when selecting the
  // dominant mode we filter them out; for the 3D chart we render every mode
  // but show NaN heights for spurious ones.
  const eigs = result.eigenvalues;
  const validIdx = [];
  for (let i = 0; i < eigs.length; i++) if (!eigs[i].spurious) validIdx.push(i);
  const pf = participationFactors(J);
  const fs = p.fs || 40e3;
  const slowCutoff = 2 * Math.PI * 0.3 * fs;

  // Pick the largest-real-part eigenvalue within the slow band (excluding spurious).
  let idx = -1, best = -Infinity;
  for (const i of validIdx) {
    if (Math.abs(eigs[i].im) < slowCutoff && eigs[i].re > best) {
      best = eigs[i].re; idx = i;
    }
  }
  if (idx < 0) {
    for (const i of validIdx) if (idx < 0 || eigs[i].re > eigs[idx].re) idx = i;
  }
  if (idx < 0) idx = 0;
  const perState = pf[idx].factors;
  const groups = {};
  for (const [g, idxs] of Object.entries(STATE_GROUPS)) {
    groups[g] = idxs.reduce((s, k) => s + perState[k], 0);
  }
  return {
    lambda: eigs[idx], perState, groups, labels: STATE_LABELS,
    allEigenvalues: eigs.filter(e => !e.spurious),
    allFactors: validIdx.map(i => pf[i].factors),
  };
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
        mr = Math.max(...eigenvalues(getJacobian(topology, p)).eigenvalues.filter(e => !e.spurious).map(e => e.re));
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
export function criticalValue(topology, baseParams, paramId, range, opts = {}) {
  const { min, max } = range;
  const slowOnly = opts.slowOnly !== false;
  const fs = baseParams.fs || 40e3;
  const slowCutoff = 2 * Math.PI * 0.3 * fs;

  const reAt = (val) => {
    try {
      const eigs = eigenvalues(getJacobian(topology, { ...baseParams, [paramId]: val })).eigenvalues.filter(e => !e.spurious && Number.isFinite(e.re));
      if (!slowOnly) return Math.max(...eigs.map(e => e.re));
      const slow = eigs.filter(e => Math.abs(e.im) < slowCutoff);
      return slow.length ? Math.max(...slow.map(e => e.re)) : -Infinity;
    } catch { return NaN; }
  };

  // STEP 1 — Pre-scan log-spaced points to find the LOWEST sign change.
  // Bisection on the full [min,max] interval would just find any crossing
  // (and converge to whichever side the midpoint happens to be on); for
  // matrices with multiple instability regions we want the smallest |param|
  // where stability is first lost.
  const SCAN = 60;
  const useLog = min > 0 && max / min > 30;
  const samples = [];
  for (let i = 0; i < SCAN; i++) {
    const frac = i / (SCAN - 1);
    const v = useLog
      ? Math.pow(10, Math.log10(min) + frac * (Math.log10(max) - Math.log10(min)))
      : min + frac * (max - min);
    samples.push({ v, f: reAt(v) });
  }
  // Find the first sign change in either direction.
  let bracket = null;
  for (let i = 1; i < SCAN; i++) {
    const a = samples[i - 1].f, b = samples[i].f;
    if (a < 0 && b > 0) { bracket = { lo: samples[i - 1].v, hi: samples[i].v, flo: a, fhi: b }; break; }
    if (a > 0 && b < 0) { bracket = { lo: samples[i].v, hi: samples[i - 1].v, flo: b, fhi: a }; break; }
  }
  if (!bracket) return null;

  // STEP 2 — Bisect inside the bracket.
  let { lo, hi, flo, fhi } = bracket;
  for (let i = 0; i < 22; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = reAt(mid);
    if (fm < 0) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; }
    if (Math.abs(hi - lo) < 1e-4 * (Math.abs(hi) + 1e-9)) break;
  }
  const crit = 0.5 * (lo + hi);
  const eigs = eigenvalues(getJacobian(topology, { ...baseParams, [paramId]: crit })).eigenvalues.filter(e => !e.spurious && Number.isFinite(e.re));
  const pool = slowOnly ? eigs.filter(e => Math.abs(e.im) < slowCutoff) : eigs;
  const dom = (pool.length ? pool : eigs).reduce((a, b) => b.re > a.re ? b : a);
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
 * Report-style stability boundary FAMILY (Figures 5 / 6 of the Buck Stability
 * Report). For each value of `familyId` (L or C), compute the full stability
 * boundary CURVE in the (Ki1, Kp2) plane.
 *
 * At a fixed (familyParam, C-or-L) and over a range of Kp2 values, find the
 * Ki1_crit at which max Re(λ) first crosses zero. Each (Kp2, Ki1_crit) pair
 * is a point on the boundary; stringing them together gives one curve per
 * family value, drawn overlaid on the same axes.
 *
 * @returns {{
 *   familyValues:number[],          // L (or C) values
 *   kp2Axis:number[],               // shared Kp2 sweep
 *   curves: Array<{                 // one entry per family value
 *     familyValue:number,
 *     ki1Crit:Array<number|null>,   // Ki1_crit at each Kp2 (NaN if no crossing)
 *   }>,
 * }}
 */
export function boundaryFamily(topology, baseParams, familyId, familyRange, kp2Range) {
  const familyValues = axis(familyRange);
  const kp2Axis = axis(kp2Range);
  const ki1Nom = baseParams.Ki1;
  // wide Ki1 search range — at least one decade either side of nominal,
  // and large enough that the bifurcation typically lies inside.
  const ki1Search = { min: ki1Nom * 0.5, max: ki1Nom * 1000 };

  const curves = familyValues.map(fv => {
    const ki1Crit = kp2Axis.map(kp2 => {
      const bp = { ...baseParams, [familyId]: fv, Kp2: kp2 };
      const c = criticalValue(topology, bp, 'Ki1', ki1Search, { slowOnly: false });
      return c ? c.value : NaN;
    });
    return { familyValue: fv, ki1Crit };
  });
  return { familyValues, kp2Axis, curves };
}

/**
 * 3D stability surface analogue of report Figures 7 / 8: Ki1_crit over a 2D
 * grid of (Kp2, familyParam). Returns a grid suitable for surface plotting.
 */
export function stabilitySurface3D(topology, baseParams, kp2Range, familyId, familyRange) {
  const kp2Vals = axis(kp2Range);
  const familyValues = axis(familyRange);
  const ki1Nom = baseParams.Ki1;
  const ki1Search = { min: ki1Nom * 0.5, max: ki1Nom * 1000 };
  const grid = [];      // grid[iy][ix] = Ki1_crit at (kp2=xVals[ix], fv=familyValues[iy])
  for (let iy = 0; iy < familyValues.length; iy++) {
    const row = [];
    for (let ix = 0; ix < kp2Vals.length; ix++) {
      const bp = { ...baseParams, [familyId]: familyValues[iy], Kp2: kp2Vals[ix] };
      const c = criticalValue(topology, bp, 'Ki1', ki1Search, { slowOnly: false });
      row.push(c ? c.value : NaN);
    }
    grid.push(row);
  }
  return { kp2Axis: kp2Vals, familyValues, grid };
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
    try { return eigenvalues(getJacobian(topology, { ...baseParams, [paramId]: v })).eigenvalues.filter(e => !e.spurious); }
    catch { return []; }
  });
  return { values: vals, rows };
}

/** LC resonance frequency in Hz: 1/(2*pi*sqrt(LC)). */
export function lcResonanceHz(p) {
  return 1 / (2 * Math.PI * Math.sqrt(p.L * p.C));
}

export { STATE_LABELS, STATE_GROUPS };
