import { EnvironmentSecret } from '@hellodeploy/database';
import { encrypt, decrypt } from '@hellodeploy/security';
import { AuditOutcome } from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';

const NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

function validateName(name) {
  if (!name || typeof name !== 'string') {
    return 'Secret name is required.';
  }
  if (name.length > 128) {
    return 'Secret name must be 128 characters or fewer.';
  }
  if (!NAME_PATTERN.test(name)) {
    return 'Secret name must contain only uppercase letters, digits, and underscores, and must not start with a digit.';
  }
  return null;
}

/**
 * Create or update an environment secret.
 * The plaintext value is encrypted immediately; it is NEVER stored or logged.
 *
 * @returns {{ success: boolean, error?: string }}
 */
export async function setSecret(projectId, name, value, actorId, opts = {}) {
  const nameError = validateName(name);
  if (nameError) {
    return { success: false, error: nameError };
  }
  if (!value || typeof value !== 'string') {
    return { success: false, error: 'Secret value is required.' };
  }

  const { ciphertext, iv, authTag, version } = encrypt(value);

  await EnvironmentSecret.findOneAndUpdate(
    { projectId, name },
    {
      $set: {
        projectId,
        name,
        ciphertext,
        iv,
        authTag,
        encryptionVersion: version,
        updatedBy: actorId,
      },
      $setOnInsert: { createdBy: actorId },
    },
    { upsert: true, new: true },
  );

  await writeAuditEvent({
    action: 'project.secret_set',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: projectId.toString(),
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: { name }, // name only — value NEVER in audit events
  });

  return { success: true };
}

/**
 * List secret names and metadata for a project.
 * Values are NEVER returned — only names, creator, and timestamps.
 *
 * @returns {Promise<Array<{ name: string, createdAt: Date, updatedAt: Date }>>}
 */
export async function listSecretNames(projectId) {
  const secrets = await EnvironmentSecret.find({ projectId })
    .select('name createdAt updatedAt')
    .sort({ name: 1 })
    .lean();
  return secrets;
}

/**
 * Delete a named environment secret.
 *
 * @returns {{ success: boolean, error?: string }}
 */
export async function deleteSecret(projectId, name, actorId, opts = {}) {
  const result = await EnvironmentSecret.deleteOne({ projectId, name });
  if (result.deletedCount === 0) {
    return { success: false, error: `Secret "${name}" not found.` };
  }

  await writeAuditEvent({
    action: 'project.secret_deleted',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: projectId.toString(),
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: { name },
  });

  return { success: true };
}

/**
 * Decrypt all secrets for a project into a plain key-value map.
 * FOR INTERNAL USE ONLY — called by the deployment worker, never by web controllers.
 * Never send the output of this function to a client.
 *
 * @returns {Promise<Record<string, string>>}
 */
export async function getDecryptedSecrets(projectId) {
  const secrets = await EnvironmentSecret.find({ projectId }).lean();
  const result = {};
  for (const s of secrets) {
    result[s.name] = decrypt({
      ciphertext: s.ciphertext,
      iv: s.iv,
      authTag: s.authTag,
      version: s.encryptionVersion,
    });
  }
  return result;
}
