/**
 * Buck converter — GSSAM closed-loop descriptor.
 *
 * Direct port of examples/Buck_closed_V4.m. The exported object tells the
 * generic engine in src/core/abcd.js everything it needs to:
 *   - render the parameter form
 *   - compute the operating point
 *   - assemble the 8x8 A and 8x1 B matrices
 *   - auto-tune Kp/Ki when the user leaves them blank
 *
 * To add a new topology, copy this file and edit the four sections below.
 */

export const buck = {
  id: 'buck',
  label: 'Buck converter',
  description: 'Step-down DC-DC converter with cascaded PI voltage + current control',

  // --- 1. Parameters the user must (or may) provide ---------------------
  // `tunable: true` means "leave blank to auto-tune".
  parameters: [
    { id: 'Vin', label: 'Input voltage',       unit: 'V',  default: 100 },
    { id: 'L',   label: 'Inductance',          unit: 'H',  default: 0.5e-3 },
    { id: 'C',   label: 'Capacitance',         unit: 'F',  default: 150e-6 },
    { id: 'R',   label: 'Load resistance',     unit: 'Ω',  default: 10 },
    { id: 'fs',  label: 'Switching frequency', unit: 'Hz', default: 40e3 },
    { id: 'Vref',label: 'Reference voltage',   unit: 'V',  default: 60 },
    { id: 'Vm',  label: 'PWM ramp amplitude',  unit: 'V',  default: 1 },
    { id: 'Kp1', label: 'Voltage-loop Kp',     unit: '',   default: 0.377,  tunable: true },
    { id: 'Ki1', label: 'Voltage-loop Ki',     unit: '',   default: 94.75,  tunable: true },
    { id: 'Kp2', label: 'Current-loop Kp',     unit: '',   default: 0.1257, tunable: true },
    { id: 'Ki2', label: 'Current-loop Ki',     unit: '',   default: 315.8,  tunable: true },
  ],

  // --- 2. Operating-point quantities used by the matrices ---------------
  // Pure function of the numeric parameters. Returns whatever d_ss-derived
  // quantities the A/B builder needs.
  operatingPoint(p) {
    const eps = 1e-9;
    let d_ss = p.Vref / p.Vin;
    d_ss = Math.max(eps, Math.min(1 - eps, d_ss));
    return {
      d_ss,
      sd: Math.sin(2 * Math.PI * d_ss),
      cd: Math.cos(2 * Math.PI * d_ss),
    };
  },

  // --- 3. A and B matrices (linearized, frozen-d) -----------------------
  // TODO: port from examples/Buck_closed_V4.m
  buildAB(p, op) {
    throw new Error('buck.buildAB: not implemented yet — see docs/MATH.md');
  },

  // --- 4. Auto-tune formulas --------------------------------------------
  // TODO: implement closed-form formulas from docs/MATH.md
  autotune(p) {
    throw new Error('buck.autotune: not implemented yet — see docs/MATH.md');
  },
};
