import { EnvironmentSecret } from '@hellodeploy/database';
import { buildSecretAad, encrypt, decrypt } from '@hellodeploy/security';
import { AuditOutcome, PLATFORM_MANAGED_ENV_NAMES } from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';
import { parse } from 'dotenv';

const NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
export const MAX_ENV_FILE_BYTES = 64 * 1024;
export const MAX_ENV_FILE_SECRETS = 100;

export const PLATFORM_MANAGED_NAME_ERROR =
  'HelloDeploy sets PORT for your app automatically from the application port in Settings. Change it there instead.';

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

const ASSIGNMENT_PATTERN = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;
const COMMENTED_ASSIGNMENT_PATTERN = /^#+\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=/;
const INLINE_PRODUCTION_PATTERN = /\s#\s*(?:prod|production)\s*[:=]\s*(.*)$/i;
const PRODUCTION_WORD = /\b(?:prod|production)\b/i;
const OTHER_ENVIRONMENT_WORD = /\b(?:local|dev|development|staging|test|testing)\b/i;
// "# --- production ---", "### PRODUCTION", "# [production]"
const SECTION_HEADER_PATTERN = /^#\s*(?:[-=*#~_]{2,}|\[)|(?:[-=*#~_]{2,}|\])\s*$/;

export const ProductionSource = Object.freeze({
  INLINE: 'inline',
  BELOW: 'below',
  LABEL: 'label',
  SECTION: 'section',
});

function parseAssignmentValue(text, name) {
  const parsed = parse(text);
  return Object.hasOwn(parsed, name) ? parsed[name] : null;
}

function stripMatchingQuotes(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.length > 1 && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function inlineProductionValue(line) {
  const rawValue = line.slice(line.indexOf('=') + 1).trimStart();
  let commentArea = rawValue;
  // A "#" inside a quoted value is part of the value, so only look after the closing quote.
  if (['"', "'", '`'].includes(rawValue[0])) {
    const closing = rawValue.indexOf(rawValue[0], 1);
    commentArea = closing === -1 ? '' : rawValue.slice(closing + 1);
  }
  const match = ` ${commentArea}`.match(INLINE_PRODUCTION_PATTERN);
  return match ? stripMatchingQuotes(match[1]) : '';
}

/**
 * Parse an uploaded .env file into one entry per variable name.
 *
 * Besides active assignments, commented-out assignments are read as the
 * production value for a name when the file marks them as such:
 *   inline   `NAME=local # prod: value`
 *   below    `# NAME=value` directly under the active `NAME=` line
 *   label    a comment mentioning prod/production, then commented assignments
 *            (until a blank line or an active assignment)
 *   section  a decorated header such as `# --- production ---`, until the
 *            next header or a comment naming another environment
 * Other commented lines are ignored. An empty active value is not an error;
 * the caller decides whether to skip it or take a value from the user.
 *
 * @returns {{ success: true, entries: Array<{ name: string, line: number,
 *   localValue: string|null, productionValue: string|null,
 *   productionLine: number|null, productionSource: string|null }> }
 *   | { success: false, error: string }}
 */
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
  const entryFor = (name, line) => {
    if (!entries.has(name)) {
      entries.set(name, {
        name,
        line,
        localValue: null,
        productionValue: null,
        productionLine: null,
        productionSource: null,
      });
    }
    return entries.get(name);
  };
  const setProduction = (name, value, line, source) => {
    const entry = entryFor(name, line);
    if (value && entry.productionValue === null) {
      entry.productionValue = value;
      entry.productionLine = line;
      entry.productionSource = source;
    }
  };

  let productionContext = null;
  let previousActiveName = null;
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const trimmed = lines[index].trim();

    if (!trimmed) {
      if (productionContext === ProductionSource.LABEL) {
        productionContext = null;
      }
      previousActiveName = null;
      continue;
    }

    if (trimmed.startsWith('#')) {
      const commented = trimmed.match(COMMENTED_ASSIGNMENT_PATTERN);
      if (commented) {
        const name = commented[1];
        const source =
          productionContext ?? (name === previousActiveName ? ProductionSource.BELOW : null);
        if (source && !validateSecretName(name)) {
          const value = parseAssignmentValue(trimmed.replace(/^#+\s*/, ''), name);
          setProduction(name, value, lineNumber, source);
        }
      } else if (PRODUCTION_WORD.test(trimmed)) {
        productionContext = SECTION_HEADER_PATTERN.test(trimmed)
          ? ProductionSource.SECTION
          : ProductionSource.LABEL;
      } else if (OTHER_ENVIRONMENT_WORD.test(trimmed) || SECTION_HEADER_PATTERN.test(trimmed)) {
        productionContext = null;
      }
      previousActiveName = null;
      continue;
    }

    const assignment = trimmed.match(ASSIGNMENT_PATTERN);
    if (!assignment) {
      return { success: false, error: `Invalid .env assignment on line ${lineNumber}.` };
    }

    const name = assignment[1];
    const nameError = validateSecretName(name);
    if (nameError) {
      return { success: false, error: `Invalid variable name on line ${lineNumber}: ${nameError}` };
    }

    const localValue = parseAssignmentValue(trimmed, name);
    if (localValue === null) {
      return { success: false, error: `Invalid .env value on line ${lineNumber}.` };
    }
    const entry = entryFor(name, lineNumber);
    if (entry.localValue !== null) {
      return { success: false, error: `Variable ${name} is defined more than once.` };
    }
    entry.line = lineNumber;
    entry.localValue = localValue;
    setProduction(name, inlineProductionValue(trimmed), lineNumber, ProductionSource.INLINE);

    if (productionContext === ProductionSource.LABEL) {
      productionContext = null;
    }
    previousActiveName = name;
  }

  // Names seen only in a commented line that held no usable production value.
  for (const [name, entry] of entries) {
    if (entry.localValue === null && entry.productionValue === null) {
      entries.delete(name);
    }
  }

  if (entries.size === 0) {
    return { success: false, error: 'The .env file does not contain any variables.' };
  }
  if (entries.size > MAX_ENV_FILE_SECRETS) {
    return {
      success: false,
      error: `A .env file may contain at most ${MAX_ENV_FILE_SECRETS} variables.`,
    };
  }
  return {
    success: true,
    entries: [...entries.values()].sort((a, b) => a.line - b.line),
  };
}

/**
 * Names and value availability for the import review screen. Values never
 * leave the server.
 */
export function previewEnvFile(content) {
  const parsed = parseEnvFile(content);
  if (!parsed.success) {
    return parsed;
  }
  return {
    success: true,
    entries: parsed.entries
      .filter((entry) => !PLATFORM_MANAGED_ENV_NAMES.includes(entry.name))
      .map((entry) => ({
        name: entry.name,
        line: entry.line,
        hasLocalValue: Boolean(entry.localValue),
        hasProductionValue: entry.productionValue !== null,
        productionLine: entry.productionLine,
        productionSource: entry.productionSource,
      })),
  };
}

/**
 * Import an uploaded .env file. `opts.selections` comes from the review
 * screen, keyed by variable name: `{ include, source: 'local'|'production',
 * value }`. Without a selection a name is imported with its production value
 * when the file has one, otherwise its local value, and skipped when it has
 * neither. `value` fills in a name whose chosen value is empty. Everything is
 * validated before the first write.
 *
 * @returns {Promise<{ success: true, count: number, productionCount: number,
 *   skipped: string[] } | { success: false, error: string }>}
 */
export async function importEnvFile(projectId, content, actorId, opts = {}) {
  const parsed = parseEnvFile(content);
  if (!parsed.success) {
    return parsed;
  }

  const selections = opts.selections ?? {};
  const writes = [];
  const skipped = [];
  const platformManaged = [];
  let productionCount = 0;
  for (const entry of parsed.entries) {
    if (PLATFORM_MANAGED_ENV_NAMES.includes(entry.name)) {
      platformManaged.push(entry.name);
      continue;
    }
    const selection = Object.hasOwn(selections, entry.name) ? selections[entry.name] : null;
    if (selection?.include === false) {
      continue;
    }

    const wantsLocal = selection?.source === 'local' || entry.productionValue === null;
    let value = wantsLocal ? entry.localValue : entry.productionValue;
    if (!value && typeof selection?.value === 'string' && selection.value.length > 0) {
      value = selection.value;
    }
    if (!value) {
      if (selection?.include === true) {
        return {
          success: false,
          error: `Enter a value for ${entry.name} or remove it before importing.`,
        };
      }
      skipped.push(entry.name);
      continue;
    }

    if (!wantsLocal) {
      productionCount += 1;
    }
    writes.push([entry.name, value]);
  }

  if (writes.length === 0) {
    return {
      success: false,
      error: 'Nothing to import. Every variable was removed or has no value.',
    };
  }

  for (const [name, value] of writes) {
    const result = await setSecret(projectId, name, value, actorId, opts);
    if (!result.success) {
      return result;
    }
  }
  return { success: true, count: writes.length, productionCount, skipped, platformManaged };
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

/**
 * Decrypt one stored secret record.
 *
 * Records written before AAD binding carry `aadBound: false` and must decrypt
 * without it, so the flag on the record — never a guess or a retry — decides.
 *
 * @param {{ projectId: unknown, name: string, ciphertext: string, iv: string,
 *   authTag: string, encryptionVersion: number, aadBound?: boolean }} record
 * @returns {string} plaintext
 */
function decryptSecretRecord(record) {
  return decrypt({
    ciphertext: record.ciphertext,
    iv: record.iv,
    authTag: record.authTag,
    version: record.encryptionVersion,
    aad: record.aadBound
      ? buildSecretAad({ projectId: record.projectId, name: record.name })
      : undefined,
  });
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
  if (PLATFORM_MANAGED_ENV_NAMES.includes(name)) {
    return { success: false, error: PLATFORM_MANAGED_NAME_ERROR };
  }
  if (!value || typeof value !== 'string') {
    return { success: false, error: 'Secret value is required.' };
  }

  const { ciphertext, iv, authTag, version, aadBound } = encrypt(
    value,
    buildSecretAad({ projectId, name }),
  );

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
        aadBound,
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
 * Delete every environment secret for a project.
 *
 * @returns {{ success: boolean, count?: number, error?: string }}
 */
export async function deleteAllSecrets(projectId, actorId, opts = {}) {
  const secrets = await listSecretNames(projectId);
  if (secrets.length === 0) {
    return { success: false, error: 'There are no secrets to delete.' };
  }

  const result = await EnvironmentSecret.deleteMany({ projectId });

  await writeAuditEvent({
    action: 'project.secrets_cleared',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: projectId.toString(),
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: { count: result.deletedCount, names: secrets.map((secret) => secret.name) },
  });

  return { success: true, count: result.deletedCount };
}

/**
 * Decrypt all secrets for a project into a plain key-value map.
 * Web controllers must not call this directly: the only path to a client is
 * `revealSecretValues`, which records an audit event first.
 *
 * @returns {Promise<Record<string, string>>}
 */
export async function getDecryptedSecrets(projectId) {
  const secrets = await EnvironmentSecret.find({ projectId }).lean();
  const result = {};
  for (const s of secrets) {
    result[s.name] = decryptSecretRecord(s);
  }
  return result;
}

/**
 * Decrypt every secret so the project owner can see them, after recording who
 * looked. The audit metadata carries names only, never values.
 *
 * @returns {Promise<Record<string, string>>}
 */
export async function revealSecretValues(projectId, actorId, opts = {}) {
  const values = await getDecryptedSecrets(projectId);
  const names = Object.keys(values);

  await writeAuditEvent({
    action: 'project.secrets_revealed',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: projectId.toString(),
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: { count: names.length, names },
  });

  return values;
}
