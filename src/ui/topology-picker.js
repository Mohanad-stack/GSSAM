/**
 * Topology picker — renders a set of selectable tiles, one per available topology.
 * Emits a callback when the selection changes.
 */

import { topologies } from '../converters/index.js';

export function renderTopologyPicker(onSelect) {
  const wrap = document.createElement('div');
  wrap.className = 'topology-tiles';

  let selected = null;

  topologies.forEach((topo) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'topology-tile';
    tile.dataset.id = topo.id;

    const title = document.createElement('span');
    title.className = 'topology-tile-title';
    title.textContent = topo.label;

    const desc = document.createElement('span');
    desc.className = 'topology-tile-desc';
    desc.textContent = topo.description;

    tile.append(title, desc);

    tile.addEventListener('click', () => {
      if (selected) selected.classList.remove('selected');
      tile.classList.add('selected');
      selected = tile;
      onSelect(topo);
    });

    wrap.appendChild(tile);
  });

  return wrap;
}
