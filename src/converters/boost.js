/**
 * Boost converter — GSSAM closed-loop descriptor.
 *
 * Direct port of examples/Boost_closed_V3.m (linearized, frozen-d, LTI).
 * State ordering: [iL0, vo0, iLR, iLI, voR, voI, ev_int, ei_int]
 */

export const boost = {
  id: 'boost',
  label: 'Boost converter',
  description: 'Step-up DC-DC converter with cascaded PI voltage + current control',

  parameters: [
    { id: 'Vin', label: 'Input voltage',       unit: 'V',  default: 12 },
    { id: 'L',   label: 'Inductance',          unit: 'H',  default: 100e-6 },
    { id: 'C',   label: 'Capacitance',         unit: 'F',  default: 16.44e-6 },
    { id: 'R',   label: 'Load resistance',     unit: 'Ω',  default: 16.2 },
    { id: 'fs',  label: 'Switching frequency', unit: 'Hz', default: 25e3 },
    { id: 'Vref',label: 'Reference voltage',   unit: 'V',  default: 18 },
    { id: 'Vm',  label: 'PWM ramp amplitude',  unit: 'V',  default: 1 },
    { id: 'Kp1', label: 'Voltage-loop Kp',     unit: '',   default: 0.226,  tunable: true },
    { id: 'Ki1', label: 'Voltage-loop Ki',     unit: '',   default: 177.5,  tunable: true },
    { id: 'Kp2', label: 'Current-loop Kp',     unit: '',   default: 0.0748, tunable: true },
    { id: 'Ki2', label: 'Current-loop Ki',     unit: '',   default: 117.5,  tunable: true },
  ],

  operatingPoint(p) {
    const eps = Number.EPSILON;
    let d_ss = 1 - p.Vin / p.Vref;        // Boost DC duty
    d_ss = Math.max(eps, Math.min(1 - eps, d_ss));
    const twoPi = 2 * Math.PI;
    const sd = Math.sin(twoPi * d_ss);
    const cd = Math.cos(twoPi * d_ss);
    return {
      d_ss,
      a_ss: sd / twoPi,
      b_ss: (cd - 1) / twoPi,
      q0: 1 - d_ss,
    };
  },

  buildAB(p, op) {
    const { L, C, R, fs, Kp1, Ki1 } = p;
    const w = 2 * Math.PI * fs;
    const { a_ss, b_ss, q0 } = op;

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
      [ q0 / L ], [ 0 ], [ 0 ], [ 0 ], [ 0 ], [ 0 ], [ 1 ], [ Kp1 ],
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
