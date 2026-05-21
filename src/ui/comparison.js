/**
 * Switching vs GSSAM comparison UI.
 *
 * Renders a "Run" control and two overlay charts (iL and vo). Each chart
 * supports MATLAB-style drag-to-zoom (drag a box) and double-click to reset —
 * so the user can inspect the steady-state ripple wherever they like.
 */

import { simulateSwitchingVsGssam } from '../core/simulate.js';
import { createChart, fmtNum } from './chart.js';

const C_SW = '#2b6cb0', C_GS = '#c0392b', C_DC = '#1e1e1c';

export function renderComparison(container, topology, parameters) {
  container.replaceChildren();

  if (!topology.switching) {
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = 'Switching comparison not available for this topology yet.';
    container.appendChild(note);
    return;
  }

  const controls = document.createElement('div');
  controls.className = 'sim-controls';

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.textContent = 'Run switching vs GSSAM';

  const cyclesLabel = document.createElement('label');
  cyclesLabel.className = 'sim-cycles';
  cyclesLabel.append(document.createTextNode('Cycles: '));
  const cyclesInput = document.createElement('input');
  cyclesInput.type = 'number';
  cyclesInput.value = '300';
  cyclesInput.min = '20';
  cyclesInput.max = '3000';
  cyclesInput.step = '20';
  cyclesLabel.appendChild(cyclesInput);

  const tip = document.createElement('span');
  tip.className = 'hint';
  tip.textContent = 'Tip: drag a box on a plot to zoom · double-click to reset';

  controls.append(runBtn, cyclesLabel, tip);
  container.appendChild(controls);

  const plotsWrap = document.createElement('div');
  plotsWrap.className = 'plots-wrap';
  container.appendChild(plotsWrap);

  const status = document.createElement('p');
  status.className = 'hint';
  container.appendChild(status);

  function run() {
    const cycles = Math.max(20, Math.min(3000, Number(cyclesInput.value) || 300));
    status.textContent = 'Simulating…';
    runBtn.disabled = true;
    setTimeout(() => {
      try {
        const t0 = performance.now();
        const r = simulateSwitchingVsGssam(topology, parameters, { cycles });
        const ms = (performance.now() - t0).toFixed(0);
        plotsWrap.replaceChildren();
        plotsWrap.appendChild(card('Inductor current iL', overlay(r, 'iL')));
        plotsWrap.appendChild(card('Output voltage vo', overlay(r, 'vo')));
        status.textContent = `Done in ${ms} ms — ${r.cycles} switching cycles.`;
      } catch (err) {
        console.error(err);
        status.textContent = 'Simulation failed: ' + err.message;
      } finally {
        runBtn.disabled = false;
      }
    }, 20);
  }

  runBtn.addEventListener('click', run);
}

function card(title, chartEl) {
  const c = document.createElement('div');
  c.className = 'plot-card';
  const h = document.createElement('h3');
  h.textContent = title;
  c.append(h, chartEl);
  return c;
}

function overlay(r, which) {
  const sw = which === 'iL' ? r.iL_sw : r.vo_sw;
  const gs = which === 'iL' ? r.iL_gs : r.vo_gs;
  const dc = which === 'iL' ? r.iL0_gs : r.vo0_gs;
  const toMs = a => a.map(v => v * 1e3);
  return createChart({
    series: [
      { x: toMs(r.tg), y: gs, color: C_GS, width: 1.3, label: 'GSSAM' },
      { x: toMs(r.t), y: sw, color: C_SW, width: 1.0, label: 'switching' },
      { x: toMs(r.tg), y: dc, color: C_DC, width: 1.5, label: 'GSSAM average' },
    ],
    xLabel: 'Time  (ms)',
    yLabel: which === 'iL' ? 'Inductor current  (A)' : 'Output voltage  (V)',
    xFmt: fmtNum, yFmt: fmtNum,
  });
}
