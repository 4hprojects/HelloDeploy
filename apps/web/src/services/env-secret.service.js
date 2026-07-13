import { EnvironmentSecret } from '@hellodeploy/database';
import { encrypt, decrypt } from '@hellodeploy/security';
import { AuditOutcome } from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';
import { parse } from 'dotenv';

const NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
export const MAX_ENV_FILE_BYTES = 64 * 1024;
export const MAX_ENV_FILE_SECRETS = 100;

export function validateSecretName(name) {
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

export function parseEnvFile(content) {
  if (typeof content !== 'string' || content.length === 0) {
    return { success: false, error: 'Choose a non-empty .env file.' };
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_ENV_FILE_BYTES) {
    return { success: false, error: 'The .env file must be 64 KB or smaller.' };
  }
  if (content.includes('\0')) {
    return { success: false, error: 'The .env file contains unsupported content.' };
  }

  const entries = new Map();
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const assignment = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!assignment) {
      return { success: false, error: `Invalid .env assignment on line ${index + 1}.` };
    }

    const name = assignment[1];
    const nameError = validateSecretName(name);
    if (nameError) {
      return { success: false, error: `Invalid variable name on line ${index + 1}: ${nameError}` };
    }

    const parsed = parse(line);
    if (!Object.hasOwn(parsed, name)) {
      return { success: false, error: `Invalid .env value on line ${index + 1}.` };
    }
    if (!parsed[name]) {
      return { success: false, error: `Variable ${name} on line ${index + 1} has no value.` };
    }
    if (entries.has(name)) {
      return { success: false, error: `Variable ${name} is defined more than once.` };
    }

    entries.set(name, parsed[name]);
    if (entries.size > MAX_ENV_FILE_SECRETS) {
      return {
        success: false,
        error: `A .env file may contain at most ${MAX_ENV_FILE_SECRETS} variables.`,
      };
    }
  }

  if (entries.size === 0) {
    return { success: false, error: 'The .env file does not contain any variables.' };
  }
  return { success: true, entries: [...entries.entries()] };
}

export async function importEnvFile(projectId, content, actorId, opts = {}) {
  const parsed = parseEnvFile(content);
  if (!parsed.success) {
    return parsed;
  }

  for (const [name, value] of parsed.entries) {
    await setSecret(projectId, name, value, actorId, opts);
  }
  return { success: true, count: parsed.entries.length };
}

function normalizeBulkSecretRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => ({
    name: typeof row?.name === 'string' ? row.name.trim().toUpperCase() : '',
    value: typeof row?.value === 'string' ? row.value : '',
  }));
}

export async function bulkUpdateSecrets(projectId, rows, actorId, opts = {}) {
  const normalizedRows = normalizeBulkSecretRows(rows);
  if (normalizedRows.length === 0) {
    return { success: false, error: 'No secrets were submitted for editing.' };
  }

  const existingSecrets = await listSecretNames(projectId);
  const existingNames = new Set(existingSecrets.map((secret) => secret.name));
  const seenNames = new Set();
  const updates = [];

  for (const row of normalizedRows) {
    const nameError = validateSecretName(row.name);
    if (nameError) {
      return { success: false, error: `Invalid secret row: ${nameError}` };
    }
    if (seenNames.has(row.name)) {
      return { success: false, error: `Secret ${row.name} was submitted more than once.` };
    }
    if (!existingNames.has(row.name)) {
      return { success: false, error: `Secret ${row.name} no longer exists.` };
    }

    seenNames.add(row.name);
    if (row.value) {
      updates.push(row);
    }
  }

  if (updates.length === 0) {
    return { success: false, error: 'Enter at least one new value before saving changes.' };
  }

  for (const row of updates) {
    const result = await setSecret(projectId, row.name, row.value, actorId, opts);
    if (!result.success) {
      return result;
    }
  }

  return { success: true, count: updates.length };
}

export async function revealSecretValue(projectId, name, actorId, opts = {}) {
  const normalizedName = typeof name === 'string' ? name.trim().toUpperCase() : '';
  const nameError = validateSecretName(normalizedName);
  if (nameError) {
    return { success: false, error: nameError };
  }

  const secret = await EnvironmentSecret.findOne({ projectId, name: normalizedName }).lean();
  if (!secret) {
    return { success: false, error: `Secret "${normalizedName}" not found.` };
  }

  const value = decrypt({
    ciphertext: secret.ciphertext,
    iv: secret.iv,
    authTag: secret.authTag,
    version: secret.encryptionVersion,
  });

  await writeAuditEvent({
    action: 'project.secret_revealed',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: projectId.toString(),
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: { name: normalizedName },
  });

  return { success: true, name: normalizedName, value };
}

/**
 * Create or update an environment secret.
 * The plaintext value is encrypted immediately; it is NEVER stored or logged.
 *
 * @returns {{ success: boolean, error?: string }}
 */
export async function setSecret(projectId, name, value, actorId, opts = {}) {
  const nameError = validateSecretName(name);
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
