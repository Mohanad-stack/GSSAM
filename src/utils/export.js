/**
 * Export the computed ABCD model in formats the user can drop into
 * MATLAB / Simulink / Python.
 *
 *   exportAs('json', result) -> string
 *   exportAs('py',   result) -> string  (runnable Python: numpy + scipy StateSpace)
 *   exportAs('m',    result) -> string  (runnable MATLAB script that rebuilds A,B,C,D)
 *
 * `result` is the object returned by buildABCD():
 *   { A, B, C, D, op, parameters }
 */

const STATE_NAMES = ['iL0', 'vo0', 'iLR', 'iLI', 'voR', 'voI', 'ev_int', 'ei_int'];

export function exportAs(format, result, meta = {}) {
  switch (format) {
    case 'json': return toJSON(result, meta);
    case 'py':   return toPython(result, meta);
    case 'm':    return toMatlab(result, meta);
    default:
      throw new Error(`exportAs: unknown format "${format}"`);
  }
}

export function fileNameFor(format, meta = {}) {
  const base = (meta.topologyId || 'gssam') + '_abcd';
  const ext = format === 'py' ? 'py' : format === 'm' ? 'm' : 'json';
  return `${base}.${ext}`;
}

function toJSON(result, meta) {
  const payload = {
    generatedBy: 'GSSAM Web Tool',
    topology: meta.topologyLabel || meta.topologyId || 'unknown',
    stateOrder: STATE_NAMES,
    parameters: result.parameters,
    operatingPoint: result.op,
    A: result.A,
    B: result.B,
    C: result.C,
    D: result.D,
  };
  return JSON.stringify(payload, null, 2);
}

function toPython(result, meta) {
  const header = commentBlock('#', meta, result);
  const sym = symbolicComment('#', meta);
  return `${header}
import numpy as np
from scipy import signal

# State order: ${STATE_NAMES.join(', ')}
${sym}A = np.array(${pyMatrix(result.A)})

B = np.array(${pyMatrix(result.B)})

C = np.array(${pyMatrix(result.C)})

D = np.array(${pyMatrix(result.D)})

# Closed-loop GSSAM state-space model (input = reference voltage Vr)
sys = signal.StateSpace(A, B, C, D)

if __name__ == "__main__":
    eigs = np.linalg.eigvals(A)
    print("Eigenvalues:")
    for e in eigs:
        print(f"  {e.real:12.4f} {'+' if e.imag >= 0 else '-'} {abs(e.imag):12.4f}j")
    print("Max real part:", max(e.real for e in eigs))
`;
}

function toMatlab(result, meta) {
  const header = commentBlock('%', meta, result);
  const sym = symbolicComment('%', meta);
  return `${header}
% State order: ${STATE_NAMES.join(', ')}
${sym}A = ${mMatrix(result.A)};

B = ${mMatrix(result.B)};

C = ${mMatrix(result.C)};

D = ${mMatrix(result.D)};

% Closed-loop GSSAM state-space model (input = reference voltage Vr)
sys = ss(A, B, C, D);

% Quick checks
fprintf('Eigenvalues:\\n');
disp(eig(A));
`;
}

// Build the symbolic A/B as an aligned comment block, e.g.
//   % A = [  0,   -1/L,  ... ;
//   %        1/C, ...        ];
//   % B = [ 1/L; 0; ... ]
function symbolicComment(c, meta) {
  const sym = meta.topology && meta.topology.symbolic;
  if (!sym) return '';
  const lines = [];
  lines.push(`${c} Symbolic form (matches the numeric matrices below):`);
  if (sym.note) lines.push(`${c}   where ${sym.note}`);

  // column widths for alignment
  const cols = sym.A[0].length;
  const widths = new Array(cols).fill(0);
  for (const row of sym.A) row.forEach((v, j) => { widths[j] = Math.max(widths[j], v.length); });

  sym.A.forEach((row, i) => {
    const cells = row.map((v, j) => v.padStart(widths[j])).join(', ');
    const open = i === 0 ? 'A = [ ' : '      ';
    const close = i === sym.A.length - 1 ? ' ]' : ';';
    lines.push(`${c} ${open}${cells}${close}`);
  });

  lines.push(`${c} B = [ ${sym.B.join('; ')} ]`);
  lines.push(c);
  return lines.join('\n') + '\n';
}

function commentBlock(c, meta, result) {
  const lines = [
    `${c} GSSAM Web Tool export`,
    `${c} Topology: ${meta.topologyLabel || meta.topologyId || 'unknown'}`,
    `${c} Generated: ${new Date().toISOString()}`,
    `${c}`,
    `${c} Parameters:`,
  ];
  for (const [k, v] of Object.entries(result.parameters)) {
    if (v != null) lines.push(`${c}   ${k} = ${v}`);
  }
  return lines.join('\n');
}

function num(v) {
  if (v === 0) return '0';
  if (!isFinite(v)) return String(v);
  return Number(v.toPrecision(12)).toString();
}

function pyMatrix(M) {
  const rows = M.map(r => '    [' + r.map(num).join(', ') + ']');
  return '[\n' + rows.join(',\n') + '\n]';
}

function mMatrix(M) {
  const rows = M.map(r => '    ' + r.map(num).join(', '));
  return '[\n' + rows.join(';\n') + '\n]';
}
