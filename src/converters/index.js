/**
 * Central registry of available topologies.
 * Adding a new converter: import it here and add to the array.
 */

import { buck } from './buck.js';
import { boost } from './boost.js';
import { buckboost } from './buckboost.js';

export const topologies = [buck, boost, buckboost];

export function getTopology(id) {
  return topologies.find(t => t.id === id);
}
