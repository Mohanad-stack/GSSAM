# MATLAB reference scripts

These are the **source of truth** for the math implemented in `src/`. The unit tests in
`tests/` check the JavaScript ABCD output against the matrices these scripts produce.

## Closed-loop GSSAM scripts (8 states)

- `Buck_closed_V4.m` — Buck closed-loop GSSAM
- `Boost_closed_V3.m` — Boost closed-loop GSSAM
- `BuckBoost_closedV2.m` — Buck-Boost closed-loop GSSAM
- `Buck_Boost_V2_Old_2024V.m` — pure-MATLAB Buck-Boost nonlinear GSSAM via ode45

## Simulink switching models (reference for the time-domain comparison)

- `Buck_2024V.slx`
- `Boost_2024V.slx`
- `Buck_Boost_2024V.slx`

The nonlinear GSSAM block lives inside these `.slx` files. Because the block is binary,
the browser tool's nonlinear model was reconstructed from GSSAM theory and then verified
*numerically* against the Figure-2 output of these models (steady-state ripple bounds and
startup), rather than by reading the block directly.

## How a converter was ported

1. Run the MATLAB script with its default parameters.
2. Copy the printed A and B matrices.
3. Paste them into the matching fixture under `tests/`.
4. Implement `buildAB` in `src/converters/<topology>.js` until the test passes.

## Reference paper

`Circuit_Theory___Apps__2020__Zhang__...pdf` — Zhang H., Liu W., Ding H., Meng Y., Cui D.
*Modeling and stability analysis of dynamic oscillation behaviors in double-input
Buck/Buck-Boost DC-DC converters using a frequency selective approach.*
Int. J. Circuit Theory Appl., 2020. DOI: 10.1002/cta.2873.
