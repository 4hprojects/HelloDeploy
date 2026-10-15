import { AuditOutcome } from '@hellodeploy/contracts';
import { redactObject } from '@hellodeploy/security';
import { logger } from './logger.js';

let AuditEventModel = null;

/**
 * Inject the AuditEvent Mongoose model. Must be called once at startup
 * after the database connection is established.
 * @param {object} model - Mongoose AuditEvent model
 */
export function configureAuditService(model) {
  AuditEventModel = model;
}

/**
 * Write an audit event. Never throws — failures are logged but do not
 * block the caller. Secret values must be redacted before passing metadata.
 *
 * @param {object} params
 * @param {string} params.action         - Verb describing what happened
 * @param {string} params.outcome        - AuditOutcome constant
 * @param {string|null} [params.actorId] - User ObjectId string, or null for system
 * @param {string|null} [params.actorRole]
 * @param {string|null} [params.projectId] - Defaults to the project the target or metadata names
 * @param {string|null} [params.targetType]
 * @param {string|null} [params.targetId]
 * @param {string|null} [params.sourceIp]
 * @param {string|null} [params.userAgent]
 * @param {string|null} [params.correlationId]
 * @param {object|null} [params.metadata] - Must not contain secret values
 */
export async function writeAuditEvent({
  action,
  outcome,
  actorId = null,
  actorRole = null,
  projectId = null,
  targetType = null,
  targetId = null,
  sourceIp = null,
  userAgent = null,
  correlationId = null,
  metadata = null,
}) {
  if (!AuditEventModel) {
    logger.warn('[audit] Audit service not configured — event dropped', { action, outcome });
    return;
  }

  try {
    await AuditEventModel.create({
      actorId: actorId ?? undefined,
      actorRole,
      action,
      projectId: resolveProjectId({ projectId, targetType, targetId, metadata }),
      targetType,
      targetId,
      outcome,
      sourceIp,
      userAgent: userAgent ? userAgent.slice(0, 500) : null,
      correlationId,
      metadata: metadata ? redactObject(metadata) : null,
    });
  } catch (err) {
    logger.error('[audit] Failed to write audit event', { action, error: err.message });
  }
}

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

/**
 * The project an event belongs to: an explicit projectId, else a project
 * target, else metadata.projectId. Call sites already record the project in
 * one of those places, so this links them without touching each one. A value
 * that isn't an ObjectId resolves to null rather than failing the write.
 */
export function resolveProjectId({ projectId, targetType, targetId, metadata }) {
  const candidate =
    projectId ?? (targetType === 'project' ? targetId : null) ?? metadata?.projectId ?? null;
  const value = candidate?.toString() ?? null;
  return value && OBJECT_ID_PATTERN.test(value) ? value : null;
}

export { AuditOutcome };
