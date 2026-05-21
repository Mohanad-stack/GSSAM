/**
 * Export the computed ABCD model in formats the user can drop into
 * MATLAB / Simulink / Python.
 *
 *   exportAs('json', result) -> string
 *   exportAs('py',   result) -> string  (a runnable Python snippet using numpy)
 *   exportAs('m',    result) -> string  (a MATLAB script)
 *   exportAs('mat',  result) -> Blob    (binary .mat — needs a small lib)
 */

export function exportAs(format, result) {
  switch (format) {
    case 'json':
      return JSON.stringify(result, null, 2);
    case 'py':
      throw new Error('export.py: not implemented yet');
    case 'm':
      throw new Error('export.m: not implemented yet');
    case 'mat':
      throw new Error('export.mat: not implemented yet (needs a mat-file lib)');
    default:
      throw new Error(`exportAs: unknown format "${format}"`);
  }
}
