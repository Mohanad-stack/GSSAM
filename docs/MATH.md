# GSSAM math reference

This doc captures the equations the code implements. Keeping the math in one place separate from the code makes it easier to (a) verify against the MATLAB scripts, (b) add new topologies, (c) onboard collaborators.

## State vector

For every single-input converter with cascaded PI control, the closed-loop state is:

```
X = [iL₀, vo₀, iLR, iLI, voR, voI, ev_int, ei_int]ᵀ     (8x1)
```

| Symbol | Meaning |
|---|---|
| `iL₀` | DC (index-0) inductor current |
| `vo₀` | DC capacitor voltage |
| `iLR, iLI` | real / imaginary parts of the first-harmonic (index-1) of iL |
| `voR, voI` | real / imaginary parts of the first-harmonic of vo |
| `ev_int` | integrator state of the **outer** (voltage) PI loop |
| `ei_int` | integrator state of the **inner** (current) PI loop |

Reconstruction back to time-domain signals (post-processing):

```
iL(t) = iL₀ + 2·iLR·cos(ωs·t) − 2·iLI·sin(ωs·t)
vo(t) = vo₀ + 2·voR·cos(ωs·t) − 2·voI·sin(ωs·t)
```

## Switching function Fourier coefficients

For a PWM signal with duty cycle d:

```
a = sin(2π·d) / (2π)
b = (cos(2π·d) − 1) / (2π)
```

These (with d) define `<s>₀ = d`, `<s>R = a`, `<s>I = b`.

## Linearized closed-loop A, B (frozen-d)

The linearized matrices are the **closed-loop** linearization at the operating
point: the controller feedback is included in A (it enters the DC inductor row, and
for Boost/Buck-Boost the DC capacitor row as well, through `d = vcon/Vm`). The
harmonic rows (3-6) carry only the plant terms. The reference enters through B. This
is the form in the updated `examples/*.m` scripts and is what the Linearized and
Nonlinear tabs use for simulation. Because the loop is closed, the linearized
response settles to the reference like the real system (no artificial open-loop
overshoot).

Each converter's `buildAB` matches its `.m` script entry-for-entry (verified in
`tests/`). Common operating-point quantities:

## Buck closed-loop A, B (linearized at d_ss)

```
d_ss = Vref / Vin
a_ss = sin(2π·d_ss)/(2π)
b_ss = (cos(2π·d_ss) − 1)/(2π)
g    = Vin/(L·Vm)
```

Row 1 (iL0) carries the control terms `[-Kp2·g, -Kp1·Kp2·g - 1/L, 0,0,0,0, Ki1·Kp2·g, Ki2·g]`.
See `examples/Buck_closed_V4.m`; the translation lives in `src/converters/buck.js`.

## Boost closed-loop A, B

```
d_ss  = 1 − Vin/Vref        (steady-state duty for boost)
q0    = 1 − d_ss
a_ss  = sin(2π·d_ss)/(2π)
b_ss  = (cos(2π·d_ss) − 1)/(2π)
```

See `examples/Boost_closed_V3.m`.

## Buck-Boost closed-loop A, B

```
d_ss  = Vref / (Vin + Vref)
```

Nonlinear in d, so the linearization additionally requires `∂a/∂d`, `∂b/∂d`:

```
da/dd =  cos(2π·d_ss)
db/dd = −sin(2π·d_ss)
```

See `examples/Buck_Boost_V2_Old_2024V.m`.

## Auto-tune formulas (plant-based, verified)

These are derived from each converter's small-signal plant and a target crossover
frequency (not fitted to data). Inner current loop crossover at fs/10; PI zero a
decade below crossover. They reproduce the verified default gains.

**Buck** (inner plant G_id = Vin/(sL), outer plant G_vi = R/(1+sRC)):
```
wc2 = 2*pi*fs/10        wc1 = wc2/10        (N_sep = 10)
Kp2 = wc2*L*Vm/Vin      Ki2 = Kp2*wc2/10
Kp1 = wc1*C             Ki1 = Kp1*wc1/10
```
Default params -> Kp2=0.126, Ki2=316, Kp1=0.377, Ki1=94.7 (matches Buck defaults).

**Boost** (inner plant G_id = Vo/(sL); has a RHP zero wRHP = D'^2*R/L):
```
D = 1 - Vin/Vo          D' = 1 - D
wc2 = 2*pi*fs/10        wc1 = wc2/2         (N_sep = 2, the key difference)
Kp2 = wc2*L*Vm/Vo       Ki2 = Kp2*wc2/10
Kp1 = wc1*C/(1-D)       Ki1 = Kp1*wc1/10
```
The outer separation is 2 (not 10) because the Boost outer-plant pole at 2/(RC)
sits near wc2/10. Validity: fs > 10*f_LC and wc1 < wRHP/3.

**Buck-Boost** (inner plant G_id = (Vin+Vo)/(sL), outer plant G_vi = -R(1-D)/(1+sRC/2)):
```
D = Vo/(Vin+Vo)         D' = 1 - D
wc2 = 2*pi*fs/10        wc1 = wc2/10        (N_sep = 10)
Kp2 = wc2*L*Vm/(Vin+Vo) Ki2 = Kp2*wc2/10
Kp1 = wc1*C/(2*(1-D))   Ki1 = Kp1*wc1/10
```

Source: derived and verified in the project's PI-tuning work (GSSAM + Simulink).

## Nonlinear GSSAM model (duty state-dependent)

The linearized A/B above is fixed at the steady-state duty `d_ss`. The nonlinear
model (`gssamNonlinear` in each descriptor) instead recomputes the duty live from the
DC states every step, so it tracks the full startup transient rather than only the
neighborhood of the operating point.

Each step:

1. Reconstruct the controller output from the DC and integrator states and form the
   instantaneous duty `d = sat(vcon / Vm)`.
2. Recompute the switching-function Fourier coefficients at that `d`:
   `a = sin(2*pi*d)/(2*pi)`, `b = (cos(2*pi*d) - 1)/(2*pi)`, `q0 = 1 - d`.
3. Evaluate the index-0 and index-+/-1 balance equations with those live coefficients.

For the Buck the inductor sees `<s>*Vin`; for the Boost and Buck-Boost the
`(1 - s)*vo` and `(1 - s)*iL` products couple the harmonics into the DC equations.
The model is integrated with RK4. It has been checked against the Simulink Figure-2
behavior (steady-state ripple bounds and startup) for all three converters.

## Stability uses the verified linearized A

The Stability tab uses the **same A matrix as the Linearized tab** —
`buildAB(topology, params).A` — the closed-loop linearization verified against the
MATLAB scripts. There is one source of truth: parameter sweeps, bifurcation
detection, participation factors, and the L/C design study all compute eigenvalues
of this matrix.

## Stability methodology (Zhang)

1. **Eigenvalue locus** — sweep a parameter, rebuild the Jacobian, track the
   eigenvalues and `max Re(lambda)`. The first crossing of `Re = 0` is the bifurcation;
   a complex crossing pair is a Hopf, a real one is a real bifurcation.
2. **Bifurcation diagram** — settle the nonlinear model at each parameter value and
   record steady-state vo (min/max/mean). A single line means one stable equilibrium; a
   fanning band is the Hopf limit cycle.
3. **Participation factors** — `P_ki = |v_ki * u_ki|` from the left/right eigenvectors,
   grouped DC / ripple / controller, identify which states drive the unstable mode.
4. **2D stability map** — sign of `max Re(lambda)` over a grid of two parameters.

### L/C design study

Bisect for the critical `Ki1` at which the system first goes unstable, as a function of
the power-stage components. The headline result reproduces the paper:
`Ki1_crit * L ~ constant` (L is the dominant stability knob), while C has a weak effect.
The design surface `Ki1_crit(L, Kp1)` is the engineer's lookup chart.

## Design sizing formulas (CCM)

```
Duty:  Buck D = Vo/Vin;  Boost D = 1 - Vin/Vo;  Buck-Boost D = Vo/(Vin+Vo)

Boundary (min CCM) inductance at load R:
  Buck:        L_b = (1-D) * R / (2 fs)
  Boost:       L_b = D (1-D)^2 R / (2 fs)
  Buck-Boost:  L_b = (1-D)^2 R / (2 fs)

Inductor:  L = L_b * (1 + safety_margin)        (default margin 30%)

Output-ripple capacitor (target dVo/Vo):
  Buck:        C = (1-D) Vo / (8 L fs^2 dVo)     (LC output filter)
  Boost/BB:    C = D Io / (fs dVo),  Io = Vo/R
```

The Design tab sizes L from the CCM boundary times the chosen safety margin, sizes C
from the chosen output-ripple target, auto-tunes the gains, and then reports the GSSAM
stability of the resulting converter.
