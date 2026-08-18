import { EnvironmentSecret } from '@hellodeploy/database';
import { decrypt } from '@hellodeploy/security';
import { writeAuditEvent } from '@hellodeploy/observability';
import { AuditOutcome } from '@hellodeploy/contracts';

/**
 * Decrypt all environment secrets for a project.
 * Returns a plain key→value map.
 *
 * SECURITY: The returned values are plaintext secrets.
 * - NEVER log this object or any of its values.
 * - Pass values directly to docker run --env; do not store or serialise.
 *
 * @param {string|import('mongoose').Types.ObjectId} projectId
 * @returns {Promise<Record<string, string>>}
 */
export async function getProjectEnvVars(projectId) {
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

  if (secrets.length > 0) {
    writeAuditEvent({
      action: 'secrets.decrypted',
      outcome: AuditOutcome.SUCCESS,
      targetType: 'project',
      targetId: projectId.toString(),
      metadata: { secretCount: secrets.length },
    }).catch(() => {});
  }

  return result;
}
