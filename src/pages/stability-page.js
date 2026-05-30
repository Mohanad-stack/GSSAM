/**
 * Stability analysis page — Zhang et al. methodology in the browser.
 *
 * Uses the verified linearized A matrix from buildAB (the same matrix the
 * Linearized tab displays). Steps:
 *   1. Eigenvalue locus + max(real) vs swept parameter -> bifurcation point
 *   2. Bifurcation diagram (vo steady-state vs parameter)
 *   3. Participation factors of the dominant mode (DC / ripple / controller)
 *   4. 2D stability map over two parameters
 * Plus: Bode magnitude + phase at the nominal point.
 */

import { renderTopologyPicker } from '../ui/topology-picker.js';
import { renderParamForm } from '../ui/param-form.js';
import { buildABCD } from '../core/abcd.js';
import { eigenvalues, frequencyResponse } from '../core/analysis.js';
import {
  getJacobian, sweepParameter, bifurcationDiagram, modeParticipation, stabilityMap2D,
  criticalValue, criticalScaling, designSurface, eigenvalueTable, lcResonanceHz,
} from '../core/stability.js';
import { createChart, fmtNum } from '../ui/chart.js';

const SWEEPABLE = [
  { id: 'Kp1', label: 'Kp1 (voltage P)' },
  { id: 'Ki1', label: 'Ki1 (voltage I)' },
  { id: 'Kp2', label: 'Kp2 (current P)' },
  { id: 'Ki2', label: 'Ki2 (current I)' },
  { id: 'L', label: 'L (inductance)' },
  { id: 'C', label: 'C (capacitance)' },
  { id: 'R', label: 'R (load)' },
];

export function renderStabilityPage(mount, store) {
  mount.replaceChildren();

  const intro = section('Stability analysis');
  const blurb = document.createElement('p');
  blurb.className = 'page-blurb hint';
  blurb.textContent =
    'Eigenvalue / bifurcation analysis on the verified linearized closed-loop A matrix ' +
    '(the same one the Linearized tab displays). Sweeping a parameter and tracking the ' +
    'eigenvalues reveals where the design loses stability.';
  intro.appendChild(blurb);
  mount.appendChild(intro);

  const topoSection = section('1. Converter & operating point');
  const pickerWrap = document.createElement('div');
  const formWrap = document.createElement('div');
  topoSection.append(pickerWrap, formWrap);
  mount.appendChild(topoSection);

  let currentForm = null;
  const picker = renderTopologyPicker((topology) => {
    store.topology = topology;
    currentForm = renderParamForm(topology, store.parameters);
    formWrap.replaceChildren(currentForm.element);
    runBtn.disabled = false;
  });
  pickerWrap.appendChild(picker);
  if (store.topology) {
    const tile = picker.querySelector(`.topology-tile[data-id="${store.topology.id}"]`);
    if (tile) tile.classList.add('selected');
    currentForm = renderParamForm(store.topology, store.parameters);
    formWrap.replaceChildren(currentForm.element);
  }

  const ctrlSection = section('2. Sweep settings');
  const controls = document.createElement('div');
  controls.className = 'stab-controls';
  const paramSel = labeledSelect('Sweep parameter', SWEEPABLE.map(s => [s.id, s.label]), 'Ki1');
  const minIn = labeledInput('Min', '100');
  const maxIn = labeledInput('Max', '30000');
  const logChk = labeledCheckbox('Log scale', false);
  controls.append(paramSel.wrap, minIn.wrap, maxIn.wrap, logChk.wrap);
  const runBtn = document.createElement('button');
  runBtn.textContent = 'Run stability analysis';
  runBtn.disabled = !store.topology;
  controls.appendChild(runBtn);
  ctrlSection.appendChild(controls);
  mount.appendChild(ctrlSection);

  const status = document.createElement('p');
  status.className = 'hint';
  ctrlSection.appendChild(status);

  const results = document.createElement('div');
  mount.appendChild(results);

  runBtn.addEventListener('click', () => {
    if (!store.topology || !currentForm) return;
    const p = currentForm.getValues();
    store.parameters = p;
    const resolved = buildABCD(store.topology, p).parameters;
    const paramId = paramSel.select.value;
    const min = Number(minIn.input.value), max = Number(maxIn.input.value);
    const log = logChk.input.checked;

    status.textContent = 'Running sweep, eigen-analysis, bifurcation diagram…';
    runBtn.disabled = true;
    results.replaceChildren();

    setTimeout(() => {
      const t0 = performance.now();
      try {
        renderAnalysis(results, store.topology, resolved, paramId, { min, max, log });
        status.textContent = `Done in ${Math.round(performance.now() - t0)} ms.`;
      } catch (err) {
        console.error(err);
        status.textContent = 'Error: ' + err.message;
      }
      runBtn.disabled = false;
    }, 30);
  });
}

function renderAnalysis(root, topology, p, paramId, range) {
  const paramLabel = (SWEEPABLE.find(s => s.id === paramId) || {}).label || paramId;

  const J0 = getJacobian(topology, p);
  const { eigenvalues: eig0, classification } = eigenvalues(J0);
  root.appendChild(banner(classification, eig0));

  const sw = sweepParameter(topology, p, paramId, { ...range, points: 48 });

  root.appendChild(h('Step 1 — Eigenvalue locus & bifurcation'));
  root.appendChild(stepText(
    `Sweeping ${paramLabel} from ${fmtNum(range.min)} to ${fmtNum(range.max)}. ` +
    (sw.bifurcation
      ? `A ${sw.bifurcation.type} bifurcation is detected at ${paramLabel} = ${fmtNum(sw.bifurcation.value)}` +
        (sw.bifurcation.type === 'Hopf' ? `, oscillating at ≈ ${sw.bifurcation.freqHz.toFixed(0)} Hz.` : '.')
      : 'No bifurcation found in this range — the system stays stable throughout.')));
  root.appendChild(plotCard('Eigenvalue locus (complex plane)', locusChart(sw)));
  root.appendChild(plotCard(`Max real part vs ${paramLabel}`, maxRealChart(sw, paramLabel, range.log)));

  root.appendChild(h('Step 2 — Bifurcation diagram'));
  root.appendChild(stepText(
    'Steady-state output voltage vs the swept parameter. A single line means one stable equilibrium; ' +
    'a fanning-out band after the bifurcation is the Hopf limit cycle.'));
  const bd = bifurcationDiagram(topology, p, paramId, { ...range, points: 24 });
  root.appendChild(plotCard(`vo steady-state vs ${paramLabel}`, bifChart(bd, paramLabel, range.log)));

  root.appendChild(h('Step 3 — Participation factors'));
  const pPart = { ...p };
  pPart[paramId] = sw.bifurcation ? sw.bifurcation.value * 1.15 : range.max;
  const part = modeParticipation(topology, pPart);
  root.appendChild(stepText(
    `Dominant mode at ${paramLabel} = ${fmtNum(pPart[paramId])}: λ = ${part.lambda.re.toFixed(1)} ± ` +
    `${Math.abs(part.lambda.im).toFixed(1)}j (${(Math.abs(part.lambda.im) / (2 * Math.PI)).toFixed(0)} Hz). ` +
    `Participation: DC ${(part.groups.DC * 100).toFixed(0)}%, ripple ${(part.groups.Ripple * 100).toFixed(0)}%, ` +
    `controller ${(part.groups.Controller * 100).toFixed(0)}%.`));
  root.appendChild(participationCard(part));

  root.appendChild(h('Step 4 — 2D stability map'));
  const secondId = paramId === 'L' ? 'Ki1' : 'L';
  const secLabel = (SWEEPABLE.find(s => s.id === secondId) || {}).label || secondId;
  root.appendChild(stepText(
    `Stable (blue) vs unstable (red) region over ${paramLabel} and ${secLabel}. ` +
    'The boundary is the bifurcation locus — a design map.'));
  const xSpec = { id: paramId, min: range.min, max: range.max, points: 20, log: range.log };
  const baseSecond = p[secondId];
  const ySpec = { id: secondId, min: baseSecond * 0.3, max: baseSecond * 3, points: 16, log: false };
  const map = stabilityMap2D(topology, p, xSpec, ySpec);
  root.appendChild(plotCard(`Stability region: ${paramLabel} vs ${secLabel}`, mapChart(map, paramLabel, secLabel)));

  root.appendChild(h('Frequency response (Bode)'));
  root.appendChild(stepText('Closed-loop response from reference to output, at the nominal operating point.'));
  const { A, B } = buildABCD(topology, p);
  const fr = frequencyResponse(A, B, { outputIdx: 1, wMin: 1, wMax: 2 * Math.PI * p.fs * 2, points: 300 });
  root.appendChild(plotCard('Bode magnitude', bodeMagChart(fr)));
  root.appendChild(plotCard('Bode phase', bodePhaseChart(fr)));

  // ---- Eigenvalue table (paper Tables 2/3) ----
  root.appendChild(h('Eigenvalue table'));
  root.appendChild(stepText(
    `All 8 eigenvalues at several values of ${paramLabel} — watch which complex pair moves toward Re = 0.`));
  const tbl = eigenvalueTable(topology, p, paramId, range, 6);
  root.appendChild(eigenTable(tbl, paramLabel));

  // ---- Heavy design study: on demand (it bisects at many points) ----
  root.appendChild(h('Design study — effect of L and C'));
  root.appendChild(stepText(
    'How the critical Ki1 (stability headroom) scales with the power-stage components. ' +
    'Key finding from the paper: Ki1_crit · L ≈ constant (L is the dominant knob), C has weak effect. ' +
    'This study bisects for Ki1_crit at many points, so it runs on demand.'));
  const studyBtn = document.createElement('button');
  studyBtn.textContent = 'Run L/C design study (slower)';
  studyBtn.className = 'secondary-btn';
  const studyOut = document.createElement('div');
  studyBtn.addEventListener('click', () => {
    studyBtn.disabled = true; studyBtn.textContent = 'Running design study…';
    setTimeout(() => {
      try { renderDesignStudy(studyOut, topology, p); }
      catch (err) { console.error(err); studyOut.textContent = 'Error: ' + err.message; }
      studyBtn.textContent = 'Re-run L/C design study'; studyBtn.disabled = false;
    }, 30);
  });
  root.append(studyBtn, studyOut);
}

function renderDesignStudy(root, topology, p) {
  root.replaceChildren();
  const lc = lcResonanceHz(p);

  const Lstudy = criticalScaling(topology, p, 'L', { min: p.L * 0.25, max: p.L * 4, points: 7 }, { min: 50, max: 200000 });
  root.appendChild(plotCard('Critical Ki1 vs L', critScaleChart(Lstudy, 'L (H)')));
  root.appendChild(plotCard('Ki1_crit × L (≈ constant?)', critProductChart(Lstudy, 'L (H)')));

  const Cstudy = criticalScaling(topology, p, 'C', { min: p.C * 0.33, max: p.C * 3, points: 6 }, { min: 50, max: 200000 });
  root.appendChild(plotCard('Critical Ki1 vs C (weak effect)', critScaleChart(Cstudy, 'C (F)')));

  const Lspread = ratioSpread(Lstudy.critKi1);
  const Cspread = ratioSpread(Cstudy.critKi1);
  root.appendChild(stepText(
    `Design-knob leverage: over the swept ranges, L changes Ki1_crit by ${Lspread.toFixed(1)}×, ` +
    `C by only ${Cspread.toFixed(1)}×. LC resonance ≈ ${lc.toFixed(0)} Hz. ` +
    `→ L is the dominant stability knob; minimise L within ripple limits for headroom.`));

  root.appendChild(h('Design surface — Ki1_crit(L, Kp1)'));
  root.appendChild(stepText('Engineer\u2019s lookup chart: maximum stable Ki1 for each (L, Kp1). Brighter = more headroom.'));
  const surf = designSurface(topology, p,
    { id: 'L', min: p.L * 0.3, max: p.L * 3, points: 12 },
    { id: 'Kp1', min: p.Kp1 * 0.3, max: p.Kp1 * 3, points: 10 },
    { min: 50, max: 200000 });
  root.appendChild(plotCard('Ki1_crit lookup (L horizontal, Kp1 vertical)', surfaceCard(surf, 'L (H)', 'Kp1')));
}

/* ---------- chart builders ---------- */
function locusChart(sw) {
  const reAll = [], imAll = [];
  for (const eigs of sw.eigs) for (const e of eigs) { reAll.push(e.re); imAll.push(e.im); }
  const imMin = Math.min(...imAll), imMax = Math.max(...imAll);
  return createChart({
    series: [
      { x: reAll, y: imAll, color: '#8b7ff0', marker: 'cross', label: 'eigenvalues (swept)' },
      { x: [0, 0], y: [imMin, imMax], color: '#c0392b', width: 1, dash: '5,4', label: 'Re = 0' },
    ],
    xLabel: 'Real part (1/s)', yLabel: 'Imag part (rad/s)',
  });
}
function maxRealChart(sw, paramLabel, log) {
  return createChart({
    series: [
      { x: sw.values, y: sw.maxReal, color: '#2b6cb0', width: 1.6, label: 'max Re(λ)' },
      { x: [sw.values[0], sw.values[sw.values.length - 1]], y: [0, 0], color: '#c0392b', width: 1, dash: '5,4', label: 'zero' },
    ],
    xLabel: paramLabel, yLabel: 'max real part (1/s)', xLog: !!log,
  });
}
function bifChart(bd, paramLabel, log) {
  return createChart({
    series: [
      { x: bd.values, y: bd.voMax, color: '#c0392b', width: 1.4, label: 'vo max' },
      { x: bd.values, y: bd.voMin, color: '#2b6cb0', width: 1.4, label: 'vo min' },
      { x: bd.values, y: bd.voMean, color: '#1e1e1c', width: 1.2, dash: '4,3', label: 'vo mean' },
    ],
    xLabel: paramLabel, yLabel: 'Output voltage (V)', xLog: !!log,
  });
}
function participationCard(part) {
  const card = document.createElement('div'); card.className = 'plot-card';
  const svgNS = 'http://www.w3.org/2000/svg';
  const W = 700, rowH = 30, top = 10, left = 60, barMax = 520;
  const H = top * 2 + part.perState.length * rowH;
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', '100%');
  const groupColor = (k) => (k < 2 ? '#2b6cb0' : k < 6 ? '#8b7ff0' : '#e0a23b');
  part.perState.forEach((v, k) => {
    const y = top + k * rowH;
    svg.appendChild(svgText(svgNS, left - 8, y + 16, part.labels[k], 'end', '#e3e6ee', 13));
    svg.appendChild(svgRect(svgNS, left, y + 4, barMax, rowH - 12, '#2a2742'));
    svg.appendChild(svgRect(svgNS, left, y + 4, Math.max(1, v * barMax), rowH - 12, groupColor(k)));
    svg.appendChild(svgText(svgNS, left + Math.max(1, v * barMax) + 6, y + 16, (v * 100).toFixed(0) + '%', 'start', '#cdd2db', 12));
  });
  const title = document.createElement('h3');
  title.textContent = 'Per-state participation (blue=DC, purple=ripple, amber=controller)';
  card.append(title, svg); return card;
}
function mapChart(map, xLabel, yLabel) {
  const sx = [], sy = [], ux = [], uy = [];
  for (let iy = 0; iy < map.yVals.length; iy++)
    for (let ix = 0; ix < map.xVals.length; ix++) {
      const mr = map.grid[iy][ix];
      if (mr > 1) { ux.push(map.xVals[ix]); uy.push(map.yVals[iy]); }
      else { sx.push(map.xVals[ix]); sy.push(map.yVals[iy]); }
    }
  return createChart({
    series: [
      { x: sx, y: sy, color: '#2b6cb0', marker: 'cross', label: 'stable' },
      { x: ux, y: uy, color: '#c0392b', marker: 'cross', label: 'unstable' },
    ],
    xLabel, yLabel,
  });
}
function bodeMagChart(fr) {
  return createChart({
    series: [{ x: fr.w, y: fr.magDb, color: '#2b6cb0', width: 1.6, label: '|Vo/Vref| (dB)' }],
    xLabel: 'Frequency (rad/s)', yLabel: 'Magnitude (dB)', xLog: true,
    xFmt: v => '10^' + Math.round(Math.log10(v)),
  });
}
function bodePhaseChart(fr) {
  return createChart({
    series: [{ x: fr.w, y: fr.phaseDeg, color: '#8b7ff0', width: 1.6, label: 'phase (°)' }],
    xLabel: 'Frequency (rad/s)', yLabel: 'Phase (degrees)', xLog: true,
    xFmt: v => '10^' + Math.round(Math.log10(v)),
  });
}

function critScaleChart(study, xLabel) {
  const xs = [], ys = [];
  study.values.forEach((v, i) => { if (isFinite(study.critKi1[i])) { xs.push(v); ys.push(study.critKi1[i]); } });
  return createChart({
    series: [{ x: xs, y: ys, color: '#2b6cb0', width: 1.8, marker: undefined, label: 'Ki1_crit' }],
    xLabel, yLabel: 'Critical Ki1',
  });
}
function critProductChart(study, xLabel) {
  const xs = [], ys = [];
  study.values.forEach((v, i) => { if (isFinite(study.product[i])) { xs.push(v); ys.push(study.product[i]); } });
  return createChart({
    series: [{ x: xs, y: ys, color: '#e0a23b', width: 1.8, label: 'Ki1_crit × L' }],
    xLabel, yLabel: 'Ki1_crit × L',
  });
}
function eigenTable(tbl, paramLabel) {
  const card = document.createElement('div'); card.className = 'plot-card';
  const t = document.createElement('h3'); t.textContent = 'Eigenvalues vs ' + paramLabel;
  const table = document.createElement('table'); table.className = 'eig-table';
  const head = document.createElement('tr');
  head.appendChild(thCell(paramLabel));
  head.appendChild(thCell('max Re(λ)'));
  head.appendChild(thCell('dominant pair (Hz)'));
  table.appendChild(head);
  tbl.values.forEach((v, i) => {
    const eigs = tbl.rows[i];
    const tr = document.createElement('tr');
    tr.appendChild(tdCell(fmtNum(v)));
    if (eigs.length) {
      const maxRe = Math.max(...eigs.map(e => e.re));
      const dom = [...eigs].sort((a, b) => b.re - a.re)[0];
      tr.appendChild(tdCell(maxRe.toFixed(1), maxRe > 1 ? 'unstable-cell' : ''));
      tr.appendChild(tdCell(Math.abs(dom.im) > 1 ? (Math.abs(dom.im) / (2 * Math.PI)).toFixed(0) : '—'));
    } else { tr.appendChild(tdCell('—')); tr.appendChild(tdCell('—')); }
    table.appendChild(tr);
  });
  card.append(t, table); return card;
}
function surfaceCard(surf, xLabel, yLabel) {
  // heatmap: brighter = higher Ki1_crit. Render as colored grid of rects.
  const card = document.createElement('div'); card.className = 'plot-card';
  const svgNS = 'http://www.w3.org/2000/svg';
  const W = 700, Hh = 460, ML = 70, MB = 50, MT = 14, MR = 14;
  const iw = W - ML - MR, ih = Hh - MT - MB;
  const nx = surf.xVals.length, ny = surf.yVals.length;
  // color scale over finite values
  const flat = surf.grid.flat().filter(isFinite);
  const vmin = Math.min(...flat), vmax = Math.max(...flat);
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`); svg.setAttribute('width', '100%');
  const cw = iw / nx, ch = ih / ny;
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const val = surf.grid[ny - 1 - iy][ix]; // flip y so larger y is up
      const x = ML + ix * cw, y = MT + iy * ch;
      const r = document.createElementNS(svgNS, 'rect');
      r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', cw + 0.5); r.setAttribute('height', ch + 0.5);
      r.setAttribute('fill', isFinite(val) ? heatColor((val - vmin) / (vmax - vmin || 1)) : '#23203a');
      svg.appendChild(r);
    }
  }
  // axis labels
  svg.appendChild(svgText(svgNS, ML + iw / 2, Hh - 12, xLabel, 'middle', '#e3e6ee', 13));
  const yl = svgText(svgNS, 18, MT + ih / 2, yLabel, 'middle', '#e3e6ee', 13);
  yl.setAttribute('transform', `rotate(-90 18 ${MT + ih / 2})`); svg.appendChild(yl);
  // min/max ticks
  svg.appendChild(svgText(svgNS, ML, Hh - 32, fmtNum(surf.xVals[0]), 'middle', '#aeb4c2', 11));
  svg.appendChild(svgText(svgNS, ML + iw, Hh - 32, fmtNum(surf.xVals[nx - 1]), 'middle', '#aeb4c2', 11));
  svg.appendChild(svgText(svgNS, ML - 6, MT + ih, fmtNum(surf.yVals[0]), 'end', '#aeb4c2', 11));
  svg.appendChild(svgText(svgNS, ML - 6, MT + 8, fmtNum(surf.yVals[ny - 1]), 'end', '#aeb4c2', 11));
  const t = document.createElement('h3'); t.textContent = `Ki1_crit (dark=low ${vmin.toFixed(0)} → bright=high ${vmax.toFixed(0)})`;
  card.append(t, svg); return card;
}
function heatColor(t) {
  // dark blue (low) -> purple -> amber (high)
  t = Math.max(0, Math.min(1, t));
  const c1 = [30, 35, 70], c2 = [139, 127, 240], c3 = [240, 180, 70];
  let r, g, b;
  if (t < 0.5) { const u = t / 0.5; r = lerp(c1[0], c2[0], u); g = lerp(c1[1], c2[1], u); b = lerp(c1[2], c2[2], u); }
  else { const u = (t - 0.5) / 0.5; r = lerp(c2[0], c3[0], u); g = lerp(c2[1], c3[1], u); b = lerp(c2[2], c3[2], u); }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function lerp(a, b, t) { return a + (b - a) * t; }
function ratioSpread(arr) {
  const f = arr.filter(isFinite);
  if (!f.length) return 1;
  return Math.max(...f) / Math.min(...f);
}
function thCell(text) { const th = document.createElement('th'); th.textContent = text; return th; }
function tdCell(text, cls) { const td = document.createElement('td'); td.textContent = text; if (cls) td.className = cls; return td; }

/* ---------- helpers ---------- */
function svgText(ns, x, y, str, anchor, fill, size) {
  const t = document.createElementNS(ns, 'text');
  t.setAttribute('x', x); t.setAttribute('y', y); t.setAttribute('text-anchor', anchor);
  t.setAttribute('fill', fill); t.setAttribute('font-size', size); t.textContent = str; return t;
}
function svgRect(ns, x, y, w, hh, fill) {
  const r = document.createElementNS(ns, 'rect');
  r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', w);
  r.setAttribute('height', hh); r.setAttribute('fill', fill); r.setAttribute('rx', 3); return r;
}
function section(titleText) {
  const s = document.createElement('section');
  const hh = document.createElement('h2'); hh.textContent = titleText; s.appendChild(hh); return s;
}
function h(text) { const e = document.createElement('h2'); e.textContent = text; e.className = 'stab-step'; return e; }
function stepText(text) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = text; return p; }
function plotCard(title, chartEl) {
  const card = document.createElement('div'); card.className = 'plot-card';
  const t = document.createElement('h3'); t.textContent = title; card.append(t, chartEl); return card;
}
function banner(classification, eigs) {
  const div = document.createElement('div'); div.className = 'stab-banner ' + classification;
  const maxRe = Math.max(...eigs.map(e => e.re));
  div.textContent = `Nominal: ${classification.toUpperCase()} — max real part ${maxRe.toFixed(1)} (1/s)`;
  return div;
}
function labeledSelect(label, opts, def) {
  const wrap = document.createElement('label'); wrap.className = 'stab-field';
  const span = document.createElement('span'); span.textContent = label;
  const select = document.createElement('select');
  for (const [val, text] of opts) { const o = document.createElement('option'); o.value = val; o.textContent = text; if (val === def) o.selected = true; select.appendChild(o); }
  wrap.append(span, select); return { wrap, select };
}
function labeledInput(label, def) {
  const wrap = document.createElement('label'); wrap.className = 'stab-field';
  const span = document.createElement('span'); span.textContent = label;
  const input = document.createElement('input'); input.type = 'text'; input.value = def; input.inputMode = 'decimal';
  wrap.append(span, input); return { wrap, input };
}
function labeledCheckbox(label, def) {
  const wrap = document.createElement('label'); wrap.className = 'stab-field stab-check';
  const input = document.createElement('input'); input.type = 'checkbox'; input.checked = def;
  const span = document.createElement('span'); span.textContent = label;
  wrap.append(input, span); return { wrap, input };
}
