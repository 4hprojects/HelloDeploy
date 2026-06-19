import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit IV — standard for GCM; must be unique per encryption
const CURRENT_VERSION = 1;

function getMasterKey() {
  const b64 = process.env.HELLODEPLOY_MASTER_KEY;
  if (!b64) {
    throw new Error('HELLODEPLOY_MASTER_KEY is not set');
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error('HELLODEPLOY_MASTER_KEY must decode to exactly 32 bytes');
  }
  return key;
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns the pieces needed to store and later decrypt.
 * The master key is loaded from HELLODEPLOY_MASTER_KEY env var — never stored.
 *
 * @param {string} plaintext
 * @returns {{ ciphertext: string, iv: string, authTag: string, version: number }}
 *   All Buffer values are base64-encoded strings.
 */
export function encrypt(plaintext) {
  const key = getMasterKey();
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes for AES-GCM

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    version: CURRENT_VERSION,
  };
}

/**
 * Decrypt a previously encrypted payload.
 * Throws if authentication fails (tampered data) or version is unsupported.
 *
 * @param {{ ciphertext: string, iv: string, authTag: string, version: number }} payload
 * @returns {string} plaintext
 */
export function decrypt({ ciphertext, iv, authTag, version }) {
  if (version !== CURRENT_VERSION) {
    throw new Error(`Unsupported encryption version: ${version}`);
  }
  const key = getMasterKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
