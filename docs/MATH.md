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

## Auto-tune formulas (placeholder)

The exact closed-form derivation goes here once we lock it in. Conceptually:

```
Given desired bandwidth ωc_v (outer) and ωc_i (inner) with ωc_i ≈ 10·ωc_v << ωs/10:

Inner current loop crossover sets:
  Kp2 = L·ωc_i / Vin
  Ki2 = Kp2 · ωc_i / 10

Outer voltage loop crossover sets:
  Kp1 = C·ωc_v
  Ki1 = Kp1 · ωc_v / 10
```

This is the textbook starting point. The actual formulas used in code will reference the converter-specific small-signal gains derived from A and B.

## How to verify a new topology

1. Add the descriptor to `src/converters/<name>.js`.
2. Pick a parameter set you have a working MATLAB run for.
3. Run `npm test` — the test fixture in `tests/` should match A and B to numerical tolerance.
4. If it doesn't match, the descriptor is wrong, not the engine.
