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
    // Plant-based design for the CCM Buck-Boost.
    //   Inner plant G_id ≈ (Vin+Vo)/(sL),  outer plant G_vi ≈ -R(1-D)/(1+sRC/2)
    //   wc2 = 2*pi*fs/10,  wc1 = wc2/10  (N_sep = 10)
    //   Kp2 = wc2*L*Vm/(Vin+Vo),   Ki2 = Kp2*wc2/10
    //   Kp1 = wc1*C/(2*(1-D)),     Ki1 = Kp1*wc1/10
    // See docs/MATH.md.
    const { L, C, Vin, fs, Vref, Vm = 1 } = p;
    const Vo = Vref;
    const eps = Number.EPSILON;
    const D = Math.max(eps, Math.min(1 - eps, Vo / (Vin + Vo)));
    const Dp = 1 - D;

    const wc2 = 2 * Math.PI * fs / 10;
    const wc1 = wc2 / 10;

    const Kp2 = wc2 * L * Vm / (Vin + Vo);
    const Ki2 = Kp2 * wc2 / 10;
    const Kp1 = wc1 * C / (2 * Dp);
    const Ki1 = Kp1 * wc1 / 10;

    return { Kp1, Ki1, Kp2, Ki2 };
  },

  // Buck-Boost switching model (vo is the magnitude of the inverted output):
  //   ON  (s=1): L diL = Vin,   C dvo = -vo/R       (inductor charges from input)
  //   OFF (s=0): L diL = -vo,   C dvo = iL - vo/R   (inductor delivers to output)
  switching: {
    deriv(iL, vo, s, p) {
      const { Vin, L, C, R } = p;
      const diL = (s ? Vin : (-vo)) / L;
      const dvo = (s ? (-vo / R) : (iL - vo / R)) / C;
      return [diL, dvo];
    },
    voNominal(p) { return p.Vref; },
  },

  // Nonlinear GSSAM closed-loop ODE (duty state-dependent).
  // Buck-Boost: L diL = s*Vin - (1-s) vo ;  C dvo = (1-s) iL - vo/R.
  gssamNonlinear(x, p) {
    const { Vin, L, C, R, Vref, Vm = 1 } = p;
    const Kp1 = p.Kp1, Ki1 = p.Ki1, Kp2 = p.Kp2, Ki2 = p.Ki2;
    const w = 2 * Math.PI * p.fs;
    const [iL0, vo0, iLR, iLI, voR, voI, evI, eiI] = x;

    const ev = Vref - vo0;
    const iLref = Kp1 * ev + Ki1 * evI;
    const ei = iLref - iL0;
    const vcon = Kp2 * ei + Ki2 * eiI;
    const d = Math.max(0, Math.min(1, vcon / Vm));
    const a = Math.sin(2 * Math.PI * d) / (2 * Math.PI);
    const b = (Math.cos(2 * Math.PI * d) - 1) / (2 * Math.PI);
    const q0 = 1 - d;

    // s*Vin (input only has DC + harmonics of s)
    const sVin0 = d * Vin, sVinR = a * Vin, sVinI = b * Vin;
    // (1-s)*vo
    const qvo0 = q0 * vo0 - 2 * (a * voR + b * voI);
    const qvoR = q0 * voR - a * vo0;
    const qvoI = q0 * voI - b * vo0;
    // (1-s)*iL
    const qiL0 = q0 * iL0 - 2 * (a * iLR + b * iLI);
    const qiLR = q0 * iLR - a * iL0;
    const qiLI = q0 * iLI - b * iL0;

    const diL0 = (sVin0 - qvo0) / L;
    const diLR = (sVinR - qvoR) / L + w * iLI;
    const diLI = (sVinI - qvoI) / L - w * iLR;
    const dvo0 = (qiL0 - vo0 / R) / C;
    const dvoR = (qiLR - voR / R) / C + w * voI;
    const dvoI = (qiLI - voI / R) / C - w * voR;

    const devI = ((d <= 0 && ev < 0) || (d >= 1 && ev > 0)) ? 0 : ev;
    const deiI = ((d <= 0 && ei < 0) || (d >= 1 && ei > 0)) ? 0 : ei;

    return [diL0, dvo0, diLR, diLI, dvoR, dvoI, devI, deiI];
  },

  symbolic: {
    A: [
      ['0',     '-q0/L',    '0',     '0',    '2*a/L',    '2*b/L',    '0',   '0'],
      ['q0/C',  '-1/(R*C)', '-2*a/C','-2*b/C','0',       '0',        '0',   '0'],
      ['0',     'a/L',      '0',     'w',    '-q0/L',    '0',        '0',   '0'],
      ['0',     'b/L',      '-w',    '0',    '0',        '-q0/L',    '0',   '0'],
      ['-a/C',  '0',        'q0/C',  '0',    '-1/(R*C)', 'w',        '0',   '0'],
      ['-b/C',  '0',        '0',     'q0/C', '-w',       '-1/(R*C)', '0',   '0'],
      ['0',     '-1',       '0',     '0',    '0',        '0',        '0',   '0'],
      ['-1',    '-Kp1',     '0',     '0',    '0',        '0',        'Ki1', '0'],
    ],
    B: ['q0/L', '0', 'q0*sd/(2*pi*L*d)', 'q0*(cd-1)/(2*pi*L*d)', '0', '0', '1', 'Kp1'],
    note: 'q0 = 1-d,  a = sin(2*pi*d)/(2*pi),  b = (cos(2*pi*d)-1)/(2*pi),  d = Vo/(Vin+Vo)',
  },
};
