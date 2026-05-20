/**
 * Buck-Boost converter — GSSAM closed-loop descriptor.
 *
 * Direct port of examples/Buck_Boost_V2_Old_2024V.m. Same contract as buck.js.
 *
 * Note: nonlinear in d, so the linearization needs da/dd and db/dd.
 */

export const buckboost = {
  id: 'buckboost',
  label: 'Buck-Boost converter',
  description: 'Inverting buck-boost DC-DC converter with cascaded PI control',

  parameters: [
    { id: 'Vin', label: 'Input voltage',       unit: 'V',  default: 18 },
    { id: 'L',   label: 'Inductance',          unit: 'H',  default: 150e-6 },
    { id: 'C',   label: 'Capacitance',         unit: 'F',  default: 100e-6 },
    { id: 'R',   label: 'Load resistance',     unit: 'Ω',  default: 10 },
    { id: 'fs',  label: 'Switching frequency', unit: 'Hz', default: 40e3 },
    { id: 'Vref',label: 'Reference voltage',   unit: 'V',  default: 12 },
    { id: 'Vm',  label: 'PWM ramp amplitude',  unit: 'V',  default: 1 },
    { id: 'Kp1', label: 'Voltage-loop Kp',     unit: '',   default: 0.002,  tunable: true },
    { id: 'Ki1', label: 'Voltage-loop Ki',     unit: '',   default: 20,     tunable: true },
    { id: 'Kp2', label: 'Current-loop Kp',     unit: '',   default: 0.01,   tunable: true },
    { id: 'Ki2', label: 'Current-loop Ki',     unit: '',   default: 50,     tunable: true },
  ],

  operatingPoint(p) {
    const eps = 1e-9;
    let d_ss = p.Vref / (p.Vin + p.Vref);
    d_ss = Math.max(eps, Math.min(1 - eps, d_ss));
    const twoPi = 2 * Math.PI;
    return {
      d_ss,
      q0: 1 - d_ss,
      a_ss: Math.sin(twoPi * d_ss) / twoPi,
      b_ss: (Math.cos(twoPi * d_ss) - 1) / twoPi,
      da_dd:  Math.cos(twoPi * d_ss),     // ∂a/∂d
      db_dd: -Math.sin(twoPi * d_ss),     // ∂b/∂d
      vo0_e_ss: p.Vin * d_ss / (1 - d_ss),
      iL0_e_ss: (p.Vin * d_ss / (1 - d_ss)) / (p.R * (1 - d_ss)),
    };
  },

  buildAB(p, op) {
    throw new Error('buckboost.buildAB: not implemented yet — see docs/MATH.md');
  },

  autotune(p) {
    throw new Error('buckboost.autotune: not implemented yet — see docs/MATH.md');
  },
};
