import mongoose from 'mongoose';

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

/**
 * A filter value trimmed to a non-empty string, or null for anything else.
 *
 * These come straight from `req.query`, where a bracketed parameter arrives as an
 * object. Returning null rather than calling String() on it follows the same
 * reasoning as the webhook's `toPlainString`: coercing would silently query for
 * "[object Object]", while reaching `.trim()` on an object throws a TypeError and
 * turns a malformed filter into a 500.
 */
function toFilterString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** A parsed date, or null when the value is absent or not a real date. */
function toFilterDate(value) {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Every event has an _id, so requiring a null one returns nothing.
const MATCHES_NOTHING = Object.freeze({ _id: null });

function buildAuditQuery({ action, actorId, targetType, targetId, outcome, from, to } = {}) {
  const query = {};

  const actionFilter = toFilterString(action);
  if (actionFilter) {
    // Prefix match: "admin." matches all admin.* actions
    const escaped = actionFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.action = new RegExp(`^${escaped}`, 'i');
  }

  // actorId is an ObjectId, so an unparseable value would reach Mongo and throw a
  // CastError. Dropping the filter instead would be worse than the 500: the reply
  // would be the whole unfiltered log, inviting an operator to read every event as
  // the work of the actor they searched for. An id that cannot exist matches
  // nothing instead.
  const actorIdFilter = toFilterString(actorId);
  if (actorIdFilter) {
    if (!mongoose.isValidObjectId(actorIdFilter)) {
      return MATCHES_NOTHING;
    }
    query.actorId = actorIdFilter;
  }

  const targetTypeFilter = toFilterString(targetType);
  if (targetTypeFilter) {
    query.targetType = targetTypeFilter;
  }

  const targetIdFilter = toFilterString(targetId);
  if (targetIdFilter) {
    query.targetId = targetIdFilter;
  }

  const outcomeFilter = toFilterString(outcome);
  if (outcomeFilter) {
    query.outcome = outcomeFilter;
  }

  const fromFilter = toFilterDate(from);
  const toFilter = toFilterDate(to);
  if (fromFilter || toFilter) {
    query.createdAt = {};
    if (fromFilter) {
      query.createdAt.$gte = fromFilter;
    }
    if (toFilter) {
      query.createdAt.$lte = toFilter;
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
