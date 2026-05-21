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

## Buck closed-loop A, B (linearized at d_ss)

```
d_ss = Vref / Vin
a_ss = sin(2π·d_ss)/(2π)
b_ss = (cos(2π·d_ss) − 1)/(2π)
```

See `examples/Buck_closed_V4.m` for the symbolic form. Direct translation lives in `src/converters/buck.js`.

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
