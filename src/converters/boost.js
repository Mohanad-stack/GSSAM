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
    { id: 'Vref',label: 'Reference voltage',   unit: 'V',  default: 21 },
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

  // Closed-loop linearization (matches Boost_closed_V3.m). Control feedback
  // enters the DC inductor row (1) and the DC capacitor row (2, via the q0
  // coupling); harmonic rows carry only plant terms.
  //   gV = Vr/(L*Vm),  hV = Vr/(C*R*Vm*q0)
  buildAB(p, op) {
    const { L, C, R, fs, Vm = 1, Vref, Kp1, Ki1, Kp2, Ki2 } = p;
    const w = 2 * Math.PI * fs;
    const { a_ss, b_ss, q0 } = op;
    const Vr = Vref;
    const gV = Vr / (L * Vm);
    const hV = Vr / (C * R * Vm * q0);

    const A = [
      [ -Kp2 * gV,        -Kp1 * Kp2 * gV - q0 / L,      0,            0,            2 * a_ss / L, 2 * b_ss / L, Ki1 * Kp2 * gV,  Ki2 * gV ],
      [ Kp2 * hV + q0 / C, Kp1 * Kp2 * hV - 1 / (R * C), -2 * a_ss / C, -2 * b_ss / C, 0,          0,           -Ki1 * Kp2 * hV, -Ki2 * hV ],
      [ 0,                 a_ss / L,                      0,            w,           -q0 / L,       0,            0,               0 ],
      [ 0,                 b_ss / L,                     -w,            0,            0,           -q0 / L,       0,               0 ],
      [ -a_ss / C,         0,                             q0 / C,       0,           -1 / (R * C),  w,            0,               0 ],
      [ -b_ss / C,         0,                             0,            q0 / C,      -w,           -1 / (R * C),  0,               0 ],
      [ 0,                -1,                             0,            0,            0,            0,            0,               0 ],
      [ -1,               -Kp1,                           0,            0,            0,            0,            Ki1,             0 ],
    ];

    const B = [
      [ (Kp1 * Kp2 * Vr + Vm * q0) / (L * Vm) ],
      [ -Kp1 * Kp2 * hV ],
      [ 0 ], [ 0 ], [ 0 ], [ 0 ], [ 1 ], [ Kp1 ],
    ];

    return { A, B };
  },

  autotune(p) {
    // Plant-based design for the CCM Boost. The Boost has a right-half-plane
    // zero (ω_RHP = D'²R/L) so the outer loop uses N_sep = 2 (not 10) and a
    // 1/(1-D) factor — see docs/MATH.md and the derivation notes.
    //   Inner plant G_id ≈ Vo/(sL),  outer plant pole at 2/(RC)
    //   wc2 = 2*pi*fs/10,  wc1 = wc2/2
    //   Kp2 = wc2*L*Vm/Vo,        Ki2 = Kp2*wc2/10
    //   Kp1 = wc1*C/(1-D),        Ki1 = Kp1*wc1/10
    const { L, C, R, Vin, fs, Vref, Vm = 1 } = p;
    const Vo = Vref;
    const eps = Number.EPSILON;
    const D = Math.max(eps, Math.min(1 - eps, 1 - Vin / Vo));
    const Dp = 1 - D;

    const wc2 = 2 * Math.PI * fs / 10;
    const wc1 = wc2 / 2;                  // N_sep = 2 for the Boost

    const Kp2 = wc2 * L * Vm / Vo;
    const Ki2 = Kp2 * wc2 / 10;
    const Kp1 = wc1 * C / Dp;
    const Ki1 = Kp1 * wc1 / 10;

    return { Kp1, Ki1, Kp2, Ki2 };
  },

  // Boost switching model:
  //   ON  (s=1): L diL = Vin,        C dvo = -vo/R          (inductor charges)
  //   OFF (s=0): L diL = Vin - vo,   C dvo = iL - vo/R      (delivers to output)
  switching: {
    deriv(iL, vo, s, p) {
      const { Vin, L, C, R } = p;
      const diL = (s ? Vin : (Vin - vo)) / L;
      const dvo = (s ? (-vo / R) : (iL - vo / R)) / C;
      return [diL, dvo];
    },
    voNominal(p) { return p.Vref; },
  },

  // Nonlinear GSSAM closed-loop ODE (duty state-dependent).
  // Boost: L diL = Vin - (1-s) vo ;  C dvo = (1-s) iL - vo/R.
  // (1-s) has DC q0=1-d and harmonics (-a, -b). GSSAM products use
  //   <(1-s) y>_0 = q0*y0 - 2(a*yR + b*yI)
  //   <(1-s) y>_R = q0*yR - a*y0,   <(1-s) y>_I = q0*yI - b*y0
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

    // (1-s)*vo
    const qvo0 = q0 * vo0 - 2 * (a * voR + b * voI);
    const qvoR = q0 * voR - a * vo0;
    const qvoI = q0 * voI - b * vo0;
    // (1-s)*iL
    const qiL0 = q0 * iL0 - 2 * (a * iLR + b * iLI);
    const qiLR = q0 * iLR - a * iL0;
    const qiLI = q0 * iLI - b * iL0;

    const diL0 = (Vin - qvo0) / L;
    const diLR = (-qvoR) / L + w * iLI;
    const diLI = (-qvoI) / L - w * iLR;
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
    B: ['q0/L', '0', '0', '0', '0', '0', '1', 'Kp1'],
    note: 'q0 = 1-d,  a = sin(2*pi*d)/(2*pi),  b = (cos(2*pi*d)-1)/(2*pi),  d = 1 - Vin/Vo',
  },
};
