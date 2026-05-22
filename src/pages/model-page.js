/**
 * Shared "model page": topology picker -> parameter form -> compute -> results.
 *
 * Both the Linearized and Nonlinear tabs use this same page; they differ only
 * in which GSSAM model the switching comparison runs (passed as `modelMode`).
 * Parameters and topology are held in a shared store so switching tabs keeps
 * the same converter.
 */

import { renderTopologyPicker } from '../ui/topology-picker.js';
import { renderParamForm } from '../ui/param-form.js';
import { renderResults } from '../ui/results.js';
import { buildABCD } from '../core/abcd.js';

/**
 * @param {HTMLElement} mount  container to render into
 * @param {object} store       shared state { topology, parameters }
 * @param {object} opts        { modelMode: 'linearized' | 'nonlinear', blurb }
 */
export function renderModelPage(mount, store, opts) {
  const { modelMode = 'linearized', blurb } = opts;
  mount.replaceChildren();

  const topoSection = section('1. Select topology');
  if (blurb) {
    const note = document.createElement('p');
    note.className = 'page-blurb hint';
    note.textContent = blurb;
    topoSection.appendChild(note);
  }
  const pickerWrap = document.createElement('div');
  topoSection.appendChild(pickerWrap);
  mount.appendChild(topoSection);

  const paramSection = section('2. Parameters');
  paramSection.hidden = true;
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Leave Kp / Ki blank to auto-tune.';
  const formWrap = document.createElement('div');
  const computeBtn = document.createElement('button');
  computeBtn.textContent = 'Compute ABCD';
  paramSection.append(hint, formWrap, computeBtn);
  mount.appendChild(paramSection);

  const resultsSection = section('3. Results');
  resultsSection.hidden = true;
  const resultsEl = document.createElement('div');
  resultsSection.appendChild(resultsEl);
  mount.appendChild(resultsSection);

  let currentForm = null;

  const picker = renderTopologyPicker((topology) => {
    store.topology = topology;
    paramSection.hidden = false;
    currentForm = renderParamForm(topology, store.parameters);
    formWrap.replaceChildren(currentForm.element);
    resultsSection.hidden = true;
  });
  pickerWrap.appendChild(picker);

  if (store.topology) {
    const tile = picker.querySelector(`.topology-tile[data-id="${store.topology.id}"]`);
    if (tile) tile.classList.add('selected');
    paramSection.hidden = false;
    currentForm = renderParamForm(store.topology, store.parameters);
    formWrap.replaceChildren(currentForm.element);
  }

  computeBtn.addEventListener('click', () => {
    if (!store.topology || !currentForm) return;
    try {
      const parameters = currentForm.getValues();
      store.parameters = parameters;
      const result = buildABCD(store.topology, parameters);
      resultsSection.hidden = false;
      renderResults(resultsEl, result, {
        topology: store.topology,
        topologyId: store.topology.id,
        topologyLabel: store.topology.label,
        modelMode,
      });
    } catch (err) {
      console.error(err);
      resultsSection.hidden = false;
      resultsEl.textContent = 'Error: ' + err.message;
    }
  });

  if (store.topology && store.parameters) {
    computeBtn.click();
  }
}

function section(titleText) {
  const s = document.createElement('section');
  const h = document.createElement('h2');
  h.textContent = titleText;
  s.appendChild(h);
  return s;
}
