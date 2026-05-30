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

/**
 * Auto-range defaults per parameter. Given the parameter's nominal value,
 * returns sensible min/max for the sweep. Gains can span very wide ranges
 * (the bifurcation is often 100× nominal or nominal/100), while power-stage
 * components stay within ~0.3-3× nominal of practical designs.
 */
function defaultRange(paramId, nominal) {
  if (!Number.isFinite(nominal) || nominal === 0) {
    return { Kp1: [0.001, 1], Ki1: [10, 50000], Kp2: [0.001, 1], Ki2: [10, 5000],
             L: [10e-6, 5e-3], C: [10e-6, 1e-3], R: [1, 100] }[paramId] || [0.1, 100];
  }
  switch (paramId) {
    case 'Kp1':
    case 'Kp2': return [nominal * 0.05, nominal * 2];
    case 'Ki1':
    case 'Ki2': return [nominal * 0.5, nominal * 200];
    case 'L':   return [nominal * 0.2, nominal * 3];
    case 'C':   return [nominal * 0.2, nominal * 4];
    case 'R':   return [nominal * 0.3, nominal * 3];
    default:    return [nominal * 0.1, nominal * 10];
  }
}

/** Compact, readable formatting for an auto-filled range value. */
function formatRangeNum(v) {
  if (!Number.isFinite(v)) return '';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1000 || a < 0.001) return v.toExponential(2).replace('e+', 'e').replace('e-0', 'e-').replace('e+0','e');
  if (a >= 10) return v.toFixed(0);
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.01) return v.toFixed(4);
  return v.toFixed(5);
}

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
  // Forward-declared: assigned below once controls exist
  let autoFillRange = () => {};
  const picker = renderTopologyPicker((topology) => {
    store.topology = topology;
    currentForm = renderParamForm(topology, store.parameters);
    formWrap.replaceChildren(currentForm.element);
    runBtn.disabled = false;
    autoFillRange();
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
  const minIn = labeledInput('Min', '');
  const maxIn = labeledInput('Max', '');
  minIn.input.placeholder = 'auto';
  maxIn.input.placeholder = 'auto';
  const logChk = labeledCheckbox('Log scale', false);
  logChk.wrap.title = 'Off: sweep points evenly spaced linearly.\n' +
    'On: points evenly spaced in log10. Use when the parameter spans decades ' +
    'or you don\'t know where the bifurcation is.';
  const resSel = labeledSelect('Resolution', [
    ['low',  'Low (fast)'],
    ['med',  'Medium (default)'],
    ['high', 'High (smooth, slower)'],
  ], 'med');
  resSel.wrap.title = 'Higher resolution = smoother plots but slower. Low ~3 s, Med ~7 s, High ~20 s.';
  controls.append(paramSel.wrap, minIn.wrap, maxIn.wrap, logChk.wrap, resSel.wrap);
  const runBtn = document.createElement('button');
  runBtn.textContent = 'Run stability analysis';
  runBtn.disabled = !store.topology;
  controls.appendChild(runBtn);
  ctrlSection.appendChild(controls);
  mount.appendChild(ctrlSection);

  // Auto min/max: prefill when the user selects a different parameter, unless
  // they have manually entered a value. We auto-fill on topology pick and on
  // sweep-parameter change; manual edits in between are honored until the user
  // clears the field or changes the sweep parameter.
  autoFillRange = () => {
    if (!store.topology || !currentForm) return;
    const params = currentForm.getValues();
    const nominal = params[paramSel.select.value];
    const [mn, mx] = defaultRange(paramSel.select.value, Number(nominal));
    minIn.input.value = formatRangeNum(mn);
    maxIn.input.value = formatRangeNum(mx);
  };
  paramSel.select.addEventListener('change', autoFillRange);
  // initial fill if a topology is already selected
  if (store.topology) autoFillRange();

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
    const res = resSel.select.value;

    status.textContent = 'Running sweep, eigen-analysis, bifurcation diagram…';
    runBtn.disabled = true;
    results.replaceChildren();

    setTimeout(() => {
      const t0 = performance.now();
      try {
        renderAnalysis(results, store.topology, resolved, paramId, { min, max, log }, res);
        status.textContent = `Done in ${Math.round(performance.now() - t0)} ms.`;
      } catch (err) {
        console.error(err);
        status.textContent = 'Error: ' + err.message;
      }
      runBtn.disabled = false;
    }, 30);
  });
}

function renderAnalysis(root, topology, p, paramId, range, res = 'med') {
  // Resolution presets: drive points for sweep / bifurcation diagram / 2D map / surface
  const RES = {
    low:  { sw: 30, bd: 18, mapX: 14, mapY: 12 },
    med:  { sw: 60, bd: 32, mapX: 22, mapY: 18 },
    high: { sw: 120, bd: 64, mapX: 36, mapY: 28 },
  }[res] || { sw: 60, bd: 32, mapX: 22, mapY: 18 };
  const paramLabel = (SWEEPABLE.find(s => s.id === paramId) || {}).label || paramId;

  const J0 = getJacobian(topology, p);
  const { eigenvalues: eig0, classification } = eigenvalues(J0);
  root.appendChild(banner(classification, eig0));

  const sw = sweepParameter(topology, p, paramId, { ...range, points: RES.sw });

  // Headline summary — the one-glance "what's the critical parameter" card.
  root.appendChild(bifurcationSummaryCard(paramLabel, paramId, p[paramId], sw));

  root.appendChild(h('Step 1 — Eigenvalue locus & bifurcation'));
  // Build a clearer status text using the new bifurcation + firstCrossing
  let bifText = `Sweeping ${paramLabel} from ${fmtNum(range.min)} to ${fmtNum(range.max)}. `;
  if (sw.bifurcation) {
    const f = sw.bifurcation.freqHz;
    bifText += `Slow-mode ${sw.bifurcation.type} bifurcation at ${paramLabel} = ${fmtNum(sw.bifurcation.value)}` +
      (sw.bifurcation.type === 'Hopf' && f > 0 ? ` (≈ ${f.toFixed(0)} Hz)` : '') + '.';
    if (sw.firstCrossing && sw.firstCrossing.value < sw.bifurcation.value) {
      bifText += ` An additional crossing also appears at ${fmtNum(sw.firstCrossing.value)} (${sw.firstCrossing.type}).`;
    }
  } else if (sw.firstCrossing) {
    bifText += `Crossing at ${paramLabel} = ${fmtNum(sw.firstCrossing.value)} (${sw.firstCrossing.type}, fast mode).`;
  } else {
    bifText += 'No bifurcation in this range — stable throughout.';
  }
  root.appendChild(stepText(bifText));
  const bifVal = sw.bifurcation ? sw.bifurcation.value : (sw.firstCrossing ? sw.firstCrossing.value : null);
  root.appendChild(plotCard('Eigenvalue locus (complex plane)', locusChart(sw, bifVal)));
  // Zoomed-in view of the slow region (paper-style — focuses on modes near the imag axis)
  root.appendChild(plotCard('Eigenvalue locus — slow region zoom',
    locusChart(sw, bifVal, { slow: true, fs: p.fs })));
  root.appendChild(plotCard(`Max real part vs ${paramLabel}`, maxRealChart(sw, paramLabel, range.log)));

  root.appendChild(h('Step 2 — Bifurcation diagram'));
  root.appendChild(stepText(
    'Steady-state output voltage vs the swept parameter. A single line means one stable equilibrium; ' +
    'a fanning-out band after the bifurcation is the Hopf limit cycle.'));
  const bd = bifurcationDiagram(topology, p, paramId, { ...range, points: RES.bd });
  root.appendChild(plotCard(`vo steady-state vs ${paramLabel}`, bifChart(bd, paramLabel, range.log)));

  root.appendChild(h('Step 3 — Participation factors'));
  const pPart = { ...p };
  if (sw.bifurcation) {
    // Determine destabilizing direction: which side of the bifurcation has positive max-real?
    const idxNearBif = sw.values.findIndex(v => v >= sw.bifurcation.value);
    const goingUp = idxNearBif >= 0 && idxNearBif < sw.maxRealSlow.length - 1 &&
                    sw.maxRealSlow[idxNearBif + 1] > sw.maxRealSlow[Math.max(0, idxNearBif - 1)];
    // step 5% past bifurcation in the destabilizing direction
    pPart[paramId] = sw.bifurcation.value * (goingUp ? 1.05 : 0.95);
  } else {
    pPart[paramId] = range.max;
  }
  const part = modeParticipation(topology, pPart);
  const f = Math.abs(part.lambda.im) / (2 * Math.PI);
  root.appendChild(stepText(
    `Dominant slow mode at ${paramLabel} = ${fmtNum(pPart[paramId])}: ` +
    `λ = ${part.lambda.re.toFixed(1)}${Math.abs(part.lambda.im) > 1 ? ` ± ${Math.abs(part.lambda.im).toFixed(1)}j (${f.toFixed(0)} Hz)` : ' (real)'}.  ` +
    `Participation: DC ${(part.groups.DC * 100).toFixed(0)}%, ripple ${(part.groups.Ripple * 100).toFixed(0)}%, ` +
    `controller ${(part.groups.Controller * 100).toFixed(0)}%.`));
  root.appendChild(participationCard(part));
  root.appendChild(participation3DCard(part.allFactors, part.allEigenvalues, part.labels));

  root.appendChild(h('Step 4 — 2D stability map'));
  const secondId = paramId === 'L' ? 'Ki1' : 'L';
  const secLabel = (SWEEPABLE.find(s => s.id === secondId) || {}).label || secondId;
  root.appendChild(stepText(
    `Stable (blue) vs unstable (red) region over ${paramLabel} and ${secLabel}. ` +
    'The boundary is the bifurcation locus — a design map.'));
  const xSpec = { id: paramId, min: range.min, max: range.max, points: RES.mapX, log: range.log };
  const baseSecond = p[secondId];
  const ySpec = { id: secondId, min: baseSecond * 0.3, max: baseSecond * 3, points: RES.mapY, log: false };
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
      try { renderDesignStudy(studyOut, topology, p, res); }
      catch (err) { console.error(err); studyOut.textContent = 'Error: ' + err.message; }
      studyBtn.textContent = 'Re-run L/C design study'; studyBtn.disabled = false;
    }, 30);
  });
  root.append(studyBtn, studyOut);
}

function renderDesignStudy(root, topology, p, res = 'med') {
  root.replaceChildren();
  const lc = lcResonanceHz(p);

  // Resolution -> point counts. Higher = smoother curves, slower bisection.
  const RES = {
    low:  { lc: 9,  surfX: 10, surfY: 8 },
    med:  { lc: 15, surfX: 14, surfY: 12 },
    high: { lc: 25, surfX: 22, surfY: 18 },
  }[res] || { lc: 15, surfX: 14, surfY: 12 };

  const Lstudy = criticalScaling(topology, p, 'L', { min: p.L * 0.25, max: p.L * 4, points: RES.lc }, { min: 50, max: 200000 });
  root.appendChild(plotCard('Critical Ki1 vs L', critScaleChart(Lstudy, 'L (H)')));
  root.appendChild(plotCard('Ki1_crit × L (≈ constant?)', critProductChart(Lstudy, 'L (H)')));

  const Cstudy = criticalScaling(topology, p, 'C', { min: p.C * 0.33, max: p.C * 3, points: RES.lc }, { min: 50, max: 200000 });
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
    { id: 'L', min: p.L * 0.3, max: p.L * 3, points: RES.surfX },
    { id: 'Kp1', min: p.Kp1 * 0.3, max: p.Kp1 * 3, points: RES.surfY },
    { min: 50, max: 200000 });
  root.appendChild(plotCard('Ki1_crit lookup (L horizontal, Kp1 vertical)', surfaceCard(surf, 'L (H)', 'Kp1')));
}

/* ---------- chart builders ---------- */

/**
 * Match eigenvalues across sweep steps so each eigenvalue has a coherent
 * trajectory (the eigensolver returns them in arbitrary order each call).
 * Greedy nearest-neighbour assignment from one step to the next.
 * Returns: tracks[k] = [{re, im, value}, ...] for each of N eigenvalues.
 */
function buildEigenTracks(sw) {
  const N = sw.eigs[0] ? sw.eigs[0].length : 0;
  if (!N) return [];
  // start: tracks initialized with first column
  const tracks = sw.eigs[0].map(e => [{ re: e.re, im: e.im, value: sw.values[0] }]);
  for (let i = 1; i < sw.eigs.length; i++) {
    const prev = tracks.map(t => t[t.length - 1]);
    const curr = sw.eigs[i].slice();
    const taken = new Array(curr.length).fill(false);
    // For each previous endpoint, pick the unassigned current eig with min distance
    for (let k = 0; k < prev.length; k++) {
      let bestJ = -1, bestD = Infinity;
      for (let j = 0; j < curr.length; j++) {
        if (taken[j]) continue;
        const dr = curr[j].re - prev[k].re, di = curr[j].im - prev[k].im;
        const d = dr * dr + di * di;
        if (d < bestD) { bestD = d; bestJ = j; }
      }
      if (bestJ >= 0) {
        taken[bestJ] = true;
        tracks[k].push({ re: curr[bestJ].re, im: curr[bestJ].im, value: sw.values[i] });
      }
    }
  }
  return tracks;
}

// 8-mode color palette (distinct, accessible on the light plot panel)
const MODE_COLORS = [
  '#2b6cb0', '#c0392b', '#27ae60', '#8e44ad',
  '#e67e22', '#16a085', '#d4ac0d', '#7f8c8d',
];

function locusChart(sw, bifValue, opts = {}) {
  const tracks = buildEigenTracks(sw);
  if (!tracks.length) return createChart({ series: [] });

  // For the slow-region zoom, restrict each track to points whose |im| is below
  // a slow-band threshold (e.g. 0.3 * fs in Hz). The track itself is unchanged;
  // we just hand the chart a y-axis clip range so the fast modes fall off-plot.
  const fs = opts.fs || 40e3;
  const slowImLimit = 2 * Math.PI * 0.3 * fs;

  // Build series: one line per eigenvalue trajectory + endpoint markers + bifurcation markers
  const series = [];
  for (let k = 0; k < tracks.length; k++) {
    const tk = tracks[k];
    const color = MODE_COLORS[k % MODE_COLORS.length];
    // In slow mode, only include tracks that ever dip into the slow band
    if (opts.slow && !tk.some(p => Math.abs(p.im) < slowImLimit)) continue;
    series.push({
      x: tk.map(p => p.re), y: tk.map(p => p.im),
      color, width: 1.4, label: `λ${k + 1}`,
    });
  }
  // start markers (green circles) and end markers (red triangles) for each track
  const filteredTracks = opts.slow ? tracks.filter(t => t.some(p => Math.abs(p.im) < slowImLimit)) : tracks;
  const startX = filteredTracks.map(t => t[0].re), startY = filteredTracks.map(t => t[0].im);
  const endX = filteredTracks.map(t => t[t.length - 1].re), endY = filteredTracks.map(t => t[t.length - 1].im);
  series.push({ x: startX, y: startY, color: '#27ae60', marker: 'circle', markerOnly: true, markerSize: 5, label: 'start (nominal)' });
  series.push({ x: endX, y: endY, color: '#c0392b', marker: 'triangle', markerOnly: true, markerSize: 6, label: 'end of sweep' });

  // bifurcation markers (black squares): the eigenvalues at the bifurcation value, if known
  if (bifValue != null && Number.isFinite(bifValue)) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < sw.values.length; i++) {
      const d = Math.abs(sw.values[i] - bifValue);
      if (d < bd) { bd = d; bi = i; }
    }
    const bifEigs = (sw.eigs[bi] || []).filter(e => !opts.slow || Math.abs(e.im) < slowImLimit);
    series.push({
      x: bifEigs.map(e => e.re), y: bifEigs.map(e => e.im),
      color: '#1e1e1c', marker: 'square', markerOnly: true, markerSize: 5,
      label: 'at bifurcation',
    });
  }

  // Re=0 axis as dashed reference
  let allIm;
  if (opts.slow) {
    allIm = filteredTracks.flatMap(t => t.filter(p => Math.abs(p.im) < slowImLimit).map(p => p.im));
  } else {
    allIm = tracks.flatMap(t => t.map(p => p.im));
  }
  if (!allIm.length) allIm = [-1, 1];
  const imMin = Math.min(...allIm), imMax = Math.max(...allIm);
  series.push({ x: [0, 0], y: [imMin, imMax], color: '#c0392b', width: 1, dash: '5,4', label: 'Re = 0' });

  return createChart({
    series,
    xLabel: 'Real part (1/s)',
    yLabel: 'Imag part (rad/s)',
  });
}
function maxRealChart(sw, paramLabel, log) {
  const series = [
    { x: sw.values, y: sw.maxReal, color: '#2b6cb0', width: 1.6, label: 'max Re(λ) overall' },
  ];
  if (sw.maxRealSlow && sw.maxRealSlow.some(v => Number.isFinite(v))) {
    series.push({ x: sw.values, y: sw.maxRealSlow, color: '#e0a23b', width: 1.6, dash: '6,3', label: 'max Re(λ) slow mode' });
  }
  series.push({ x: [sw.values[0], sw.values[sw.values.length - 1]], y: [0, 0], color: '#c0392b', width: 1, dash: '5,4', label: 'zero' });
  return createChart({ series, xLabel: paramLabel, yLabel: 'max real part (1/s)', xLog: !!log });
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

/**
 * 3D participation chart — Zhang Figure 9 analogue.
 * Isometric SVG bar chart: 8 eigenvalues (front-to-back) × 8 state variables
 * (left-to-right) × P value (height). Each bar colored by height with a
 * cyan-yellow-red colormap. Bars are drawn back-to-front, painter's algorithm.
 */
function participation3DCard(perEigenFactors, eigs, stateLabels) {
  const card = document.createElement('div'); card.className = 'plot-card';
  const title = document.createElement('h3');
  title.textContent = 'Participation factors — all modes vs all states';
  card.appendChild(title);

  const svgNS = 'http://www.w3.org/2000/svg';
  const W = 780, H = 480;
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', '100%');

  const N = 8;
  const cellW = 38, depthW = 26;
  const dx_dep = depthW * Math.cos(Math.PI / 6);
  const dy_dep = -depthW * Math.sin(Math.PI / 6);
  const heightUnit = 360;
  const ox = 130;
  const oy = 410;

  // pmax for normalization (with floor so empty rows still render axes sensibly)
  let pmax = 0;
  for (const row of perEigenFactors) for (const v of row) if (v > pmax) pmax = v;
  if (pmax < 0.1) pmax = 0.1;

  // Mode label = frequency (or "DC" for real eigenvalues). Per-row colors from
  // the report's blue/orange/yellow/purple palette, repeated as needed.
  const MODE_PALETTE = [
    '#3b82f6',  // blue
    '#f97316',  // orange
    '#eab308',  // yellow
    '#a855f7',  // purple
    '#10b981',  // green
    '#ef4444',  // red
    '#06b6d4',  // cyan
    '#f59e0b',  // amber
  ];
  const modeLabel = (j) => {
    const e = eigs[j];
    if (!e) return '';
    if (Math.abs(e.im) < 1) return 'DC';
    const f = Math.abs(e.im) / (2 * Math.PI);
    if (f >= 1000) return (f / 1000).toFixed(1) + ' kHz';
    return f.toFixed(0) + ' Hz';
  };
  const modeColor = (j) => MODE_PALETTE[j % MODE_PALETTE.length];

  // floor grid
  const floorPath = document.createElementNS(svgNS, 'path');
  let d = `M ${ox} ${oy} `;
  for (let i = 1; i <= N; i++) {
    const x = ox + i * cellW;
    d += `L ${x} ${oy} L ${x + N * dx_dep} ${oy + N * dy_dep} M ${x} ${oy} `;
  }
  d += `M ${ox} ${oy} L ${ox + N * dx_dep} ${oy + N * dy_dep} `;
  for (let j = 1; j <= N; j++) {
    const sx = ox + j * dx_dep, sy = oy + j * dy_dep;
    d += `L ${sx + N * cellW} ${sy} M ${sx} ${sy} `;
  }
  floorPath.setAttribute('d', d);
  floorPath.setAttribute('fill', 'none');
  floorPath.setAttribute('stroke', '#3a3858');
  floorPath.setAttribute('stroke-width', '0.6');
  svg.appendChild(floorPath);

  // bars: back-to-front for painter's algorithm. Color is per-mode (depth row).
  for (let j = N - 1; j >= 0; j--) {
    const fillCol = modeColor(j);
    const sideCol = darken(fillCol, 0.72);
    const topCol = lighten(fillCol, 1.1);
    for (let i = 0; i < N; i++) {
      const v = perEigenFactors[j] ? perEigenFactors[j][i] : 0;
      if (v < 0.005) continue;
      const h = (v / pmax) * heightUnit;
      const FL = [ox + i * cellW + 4 + j * dx_dep, oy + j * dy_dep];
      const FR = [FL[0] + cellW - 8,               FL[1]];
      const BR = [FR[0] + dx_dep * 0.85,           FR[1] + dy_dep * 0.85];
      const BL = [FL[0] + dx_dep * 0.85,           FL[1] + dy_dep * 0.85];
      const tFL = [FL[0], FL[1] - h];
      const tFR = [FR[0], FR[1] - h];
      const tBR = [BR[0], BR[1] - h];
      const tBL = [BL[0], BL[1] - h];
      // right side, front face, top
      addPolygon(svg, svgNS, [FR, BR, tBR, tFR], sideCol, 0.9);
      addPolygon(svg, svgNS, [FL, FR, tFR, tFL], fillCol, 0.95);
      addPolygon(svg, svgNS, [tFL, tFR, tBR, tBL], topCol, 1);
      // Value label on tall bars (P >= 0.30) — keeps the chart legible
      if (v >= 0.30) {
        const lblX = (tFL[0] + tBR[0]) / 2;
        const lblY = (tFL[1] + tBR[1]) / 2 - 4;
        const t = svgText(svgNS, lblX, lblY, v.toFixed(2), 'middle', '#e3e6ee', 11);
        t.setAttribute('font-weight', '700');
        t.setAttribute('stroke', '#1c1a30');
        t.setAttribute('stroke-width', '0.6');
        t.setAttribute('paint-order', 'stroke');
        svg.appendChild(t);
      }
    }
  }

  // x-axis labels (state variables) under the front edge
  for (let i = 0; i < N; i++) {
    const x = ox + i * cellW + cellW / 2;
    svg.appendChild(svgText(svgNS, x, oy + 18, stateLabels[i], 'middle', '#cdd2db', 11));
  }
  // depth-axis labels (mode frequency) at the right edge of each row
  for (let j = 0; j < N; j++) {
    const sx = ox + N * cellW + j * dx_dep + 10;
    const sy = oy + j * dy_dep + 4;
    svg.appendChild(svgText(svgNS, sx, sy, modeLabel(j), 'start', '#cdd2db', 11));
  }
  // z-axis (P) ticks
  for (const frac of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const tickY = oy - frac * heightUnit;
    svg.appendChild(svgText(svgNS, ox - 6, tickY + 4, (frac * pmax).toFixed(2), 'end', '#aeb4c2', 10));
    const ln = document.createElementNS(svgNS, 'line');
    ln.setAttribute('x1', ox - 2); ln.setAttribute('y1', tickY);
    ln.setAttribute('x2', ox); ln.setAttribute('y2', tickY);
    ln.setAttribute('stroke', '#aeb4c2'); ln.setAttribute('stroke-width', '0.6');
    svg.appendChild(ln);
  }
  // axis titles
  svg.appendChild(svgText(svgNS, ox - 40, oy - heightUnit / 2, 'P', 'middle', '#e3e6ee', 14));
  svg.appendChild(svgText(svgNS, ox + N * cellW / 2, oy + 38, 'State variables', 'middle', '#e3e6ee', 12));
  svg.appendChild(svgText(svgNS, ox + N * cellW + N * dx_dep / 2 + 30, oy + N * dy_dep / 2 - 6,
                          'Mode (frequency)', 'start', '#e3e6ee', 12));

  card.appendChild(svg);
  return card;
}

function lighten(rgb, factor) {
  const m = rgb.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!m) return rgb;
  const r = Math.min(255, Math.round(parseInt(m[1], 16) * factor));
  const g = Math.min(255, Math.round(parseInt(m[2], 16) * factor));
  const b = Math.min(255, Math.round(parseInt(m[3], 16) * factor));
  return `rgb(${r},${g},${b})`;
}

function addPolygon(svg, ns, pts, fill, alpha) {
  const p = document.createElementNS(ns, 'polygon');
  p.setAttribute('points', pts.map(c => `${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' '));
  p.setAttribute('fill', fill);
  p.setAttribute('fill-opacity', alpha);
  p.setAttribute('stroke', '#1c1a30');
  p.setAttribute('stroke-width', '0.4');
  svg.appendChild(p);
}
function darken(rgb, factor) {
  const m = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return rgb;
  return `rgb(${Math.round(+m[1] * factor)},${Math.round(+m[2] * factor)},${Math.round(+m[3] * factor)})`;
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

/**
 * One-glance "headline" card naming the critical parameter, the bifurcation
 * type, its value, frequency, and the margin from the nominal operating point.
 */
function bifurcationSummaryCard(paramLabel, paramId, nominalValue, sw) {
  const card = document.createElement('div');
  card.className = 'plot-card stab-bif-summary';
  const title = document.createElement('h3');
  title.textContent = 'Bifurcation summary';
  card.appendChild(title);

  const tbl = document.createElement('table');
  tbl.className = 'stab-bif-table';
  const row = (k, v) => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); td1.textContent = k;
    const td2 = document.createElement('td'); td2.textContent = v;
    tr.append(td1, td2); tbl.appendChild(tr);
  };

  row('Sweep parameter', paramLabel);
  row('Nominal value', fmtNum(nominalValue));

  if (sw.bifurcation) {
    const b = sw.bifurcation;
    const margin = nominalValue !== 0 ? (b.value / nominalValue) : NaN;
    row('Bifurcation type', b.type);
    row('Critical value', fmtNum(b.value));
    if (b.type === 'Hopf' && b.freqHz > 0) row('Oscillation frequency', `${b.freqHz.toFixed(0)} Hz`);
    if (Number.isFinite(margin)) {
      const marginStr = margin > 1
        ? `${margin.toFixed(1)}× nominal`
        : `nominal / ${(1 / margin).toFixed(1)}`;
      row('Margin from nominal', marginStr);
    }
    if (sw.firstCrossing && Math.abs(sw.firstCrossing.value - b.value) > 1e-3) {
      row('Additional crossing', `${fmtNum(sw.firstCrossing.value)} (${sw.firstCrossing.type})`);
    }
  } else if (sw.firstCrossing) {
    row('Crossing type', sw.firstCrossing.type);
    row('Crossing value', fmtNum(sw.firstCrossing.value));
    if (sw.firstCrossing.freqHz > 0) row('Frequency', `${sw.firstCrossing.freqHz.toFixed(0)} Hz`);
  } else {
    row('Result', 'No bifurcation in the swept range — stable throughout.');
  }
  card.appendChild(tbl);
  return card;
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
