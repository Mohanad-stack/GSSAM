/**
 * Main entry point — wires the three sections together:
 *   topology picker -> parameter form -> compute -> results
 *
 * Each section is hidden until the previous one is satisfied.
 */

import { renderTopologyPicker } from '../src/ui/topology-picker.js';
import { renderParamForm } from '../src/ui/param-form.js';
import { renderResults } from '../src/ui/results.js';
import { buildABCD } from '../src/core/abcd.js';

let currentTopology = null;
let currentForm = null;

const paramsSection = document.getElementById('params-section');
const resultsSection = document.getElementById('results-section');
const paramFormEl = document.getElementById('param-form');
const resultsEl = document.getElementById('results');
const computeBtn = document.getElementById('compute-btn');

// --- 1. Topology picker -----------------------------------------------------
try {
  renderTopologyPicker((topology) => {
    currentTopology = topology;

    // Reveal the parameter section and render its form
    paramsSection.hidden = false;
    currentForm = renderParamForm(topology);
    paramFormEl.replaceChildren(currentForm.element);

    // Hide stale results
    resultsSection.hidden = true;
  });
} catch (err) {
  console.warn('Topology picker not implemented yet:', err.message);
  document.getElementById('topology-picker').textContent =
    '⚠ UI not implemented yet — see src/ui/topology-picker.js';
}

// --- 2. Compute -------------------------------------------------------------
computeBtn.addEventListener('click', () => {
  if (!currentTopology || !currentForm) return;

  try {
    const parameters = currentForm.getValues();
    const result = buildABCD(currentTopology, parameters);

    resultsSection.hidden = false;
    renderResults(resultsEl, result);
  } catch (err) {
    console.error(err);
    resultsSection.hidden = false;
    resultsEl.textContent = `Error: ${err.message}`;
  }
});
