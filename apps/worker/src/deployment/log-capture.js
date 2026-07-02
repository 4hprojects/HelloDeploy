// Patterns that must never appear in stored deployment logs
const REDACT_PATTERNS = [
  // GitHub tokens (classic + fine-grained PATs)
  /ghp_[A-Za-z0-9]{36}/g,
  /ghs_[A-Za-z0-9]{36}/g,
  /ghu_[A-Za-z0-9]{36}/g,
  /gho_[A-Za-z0-9]{36}/g,
  /ghr_[A-Za-z0-9]{36}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  // AWS access keys + generic AWS secret assignment
  /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
  /aws_secret_access_key\s*[=:]\s*[^\s&]*/gi,
  // Generic bearer/token patterns
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /x-access-token:[^@\s]*/gi,
  // npm tokens
  /npm_[A-Za-z0-9]{36}/g,
  // Generic secrets (key=value format)
  /(?:password|secret|token|key|credential)=[^\s&]*/gi,
];

/**
 * Redact known secret patterns from a log line before storage.
 * Lines are capped at 2000 chars to prevent log bloat.
 *
 * @param {string} line
 * @returns {string}
 */
export function redactLogLine(line) {
  let redacted = line;
  for (const pattern of REDACT_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted.slice(0, 2000);
}

/**
 * Split a buffer from child process output into individual lines,
 * redact each, and return the array.
 *
 * @param {Buffer} buffer
 * @returns {string[]}
 */
export function processOutputLines(buffer) {
  return buffer
    .toString('utf8')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .map(redactLogLine);
}
