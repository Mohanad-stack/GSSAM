/**
 * Real-time switching vs GSSAM comparison.
 *
 * Runs two simulations over the same horizon and returns aligned time series:
 *   1. SWITCHING model: physical [iL, vo] integrated cycle-by-cycle with the
 *      PWM switch flipping ON for d*Ts then OFF for (1-d)*Ts. The cascaded PI
 *      controllers update the duty once per switching period (sampled control).
 *   2. GSSAM model: the 8-state averaged model integrated with the same
 *      controllers, then reconstructed back to iL(t), vo(t) via the index-±1
 *      harmonics.
 *
 * The point of the comparison: GSSAM should track the switching model's
 * average AND its ripple (that's what GSSAM adds over plain averaging).
 */

import { buildABCD } from './abcd.js';

/**
 * @param {object} topology  descriptor with .switching.deriv and .operatingPoint
 * @param {object} parameters numeric params (Vin, L, C, R, fs, Vref, Kp1.., Vm)
 * @param {object} [opts]
 * @param {number} [opts.cycles] number of switching cycles to simulate
 * @param {number} [opts.subStepsPerPhase] integration sub-steps within each ON/OFF phase
 * @returns {{
 *   t: number[], iL_sw: number[], vo_sw: number[],
 *   tg: number[], iL_gs: number[], vo_gs: number[],
 *   iL0_gs: number[], vo0_gs: number[],
 *   fs: number, Ts: number, cycles: number
 * }}
 */
export function simulateSwitchingVsGssam(topology, parameters, opts = {}) {
  if (!topology.switching) {
    throw new Error(`${topology.id}: no switching model defined`);
  }
  const p = { ...parameters };
  const { Vin, L, C, R, fs, Vref, Vm = 1 } = p;
  const Kp1 = p.Kp1, Ki1 = p.Ki1, Kp2 = p.Kp2, Ki2 = p.Ki2;

  const Ts = 1 / fs;
  const w = 2 * Math.PI * fs;
  const cycles = opts.cycles ?? 200;
  const sub = opts.subStepsPerPhase ?? 10;
  const modelMode = opts.modelMode ?? 'linearized';

  // ---- 1. SWITCHING MODEL ------------------------------------------------
  // Physical state [iL, vo] + integrator states for the two PI loops.
  let iL = 0, vo = 0;
  let evInt = 0, eiInt = 0;     // outer (voltage), inner (current) integrators

  const t = [];
  const iL_sw = [];
  const vo_sw = [];

  // The controller senses the CYCLE-AVERAGED vo and iL (not the instantaneous
  // value at the cycle boundary). For a boost the output ripple is asymmetric,
  // so sampling at the boundary regulates the peak rather than the average and
  // leaves a DC error; averaging makes the regulated DC equal Vref, matching a
  // properly-sampled / Simulink controller. Seed with the instantaneous value
  // for the first cycle.
  let voSense = 0, iLSense = 0;

  for (let n = 0; n < cycles; n++) {
    // --- sampled controller update (once per switching period) ---
    const ev = Vref - voSense;
    const iLref = Kp1 * ev + Ki1 * evInt;
    const ei = iLref - iLSense;
    const vcon = Kp2 * ei + Ki2 * eiInt;

    let d = vcon / Vm;
    const dSat = Math.max(0, Math.min(1, d));

    // anti-windup: stop integrating when saturated and pushing further in
    if (!((dSat <= 0 && ev < 0) || (dSat >= 1 && ev > 0))) evInt += ev * Ts;
    if (!((dSat <= 0 && ei < 0) || (dSat >= 1 && ei > 0))) eiInt += ei * Ts;

    d = dSat;

    // --- integrate physical states across ON then OFF phase, recording
    //     several samples within each phase, and accumulating the time-average
    //     of vo and iL to feed the controller next cycle ---
    const tOn = d * Ts;
    const tOff = (1 - d) * Ts;
    const t0 = n * Ts;

    const acc = { voSum: 0, iLSum: 0, wSum: 0 };
    recordPhase(topology, iL, vo, 1, tOn, sub, p, t0, t, iL_sw, vo_sw, acc, (a, b) => { iL = a; vo = b; });
    recordPhase(topology, iL, vo, 0, tOff, sub, p, t0 + tOn, t, iL_sw, vo_sw, acc, (a, b) => { iL = a; vo = b; });
    if (acc.wSum > 0) { voSense = acc.voSum / acc.wSum; iLSense = acc.iLSum / acc.wSum; }
    else { voSense = vo; iLSense = iL; }
  }

  // ---- 2. GSSAM MODEL ----------------------------------------------------
  // Linearized: integrate the displayed A, B (dx = A x + B Vref). Its startup
  //   overshoots; valid near the operating point.
  // Nonlinear: integrate the duty-state-dependent averaged ODE (d recomputed
  //   from live states each step). Tracks the full startup, matching switching.
  let gs;
  if (modelMode === 'nonlinear') {
    gs = simulateGssamNonlinear(topology, p, { tEnd: cycles * Ts, w });
  } else {
    const { A, B } = buildABCD(topology, p, { autotuneIfMissing: false });
    gs = simulateGssam(topology, p, { tEnd: cycles * Ts, w, A, B });
  }

  return {
    t, iL_sw, vo_sw,
    tg: gs.t, iL_gs: gs.iL, vo_gs: gs.vo, iL0_gs: gs.iL0, vo0_gs: gs.vo0,
    fs, Ts, cycles,
  };
}

// Integrate physical [iL, vo] for duration `dur` with switch state s, RK4,
// recording (t, iL, vo) at each sub-step so the intra-cycle ripple is sampled.
// Also accumulates a time-weighted sum of vo and iL into `acc` so the caller
// can compute the cycle-average for the controller.
function recordPhase(topology, iL, vo, s, dur, sub, p, tStart, tArr, iLArr, voArr, acc, setState) {
  if (dur <= 0) { setState(iL, vo); return; }
  const h = dur / sub;
  const f = (a, b) => topology.switching.deriv(a, b, s, p);
  for (let k = 0; k < sub; k++) {
    const [k1a, k1b] = f(iL, vo);
    const [k2a, k2b] = f(iL + 0.5 * h * k1a, vo + 0.5 * h * k1b);
    const [k3a, k3b] = f(iL + 0.5 * h * k2a, vo + 0.5 * h * k2b);
    const [k4a, k4b] = f(iL + h * k3a, vo + h * k3b);
    const iLnew = iL + (h / 6) * (k1a + 2 * k2a + 2 * k3a + k4a);
    const voNew = vo + (h / 6) * (k1b + 2 * k2b + 2 * k3b + k4b);
    // trapezoidal time-weighted accumulation over this sub-step
    if (acc) {
      acc.voSum += 0.5 * (vo + voNew) * h;
      acc.iLSum += 0.5 * (iL + iLnew) * h;
      acc.wSum += h;
    }
    iL = iLnew; vo = voNew;
    tArr.push(tStart + (k + 1) * h);
    iLArr.push(iL);
    voArr.push(vo);
  }
  setState(iL, vo);
}

/**
 * Linearized GSSAM closed-loop simulation.
 *
 * Integrates the SAME linearized state-space model the tool builds and
 * displays:  dx/dt = A x + B*Vref,  with x(0) = 0  and
 *   x = [iL0, vo0, iLR, iLI, voR, voI, ev_int, ei_int].
 * Then reconstructs the time-domain waveforms via the index-+/-1 harmonics:
 *   iL(t) = iL0 + 2 iLR cos(w t) - 2 iLI sin(w t)
 *   vo(t) = vo0 + 2 voR cos(w t) - 2 voI sin(w t)
 *
 * Because this is the LINEARIZED model (matrices frozen at the operating
 * point), its startup transient is NOT expected to match the real switching
 * converter: far from the operating point the linear model overshoots
 * dramatically (large iL/vo spikes). That mismatch is correct and expected.
 * The nonlinear, duty-state-dependent GSSAM (which tracks the switching
 * startup) is a planned future feature, to be built against the MATLAB reference.
 *
 * A is stiff (slow control poles + fast harmonic poles), so we integrate with
 * A-stable backward Euler:  (I - h A) x_{k+1} = x_k + h B Vref.
 */
function simulateGssam(topology, p, { tEnd, w, A, B }) {
  const Vref = p.Vref;
  const dim = A.length;

  // Step size: resolve the switching ripple (~24 steps/cycle). Backward Euler
  // is unconditionally stable, so the step is chosen for accuracy, not stability.
  const Ts = 2 * Math.PI / w;
  const h0 = Ts / 24;
  let nSteps = Math.ceil(tEnd / h0);
  const MAX_STEPS = 240000;
  if (nSteps > MAX_STEPS) nSteps = MAX_STEPS;
  const h = tEnd / nSteps;

  const actualStepsPerCycle = Ts / h;
  let recordEvery = Math.max(1, Math.round(actualStepsPerCycle / 16));
  if (nSteps / recordEvery > 50000) recordEvery = Math.ceil(nSteps / 50000);

  // Factor (I - h A) once.
  const M = Array.from({ length: dim }, (_, i) =>
    Array.from({ length: dim }, (_, j) => (i === j ? 1 : 0) - h * A[i][j]));
  const lu = luDecomposeSim(M);

  let x = new Array(dim).fill(0);
  const t = [], iL = [], vo = [], iL0 = [], vo0 = [];

  for (let k = 0; k <= nSteps; k++) {
    if (k % recordEvery === 0 || k === nSteps) {
      const tk = k * h;
      const c = Math.cos(w * tk), s = Math.sin(w * tk);
      t.push(tk);
      iL.push(x[0] + 2 * x[2] * c - 2 * x[3] * s);
      vo.push(x[1] + 2 * x[4] * c - 2 * x[5] * s);
      iL0.push(x[0]); vo0.push(x[1]);
    }
    if (k === nSteps) break;
    const rhs = x.map((v, i) => v + h * B[i][0] * Vref);
    x = luSolveSim(lu, rhs);
  }

  return { t, iL, vo, iL0, vo0 };
}

/**
 * Nonlinear GSSAM closed-loop simulation. Integrates the duty-state-dependent
 * averaged ODE (topology.gssamNonlinear) with explicit RK4. The duty is
 * recomputed from the live DC states each step, so the model tracks the full
 * startup transient and matches the switching converter (unlike the linearized
 * model, which overshoots). State is reconstructed to iL(t), vo(t) via the
 * index-±1 harmonics.
 */
function simulateGssamNonlinear(topology, p, { tEnd, w }) {
  if (typeof topology.gssamNonlinear !== 'function') {
    throw new Error(`${topology.id}: no nonlinear GSSAM model defined`);
  }
  const Ts = 2 * Math.PI / w;
  const stepsPerCycle = 24;
  const hAccuracy = Ts / stepsPerCycle;
  const hStable = 1.5 / w;            // RK4 stability for the ±w rotation
  const h0 = Math.min(hAccuracy, hStable);
  let nSteps = Math.ceil(tEnd / h0);
  const MAX_STEPS = 240000;
  if (nSteps > MAX_STEPS) nSteps = MAX_STEPS;
  const h = tEnd / nSteps;

  const actualSPC = Ts / h;
  let recordEvery = Math.max(1, Math.round(actualSPC / 16));
  if (nSteps / recordEvery > 50000) recordEvery = Math.ceil(nSteps / 50000);

  const f = (x) => topology.gssamNonlinear(x, p);

  let x = new Array(8).fill(0);
  const t = [], iL = [], vo = [], iL0 = [], vo0 = [];

  for (let k = 0; k <= nSteps; k++) {
    if (k % recordEvery === 0 || k === nSteps) {
      const tk = k * h;
      const c = Math.cos(w * tk), s = Math.sin(w * tk);
      t.push(tk);
      iL.push(x[0] + 2 * x[2] * c - 2 * x[3] * s);
      vo.push(x[1] + 2 * x[4] * c - 2 * x[5] * s);
      iL0.push(x[0]); vo0.push(x[1]);
    }
    if (k === nSteps) break;
    const k1 = f(x);
    const k2 = f(x.map((v, i) => v + 0.5 * h * k1[i]));
    const k3 = f(x.map((v, i) => v + 0.5 * h * k2[i]));
    const k4 = f(x.map((v, i) => v + h * k3[i]));
    x = x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  return { t, iL, vo, iL0, vo0 };
}

// LU helpers (local to the simulator).
function luDecomposeSim(Ain) {
  const n = Ain.length;
  const A = Ain.map(r => r.slice());
  const piv = Array.from({ length: n }, (_, i) => i);
  for (let col = 0; col < n; col++) {
    let pmax = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[pmax][col])) pmax = r;
    if (pmax !== col) { [A[col], A[pmax]] = [A[pmax], A[col]]; [piv[col], piv[pmax]] = [piv[pmax], piv[col]]; }
    const d = A[col][col] || 1e-300;
    for (let r = col + 1; r < n; r++) {
      A[r][col] /= d;
      for (let c = col + 1; c < n; c++) A[r][c] -= A[r][col] * A[col][c];
    }
  }
  return { A, piv };
}
function luSolveSim({ A, piv }, b) {
  const n = b.length;
  const x = piv.map(i => b[i]);
  for (let r = 1; r < n; r++) for (let c = 0; c < r; c++) x[r] -= A[r][c] * x[c];
  for (let r = n - 1; r >= 0; r--) {
    for (let c = r + 1; c < n; c++) x[r] -= A[r][c] * x[c];
    x[r] /= A[r][r] || 1e-300;
  }
  return x;
}
