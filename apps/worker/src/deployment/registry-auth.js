import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RegistryCredential, registryCredentialAadName } from '@hellodeploy/database';
import { buildSecretAad, decrypt } from '@hellodeploy/security';

// Keys Docker uses for each registry in config.json `auths`.
const DOCKER_AUTH_KEYS = Object.freeze({
  'docker.io': 'https://index.docker.io/v1/',
  'ghcr.io': 'ghcr.io',
});

/**
 * Decrypt a project's saved pull credential for one registry, or null when the
 * project has none (public images).
 */
export async function loadRegistryCredential(projectId, registry, deps = {}) {
  const findCredential =
    deps.findCredential ?? ((query) => RegistryCredential.findOne(query).lean());
  const record = await findCredential({ projectId, registry });
  if (!record) {
    return null;
  }
  const token = decrypt({
    ciphertext: record.ciphertext,
    iv: record.iv,
    authTag: record.authTag,
    version: record.encryptionVersion,
    aad: buildSecretAad({
      projectId: String(projectId),
      name: registryCredentialAadName(registry),
    }),
  });
  return { username: record.username, token };
}

/**
 * Run `fn` with a private Docker config directory holding only this
 * credential, so docker and the scanner authenticate without touching the
 * worker's own registry login. The directory is removed afterwards.
 */
export async function withDockerConfig(registry, credential, fn) {
  if (!credential) {
    return fn(undefined);
  }
  const directory = await mkdtemp(join(tmpdir(), 'hellodeploy-registry-'));
  try {
    const auth = Buffer.from(`${credential.username}:${credential.token}`).toString('base64');
    await writeFile(
      join(directory, 'config.json'),
      JSON.stringify({ auths: { [DOCKER_AUTH_KEYS[registry]]: { auth } } }),
      { mode: 0o600 },
    );
    return await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
