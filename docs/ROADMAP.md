# Roadmap

## Shipped

### Core model
- [x] Repo structure, README, architecture + math docs
- [x] Tab shell (Linearized / Nonlinear / Stability analysis / Design) with shared state
- [x] Generic ABCD builder driven by per-topology descriptors
- [x] Buck, Boost, Buck-Boost descriptors
- [x] Functional topology picker
- [x] Auto-generated parameter forms; "leave blank to auto-tune" gains
- [x] A, B, C, D display with eigenvalues and stability flag
- [x] Unit tests matching the reference MATLAB (Buck_closed_V4, Boost_closed_V3, BuckBoost_closedV2)

### Auto-tune
- [x] Per-topology closed-form gain tuning
- [x] Stability check on user-supplied gains

### Plots and export
- [x] Bode magnitude + phase
- [x] Pole/eigenvalue display
- [x] Step / time-domain response
- [x] Drag-to-zoom and fullscreen on charts; adaptive axis tick formatting
- [x] Export ABCD (.py / JSON) with symbolic matrices

### Simulation
- [x] Switching vs GSSAM time-domain comparison (linearized model)
- [x] Cycle-averaged switching controller (regulates the average, not the cycle boundary)
- [x] **Nonlinear GSSAM model** — duty-state-dependent averaged model that tracks the
      full startup transient; verified numerically against the Simulink Figure-2 behavior
      for all three converters

### Stability analysis (Zhang methodology)
- [x] True closed-loop Jacobian (distinct from the simulation matrix), analytic for Buck,
      numeric + Newton equilibrium for Boost / Buck-Boost
- [x] Parameter-sweep eigenvalue loci and max-real-part tracking
- [x] Automatic Hopf / real bifurcation detection with frequency
- [x] Bifurcation diagram (steady-state vo fanning into the limit cycle)
- [x] Participation factors (DC / ripple / controller) via left/right eigenvectors
- [x] 2D stability map over two parameters
- [x] Eigenvalue table (paper Tables 2/3 style)
- [x] L/C design study: critical Ki1 vs L and vs C, the Ki1_crit*L ~ const scaling law,
      design-knob ranking, and the Ki1_crit(L, Kp1) design surface
- [x] Shifted-QR eigenvalue routine with deflation for speed

### Design
- [x] Spec-in / components-out: Vin, Vo, load, frequency -> L, C, gains
- [x] L conduction-mode dropdown (CCM; DCM reserved)
- [x] L safety-margin-above-CCM-boundary dropdown
- [x] C output-ripple-target dropdown
- [x] GSSAM stability verdict and Ki1 headroom for the designed converter
- [x] Hand-off of the design to the other tabs via the shared store

## In progress

- [ ] **Numerical validation of the stability tab** against MATLAB stability runs
      (parameters + known critical Ki1 + Hopf frequency). The mechanism and signatures
      are in place; this closes the loop the same way the A/B and Figure-2 checks did.

## Backlog / ideas

- [ ] Per-point colored eigenvalue locus (parameter-value gradient, paper Figure-7A style) —
      needs a chart-engine enhancement
- [ ] DCM design path in the Design tab
- [ ] Shareable URL (parameters encoded in the URL hash)
- [ ] Faster L/C design study (it bisects at many points; currently on-demand)
- [ ] Custom user-defined topologies via a switching-function editor
- [ ] Multi-input / multi-port converters (the full Zhang paper setup)
- [ ] Optimization-based gain tuning (minimize settling time s.t. margin >= X)

## Hosting

The whole app is static (HTML + CSS + ES modules, no build step, no backend), so it can be
served by any static host. See the "Hosting" section in the README discussion / the notes
below.

- [ ] Pick a host: GitHub Pages (simplest for a GitHub repo), Netlify, or Vercel
- [ ] Enable HTTPS (automatic on all three)
- [ ] Optional custom domain
