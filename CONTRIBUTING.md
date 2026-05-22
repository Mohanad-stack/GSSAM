# Contributing

## How to add a new converter topology

This is the single most common contribution. The architecture is set up so adding a topology means **one new file** in `src/converters/` plus one registry edit.

### 1. Copy an existing descriptor

```bash
cp src/converters/buck.js src/converters/sepic.js
```

Edit the four sections of the new file:
- `id`, `label`, `description`
- `parameters` — adjust defaults
- `operatingPoint(p)` — compute the steady-state quantities your A and B need
- `buildAB(p, op)` — the 8×8 A and 8×1 B for the closed-loop linearization
- `autotune(p)` — closed-form Kp/Ki formula

### 2. Register it

In `src/converters/index.js`:

```js
import { sepic } from './sepic.js';
export const topologies = [buck, boost, buckboost, sepic];
```

That's it. The UI auto-discovers the new topology and renders a form for it.

### 3. Verify against MATLAB

Add a fixture test in `tests/sepic.test.js` (mirror `tests/buck.test.js`) with the expected A from a reference MATLAB run.

## Running locally

No build step in v0:

```bash
git clone https://github.com/<you>/gssam-web.git
cd gssam-web
npm run dev    # python -m http.server 8000  (run from project root)
```

Open <http://localhost:8000>. Serve from the project ROOT (not a subfolder) so the browser can reach both index.html and src/.

## Code style

- ES modules, no transpiler in v0.
- No external dependencies in `src/core/` if avoidable (keeps the math auditable).
- One topology per file in `src/converters/`.
- Math symbols in code should match the symbols in `docs/MATH.md`.

## Reporting bugs

Open an issue with:
1. Topology + parameter values used
2. Expected behavior
3. Actual output
4. Browser + version
