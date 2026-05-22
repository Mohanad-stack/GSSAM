/**
 * Static plots — pole-zero map, step response, Bode. Each uses the interactive
 * createChart() helper, so all support drag-to-zoom and double-click reset.
 */

import { eigenvalues, stepResponse, frequencyResponse } from '../core/analysis.js';
import { createChart } from './chart.js';

const C_SW = '#2b6cb0', C_REF = '#8a8a82', C_BAD = '#c0392b';

export function renderPlots(container, result) {
  const { A, B } = result;
  container.appendChild(card('Pole-zero map', poleZero(A)));
  container.appendChild(card('Step response of output voltage', stepPlot(A, B)));
  container.appendChild(card('Bode — reference to output voltage', bodePlot(A, B)));
}

function card(title, chartEl) {
  const c = document.createElement('div');
  c.className = 'plot-card';
  const h = document.createElement('h3');
  h.textContent = title;
  c.append(h, chartEl);
  return c;
}

function poleZero(A) {
  const { eigenvalues: eigs } = eigenvalues(A);
  const stableX = [], stableY = [], unstableX = [], unstableY = [];
  for (const e of eigs) {
    if (e.re > 1e-3) { unstableX.push(e.re); unstableY.push(e.im); }
    else { stableX.push(e.re); stableY.push(e.im); }
  }
  const maxRe = Math.max(1, ...eigs.map(e => Math.abs(e.re)));
  const series = [
    { x: [0, 0], y: [-1e12, 1e12], color: C_REF, width: 1, dash: '4 3', label: 'jω axis' },
    { x: stableX, y: stableY, color: C_SW, marker: 'cross', label: 'pole (×)' },
  ];
  if (unstableX.length) series.push({ x: unstableX, y: unstableY, color: C_BAD, marker: 'cross', label: 'unstable pole' });
  return createChart({
    series,
    xLabel: 'Real axis  (1/s)', yLabel: 'Imag axis  (rad/s)',
  });
}

function stepPlot(A, B) {
  const { t, y } = stepResponse(A, B, { outputIdx: 1, stepValue: 1 });
  const tMs = t.map(v => v * 1e3);
  return createChart({
    series: [
      { x: [tMs[0], tMs[tMs.length - 1]], y: [1, 1], color: C_REF, width: 1, dash: '4 3', label: 'reference = 1' },
      { x: tMs, y, color: C_SW, width: 1.8, label: 'vo (normalized)' },
    ],
    xLabel: 'Time  (ms)', yLabel: 'vo / Vref',
  });
}

function bodePlot(A, B) {
  const { w, magDb } = frequencyResponse(A, B, { outputIdx: 1, wMin: 1, wMax: 1e7, points: 300 });
  return createChart({
    series: [
      { x: [w[0], w[w.length - 1]], y: [0, 0], color: C_REF, width: 1, dash: '4 3', label: '0 dB' },
      { x: w, y: magDb, color: C_SW, width: 1.8, label: 'Vo / Vref' },
    ],
    xLog: true,
    xLabel: 'Frequency  (rad/s)', yLabel: 'Magnitude  (dB)',
    xFmt: v => '10^' + Math.round(Math.log10(v)),
  });
}
