/**
 * Auto-generates a parameter input form from a topology descriptor.
 *
 * Returns { element, getValues }. Tunable parameters left empty come back
 * as `null`, which the engine interprets as "auto-tune".
 */

export function renderParamForm(topology) {
  const form = document.createElement('div');
  form.className = 'param-form';

  const inputs = {};

  // Split into power-stage params and controller gains for visual grouping
  const powerParams = topology.parameters.filter(p => !p.tunable);
  const gainParams  = topology.parameters.filter(p => p.tunable);

  form.appendChild(makeGroup('Power stage', powerParams, inputs));
  form.appendChild(makeGroup('Controller gains (leave blank to auto-tune)', gainParams, inputs));

  function getValues() {
    const values = {};
    for (const param of topology.parameters) {
      const raw = inputs[param.id].value.trim();
      if (raw === '') {
        values[param.id] = param.tunable ? null : NaN;
      } else {
        values[param.id] = Number(raw);
      }
    }
    return values;
  }

  return { element: form, getValues };
}

function makeGroup(legendText, params, inputs) {
  const group = document.createElement('fieldset');
  group.className = 'param-group';

  const legend = document.createElement('legend');
  legend.textContent = legendText;
  group.appendChild(legend);

  const grid = document.createElement('div');
  grid.className = 'param-grid';

  for (const param of params) {
    const field = document.createElement('label');
    field.className = 'param-field';

    const name = document.createElement('span');
    name.className = 'param-label';
    name.textContent = param.unit ? `${param.label} (${param.unit})` : param.label;

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.className = 'param-input';
    input.placeholder = param.tunable ? 'auto' : '';
    if (param.default != null) input.value = String(param.default);

    inputs[param.id] = input;
    field.append(name, input);
    grid.appendChild(field);
  }

  group.appendChild(grid);
  return group;
}
