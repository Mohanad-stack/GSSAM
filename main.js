/**
 * App shell + router. Top-level tabs:
 *   Linearized | Nonlinear | Stability analysis | Design
 *
 * Topology + parameters live in a shared `store`, so switching tabs keeps the
 * same converter. Linearized and Nonlinear share the model-page component and
 * differ only in which GSSAM the comparison runs. Stability and Design are
 * stubs for now.
 */

import { renderModelPage } from './src/pages/model-page.js';
import { renderStabilityPage } from './src/pages/stability-page.js';
import { renderDesignPage } from './src/pages/design-page.js';

const store = { topology: null, parameters: null };

const TABS = [
  { id: 'linearized', label: 'Linearized',
    render: (mount) => renderModelPage(mount, store, {
      modelMode: 'linearized',
      blurb: 'Linearized GSSAM: the 8-state model is frozen at the operating point. ' +
             'Exact near steady state; its startup transient will not match the switching converter.',
    }) },
  { id: 'nonlinear', label: 'Nonlinear',
    render: (mount) => renderModelPage(mount, store, {
      modelMode: 'nonlinear',
      blurb: 'Nonlinear GSSAM: the duty is recomputed from the live states each step, ' +
             'so it tracks the full startup transient — matching the switching converter from t=0.',
    }) },
  { id: 'stability', label: 'Stability analysis',
    render: (mount) => renderStabilityPage(mount, store) },
  { id: 'design', label: 'Design',
    render: (mount) => renderDesignPage(mount, store) },
];

const nav = document.getElementById('tab-nav');
const content = document.getElementById('page-content');
let activeId = 'linearized';

function renderNav() {
  nav.replaceChildren();
  for (const tab of TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn' + (tab.id === activeId ? ' active' : '');
    btn.textContent = tab.label;
    btn.addEventListener('click', () => { activeId = tab.id; route(); });
    nav.appendChild(btn);
  }
}

function route() {
  renderNav();
  const tab = TABS.find(t => t.id === activeId) || TABS[0];
  try {
    tab.render(content);
  } catch (err) {
    console.error(err);
    content.replaceChildren();
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Error loading this tab: ' + err.message;
    content.appendChild(p);
  }
}

route();
