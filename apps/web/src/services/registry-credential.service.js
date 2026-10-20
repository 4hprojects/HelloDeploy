import {
  APPROVED_IMAGE_REGISTRIES,
  AuditOutcome,
  isApprovedImageRegistry,
} from '@hellodeploy/contracts';
import { RegistryCredential, registryCredentialAadName } from '@hellodeploy/database';
import { writeAuditEvent } from '@hellodeploy/observability';
import { buildSecretAad, encrypt, hasControlChars } from '@hellodeploy/security';

const MAX_USERNAME_LENGTH = 255;
const MAX_TOKEN_LENGTH = 4096;

/** Saved registries for a project, without their tokens. */
export async function listRegistryCredentials(projectId) {
  const records = await RegistryCredential.find({ projectId })
    .select({ registry: 1, username: 1, updatedAt: 1 })
    .sort({ registry: 1 })
    .lean();
  return records.map(({ registry, username, updatedAt }) => ({ registry, username, updatedAt }));
}

/**
 * Store or replace a project's pull credential for one approved registry. The
 * token is encrypted and bound to the project and registry; it is never read
 * back by the web process.
 */
export async function saveRegistryCredential({
  projectId,
  registry,
  username,
  token,
  actorId,
  sourceIp,
  correlationId,
}) {
  const name = String(username ?? '').trim();
  const secret = String(token ?? '');
  if (!isApprovedImageRegistry(registry)) {
    return {
      success: false,
      error: `Choose one of ${APPROVED_IMAGE_REGISTRIES.join(', ')}.`,
    };
  }
  if (!name || name.length > MAX_USERNAME_LENGTH || hasControlChars(name)) {
    return { success: false, error: 'Enter the registry username.' };
  }
  if (!secret || secret.length > MAX_TOKEN_LENGTH || hasControlChars(secret)) {
    return { success: false, error: 'Enter a read-only access token for the registry.' };
  }

  const sealed = encrypt(
    secret,
    buildSecretAad({ projectId: String(projectId), name: registryCredentialAadName(registry) }),
  );
  await RegistryCredential.updateOne(
    { projectId, registry },
    {
      $set: {
        username: name,
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        authTag: sealed.authTag,
        encryptionVersion: sealed.version,
        updatedBy: actorId,
      },
      $setOnInsert: { createdBy: actorId },
    },
    { upsert: true },
  );
  await writeAuditEvent({
    action: 'project.registry_credential_saved',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: String(projectId),
    sourceIp,
    correlationId,
    metadata: { registry },
  });
  return { success: true };
}

export async function deleteRegistryCredential({
  projectId,
  registry,
  actorId,
  sourceIp,
  correlationId,
}) {
  if (!isApprovedImageRegistry(registry)) {
    return { success: false, error: 'No credential is saved for that registry.' };
  }
  const result = await RegistryCredential.deleteOne({ projectId, registry });
  if (result.deletedCount === 0) {
    return { success: false, error: 'No credential is saved for that registry.' };
  }
  await writeAuditEvent({
    action: 'project.registry_credential_deleted',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: String(projectId),
    sourceIp,
    correlationId,
    metadata: { registry },
  });
  return { success: true };
}
