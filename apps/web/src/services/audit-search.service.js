import { AuditEvent } from '@hellodeploy/database';

function buildAuditQuery({ action, actorId, targetType, targetId, outcome, from, to } = {}) {
  const query = {};

  if (action?.trim()) {
    // Prefix match: "admin." matches all admin.* actions
    const escaped = action.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.action = new RegExp(`^${escaped}`, 'i');
  }

  if (actorId?.trim()) {
    query.actorId = actorId.trim();
  }

  if (targetType?.trim()) {
    query.targetType = targetType.trim();
  }

  if (targetId?.trim()) {
    query.targetId = targetId.trim();
  }

  if (outcome?.trim()) {
    query.outcome = outcome.trim();
  }

  if (from || to) {
    query.createdAt = {};
    if (from) {
      query.createdAt.$gte = new Date(from);
    }
    if (to) {
      query.createdAt.$lte = new Date(to);
    }
  }

  return query;
}

/**
 * Search audit events with filters.
 *
 * @param {{
 *   action?: string,
 *   actorId?: string,
 *   targetType?: string,
 *   targetId?: string,
 *   outcome?: string,
 *   from?: Date | string,
 *   to?: Date | string,
 *   page?: number,
 *   limit?: number,
 * }} opts
 */
export async function searchAuditEvents({
  action,
  actorId,
  targetType,
  targetId,
  outcome,
  from,
  to,
  page = 1,
  limit = 50,
} = {}) {
  const query = buildAuditQuery({ action, actorId, targetType, targetId, outcome, from, to });

  const skip = (page - 1) * limit;

  const [events, total] = await Promise.all([
    AuditEvent.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditEvent.countDocuments(query),
  ]);

  return { events, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function exportAuditEvents(filters = {}, { limit = 5000 } = {}) {
  const query = buildAuditQuery(filters);
  return AuditEvent.find(query).sort({ createdAt: -1 }).limit(limit).lean();
}
