/**
 * Main entry point — wires the three sections together:
 *   topology picker -> parameter form -> compute -> results
 */

import { renderTopologyPicker } from './src/ui/topology-picker.js';
import { renderParamForm } from './src/ui/param-form.js';
import { renderResults } from './src/ui/results.js';
import { buildABCD } from './src/core/abcd.js';

let currentTopology = null;
let currentForm = null;

const paramsSection = document.getElementById('params-section');
const resultsSection = document.getElementById('results-section');
const paramFormEl = document.getElementById('param-form');
const resultsEl = document.getElementById('results');
const computeBtn = document.getElementById('compute-btn');

renderTopologyPickerSafe();

function renderTopologyPickerSafe() {
  try {
    const picker = renderTopologyPicker((topology) => {
      currentTopology = topology;
      paramsSection.hidden = false;
      currentForm = renderParamForm(topology);
      paramFormEl.replaceChildren(currentForm.element);
      resultsSection.hidden = true;
    });
    document.getElementById('topology-picker').replaceChildren(picker);
  } catch (err) {
    console.error(err);
    document.getElementById('topology-picker').textContent =
      'Error loading topologies: ' + err.message;
  }
}

computeBtn.addEventListener('click', () => {
  if (!currentTopology || !currentForm) return;
  try {
    const parameters = currentForm.getValues();
    const result = buildABCD(currentTopology, parameters);
    resultsSection.hidden = false;
    renderResults(resultsEl, result, {
      topology: currentTopology,
      topologyId: currentTopology.id,
      topologyLabel: currentTopology.label,
    });
  } catch (err) {
    console.error(err);
    resultsSection.hidden = false;
    resultsEl.textContent = 'Error: ' + err.message;
  }
});
