# GSSAM Web Tool

A browser-based tool that converts any switching DC-DC converter into a **Generalized State-Space Averaging Model (GSSAM)** — giving you the closed-loop **A, B, C, D** matrices, eigenvalues, and frequency response from a handful of parameters.

> Built on the frequency-selective averaging method (Zhang et al., 2020) extended to single-input Buck, Boost, and Buck-Boost converters with cascaded PI control and anti-windup.

## What it does

You pick a topology, type in the power-stage parameters and (optionally) the PI gains, and the tool returns:

- The **8×8 closed-loop ABCD model** (`iL₀, vo₀, iLR, iLI, voR, voI, ev_int, ei_int`)
- **Eigenvalues** and stability margins
- **Bode / step response** plots
- An **exportable model** (`.mat`, `.py`, JSON) you can drop straight into MATLAB, Simulink, or Python

If you leave Kp / Ki blank, the tool **auto-tunes** them from the converter parameters using closed-form formulas.

## Status

🚧 Early development — repo skeleton only. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Quick start (once the prototype lands)

```bash
git clone https://github.com/<your-username>/gssam-web.git
cd gssam-web
# open public/index.html in any browser — no build step required for v0
```

## Why GSSAM and not standard averaging?

Classical state-space averaging captures only the DC component and loses the switching ripple. GSSAM keeps the index-0 (average) **and** index-±1 (first harmonic) terms, so the model reproduces both low-frequency dynamics *and* the high-frequency ripple — which means it can predict phenomena like subharmonic oscillation that the textbook averaged model misses.

## Repo layout

```
gssam-web/
├── public/              # static site (HTML/CSS/JS) — what users see
├── src/
│   ├── converters/      # one file per topology (buck, boost, buck-boost, ...)
│   ├── core/            # GSSAM math: ABCD builder, eigenvalues, auto-tune
│   ├── ui/              # UI components (forms, plots, results panel)
│   └── utils/           # helpers: validation, export, presets
├── backend/             # OPTIONAL Python backend for heavy features (real-time sim)
├── examples/            # reference MATLAB files this is based on
├── tests/               # unit tests for the math
├── docs/                # architecture, math derivations, roadmap
└── .github/workflows/   # CI
```

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

## License

MIT (planned).

## Reference

- Zhang H., Liu W., Ding H., Meng Y., Cui D. *"Modeling and stability analysis of dynamic oscillation behaviors in double-input Buck/Buck-Boost DC-DC converters using frequency selective approach."* Int. J. Circuit Theory Appl. (2020).
