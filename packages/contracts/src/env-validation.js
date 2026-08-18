/** Read a required environment variable, throwing if it is unset/empty. */
export function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Read an optional environment variable, falling back to `defaultValue`. */
export function optional(name, defaultValue) {
  return process.env[name] ?? defaultValue;
}

export function parseIntegerEnv(name, rawValue, { min, max }) {
  if (!/^-?\d+$/.test(String(rawValue))) {
    throw new Error(`${name} must be an integer.`);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }
  return value;
}

export function parseHostnameEnv(name, rawValue) {
  const value = String(rawValue ?? '')
    .trim()
    .toLowerCase();
  const label = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
  const hostname = new RegExp(`^(?=.{1,253}$)(?:${label}\\.)+${label}$`);
  if (!hostname.test(value)) {
    throw new Error(`${name} must be a valid hostname without a scheme, port, path, or wildcard.`);
  }
  return value;
}

export function assertPairedEnvironment(firstName, firstValue, secondName, secondValue) {
  if (Boolean(firstValue) !== Boolean(secondValue)) {
    throw new Error(`${firstName} and ${secondName} must either both be set or both be unset.`);
  }
}

export function assertAllOrNoneEnvironment(entries, integrationName) {
  const configured = entries.filter(([, value]) => Boolean(value));
  if (configured.length !== 0 && configured.length !== entries.length) {
    const missing = entries.filter(([, value]) => !value).map(([name]) => name);
    throw new Error(
      `${integrationName} configuration is incomplete. Missing: ${missing.join(', ')}.`,
    );
  }
}

function decodeProductionMasterKey(name, value) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value || '')) {
    throw new Error(`${name} must be a base64-encoded 32-byte key.`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32) {
    throw new Error(`${name} must be a base64-encoded 32-byte key.`);
  }
  if (decoded.equals(Buffer.alloc(32))) {
    throw new Error(
      `${name} must not be the all-zero development placeholder. Generate a real key with scripts/generate-secrets.js.`,
    );
  }
  return decoded;
}

export function assertProductionSecrets({ sessionSecret, masterKey, nextMasterKey }) {
  if (typeof sessionSecret === 'string' && sessionSecret.length < 64) {
    throw new Error('SESSION_SECRET must contain at least 64 characters in production.');
  }

  const primary = decodeProductionMasterKey('HELLODEPLOY_MASTER_KEY', masterKey);
  if (nextMasterKey) {
    const next = decodeProductionMasterKey('HELLODEPLOY_MASTER_KEY_NEXT', nextMasterKey);
    if (next.equals(primary)) {
      throw new Error('HELLODEPLOY_MASTER_KEY_NEXT must differ from HELLODEPLOY_MASTER_KEY.');
    }
  }
}
