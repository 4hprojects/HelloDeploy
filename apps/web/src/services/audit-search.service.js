import mongoose from 'mongoose';

import { DeploymentTrigger, PlatformRole } from '@hellodeploy/contracts';
import {
  AUDIT_EVENT_RETENTION_SECONDS,
  AuditEvent,
  Deployment,
  Domain,
  Project,
  ProjectMembership,
  User,
} from '@hellodeploy/database';

export const AUDIT_RETENTION_DAYS = AUDIT_EVENT_RETENTION_SECONDS / (24 * 60 * 60);

const ACTION_CATEGORY_LABELS = Object.freeze({
  auth: 'Sign-in & accounts',
  admin: 'Admin actions',
  project: 'Projects',
  deployment: 'Deployments',
  domain: 'Domains',
  secrets: 'Secrets',
  notification: 'Notifications',
  nginx: 'Routing',
  github: 'GitHub',
});

const TARGET_TYPE_LABELS = Object.freeze({
  user: 'User',
  project: 'Project',
  deployment: 'Deployment',
  domain: 'Domain',
  notification: 'Notification',
  nginx_route: 'Route',
  nginx_route_batch: 'Routing batch',
  approval_request: 'Approval request',
  platform_setting: 'Platform setting',
  audit_events: 'Audit log',
});

// Every event has an _id, so requiring a null one returns nothing.
const MATCHES_NOTHING = Object.freeze({ _id: null });

const HOUR_MS = 60 * 60 * 1000;

/** The Period filter; "custom" uses the From and To dates instead. */
export const AUDIT_PERIODS = Object.freeze({
  '24h': { label: 'Last 24 hours', ms: 24 * HOUR_MS },
  '7d': { label: 'Last 7 days', ms: 7 * 24 * HOUR_MS },
  '30d': { label: 'Last 30 days', ms: 30 * 24 * HOUR_MS },
  custom: { label: 'Custom range…', ms: null },
});

const ACTOR_MATCH_LIMIT = 50;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Search audit events with filters.
 *
 * @param {{
 *   action?: string,        // prefix, e.g. "admin." or "auth"
 *   actor?: string,         // name or email words, or "system"
 *   actorId?: string,
 *   targetType?: string,
 *   targetId?: string,
 *   correlationId?: string,
 *   outcome?: string,
 *   period?: string,        // a key of AUDIT_PERIODS; a preset overrides from/to
 *   from?: Date | string,   // a YYYY-MM-DD value means the start of that local day
 *   to?: Date | string,     // a YYYY-MM-DD value includes that whole local day
 *   page?: number,
 *   limit?: number,
 * }} opts
 */
export async function searchAuditEvents({ page = 1, limit = 50, ...filters } = {}) {
  const query = await buildAuditQuery(filters);
  const skip = (page - 1) * limit;

  const [rawEvents, total, filteredActor] = await Promise.all([
    AuditEvent.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditEvent.countDocuments(query),
    findFilteredActor(filters.actorId),
  ]);
  const events = await attachTargetLabels(await attachActors(rawEvents));

  return { events, total, page, limit, totalPages: Math.ceil(total / limit), filteredActor };
}

export async function exportAuditEvents(filters = {}, { limit = 5000 } = {}) {
  const query = await buildAuditQuery(filters);
  return AuditEvent.find(query).sort({ createdAt: -1 }).limit(limit).lean();
}

/**
 * Dropdown choices built from what is actually recorded. `distinct` reads the
 * action and targetType indexes, so it stays cheap over the 90-day window.
 */
export async function getAuditFilterOptions() {
  const [actions, targetTypes] = await Promise.all([
    AuditEvent.distinct('action'),
    AuditEvent.distinct('targetType'),
  ]);
  const categories = [...new Set(actions.map((action) => action.split('.')[0]))].sort();
  return {
    actionCategories: categories.map((category) => ({
      value: `${category}.`,
      label: ACTION_CATEGORY_LABELS[category] ?? capitalize(category.replaceAll('_', ' ')),
    })),
    targetTypes: targetTypes
      .filter(Boolean)
      .sort()
      .map((type) => ({ value: type, label: toTargetTypeLabel(type) })),
  };
}

/** "auth.sign_in" → "Sign in"; the part before the first dot is the category. */
export function toActionLabel(action) {
  const [, ...rest] = action.split('.');
  return capitalize((rest.length > 0 ? rest.join(' ') : action).replaceAll('_', ' '));
}

export function toTargetTypeLabel(type) {
  return TARGET_TYPE_LABELS[type] ?? capitalize(type.replaceAll('_', ' '));
}

async function buildAuditQuery({
  action,
  actor,
  actorId,
  targetType,
  targetId,
  correlationId,
  outcome,
  period,
  from,
  to,
} = {}) {
  const query = {};
  const conditions = [];

  const actionFilter = toFilterString(action);
  if (actionFilter) {
    // Prefix match: "admin." matches all admin.* actions
    query.action = new RegExp(`^${escapeRegExp(actionFilter)}`, 'i');
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

  const actorFilter = toFilterString(actor);
  if (actorFilter) {
    // Same reasoning as actorId: a name that matches no one returns no events,
    // never the unfiltered log.
    const actorCondition = await toActorCondition(actorFilter);
    if (!actorCondition) {
      return MATCHES_NOTHING;
    }
    conditions.push(actorCondition);
  }

  const targetTypeFilter = toFilterString(targetType);
  if (targetTypeFilter) {
    query.targetType = targetTypeFilter;
  }

  const targetIdFilter = toFilterString(targetId);
  if (targetIdFilter) {
    query.targetId = targetIdFilter;
  }

  const correlationIdFilter = toFilterString(correlationId);
  if (correlationIdFilter) {
    query.correlationId = correlationIdFilter;
  }

  const outcomeFilter = toFilterString(outcome);
  if (outcomeFilter) {
    query.outcome = outcomeFilter;
  }

  // A preset period wins over custom dates, and is measured from now so a
  // saved link keeps meaning "the last 7 days".
  const periodKey = toFilterString(period);
  const createdAt =
    periodKey && Object.hasOwn(AUDIT_PERIODS, periodKey) && AUDIT_PERIODS[periodKey].ms
      ? { $gte: new Date(Date.now() - AUDIT_PERIODS[periodKey].ms) }
      : toCreatedAtRange(from, to);
  if (createdAt) {
    query.createdAt = createdAt;
  }

  if (conditions.length > 0) {
    query.$and = conditions;
  }
  return query;
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * "system" means events with no actor. Anything else is words that must each
 * appear in the user's first name, last name or email, so "ada love" finds
 * Ada Lovelace. Returns null when no user matches.
 */
async function toActorCondition(actor) {
  if (actor.toLowerCase() === 'system') {
    return { actorId: null };
  }
  const words = actor.split(/\s+/).map((word) => new RegExp(escapeRegExp(word), 'i'));
  const users = await User.find({
    $and: words.map((word) => ({
      $or: [{ firstName: word }, { lastName: word }, { email: word }],
    })),
  })
    .select('_id')
    .limit(ACTOR_MATCH_LIMIT)
    .lean();
  return users.length === 0 ? null : { actorId: { $in: users.map((user) => user._id) } };
}

/**
 * A date-only value (what the page's date inputs send) covers whole local days,
 * matching the local times the page shows; "To" includes its whole day.
 * Unparseable values are ignored.
 */
function toCreatedAtRange(from, to) {
  const range = {};
  const fromDate = toFilterDate(from);
  if (fromDate) {
    range.$gte = fromDate;
  }
  const toDate = toFilterDate(to);
  if (toDate && typeof to === 'string' && DATE_ONLY.test(to.trim())) {
    range.$lt = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1);
  } else if (toDate) {
    range.$lte = toDate;
  }
  return Object.keys(range).length > 0 ? range : null;
}

/** A parsed date, or null when the value is absent or not a real date. */
function toFilterDate(value) {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    return null;
  }
  const dateOnly = typeof value === 'string' ? DATE_ONLY.exec(value.trim()) : null;
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function findFilteredActor(actorId) {
  const id = toFilterString(actorId);
  if (!id || !mongoose.isValidObjectId(id)) {
    return null;
  }
  const user = await User.findById(id).select('firstName lastName email').lean();
  return user ? toActorSummary(user) : null;
}

/**
 * Resolve each event's actorId to `actor: { name, email }`. System actions and
 * actors whose User record no longer exists get no `actor`; the view then
 * shows "System" or the raw id.
 */
async function attachActors(events) {
  const actorIds = [...new Set(events.map((e) => e.actorId?.toString()).filter(Boolean))];
  if (actorIds.length === 0) {
    return events;
  }
  const actors = await User.find({ _id: { $in: actorIds } })
    .select('firstName lastName email')
    .lean();
  const actorById = new Map(actors.map((a) => [a._id.toString(), toActorSummary(a)]));
  return events.map((event) => {
    const actor = event.actorId ? actorById.get(event.actorId.toString()) : null;
    return actor ? { ...event, actor } : event;
  });
}

function toActorSummary(user) {
  return { name: `${user.firstName} ${user.lastName}`.trim(), email: user.email };
}

/**
 * Give each event `target: { label, href }` naming what it acted on. One query
 * per target type; anything unknown or deleted falls back to type + short id.
 * Project pages need membership, so project links go to the admin project list.
 */
async function attachTargetLabels(events) {
  const idsOfType = (type) => [
    ...new Set(
      events
        .filter((e) => e.targetType === type && mongoose.isValidObjectId(e.targetId))
        .map((e) => e.targetId),
    ),
  ];
  const [users, projects, deployments, domains] = await Promise.all([
    User.find({ _id: { $in: idsOfType('user') } })
      .select('firstName lastName')
      .lean(),
    Project.find({ _id: { $in: idsOfType('project') } })
      .select('name slug')
      .lean(),
    Deployment.find({ _id: { $in: idsOfType('deployment') } })
      .select('projectId sequenceNumber')
      .lean(),
    Domain.find({ _id: { $in: idsOfType('domain') } })
      .select('hostnameNormalized')
      .lean(),
  ]);
  const deploymentProjects = await Project.find({
    _id: { $in: deployments.map((d) => d.projectId) },
  })
    .select('name slug')
    .lean();

  const byId = (docs) => new Map(docs.map((doc) => [doc._id.toString(), doc]));
  const deploymentProjectsById = byId(deploymentProjects);
  const labelers = {
    user: labelWith(byId(users), (user) => ({
      label: `${user.firstName} ${user.lastName}`.trim(),
      href: `/admin/users/${user._id}`,
    })),
    project: labelWith(byId(projects), toProjectTarget),
    deployment: labelWith(byId(deployments), (deployment) => {
      const project = deploymentProjectsById.get(deployment.projectId?.toString());
      return project
        ? {
            label: `${project.name} #${deployment.sequenceNumber}`,
            href: toProjectTarget(project).href,
          }
        : null;
    }),
    domain: labelWith(byId(domains), (domain) => ({
      label: domain.hostnameNormalized,
      href: null,
    })),
  };

  return events.map((event) => {
    if (!event.targetType) {
      return event;
    }
    const target = labelers[event.targetType]?.(event.targetId) ?? {
      label: toTargetTypeLabel(event.targetType),
      shortId: event.targetId ? String(event.targetId).slice(-8) : null,
      href: null,
    };
    return { ...event, target };
  });
}

function labelWith(docsById, toTarget) {
  return (targetId) => {
    const doc = docsById.get(String(targetId));
    return doc ? toTarget(doc) : null;
  };
}

function toProjectTarget(project) {
  return {
    label: project.name,
    href: `/admin/projects?search=${encodeURIComponent(project.slug)}`,
  };
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

/**
 * One page of a project's audit events, newest first, each with a display
 * `actorLabel`. The project comes from the resolved route, never the query.
 */
export async function searchProjectActivity(
  projectId,
  { page = 1, limit = PROJECT_ACTIVITY_PER_PAGE, ...filters } = {},
) {
  const query = await buildProjectActivityQuery(projectId, filters);
  const skip = (page - 1) * limit;

  const [rawEvents, total] = await Promise.all([
    AuditEvent.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditEvent.countDocuments(query),
  ]);
  const events = await labelActors(projectId, rawEvents);

  return { events, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function exportProjectActivity(projectId, filters = {}) {
  const query = await buildProjectActivityQuery(projectId, filters);
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

async function buildProjectActivityQuery(projectId, { category, actorId, outcome, from, to } = {}) {
  const query = { ...(await buildAuditQuery({ actorId, outcome, from, to })), projectId };

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
