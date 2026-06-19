import { randomBytes, createHash } from 'node:crypto';

/** Generate a cryptographically secure random token as a hex string. */
export function generateRawToken(byteLength = 32) {
  return randomBytes(byteLength).toString('hex');
}

/**
 * Hash a raw token with SHA-256 for safe storage.
 * The raw token is sent to the user; only the hash is stored in the database.
 */
export function hashToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Generate a token and its hash in one step. */
export function generateToken(byteLength = 32) {
  const raw = generateRawToken(byteLength);
  return { raw, hash: hashToken(raw) };
}
