# Roadmap

## v0.1 — Skeleton (current)

- [x] Repo structure
- [x] README and architecture docs
- [ ] Static `index.html` shell with topology picker placeholder
- [ ] Empty module stubs in `src/` so imports resolve
- [ ] CI workflow that lints and runs tests

## v0.2 — Buck (MVP)

- [ ] Buck topology descriptor (`src/converters/buck.js`)
- [ ] Generic ABCD builder for the descriptor format
- [ ] Buck parameter form auto-generated from descriptor
- [ ] Display A, B, C, D as tables
- [ ] Display eigenvalues with stability flag
- [ ] Unit tests that match the reference MATLAB output of `Buck_closed_V4.m`

## v0.3 — Boost and Buck-Boost

- [ ] Boost descriptor
- [ ] Buck-Boost descriptor
- [ ] Topology picker becomes functional
- [ ] Tests against `Boost_closed_V3.m` and `BuckBoost_closedV2.m`

## v0.4 — Auto-tune

- [ ] Auto-tune formulas per topology
- [ ] "Leave blank to auto-tune" UX
- [ ] Stability check on user-supplied gains, with warning if poles cross into RHP

## v0.5 — Plots and export

- [ ] Bode plot (control-to-output)
- [ ] Pole-zero map
- [ ] Step response
- [ ] Export ABCD as `.mat`, `.py`, JSON
- [ ] Shareable URL (parameters encoded in the URL hash)

## v0.6 — Hosting

- [ ] Pick a host: GitHub Pages, Vercel, or Netlify
- [ ] Custom domain (optional)
- [ ] HTTPS

## v1.0 — Real-time switching vs GSSAM

This is the big feature you mentioned. Requires either:

- A JS ODE integrator running in a Web Worker (works for short sims), or
- A Python backend on Hugging Face Spaces / Railway (works for everything)

- [ ] Decide JS-only vs Python backend
- [ ] Side-by-side time-domain plot: switching model vs GSSAM
- [ ] Frequency-domain comparison

## Beyond v1.0

- [ ] Bifurcation explorer (parameter sweeps, eigenvalue loci)
- [ ] Multi-input / multi-port converters (the Zhang paper setup)
- [ ] Custom user-defined topologies via a switching-function editor
- [ ] User accounts and saved projects (only if there's demand)
- [ ] REST API for batch model generation
- [ ] Optimization-based gain tuning (minimize settling time s.t. stability margin >= X)
- [ ] Hardware-in-loop export (real-time C code generation)
