/**
 * Converter design engine.
 *
 * Given Vin, Vo, load R, and switching frequency fs, size:
 *   - L for continuous-conduction mode (CCM): the boundary inductance that
 *     keeps the converter just in CCM at the given load, scaled up by a margin
 *     so it sits solidly in CCM. (DCM design is a future option.)
 *   - C from a target output-voltage ripple (ΔVo/Vo).
 * Then auto-tune the PI gains and report the resulting GSSAM stability.
 *
 * Formulas (CCM, ideal):
 *   Duty:  Buck D = Vo/Vin;  Boost D = 1 - Vin/Vo;  Buck-Boost D = Vo/(Vin+Vo)
 *   Boundary L (L_b): smallest L for CCM at load R —
 *     Buck:        L_b = (1-D)·R / (2·fs)
 *     Boost:       L_b = D·(1-D)²·R / (2·fs)
 *     Buck-Boost:  L_b = (1-D)²·R / (2·fs)
 *   Output ripple → C:
 *     Buck:        C = (1-D)·Vo / (8·L·fs²·ΔVo)        (LC output filter)
 *     Boost:       C = D·Io / (fs·ΔVo) = D·Vo/(R·fs·ΔVo)
 *     Buck-Boost:  C = D·Vo / (R·fs·ΔVo)
 */

export const CCM_MARGIN = 1.3;   // L set this far above the CCM boundary

export function dutyFor(topoId, Vin, Vo) {
  if (topoId === 'buck') return clamp(Vo / Vin);
  if (topoId === 'boost') return clamp(1 - Vin / Vo);
  return clamp(Vo / (Vin + Vo)); // buckboost
}

function clamp(d) { return Math.max(0.001, Math.min(0.999, d)); }

/** Boundary (minimum CCM) inductance at load R. */
export function boundaryL(topoId, D, R, fs) {
  if (topoId === 'buck') return (1 - D) * R / (2 * fs);
  if (topoId === 'boost') return D * (1 - D) * (1 - D) * R / (2 * fs);
  return (1 - D) * (1 - D) * R / (2 * fs); // buckboost
}

/** Capacitance for a target output-voltage ripple fraction (ΔVo/Vo). */
export function capForRipple(topoId, D, Vo, R, fs, L, rippleFrac) {
  const dVo = rippleFrac * Vo;
  if (topoId === 'buck') {
    // second-order LC filter ripple: ΔVo = (1-D)·Vo / (8·L·C·fs²)
    return (1 - D) * Vo / (8 * L * fs * fs * dVo);
  }
  // boost / buck-boost: cap supplies load during ON; ΔVo = D·Io/(C·fs)
  const Io = Vo / R;
  return D * Io / (fs * dVo);
}

/** Average inductor current (DC) for the topology at the operating point. */
export function avgInductorCurrent(topoId, D, Vo, R) {
  const Io = Vo / R;
  if (topoId === 'buck') return Io;          // iL avg = output current
  // boost / buck-boost: iL avg = Io / (1 - D)
  return Io / (1 - D);
}

/**
 * Inductance for a target inductor-current ripple fraction (ΔiL / iL_avg).
 * Voltage across L during the ON interval sets the ripple:
 *   ΔiL = V_L_on · D / (L · fs)   →   L = V_L_on · D / (ΔiL · fs)
 *   Buck:  V_L_on = Vin − Vo
 *   Boost: V_L_on = Vin
 *   Buck-Boost: V_L_on = Vin
 */
export function inductorForRipple(topoId, D, Vin, Vo, R, fs, ripFrac) {
  const iLavg = avgInductorCurrent(topoId, D, Vo, R);
  const dIL = ripFrac * iLavg;
  const vLon = topoId === 'buck' ? (Vin - Vo) : Vin;
  return vLon * D / (dIL * fs);
}

/**
 * Full design: returns the sized parameters object (ready for buildABCD),
 * plus the intermediate design quantities for display.
 *
 * L sizing (safety margin above the CCM boundary):
 *   - marginFrac is the fractional safety margin above the minimum CCM
 *     inductance, so L = L_boundary · (1 + marginFrac). E.g. marginFrac = 0.30
 *     gives L = 1.30 · L_boundary.
 *   - if marginFrac is null, fall back to the default CCM_MARGIN.
 */
export function designConverter(topology, { Vin, Vo, R, fs, mode = 'CCM', rippleFrac = 0.01, marginFrac = null }) {
  const id = topology.id;
  const D = dutyFor(id, Vin, Vo);
  const Lb = boundaryL(id, D, R, fs);
  const usedMargin = marginFrac != null ? marginFrac : (CCM_MARGIN - 1);
  const L = Lb * (1 + usedMargin);
  const lBasis = marginFrac != null ? 'ccm-margin' : 'default-margin';
  const C = capForRipple(id, D, Vo, R, fs, L, rippleFrac);
  const iLavg = avgInductorCurrent(id, D, Vo, R);

  // assemble parameters; leave gains null so the engine auto-tunes them
  const parameters = {
    Vin, L, C, R, fs, Vref: Vo, Vm: 1,
    Kp1: null, Ki1: null, Kp2: null, Ki2: null,
  };
  return {
    parameters,
    design: { D, boundaryL: Lb, L, C, rippleFrac, mode, lBasis, iLavg, marginFrac: usedMargin },
  };
}
