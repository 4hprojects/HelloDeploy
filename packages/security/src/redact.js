/**
 * Patterns that must never appear in logs or error messages.
 * Add new patterns as more sensitive fields are introduced.
 */
const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'confirmPassword',
  'currentPassword',
  'newPassword',
  'token',
  'resetToken',
  'verificationToken',
  'csrfToken',
  'sessionToken',
  'secret',
  'encryptionKey',
  'masterKey',
  'apiKey',
  'privateKey',
  'webhookSecret',
  'turnstileToken',
  '_csrf',
]);

/**
 * Recursively redact sensitive keys from an object before logging.
 * Returns a new object — does not mutate the original.
 */
export function redactObject(obj, depth = 0) {
  if (depth > 10 || obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = REDACTED;
    } else {
      result[key] = redactObject(value, depth + 1);
    }
  }
  return result;
}

/** Redact a request body object for safe audit logging. */
export function redactBody(body) {
  return redactObject(body ?? {});
}
