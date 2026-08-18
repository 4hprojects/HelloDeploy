import { AuditEvent, User } from '@hellodeploy/database';

/**
 * Resolve each event's actorId to a readable "Name (email)" label.
 * Falls back silently (no actorName set) for system actions or actors whose
 * User record no longer exists — the view keeps showing the raw ID then.
 */
async function attachActorNames(events) {
  const actorIds = [...new Set(events.map((e) => e.actorId?.toString()).filter(Boolean))];
  if (actorIds.length === 0) {
    return events;
  }
  const actors = await User.find({ _id: { $in: actorIds } })
    .select('firstName lastName email')
    .lean();
  const actorById = new Map(actors.map((a) => [a._id.toString(), a]));
  return events.map((event) => {
    const actor = event.actorId ? actorById.get(event.actorId.toString()) : null;
    return actor
      ? { ...event, actorName: `${actor.firstName} ${actor.lastName} (${actor.email})` }
      : event;
  });
}

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

  const [rawEvents, total] = await Promise.all([
    AuditEvent.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditEvent.countDocuments(query),
  ]);
  const events = await attachActorNames(rawEvents);

  return { events, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function exportAuditEvents(filters = {}, { limit = 5000 } = {}) {
  const query = buildAuditQuery(filters);
  return AuditEvent.find(query).sort({ createdAt: -1 }).limit(limit).lean();
}
