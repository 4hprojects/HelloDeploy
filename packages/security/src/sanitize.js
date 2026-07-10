// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]');

/**
 * True if `value` contains a newline or other control character. Used to
 * guard any value that gets interpolated into a generated file (Dockerfile
 * RUN/CMD, shell-adjacent config) — a newline would let the value inject
 * arbitrary directives.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function hasControlChars(value) {
  return CONTROL_CHARS.test(value);
}

/**
 * Throws if `value` contains a control character. Intended for a second,
 * independent check right before interpolation, so a write path that
 * bypassed the primary form validator still can't inject directives.
 *
 * @param {string} value
 * @param {string} label — used in the error message
 */
export function assertNoControlChars(value, label) {
  if (hasControlChars(value)) {
    throw new Error(`${label} must not contain line breaks or control characters.`);
  }
}
