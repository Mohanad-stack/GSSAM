/**
 * Auto-generates a parameter input form from a topology descriptor.
 *
 * Contract: takes a descriptor, returns a DOM element. Reads back values
 * via the returned `getValues()` function. Tunable parameters whose input
 * is empty come back as `null`, which the engine interprets as "auto-tune".
 *
 * Usage:
 *   const { element, getValues } = renderParamForm(topology);
 *   document.getElementById('params').replaceChildren(element);
 *   button.onclick = () => buildABCD(topology, getValues());
 */

export function renderParamForm(topology) {
  // TODO: render the form
  throw new Error('renderParamForm: not implemented yet');
}
