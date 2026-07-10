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

export function assertProductionSecrets({ sessionSecret, masterKey }) {
  if (typeof sessionSecret === 'string' && sessionSecret.length < 64) {
    throw new Error('SESSION_SECRET must contain at least 64 characters in production.');
  }

  if (!/^[A-Za-z0-9+/]{43}=$/.test(masterKey || '')) {
    throw new Error('HELLODEPLOY_MASTER_KEY must be a base64-encoded 32-byte key.');
  }
  const decoded = Buffer.from(masterKey, 'base64');
  if (decoded.length !== 32) {
    throw new Error('HELLODEPLOY_MASTER_KEY must be a base64-encoded 32-byte key.');
  }
}
