import { boost } from './src/converters/boost.js';
import { buckboost } from './src/converters/buckboost.js';
function show(name, topo) {
  const p = Object.fromEntries(topo.parameters.map(x => [x.id, x.default]));
  const op = topo.operatingPoint(p);
  const { A, B } = topo.buildAB(p, op);
  const fmt = v => v === 0 ? '0' : (Math.abs(v) >= 1000 || Math.abs(v) < 0.001 ? v.toExponential(4) : v.toFixed(4));
  console.log(`\n========== ${name} ==========`);
  console.log('d_ss =', op.d_ss.toFixed(4), ' q0 =', op.q0.toFixed(4));
  console.log('A:');
  A.forEach(r => console.log('  [' + r.map(fmt).join(', ') + ']'));
  console.log('B:', '[' + B.map(r => fmt(r[0])).join(', ') + ']');
}
show('BOOST', boost);
show('BUCK-BOOST', buckboost);
