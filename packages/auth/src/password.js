import argon2 from 'argon2';

// Conservative settings suited for a resource-constrained single VPS.
// Exceeds OWASP minimum recommendations for Argon2id.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MB
  timeCost: 2,
  parallelism: 1,
};

// Prevent DoS via extremely long password inputs; 72 is bcrypt's native limit,
// using 128 keeps parity with common policy while being safe for Argon2.
const MAX_PASSWORD_BYTES = 128;

/**
 * Hash a plaintext password for storage.
 * @param {string} plaintext
 * @returns {Promise<string>} Argon2id hash string
 */
export async function hashPassword(plaintext) {
  if (!plaintext || plaintext.length > MAX_PASSWORD_BYTES) {
    throw new Error('Password length out of accepted range');
  }
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}

/**
 * Verify a plaintext password against a stored Argon2 hash.
 * Returns false instead of throwing on mismatch to prevent timing leaks.
 * @param {string} hash - Stored hash
 * @param {string} plaintext - Submitted password
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(hash, plaintext) {
  if (!plaintext || plaintext.length > MAX_PASSWORD_BYTES) {
    return false;
  }
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}
