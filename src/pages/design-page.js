/**
 * Design tab — spec-in, components-out.
 *
 * Inputs: Vin, desired Vo, load R, switching frequency fs.
 *   - L dropdown: conduction mode. CCM is selectable; DCM is shown but disabled
 *     (future work).
 *   - C dropdown: target output-voltage ripple (1% … 0.001%).
 * Output: sized L and C, auto-tuned PI gains, and the resulting GSSAM stability.
 */

import { renderTopologyPicker } from '../ui/topology-picker.js';
import { designConverter } from '../core/design.js';
import { buildABCD } from '../core/abcd.js';
import { eigenvalues } from '../core/analysis.js';
import { getJacobian, criticalValue, lcResonanceHz } from '../core/stability.js';

const RIPPLE_OPTIONS = [
  { label: '1 %', value: 0.01 },
  { label: '0.5 %', value: 0.005 },
  { label: '0.1 %', value: 0.001 },
  { label: '0.05 %', value: 0.0005 },
  { label: '0.01 %', value: 0.0001 },
  { label: '0.001 %', value: 0.00001 },
];

const MARGIN_OPTIONS = [
  { label: 'Default (+30% above CCM)', value: '' },
  { label: '+20% above CCM boundary', value: 0.2 },
  { label: '+30% above CCM boundary', value: 0.3 },
  { label: '+50% above CCM boundary', value: 0.5 },
];

export function renderDesignPage(mount, store) {
  mount.replaceChildren();

  const intro = section('Design a converter');
  const blurb = document.createElement('p');
  blurb.className = 'page-blurb hint';
  blurb.textContent =
    'Enter your target specs and the tool sizes L and C, auto-tunes the PI gains, ' +
    'and checks the resulting GSSAM stability — so you can see if the design has Hopf headroom before committing.';
  intro.appendChild(blurb);
  mount.appendChild(intro);

  // topology
  const topoSection = section('1. Topology');
  const pickerWrap = document.createElement('div');
  topoSection.appendChild(pickerWrap);
  mount.appendChild(topoSection);

  const picker = renderTopologyPicker((topology) => {
    store.designTopology = topology;
    designBtn.disabled = false;
  });
  pickerWrap.appendChild(picker);
  if (store.designTopology) {
    const tile = picker.querySelector(`.topology-tile[data-id="${store.designTopology.id}"]`);
    if (tile) tile.classList.add('selected');
  }

  // specs
  const specSection = section('2. Specifications');
  const grid = document.createElement('div');
  grid.className = 'design-grid';
  const vinIn = field('Input voltage Vin (V)', '24');
  const voIn = field('Desired output Vo (V)', '12');
  const rIn = field('Load resistance R (Ω)', '10');
  const fsIn = field('Switching frequency fs (Hz)', '40000');

  // L mode dropdown (CCM enabled, DCM disabled)
  const lWrap = document.createElement('label'); lWrap.className = 'design-field';
  const lSpan = document.createElement('span'); lSpan.textContent = 'Inductor L — conduction mode';
  const lSel = document.createElement('select');
  const ccmOpt = document.createElement('option'); ccmOpt.value = 'CCM'; ccmOpt.textContent = 'CCM (continuous)'; lSel.appendChild(ccmOpt);
  const dcmOpt = document.createElement('option'); dcmOpt.value = 'DCM'; dcmOpt.textContent = 'DCM (discontinuous) — coming soon'; dcmOpt.disabled = true; lSel.appendChild(dcmOpt);
  lWrap.append(lSpan, lSel);

  // L safety-margin dropdown (optional; default = +30% above CCM boundary)
  const irWrap = document.createElement('label'); irWrap.className = 'design-field';
  const irSpan = document.createElement('span'); irSpan.textContent = 'Inductor L — safety margin above CCM';
  const irSel = document.createElement('select');
  for (const opt of MARGIN_OPTIONS) { const o = document.createElement('option'); o.value = String(opt.value); o.textContent = opt.label; irSel.appendChild(o); }
  irWrap.append(irSpan, irSel);

  // C ripple dropdown
  const cWrap = document.createElement('label'); cWrap.className = 'design-field';
  const cSpan = document.createElement('span'); cSpan.textContent = 'Capacitor C — max output ripple';
  const cSel = document.createElement('select');
  for (const opt of RIPPLE_OPTIONS) { const o = document.createElement('option'); o.value = String(opt.value); o.textContent = opt.label; cSel.appendChild(o); }
  cWrap.append(cSpan, cSel);

  grid.append(vinIn.wrap, voIn.wrap, rIn.wrap, fsIn.wrap, lWrap, irWrap, cWrap);
  specSection.appendChild(grid);

  const designBtn = document.createElement('button');
  designBtn.textContent = 'Design converter';
  designBtn.disabled = !store.designTopology;
  specSection.appendChild(designBtn);
  mount.appendChild(specSection);

  const out = document.createElement('div');
  mount.appendChild(out);

  designBtn.addEventListener('click', () => {
    if (!store.designTopology) return;
    const Vin = Number(vinIn.input.value);
    const Vo = Number(voIn.input.value);
    const R = Number(rIn.input.value);
    const fs = Number(fsIn.input.value);
    const rippleFrac = Number(cSel.value);
    const mVal = irSel.value;
    const marginFrac = mVal === '' ? null : Number(mVal);
    if (![Vin, Vo, R, fs].every(Number.isFinite)) { out.textContent = 'Please enter valid numbers.'; return; }

    out.replaceChildren();
    try {
      renderDesignResult(out, store.designTopology, { Vin, Vo, R, fs, rippleFrac, marginFrac }, store);
    } catch (err) {
      console.error(err);
      out.textContent = 'Error: ' + err.message;
    }
  });
}

function renderDesignResult(root, topology, spec, store) {
  const { parameters, design } = designConverter(topology, spec);
  const res = buildABCD(topology, parameters);
  const p = res.parameters; // resolved gains

  // sanity check on topology feasibility
  if (topology.id === 'boost' && spec.Vo <= spec.Vin) {
    root.appendChild(warn('A boost converter must step UP: Vo should be greater than Vin.'));
  }
  if (topology.id === 'buck' && spec.Vo >= spec.Vin) {
    root.appendChild(warn('A buck converter must step DOWN: Vo should be less than Vin.'));
  }

  // results table
  root.appendChild(h('Designed components'));
  const tbl = document.createElement('table'); tbl.className = 'design-table';
  addRow(tbl, 'Duty cycle D', design.D.toFixed(3));
  const lNote = `  (${(design.marginFrac * 100).toFixed(0)}% above CCM boundary ${fmtSI(design.boundaryL, 'H')})`;
  addRow(tbl, 'Inductor L', fmtSI(design.L, 'H') + lNote);
  addRow(tbl, 'Avg inductor current', design.iLavg.toFixed(2) + ' A');
  addRow(tbl, 'Capacitor C', fmtSI(design.C, 'F') + `  (for ≤ ${(design.rippleFrac * 100).toFixed(3)}% output ripple)`);
  addRow(tbl, 'Voltage-loop gains', `Kp1 = ${p.Kp1.toPrecision(3)},  Ki1 = ${p.Ki1.toPrecision(4)}`);
  addRow(tbl, 'Current-loop gains', `Kp2 = ${p.Kp2.toPrecision(3)},  Ki2 = ${p.Ki2.toPrecision(4)}`);
  root.appendChild(tbl);

  // stability verdict
  root.appendChild(h('GSSAM stability check'));
  const { classification } = eigenvalues(getJacobian(topology, p));
  root.appendChild(verdict(classification));

  // Ki1 headroom (how far the integrator gain can rise before Hopf)
  const crit = criticalValue(topology, p, 'Ki1', { min: Math.max(1, p.Ki1 * 0.5), max: p.Ki1 * 500 });
  const lc = lcResonanceHz(p);
  if (crit) {
    const headroom = crit.value / p.Ki1;
    root.appendChild(stepText(
      `Ki1 stability headroom: a ${crit.type} bifurcation appears at Ki1 = ${crit.value.toFixed(0)} ` +
      `(${headroom.toFixed(0)}× the tuned value), oscillating at ≈ ${crit.freqHz.toFixed(0)} Hz. ` +
      `LC resonance ≈ ${lc.toFixed(0)} Hz.`));
  } else {
    root.appendChild(stepText(
      `No Ki1 bifurcation found up to 500× the tuned gain — large stability headroom. LC resonance ≈ ${lc.toFixed(0)} Hz.`));
  }

  // hand-off: load this design into the shared store so the Linearized,
  // Nonlinear, and Stability tabs show this exact converter.
  root.appendChild(stepText(
    'These parameters are now loaded — switch to the Linearized or Nonlinear tab to simulate this design, ' +
    'or the Stability tab to sweep it.'));
  if (store) { store.topology = topology; store.parameters = p; }
}

/* ---------- helpers ---------- */
function section(t) { const s = document.createElement('section'); const hh = document.createElement('h2'); hh.textContent = t; s.appendChild(hh); return s; }
function h(t) { const e = document.createElement('h2'); e.textContent = t; e.className = 'stab-step'; return e; }
function stepText(t) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = t; return p; }
function field(label, def) {
  const wrap = document.createElement('label'); wrap.className = 'design-field';
  const span = document.createElement('span'); span.textContent = label;
  const input = document.createElement('input'); input.type = 'text'; input.value = def; input.inputMode = 'decimal';
  wrap.append(span, input); return { wrap, input };
}
function addRow(tbl, k, v) {
  const tr = document.createElement('tr');
  const td1 = document.createElement('td'); td1.textContent = k; td1.className = 'design-key';
  const td2 = document.createElement('td'); td2.textContent = v;
  tr.append(td1, td2); tbl.appendChild(tr);
}
function verdict(classification) {
  const div = document.createElement('div'); div.className = 'stab-banner ' + classification;
  const msg = classification === 'stable' ? 'STABLE — the designed converter is stable at its operating point.'
    : classification === 'marginal' ? 'MARGINAL — poles sit near the imaginary axis.'
    : 'UNSTABLE — this design oscillates; adjust specs or gains.';
  div.textContent = msg; return div;
}
function warn(text) { const d = document.createElement('div'); d.className = 'stab-banner marginal'; d.textContent = text; return d; }
function fmtSI(v, unit) {
  const a = Math.abs(v);
  if (a >= 1) return v.toFixed(3) + ' ' + unit;
  if (a >= 1e-3) return (v * 1e3).toFixed(2) + ' m' + unit;
  if (a >= 1e-6) return (v * 1e6).toFixed(2) + ' µ' + unit;
  if (a >= 1e-9) return (v * 1e9).toFixed(2) + ' n' + unit;
  return v.toExponential(2) + ' ' + unit;
}
