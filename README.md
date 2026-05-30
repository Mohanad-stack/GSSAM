# GSSAM Web Tool

A browser-based tool that turns switching DC-DC converters (Buck, Boost, Buck-Boost) into a **Generalized State-Space Averaging Model (GSSAM)** and lets you simulate, analyze, and design them — entirely client-side, no backend.

> Built on the frequency-selective averaging method (Zhang et al., 2020), extended to single-input Buck, Boost, and Buck-Boost converters with cascaded PI voltage + current control.

## What it does

The tool has four tabs:

1. **Linearized** — builds the 8x8 closed-loop **A, B, C, D** model, shows eigenvalues and stability, simulates the linearized GSSAM against a full switching converter, and exports the model. Leaving the PI gains blank auto-tunes them.
2. **Nonlinear** — the duty-state-dependent averaged model that tracks the full startup transient (not just steady state), verified numerically against the Simulink switching model.
3. **Stability analysis** — the Zhang methodology in the browser: eigenvalue loci under a parameter sweep, automatic Hopf / real bifurcation detection, bifurcation diagrams, participation factors, 2D stability maps, Bode magnitude + phase, an eigenvalue table, and an L/C design study (the `Ki1_crit * L ~ const` scaling law).
4. **Design** — enter target specs (Vin, Vo, load, frequency), choose the conduction mode and ripple targets, and the tool sizes L and C, auto-tunes the gains, and reports the resulting GSSAM stability. The design hands off to the other tabs.

The 8 states are `[iL0, vo0, iLR, iLI, voR, voI, ev_int, ei_int]`: DC inductor current and capacitor voltage, the real/imaginary parts of their first switching harmonic, and the two PI integrator states.

## Quick start

The app is pure ES modules, so it must be served over HTTP (not opened as a `file://`):

```bash
git clone https://github.com/<your-username>/gssam-web.git
cd gssam-web
python -m http.server 8000
# then open http://localhost:8000
```

> **Tip:** after replacing files, hard-refresh the browser (Ctrl/Cmd+Shift+R). ES modules cache aggressively, and a stale cache looks exactly like a bug.

## Why GSSAM and not standard averaging?

Classical state-space averaging keeps only the DC component and loses the switching ripple. GSSAM keeps the index-0 (average) **and** index-+/-1 (first harmonic) terms, so the model reproduces both the low-frequency dynamics *and* the ripple. That extra structure is what lets the stability tab predict oscillation onset (Hopf bifurcations) that the textbook averaged model cannot see.

## One verified matrix, everywhere

The Linearized tab, the Nonlinear-tab comparison plot, the Stability tab, and the
Design-tab stability verdict all share **one** A matrix: `buildAB(topology, params).A`,
the closed-loop linearization verified entry-by-entry against the MATLAB scripts. The
controller feedback is already part of A (it enters the DC inductor row, and for
Boost/Buck-Boost the DC capacitor row), so the loop is closed and the matrix can
exhibit Hopf and real bifurcations under parameter sweeps. One source of truth, no
"which matrix is this" footnotes.

## Repo layout

```
gssam-web/
|- index.html              # tab shell (served from project root)
|- main.js                 # tab router + shared store
|- styles.css
|- src/
|  |- converters/          # one descriptor per topology (buck, boost, buckboost)
|  |- core/                # GSSAM math: abcd, analysis, autotune, simulate,
|  |                       #   stability, design
|  |- pages/               # model-page (Linearized/Nonlinear), stability-page, design-page
|  |- ui/                  # chart, comparison, param-form, results, topology-picker, plots
|  |- utils/               # export, validate
|- examples/               # MATLAB reference scripts (source of truth for the math)
|- tests/                  # ABCD unit tests vs the MATLAB reference
|- docs/                   # ARCHITECTURE, MATH, ROADMAP
```

## Verification status

- **Linearized A/B** — verified entry-by-entry against the reference MATLAB at matching operating points.
- **Nonlinear model** — verified numerically against the Simulink Figure-2 behavior (steady-state ripple bounds and startup) for all three converters.
- **Stability** — bifurcation mechanism and participation signatures reproduce the Zhang methodology; numerical validation against MATLAB stability runs is the current open task.

## License

MIT — see [LICENSE](LICENSE).

## Reference

Zhang H., Liu W., Ding H., Meng Y., Cui D. *Modeling and stability analysis of dynamic oscillation behaviors in double-input Buck/Buck-Boost DC-DC converters using a frequency selective approach.* Int. J. Circuit Theory Appl., 2020. DOI: 10.1002/cta.2873.
