/**
 * Whether a caller-supplied path may be redirected to.
 *
 * Checking only that a value starts with `/` is not enough. Browsers follow the
 * URL specification, which treats a backslash the same as a forward slash while
 * parsing, so `/\evil.com` resolves to `https://evil.com/` — a working open
 * redirect that a leading-slash test accepts.
 *
 * Rather than enumerate the ways a string can escape, resolve it and check
 * where it actually points.
 *
 * @param {unknown} candidate
 * @returns {boolean}
 */
export function isSafeReturnPath(candidate) {
  if (typeof candidate !== 'string' || !candidate.startsWith('/')) {
    return false;
  }

  try {
    // Any origin works; what matters is whether resolution stays inside it.
    const base = 'https://internal.invalid';
    return new URL(candidate, base).origin === base;
  } catch {
    return false;
  }
}
