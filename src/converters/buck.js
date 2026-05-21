/**
 * Buck converter — GSSAM closed-loop descriptor.
 *
 * Direct port of examples/Buck_closed_V4.m (linearized, frozen-d, LTI).
 * State ordering: [iL0, vo0, iLR, iLI, voR, voI, ev_int, ei_int]
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
  operatingPoint(p) {
    const eps = Number.EPSILON;
    let d_ss = p.Vref / p.Vin;
    d_ss = Math.max(eps, Math.min(1 - eps, d_ss));
    return {
      d_ss,
      sd: Math.sin(2 * Math.PI * d_ss),
      cd: Math.cos(2 * Math.PI * d_ss),
    };
  },

  // --- 3. A and B matrices (linearized, frozen-d) -----------------------
  // dX = A*X + B*Vr,  X = [iL0, vo0, iLR, iLI, voR, voI, ev_int, ei_int]
  buildAB(p, op) {
    const { L, C, R, fs, Kp1, Ki1 } = p;
    const w = 2 * Math.PI * fs;
    const { d_ss, sd, cd } = op;

    const A = [
      [ 0,     -1 / L,      0,      0,      0,          0,          0,    0 ],
      [ 1 / C, -1 / (R * C), 0,     0,      0,          0,          0,    0 ],
      [ 0,      0,           0,     w,     -1 / L,      0,          0,    0 ],
      [ 0,      0,          -w,     0,      0,         -1 / L,      0,    0 ],
      [ 0,      0,           1 / C, 0,     -1 / (R * C), w,         0,    0 ],
      [ 0,      0,           0,     1 / C, -w,         -1 / (R * C), 0,   0 ],
      [ 0,     -1,           0,     0,      0,          0,          0,    0 ],
      [ -1,    -Kp1,         0,     0,      0,          0,          Ki1,  0 ],
    ];

    const B = [
      [ 1 / L ],
      [ 0 ],
      [ sd / (2 * Math.PI * L * d_ss) ],
      [ (cd - 1) / (2 * Math.PI * L * d_ss) ],
      [ 0 ],
      [ 0 ],
      [ 1 ],
      [ Kp1 ],
    ];

    return { A, B };
  },

  // --- 4. Auto-tune formulas --------------------------------------------
  // Plant-based crossover design (adopted standard: N_inner = 10).
  // Inner current-loop plant  G_id = Vin/(sL); outer voltage-loop plant
  // G_vi = R/(1+sRC). PI zero placed a decade below crossover.
  //   wc2 = 2*pi*fs/10  (inner),  wc1 = wc2/10  (outer)
  //   Kp2 = wc2*L*Vm/Vin,  Ki2 = Kp2*wc2/10
  //   Kp1 = wc1*C,         Ki1 = Kp1*wc1/10
  // See docs/MATH.md. Matches the Buck defaults above for the default params.
  autotune(p) {
    const { L, C, Vin, fs, Vm = 1 } = p;
    const wc2 = 2 * Math.PI * fs / 10;   // inner crossover at fs/10
    const wc1 = wc2 / 10;                // outer a decade slower
    const Kp2 = wc2 * L * Vm / Vin;
    const Ki2 = Kp2 * wc2 / 10;
    const Kp1 = wc1 * C;
    const Ki1 = Kp1 * wc1 / 10;
    return { Kp1, Ki1, Kp2, Ki2 };
  },

  // --- 5. Switching model (physical [iL, vo] dynamics per switch state) --
  // Buck: switch ON connects Vin to the LC filter; OFF freewheels through diode.
  //   ON  (s=1): L diL = Vin - vo,  C dvo = iL - vo/R
  //   OFF (s=0): L diL =     - vo,  C dvo = iL - vo/R
  switching: {
    deriv(iL, vo, s, p) {
      const { Vin, L, C, R } = p;
      const vL = s ? (Vin - vo) : (-vo);
      const diL = vL / L;
      const dvo = (iL - vo / R) / C;
      return [diL, dvo];
    },
    voNominal(p) { return p.Vref; },
  },

  // --- 6. Symbolic A, B (for export comments) ---------------------------
  // String form of the matrices, shown as a comment in exports so the user
  // sees the structure alongside the numeric values. Matches buildAB above.
  symbolic: {
    A: [
      ['0',    '-1/L',     '0',    '0',   '0',        '0',        '0',   '0'],
      ['1/C',  '-1/(R*C)', '0',    '0',   '0',        '0',        '0',   '0'],
      ['0',    '0',        '0',    'w',   '-1/L',     '0',        '0',   '0'],
      ['0',    '0',        '-w',   '0',   '0',        '-1/L',     '0',   '0'],
      ['0',    '0',        '1/C',  '0',   '-1/(R*C)', 'w',        '0',   '0'],
      ['0',    '0',        '0',    '1/C', '-w',       '-1/(R*C)', '0',   '0'],
      ['0',    '-1',       '0',    '0',   '0',        '0',        '0',   '0'],
      ['-1',   '-Kp1',     '0',    '0',   '0',        '0',        'Ki1', '0'],
    ],
    B: ['1/L', '0', 'sd/(2*pi*L*d)', '(cd-1)/(2*pi*L*d)', '0', '0', '1', 'Kp1'],
  },
};
