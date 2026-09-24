import { createHash } from 'node:crypto';

export function publicEnvironment(values) {
  const result = {};
  for (const name of Object.keys(values).sort()) {
    if (!name.startsWith('NEXT_PUBLIC_')) {
      continue;
    }
    const value = values[name];
    if (
      !/^NEXT_PUBLIC_[A-Z0-9_]+$/.test(name) ||
      typeof value !== 'string' ||
      [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    ) {
      throw new Error('Invalid public build configuration.');
    }
    let role;
    try {
      role = JSON.parse(Buffer.from(value.split('.')[1] || '', 'base64url').toString()).role;
    } catch {
      /* Not a JWT. */
    }
    if (value.startsWith('sb_secret_') || role === 'service_role') {
      throw new Error('Privileged credentials cannot be public build configuration.');
    }
    result[name] = value;
  }
  return result;
}
export function publicConfigurationFingerprint(values) {
  return createHash('sha256')
    .update(JSON.stringify(publicEnvironment(values)))
    .digest('hex');
}
export function releaseEnvironment(current, snapshot) {
  if (snapshot === null || snapshot === undefined) {
    return current;
  } // Releases built before snapshots existed.
  return {
    ...Object.fromEntries(
      Object.entries(current).filter(([key]) => !key.startsWith('NEXT_PUBLIC_')),
    ),
    ...publicEnvironment(snapshot),
  };
}
