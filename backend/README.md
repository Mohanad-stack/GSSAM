# Backend (reserved)

**Not used in v0.** This folder is reserved for a future Python backend that handles features too heavy for the browser:

- Real-time switching simulation (ODE45-style integration over many cycles)
- Bifurcation sweeps across parameter grids
- Symbolic linearization of user-supplied custom topologies (SymPy)

Likely stack when this lands:
- **FastAPI** for the HTTP layer
- **NumPy / SciPy** for the math
- **SymPy** for symbolic linearization
- Deployed to **Hugging Face Spaces** (free) or **Railway** (cheap)

Until then this folder stays empty.
