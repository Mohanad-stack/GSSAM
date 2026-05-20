/**
 * Boost converter — GSSAM closed-loop descriptor.
 *
 * Direct port of examples/Boost_closed_V3.m. Same contract as buck.js.
 */

export const boost = {
  id: 'boost',
  label: 'Boost converter',
  description: 'Step-up DC-DC converter with cascaded PI voltage + current control',

  parameters: [
    { id: 'Vin', label: 'Input voltage',       unit: 'V',  default: 18 },
    { id: 'L',   label: 'Inductance',          unit: 'H',  default: 150e-6 },
    { id: 'C',   label: 'Capacitance',         unit: 'F',  default: 100e-6 },
    { id: 'R',   label: 'Load resistance',     unit: 'Ω',  default: 10 },
    { id: 'fs',  label: 'Switching frequency', unit: 'Hz', default: 40e3 },
    { id: 'Vref',label: 'Reference voltage',   unit: 'V',  default: 30 },
    { id: 'Vm',  label: 'PWM ramp amplitude',  unit: 'V',  default: 1 },
    { id: 'Kp1', label: 'Voltage-loop Kp',     unit: '',   default: null, tunable: true },
    { id: 'Ki1', label: 'Voltage-loop Ki',     unit: '',   default: null, tunable: true },
    { id: 'Kp2', label: 'Current-loop Kp',     unit: '',   default: null, tunable: true },
    { id: 'Ki2', label: 'Current-loop Ki',     unit: '',   default: null, tunable: true },
  ],

  operatingPoint(p) {
    const eps = 1e-9;
    let d_ss = 1 - p.Vin / p.Vref;
    d_ss = Math.max(eps, Math.min(1 - eps, d_ss));
    return {
      d_ss,
      q0: 1 - d_ss,
      a_ss: Math.sin(2 * Math.PI * d_ss) / (2 * Math.PI),
      b_ss: (Math.cos(2 * Math.PI * d_ss) - 1) / (2 * Math.PI),
    };
  },

  buildAB(p, op) {
    throw new Error('boost.buildAB: not implemented yet — see docs/MATH.md');
  },

  autotune(p) {
    throw new Error('boost.autotune: not implemented yet — see docs/MATH.md');
  },
};
