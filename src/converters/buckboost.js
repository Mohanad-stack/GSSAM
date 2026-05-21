/**
 * Buck-Boost converter — GSSAM closed-loop descriptor.
 *
 * Direct port of examples/BuckBoost_closedV2.m (linearized, frozen-d, LTI).
 * State ordering: [iL0, vo0, iLR, iLI, voR, voI, ev_int, ei_int]
 *
 * A matrix is structurally identical to Boost. The difference is the
 * operating-point duty (d_ss = Vref/(Vin+Vref)) and the B(3),B(4) harmonic
 * terms, which carry an extra q0 factor.
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
    { id: 'Vref',label: 'Reference voltage',   unit: 'V',  default: 12 },   // = 18*0.4/0.6
    { id: 'Vm',  label: 'PWM ramp amplitude',  unit: 'V',  default: 1 },
    { id: 'Kp1', label: 'Voltage-loop Kp',     unit: '',   default: 0.001,   tunable: true },
    { id: 'Ki1', label: 'Voltage-loop Ki',     unit: '',   default: 84.7,    tunable: true },
    { id: 'Kp2', label: 'Current-loop Kp',     unit: '',   default: 0.00484, tunable: true },
    { id: 'Ki2', label: 'Current-loop Ki',     unit: '',   default: 28.7,    tunable: true },
  ],

  operatingPoint(p) {
    const eps = Number.EPSILON;
    let d_ss = p.Vref / (p.Vin + p.Vref);   // ideal Buck-Boost DC duty
    d_ss = Math.max(eps, Math.min(1 - eps, d_ss));
    const twoPi = 2 * Math.PI;
    const sd = Math.sin(twoPi * d_ss);
    const cd = Math.cos(twoPi * d_ss);
    return {
      d_ss,
      sd, cd,
      a_ss: sd / twoPi,
      b_ss: (cd - 1) / twoPi,
      q0: 1 - d_ss,
    };
  },

  buildAB(p, op) {
    const { L, C, R, fs, Kp1, Ki1 } = p;
    const w = 2 * Math.PI * fs;
    const { a_ss, b_ss, q0, sd, cd, d_ss } = op;

    const A = [
      [ 0,        -q0 / L,      0,            0,            2 * a_ss / L, 2 * b_ss / L, 0,   0 ],
      [ q0 / C,   -1 / (R * C), -2 * a_ss / C, -2 * b_ss / C, 0,         0,           0,   0 ],
      [ 0,         a_ss / L,    0,            w,           -q0 / L,       0,           0,   0 ],
      [ 0,         b_ss / L,   -w,            0,            0,           -q0 / L,      0,   0 ],
      [ -a_ss / C, 0,           q0 / C,       0,           -1 / (R * C),  w,           0,   0 ],
      [ -b_ss / C, 0,           0,            q0 / C,      -w,           -1 / (R * C), 0,   0 ],
      [ 0,        -1,           0,            0,            0,            0,           0,   0 ],
      [ -1,       -Kp1,         0,            0,            0,            0,           Ki1, 0 ],
    ];

    const B = [
      [ q0 / L ],
      [ 0 ],
      [ q0 * sd / (2 * Math.PI * L * d_ss) ],
      [ q0 * (cd - 1) / (2 * Math.PI * L * d_ss) ],
      [ 0 ],
      [ 0 ],
      [ 1 ],
      [ Kp1 ],
    ];

    return { A, B };
  },

  autotune(p) {
    const { L, C, Vin, fs } = p;
    const wc_i = 2 * Math.PI * (fs / 20);
    const wc_v = wc_i / 10;
    const Kp2 = (L * wc_i) / Vin;
    const Ki2 = Kp2 * wc_i / 10;
    const Kp1 = C * wc_v;
    const Ki1 = Kp1 * wc_v / 10;
    return { Kp1, Ki1, Kp2, Ki2 };
  },
};
