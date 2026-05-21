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

  // ---- 1. SWITCHING MODEL ------------------------------------------------
  // Physical state [iL, vo] + integrator states for the two PI loops.
  let iL = 0, vo = 0;
  let evInt = 0, eiInt = 0;     // outer (voltage), inner (current) integrators

  const t = [];
  const iL_sw = [];
  const vo_sw = [];

  for (let n = 0; n < cycles; n++) {
    // --- sampled controller update (once per switching period) ---
    const ev = Vref - vo;
    const iLref = Kp1 * ev + Ki1 * evInt;
    const ei = iLref - iL;
    const vcon = Kp2 * ei + Ki2 * eiInt;

    let d = vcon / Vm;
    const dSat = Math.max(0, Math.min(1, d));

    // anti-windup: stop integrating when saturated and pushing further in
    if (!((dSat <= 0 && ev < 0) || (dSat >= 1 && ev > 0))) evInt += ev * Ts;
    if (!((dSat <= 0 && ei < 0) || (dSat >= 1 && ei > 0))) eiInt += ei * Ts;

    d = dSat;

    // --- integrate physical states across ON then OFF phase, recording
    //     several samples within each phase so the ripple is captured ---
    const tOn = d * Ts;
    const tOff = (1 - d) * Ts;
    const t0 = n * Ts;

    recordPhase(topology, iL, vo, 1, tOn, sub, p, t0, t, iL_sw, vo_sw, (a, b) => { iL = a; vo = b; });
    recordPhase(topology, iL, vo, 0, tOff, sub, p, t0 + tOn, t, iL_sw, vo_sw, (a, b) => { iL = a; vo = b; });
  }

  // ---- 2. GSSAM MODEL ----------------------------------------------------
  // Integrate the nonlinear 8-state GSSAM with the same controllers.
  // We reuse buildABCD's operating point only for sizing; the GSSAM ODE here
  // is the closed-loop averaged dynamics used in the MATLAB nonlinear block.
  const gs = simulateGssam(topology, p, { tEnd: cycles * Ts, w });

  return {
    t, iL_sw, vo_sw,
    tg: gs.t, iL_gs: gs.iL, vo_gs: gs.vo, iL0_gs: gs.iL0, vo0_gs: gs.vo0,
    fs, Ts, cycles,
  };
}

// Integrate physical [iL, vo] for duration `dur` with switch state s, RK4,
// recording (t, iL, vo) at each sub-step so the intra-cycle ripple is sampled.
function recordPhase(topology, iL, vo, s, dur, sub, p, tStart, tArr, iLArr, voArr, setState) {
  if (dur <= 0) { setState(iL, vo); return; }
  const h = dur / sub;
  const f = (a, b) => topology.switching.deriv(a, b, s, p);
  for (let k = 0; k < sub; k++) {
    const [k1a, k1b] = f(iL, vo);
    const [k2a, k2b] = f(iL + 0.5 * h * k1a, vo + 0.5 * h * k1b);
    const [k3a, k3b] = f(iL + 0.5 * h * k2a, vo + 0.5 * h * k2b);
    const [k4a, k4b] = f(iL + h * k3a, vo + h * k3b);
    iL += (h / 6) * (k1a + 2 * k2a + 2 * k3a + k4a);
    vo += (h / 6) * (k1b + 2 * k2b + 2 * k3b + k4b);
    tArr.push(tStart + (k + 1) * h);
    iLArr.push(iL);
    voArr.push(vo);
  }
  setState(iL, vo);
}

/**
 * Nonlinear GSSAM closed-loop simulation. State:
 *   [iL0, vo0, iLR, iLI, voR, voI, evInt, eiInt]
 * The averaged dynamics use the duty d computed from the DC states each step;
 * the Fourier coefficients a,b of the switching function depend on d.
 *
 * This mirrors the gssam_*_cl_ode structure from the MATLAB scripts but is
 * written generically against the converter's switching law via its
 * complement factor q0 = 1 - d. For topologies whose averaged input term is
 * d*Vin (buck) vs Vin (boost/buck-boost), we read a per-topology flag.
 */
function simulateGssam(topology, p, { tEnd, w }) {
  const { Vin, L, C, R, Vref, Vm = 1 } = p;
  const Kp1 = p.Kp1, Ki1 = p.Ki1, Kp2 = p.Kp2, Ki2 = p.Ki2;
  const id = topology.id;

  const n = 4000;
  const h = tEnd / n;

  let x = new Array(8).fill(0);
  const t = [], iL = [], vo = [], iL0 = [], vo0 = [];

  const deriv = (x) => {
    const [iL0v, vo0v, iLR, iLI, voR, voI, evInt, eiInt] = x;

    // controller from DC averages
    const ev = Vref - vo0v;
    const iLref = Kp1 * ev + Ki1 * evInt;
    const ei = iLref - iL0v;
    const vcon = Kp2 * ei + Ki2 * eiInt;
    let d = Math.max(0, Math.min(1, vcon / Vm));

    const a = Math.sin(2 * Math.PI * d) / (2 * Math.PI);
    const b = (Math.cos(2 * Math.PI * d) - 1) / (2 * Math.PI);
    const q0 = 1 - d;

    let diL0, dvo0, diLR, diLI, dvoR, dvoI;

    if (id === 'buck') {
      // <s*Vin> input on inductor, (1-s) not applied to vo (buck connects Vin)
      diL0 = (d * Vin - vo0v) / L;
      diLR = (a * Vin - voR) / L + w * iLI;
      diLI = (b * Vin - voI) / L - w * iLR;
      dvo0 = (iL0v - vo0v / R) / C;
      dvoR = (iLR - voR / R) / C + w * voI;
      dvoI = (iLI - voI / R) / C - w * voR;
    } else {
      // boost / buck-boost: inductor sees (1-s)*vo off-state; cap sees (1-s)*iL
      const inputTerm = (id === 'boost') ? Vin : Vin; // both charge from Vin in ON
      // <(1-s) vo> products
      const qvo_0 = q0 * vo0v + 2 * (-a * voR - b * voI);
      const qvo_R = q0 * voR - a * vo0v;
      const qvo_I = q0 * voI - b * vo0v;
      const qiL_0 = q0 * iL0v + 2 * (-a * iLR - b * iLI);
      const qiL_R = q0 * iLR - a * iL0v;
      const qiL_I = q0 * iLI - b * iL0v;

      const sVin_0 = d * inputTerm, sVin_R = a * inputTerm, sVin_I = b * inputTerm;

      if (id === 'boost') {
        // L diL = Vin - (1-s) vo ;  C dvo = (1-s) iL - vo/R
        diL0 = (inputTerm - qvo_0) / L;
        diLR = (sVin_R * 0 - qvo_R) / L + w * iLI + 0; // Vin has no harmonic
        diLI = (-qvo_I) / L - w * iLR;
        // correct DC: input is constant Vin (only DC), so harmonics only from -qvo
        diLR = (-qvo_R) / L + w * iLI;
        diLI = (-qvo_I) / L - w * iLR;
        dvo0 = (qiL_0 - vo0v / R) / C;
        dvoR = (qiL_R - voR / R) / C + w * voI;
        dvoI = (qiL_I - voI / R) / C - w * voR;
      } else {
        // buck-boost: L diL = s*Vin - (1-s) vo ;  C dvo = (1-s) iL - vo/R
        diL0 = (sVin_0 - qvo_0) / L;
        diLR = (sVin_R - qvo_R) / L + w * iLI;
        diLI = (sVin_I - qvo_I) / L - w * iLR;
        dvo0 = (qiL_0 - vo0v / R) / C;
        dvoR = (qiL_R - voR / R) / C + w * voI;
        dvoI = (qiL_I - voI / R) / C - w * voR;
      }
    }

    // anti-windup
    const dSat = d;
    const devInt = ((dSat <= 0 && ev < 0) || (dSat >= 1 && ev > 0)) ? 0 : ev;
    const deiInt = ((dSat <= 0 && ei < 0) || (dSat >= 1 && ei > 0)) ? 0 : ei;

    return [diL0, dvo0, diLR, diLI, dvoR, dvoI, devInt, deiInt];
  };

  for (let k = 0; k <= n; k++) {
    const tk = k * h;
    const c = Math.cos(w * tk), s = Math.sin(w * tk);
    const iLfull = x[0] + 2 * x[2] * c - 2 * x[3] * s;
    const voFull = x[1] + 2 * x[4] * c - 2 * x[5] * s;
    t.push(tk); iL.push(iLfull); vo.push(voFull); iL0.push(x[0]); vo0.push(x[1]);
    if (k === n) break;

    const k1 = deriv(x);
    const k2 = deriv(x.map((v, i) => v + 0.5 * h * k1[i]));
    const k3 = deriv(x.map((v, i) => v + 0.5 * h * k2[i]));
    const k4 = deriv(x.map((v, i) => v + h * k3[i]));
    x = x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }

  return { t, iL, vo, iL0, vo0 };
}
