/**
 * Results panel — renders the ABCD matrices, operating point, and eigenvalues.
 *
 *   renderResults(container, { A, B, C, D, op, parameters });
 */

import { eigenvalues } from '../core/analysis.js';
import { exportAs, fileNameFor } from '../utils/export.js';
import { renderComparison } from './comparison.js';

export function renderResults(container, result, meta = {}) {
  container.replaceChildren();

  const { A, B, op, parameters } = result;

  // --- Export buttons ---
  container.appendChild(sectionTitle('Export model'));
  container.appendChild(exportBar(result, meta));

  // --- Operating point ---
  container.appendChild(sectionTitle('Operating point'));
  const opList = document.createElement('div');
  opList.className = 'op-list';
  for (const [k, v] of Object.entries(op)) {
    const item = document.createElement('span');
    item.innerHTML = `<code>${k}</code> = ${fmt(v)}`;
    opList.appendChild(item);
  }
  container.appendChild(opList);

  // --- Effective gains used (shows auto-tuned values) ---
  container.appendChild(sectionTitle('Controller gains used'));
  const gains = document.createElement('div');
  gains.className = 'op-list';
  ['Kp1', 'Ki1', 'Kp2', 'Ki2'].forEach(k => {
    if (parameters[k] != null) {
      const item = document.createElement('span');
      item.innerHTML = `<code>${k}</code> = ${fmt(parameters[k])}`;
      gains.appendChild(item);
    }
  });
  container.appendChild(gains);

  // --- A matrix ---
  container.appendChild(sectionTitle('A matrix (8×8)'));
  container.appendChild(matrixTable(A));

  // --- B vector ---
  container.appendChild(sectionTitle('B vector (8×1)'));
  container.appendChild(matrixTable(B));

  // --- Eigenvalues / stability ---
  container.appendChild(sectionTitle('Eigenvalues & stability'));
  try {
    const { eigenvalues: eigs, classification } = eigenvalues(A);
    const badge = document.createElement('div');
    badge.className = 'stability-badge ' + classification;
    const labels = {
      stable: '✓ Stable (all poles in left half-plane)',
      marginal: '○ Marginally stable (pole on imaginary axis — expected from integrators)',
      unstable: '✗ Unstable (pole in right half-plane)',
    };
    badge.textContent = labels[classification];
    container.appendChild(badge);

    const eigList = document.createElement('div');
    eigList.className = 'eig-list';
    eigs.forEach((e, i) => {
      const row = document.createElement('span');
      const imStr = e.im === 0 ? '' : (e.im > 0 ? ` + ${fmt(e.im)}j` : ` − ${fmt(-e.im)}j`);
      row.innerHTML = `<code>λ${i + 1}</code> = ${fmt(e.re)}${imStr}`;
      eigList.appendChild(row);
    });
    container.appendChild(eigList);
  } catch (err) {
    const warn = document.createElement('p');
    warn.className = 'hint';
    warn.textContent = `Eigenvalues unavailable: ${err.message}`;
    container.appendChild(warn);
  }

  // --- Switching vs GSSAM comparison ---
  container.appendChild(sectionTitle('Switching vs GSSAM comparison'));
  try {
    const cmpWrap = document.createElement('div');
    renderComparison(cmpWrap, meta.topology, result.parameters, meta.modelMode || 'linearized');
    container.appendChild(cmpWrap);
  } catch (err) {
    const warn = document.createElement('p');
    warn.className = 'hint';
    warn.textContent = `Comparison unavailable: ${err.message}`;
    container.appendChild(warn);
  }
}

function sectionTitle(text) {
  const h = document.createElement('h3');
  h.textContent = text;
  return h;
}

function exportBar(result, meta) {
  const bar = document.createElement('div');
  bar.className = 'export-bar';

  const formats = [
    { fmt: 'm',    label: 'MATLAB (.m)',  type: 'text/plain' },
    { fmt: 'py',   label: 'Python (.py)', type: 'text/x-python' },
    { fmt: 'json', label: 'JSON',         type: 'application/json' },
  ];

  // --- split dropdown: "Export" + caret ---
  const dropdown = document.createElement('div');
  dropdown.className = 'export-dropdown';

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'export-btn export-main';
  main.innerHTML = '<span>Export model</span><span class="caret">▾</span>';

  const menu = document.createElement('div');
  menu.className = 'export-menu';
  menu.hidden = true;

  for (const { fmt, label, type } of formats) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'export-menu-item';
    item.textContent = label;
    item.addEventListener('click', () => {
      menu.hidden = true;
      try {
        downloadText(exportAs(fmt, result, meta), fileNameFor(fmt, meta), type);
      } catch (err) { console.error(err); alert('Export failed: ' + err.message); }
    });
    menu.appendChild(item);
  }

  main.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener('click', () => { menu.hidden = true; });

  dropdown.append(main, menu);
  bar.appendChild(dropdown);

  // --- copy button ---
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'export-btn secondary';
  copyBtn.innerHTML = '<span class="ci">⧉</span> Copy MATLAB';
  copyBtn.addEventListener('click', async () => {
    const label = copyBtn.innerHTML;
    try {
      await navigator.clipboard.writeText(exportAs('m', result, meta));
      copyBtn.textContent = 'Copied ✓';
    } catch {
      copyBtn.textContent = 'Copy failed';
    }
    setTimeout(() => { copyBtn.innerHTML = label; }, 1500);
  });
  bar.appendChild(copyBtn);

  return bar;
}

function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


function matrixTable(M) {
  const table = document.createElement('table');
  table.className = 'matrix';
  for (const row of M) {
    const tr = document.createElement('tr');
    for (const v of row) {
      const td = document.createElement('td');
      td.textContent = fmt(v);
      if (v === 0) td.classList.add('zero');
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  return table;
}

function fmt(v) {
  if (v === 0) return '0';
  if (!isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a >= 1e4 || a < 1e-3) return v.toExponential(3);
  return v.toFixed(4).replace(/\.?0+$/, '');
}
