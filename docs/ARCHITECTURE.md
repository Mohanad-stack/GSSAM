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

## How a topology is defined

Each topology is a single descriptor file under `src/converters/` (`buck.js`,
`boost.js`, `buckboost.js`). A descriptor declares:

- the parameters it needs (Vin, L, C, R, fs, Vref, gains, ...)
- the steady-state operating point (`operatingPoint`: d_ss, harmonic coefficients)
- `buildAB` — the frozen-duty simulation matrix (matches the Simulink linearized block)
- `gssamNonlinear` — the duty-state-dependent nonlinear averaged ODE
- `autotune` — closed-form PI gain formulas
- `switching` — the reference switching model for the time-domain comparison
- optionally `jacobian` — the analytic closed-loop Jacobian (Buck only; the others
  are differentiated numerically by the stability engine)

The generic builder in `src/core/abcd.js` turns a descriptor + numeric parameters
into numeric A, B, C, D and never knows which converter it is building. Adding a new
topology (SEPIC, Cuk, ...) means writing **one new descriptor file**; the engine, UI,
pages, plots, and export work unchanged.

## One verified matrix

There is one A matrix in the codebase: `buildAB(topology, params).A`, the closed-loop
linearization at the operating point. It is verified entry-by-entry against the MATLAB
scripts (`tests/`). The Linearized tab uses it for simulation and display; the Stability
tab feeds it into the sweep / bifurcation / participation engine; the Design tab uses it
to report a stability verdict for designed components. One source of truth.

## Pages and the shared store

`main.js` is a small tab router holding a shared `store = { topology, parameters,
designTopology }`. Each tab is a page module:

- `src/pages/model-page.js` — the shared converter page used by both the Linearized and
  Nonlinear tabs (parameterized by a `modelMode` flag; same engine, different model).
- `src/pages/stability-page.js` — the Zhang 4-step analysis plus the L/C design study.
- `src/pages/design-page.js` — spec-in / components-out, with hand-off to the store so
  the other tabs pick up the designed converter.

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
| Topology descriptors | `src/converters/buck.js`, `boost.js`, `buckboost.js` |
| Generic ABCD assembly | `src/core/abcd.js` |
| Auto-tune PI gains | `src/core/autotune.js` |
| Eigenvalues, transfer functions, participation factors | `src/core/analysis.js` |
| Time-domain switching vs GSSAM simulation | `src/core/simulate.js` |
| Stability engine (Jacobian, sweeps, bifurcation, L/C study) | `src/core/stability.js` |
| Component sizing for the Design tab | `src/core/design.js` |
| Tab pages | `src/pages/model-page.js`, `stability-page.js`, `design-page.js` |
| Charts, forms, results, comparison, topology picker | `src/ui/` |
| Validation, export | `src/utils/` |
| Tab shell + router | `index.html`, `main.js` |
| Unit tests against reference MATLAB output | `tests/` |
| MATLAB source of truth | `examples/` |

## Hosting

The app is fully static — HTML, CSS, and ES modules with no build step and no backend —
so any static host works. The only requirement is being served over HTTP (ES modules do
not load from `file://`). GitHub Pages is the simplest path for a GitHub repo; Netlify and
Vercel also work with zero configuration. All three provide HTTPS automatically.

## On a backend

Nothing in the current tool needs one — the linear algebra on 8x8 matrices and the
time-domain integration both run fast enough in the browser. A backend would only become
attractive for much heavier batch sweeps or symbolic linearization of arbitrary
user-defined topologies. The `backend/` folder is reserved for that and is otherwise unused.
