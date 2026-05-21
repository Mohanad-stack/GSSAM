# Architecture

## Big picture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│       UI        │ -> │   Core engine    │ -> │     Outputs     │
│  (HTML forms,   │    │  (GSSAM math,    │    │  (ABCD matrices,│
│   plot canvas)  │    │   ABCD, tuning)  │    │   plots, export)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
        |                       |                       |
   src/ui/               src/core/                src/utils/export
                         src/converters/
```

Everything below `src/` is pure ES modules. No framework required for v0 — adding React/Vue later is easy because the math has no DOM dependencies.

## The two-layer split

Each topology has **two files**:

1. **`src/converters/<topo>.js`** — declares the converter:
   - what parameters it needs (Vin, L, C, R, fs, Vref, ...)
   - the steady-state operating point (d_ss, Vo, IL)
   - the symbolic A and B matrices, with placeholders for d_ss, Kp1, Ki1, etc.
   - the auto-tune formula for Kp / Ki

2. **`src/core/abcd.js`** — generic ABCD builder:
   - takes a topology descriptor + numeric parameters
   - returns numeric A, B, C, D
   - never knows which converter it's building

This split is what makes adding new topologies cheap. To add a SEPIC or a Ćuk converter later, you write **one new file in `src/converters/`** — the engine, UI, plots, and export work unchanged.

## Data flow

1. User picks topology -> `src/ui/topology-picker.js` loads the matching descriptor from `src/converters/`.
2. UI auto-generates the parameter form from the descriptor's parameter list.
3. User clicks **Compute**.
4. If Kp/Ki are blank -> `src/core/autotune.js` fills them in using the descriptor's tuning formula.
5. `src/core/abcd.js` builds the numeric 8×8 A and 8×1 B.
6. `src/core/analysis.js` computes eigenvalues, transfer functions, step response.
7. `src/ui/results.js` renders the matrices, plots, and download buttons.

## Why browser-only for v0

- Pure linear algebra on 8×8 matrices runs in microseconds.
- No backend means no hosting cost, no auth, no CORS, no DevOps.
- Anyone can fork the repo and run it locally by opening `index.html`.

## When a backend is needed

Cases that justify spinning up Python (FastAPI on Hugging Face Spaces or Railway):

- **Real-time switching simulation** to compare against GSSAM (heavy ODE integration).
- **Bifurcation sweeps** scanning many parameter combinations.
- **Symbolic linearization** of user-supplied custom topologies (SymPy is much better than anything in JS).

Until those features ship, no backend is needed. The `backend/` folder is reserved for that future work.

## Where things live

| Concern | Location |
|---|---|
| Topology definitions | `src/converters/buck.js`, `boost.js`, `buckboost.js` |
| GSSAM math, ABCD assembly | `src/core/abcd.js` |
| Auto-tune PI gains | `src/core/autotune.js` |
| Eigenvalues, transfer functions | `src/core/analysis.js` |
| Forms, plots, results panel | `src/ui/` |
| Math helpers (matrix ops if not using a library) | `src/utils/math.js` |
| Validation, export, presets | `src/utils/` |
| Static page shell | `public/index.html` |
| Unit tests against reference MATLAB output | `tests/` |
| MATLAB source of truth | `examples/` |
