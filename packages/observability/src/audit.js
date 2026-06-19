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

export { AuditOutcome };
