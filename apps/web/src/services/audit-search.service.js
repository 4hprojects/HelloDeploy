import mongoose from 'mongoose';

import { DeploymentTrigger, PlatformRole } from '@hellodeploy/contracts';
import { AuditEvent, ProjectMembership, User } from '@hellodeploy/database';

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

// ─── Project activity (owner and maintainer view of one project's events) ─────

export const PROJECT_ACTIVITY_PER_PAGE = 50;
export const PROJECT_ACTIVITY_EXPORT_LIMIT = 5000;

export const ACTIVITY_CATEGORIES = Object.freeze({
  deployments: { label: 'Deployments', pattern: /^deployment\./ },
  domains: { label: 'Domains', pattern: /^domain\./ },
  secrets: { label: 'Secrets', pattern: /^(project\.secret|secrets\.)/ },
  members: { label: 'Members', pattern: /^project\.(member|invitation|ownership)/ },
  project: {
    label: 'Project settings',
    pattern: /^(admin\.|project\.(?!secret|member|invitation|ownership))/,
  },
});

const ACTION_LABELS = Object.freeze({
  'admin.project_suspended': 'Project suspended by HelloDeploy',
  'admin.project_reactivated': 'Project reactivated by HelloDeploy',
  'admin.quota_updated': 'Limits changed by HelloDeploy',
  'admin.quota_cleared': 'Limits reset by HelloDeploy',
  'project.secrets_revealed': 'Secret values shown',
  'project.audit_exported': 'Activity exported',
  'secrets.decrypted': 'Secrets loaded for a deployment',
});

const TRIGGER_LABELS = Object.freeze({
  [DeploymentTrigger.AUTOMATIC]: 'GitHub push',
  [DeploymentTrigger.SYSTEM]: 'Deploy hook',
});

const ADMIN_ROLES = new Set([PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN]);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One page of a project's audit events, newest first, each with a display
 * `actorLabel`. The project comes from the resolved route, never the query.
 */
export async function searchProjectActivity(
  projectId,
  { page = 1, limit = PROJECT_ACTIVITY_PER_PAGE, ...filters } = {},
) {
  const query = buildProjectActivityQuery(projectId, filters);
  const skip = (page - 1) * limit;

  const [rawEvents, total] = await Promise.all([
    AuditEvent.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditEvent.countDocuments(query),
  ]);
  const events = await labelActors(projectId, rawEvents);

  return { events, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function exportProjectActivity(projectId, filters = {}) {
  const query = buildProjectActivityQuery(projectId, filters);
  const events = await AuditEvent.find(query)
    .sort({ createdAt: -1 })
    .limit(PROJECT_ACTIVITY_EXPORT_LIMIT)
    .lean();
  return labelActors(projectId, events);
}

/** Everyone who appears in the project's log, for the actor filter. */
export async function getProjectActivityActors(projectId) {
  const actorIds = await AuditEvent.distinct('actorId', { projectId, actorId: { $ne: null } });
  const labels = await resolveActorLabels(projectId, actorIds);
  return [...labels]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** A readable name for an action, e.g. "project.member_added" → "Member added". */
export function describeAction(action) {
  if (ACTION_LABELS[action]) {
    return ACTION_LABELS[action];
  }
  const [area, ...rest] = action.split('.');
  const verb = rest.join(' ').replaceAll('_', ' ');
  // "project.secret_set" reads better as "Secret set"; "project.created" keeps its area.
  const text = area === 'project' && verb.includes(' ') ? verb : `${area} ${verb}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A short summary from an allowlist of metadata keys. Metadata also holds
 * secret names, emails and user ids that Maintainers must not see, so nothing
 * outside the allowlist is ever shown.
 */
export function describeDetails(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return '';
  }
  const parts = [];
  if (Number.isInteger(metadata.sequenceNumber)) {
    parts.push(`#${metadata.sequenceNumber}`);
  }
  for (const key of ['commitSha', 'hostname', 'hostnameNormalized', 'failureCode']) {
    if (typeof metadata[key] === 'string' && metadata[key] !== '') {
      parts.push(metadata[key].slice(0, 200));
    }
  }
  const role = metadata.newRole ?? metadata.role;
  if (typeof role === 'string' && role !== '') {
    parts.push(`role ${role.toLowerCase()}`);
  }
  if (Number.isInteger(metadata.count)) {
    parts.push(`${metadata.count} affected`);
  }
  return parts.join(' · ');
}

function buildProjectActivityQuery(projectId, { category, actorId, outcome, from, to } = {}) {
  // A date-only "to" from <input type="date"> means through the end of that day.
  const toFilter = toFilterString(to);
  const inclusiveTo =
    toFilter && DATE_ONLY.test(toFilter)
      ? new Date(new Date(toFilter).getTime() + ONE_DAY_MS - 1)
      : to;
  const query = { ...buildAuditQuery({ actorId, outcome, from, to: inclusiveTo }), projectId };

  const categoryKey = toFilterString(category);
  if (categoryKey && Object.hasOwn(ACTIVITY_CATEGORIES, categoryKey)) {
    query.action = ACTIVITY_CATEGORIES[categoryKey].pattern;
  }
  return query;
}

async function labelActors(projectId, events) {
  const actorIds = [...new Set(events.map((e) => e.actorId?.toString()).filter(Boolean))];
  const labels = await resolveActorLabels(projectId, actorIds);
  return events.map((event) => ({
    ...event,
    actorLabel: event.actorId ? labels.get(event.actorId.toString()) : systemActorLabel(event),
  }));
}

/**
 * Names only for people still on the project. Emails, former members' names
 * and platform admins' identities stay out of a page Maintainers can read.
 */
async function resolveActorLabels(projectId, actorIds) {
  if (actorIds.length === 0) {
    return new Map();
  }
  const [users, memberships] = await Promise.all([
    User.find({ _id: { $in: actorIds } })
      .select('firstName lastName platformRole')
      .lean(),
    ProjectMembership.find({ projectId, userId: { $in: actorIds } })
      .select('userId')
      .lean(),
  ]);
  const memberIds = new Set(memberships.map((m) => m.userId.toString()));
  const userById = new Map(users.map((u) => [u._id.toString(), u]));

  return new Map(
    actorIds.map((rawId) => {
      const id = rawId.toString();
      const user = userById.get(id);
      if (user && memberIds.has(id)) {
        return [id, `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Project member'];
      }
      if (user && ADMIN_ROLES.has(user.platformRole)) {
        return [id, 'HelloDeploy admin'];
      }
      return [id, 'Former member'];
    }),
  );
}

function systemActorLabel(event) {
  if (event.action === 'deployment.created') {
    return TRIGGER_LABELS[event.metadata?.triggerType] ?? 'HelloDeploy';
  }
  return 'HelloDeploy';
}
