# MATLAB reference scripts

These are the **source of truth** for the math implemented in `src/`. When porting a converter:

1. Run the MATLAB script with the default parameters.
2. Copy the printed A and B matrices.
3. Paste them into the matching test fixture under `tests/`.
4. Implement `buildAB` in `src/converters/<topology>.js` until the test passes.

## Files to drop in here

Copy these from the original project into this folder:

- `Buck_closed_V4.m` — Buck closed-loop GSSAM (8 states)
- `Boost_closed_V3.m` — Boost closed-loop GSSAM (8 states)
- `BuckBoost_closedV2.m` — Buck-Boost closed-loop GSSAM (8 states)
- `Buck_2024V.slx` — Simulink switching model for Buck (reference for sim comparison)
- `Boost_2024V.slx` — Simulink switching model for Boost
- `Buck_Boost_2024V.slx` — Simulink switching model for Buck-Boost
- `Buck_Boost_V2_Old_2024V.m` — pure-MATLAB Buck-Boost nonlinear GSSAM via ode45

These are kept in `examples/` (not embedded in `src/`) because they're for verification, not for shipping.

## Reference paper

Zhang H., Liu W., Ding H., Meng Y., Cui D. *"Modeling and stability analysis of dynamic oscillation behaviors in double-input Buck/Buck-Boost DC-DC converters using frequency selective approach."* Int. J. Circuit Theory Appl., 2020. DOI: 10.1002/cta.2873.
