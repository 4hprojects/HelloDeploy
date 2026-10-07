import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit IV — standard for GCM; must be unique per encryption

// Rotation model: version 1 is always HELLODEPLOY_MASTER_KEY (unchanged from
// pre-rotation behavior — every existing installation's stored secrets are
// version 1 and must keep decrypting with this var alone, with no other
// env var required). Version 2 exists only while HELLODEPLOY_MASTER_KEY_NEXT
// is set, during an active rotation window.
//
// To rotate the master key:
//   1. Generate a new key and set it as HELLODEPLOY_MASTER_KEY_NEXT (leave
//      HELLODEPLOY_MASTER_KEY as-is).
//   2. Restart — existing (version 1) secrets keep decrypting via
//      HELLODEPLOY_MASTER_KEY; new encryptions use HELLODEPLOY_MASTER_KEY_NEXT
//      and are stamped version 2.
//   3. Run scripts/rotate-master-key.js to re-encrypt every stored secret
//      under the new key (bumping each record to version 2).
//   4. Once every record is version 2, promote: set HELLODEPLOY_MASTER_KEY to
//      the value that was in HELLODEPLOY_MASTER_KEY_NEXT, then unset
//      HELLODEPLOY_MASTER_KEY_NEXT. The system is back to a single active key.
const VERSION_PRIMARY = 1;
const VERSION_NEXT = 2;

function decodeKey(envVarName, b64) {
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error(`${envVarName} must decode to exactly 32 bytes`);
  }
  return key;
}

function getMasterKey() {
  const b64 = process.env.HELLODEPLOY_MASTER_KEY;
  if (!b64) {
    throw new Error('HELLODEPLOY_MASTER_KEY is not set');
  }
  return decodeKey('HELLODEPLOY_MASTER_KEY', b64);
}

function getNextKey() {
  const b64 = process.env.HELLODEPLOY_MASTER_KEY_NEXT;
  if (!b64) {
    return null;
  }
  return decodeKey('HELLODEPLOY_MASTER_KEY_NEXT', b64);
}

function getKeyForVersion(version) {
  if (version === VERSION_PRIMARY) {
    return getMasterKey();
  }
  if (version === VERSION_NEXT) {
    // During rotation, version 2 belongs to the next key. After promotion,
    // HELLODEPLOY_MASTER_KEY holds that same key and NEXT is deliberately
    // unset, so version-2 records must fall back to the promoted primary.
    return getNextKey() ?? getMasterKey();
  }
  throw new Error(`Unsupported encryption version: ${version}`);
}

/**
 * Build the additional authenticated data that ties a ciphertext to one record.
 *
 * Without it a ciphertext is valid wherever it is pasted, so anyone able to write
 * to the collection could copy another project's secret into a project they own
 * and read the plaintext back through reveal or a deploy. GCM authenticates this
 * value without storing it, and the pair below is the record's identity — the
 * same pair the collection's unique index is built on.
 *
 * @param {{ projectId: unknown, name: string }} record
 * @returns {Buffer}
 */
export function buildSecretAad({ projectId, name }) {
  return Buffer.from(`${String(projectId)}:${name}`, 'utf8');
}

export function buildNotificationAad(notificationId) {
  return Buffer.from(`notification:${String(notificationId)}`, 'utf8');
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns the pieces needed to store and later decrypt.
 *
 * Uses HELLODEPLOY_MASTER_KEY_NEXT (version 2) when a rotation is in
 * progress, otherwise HELLODEPLOY_MASTER_KEY (version 1) — never stored.
 *
 * `aad` binds the result to a single record. It is reported back as `aadBound`
 * so the caller can record whether decryption will need it: key choice and AAD
 * are independent, and folding both into `version` would make the version space
 * combinatorial.
 *
 * @param {string} plaintext
 * @param {Buffer} [aad]
 * @returns {{ ciphertext: string, iv: string, authTag: string, version: number,
 *   aadBound: boolean }} All Buffer values are base64-encoded strings.
 */
export function encrypt(plaintext, aad) {
  const nextKey = getNextKey();
  const key = nextKey ?? getMasterKey();
  const version = nextKey ? VERSION_NEXT : VERSION_PRIMARY;
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  if (aad) {
    cipher.setAAD(aad);
  }
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes for AES-GCM

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    version,
    aadBound: Boolean(aad),
  };
}

/**
 * Decrypt a previously encrypted payload.
 * Throws if authentication fails (tampered data) or version is unsupported.
 *
 * `aad` must be passed exactly when the record was written with it — records
 * predating AAD binding carry `aadBound: false` and decrypt without one. There is
 * deliberately no retry without AAD on failure: that would turn a real
 * authentication failure, which is the signal a ciphertext was moved, into a
 * silent success.
 *
 * @param {{ ciphertext: string, iv: string, authTag: string, version: number,
 *   aad?: Buffer }} payload
 * @returns {string} plaintext
 */
export function decrypt({ ciphertext, iv, authTag, version, aad }) {
  const key = getKeyForVersion(version);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  if (aad) {
    decipher.setAAD(aad);
  }

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

export { VERSION_PRIMARY, VERSION_NEXT };
