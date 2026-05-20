/**
 * Linear analysis on the closed-loop ABCD model.
 *
 * Builds on the result of buildABCD(). Everything here is OPTIONAL — the user
 * gets a valid ABCD even if these helpers throw.
 */

/**
 * Eigenvalues of A. Stability = all real parts strictly negative.
 *
 * For v0, we can use a small library (e.g. ml-matrix). Once that's wired in,
 * fill this in.
 *
 * @returns {{ eigenvalues: Array<{re:number, im:number}>, stable: boolean }}
 */
export function eigenvalues(A) {
  throw new Error('eigenvalues: not implemented yet — wire in ml-matrix or math.js');
}

/**
 * Compute the transfer function from input u (col index of B) to output y (row
 * index of C) symbolically as numerator/denominator polynomials.
 */
export function transferFunction(A, B, C, D, inputIdx = 0, outputIdx = 0) {
  throw new Error('transferFunction: not implemented yet');
}

/**
 * Time-domain step response by direct integration of dX/dt = A*X + B*u.
 * For an 8-state LTI system this is fast in pure JS.
 */
export function stepResponse(A, B, C, D, opts = {}) {
  throw new Error('stepResponse: not implemented yet');
}
