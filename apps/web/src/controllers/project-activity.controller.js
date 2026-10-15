import { AuditOutcome } from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';

import { asyncHandler } from '../utils/async-handler.js';
import {
  ACTIVITY_CATEGORIES,
  describeAction,
  describeDetails,
  exportProjectActivity,
  getProjectActivityActors,
  searchProjectActivity,
} from '../services/audit-search.service.js';

const FILTER_KEYS = ['category', 'actorId', 'outcome', 'from', 'to'];
// A cell starting with one of these runs as a formula in spreadsheet apps, and
// actor names are chosen by users.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export const getProjectActivity = asyncHandler(async (req, res) => {
  const project = req.project;
  const filters = readFilters(req.query);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

  const [result, actors] = await Promise.all([
    searchProjectActivity(project._id, { ...filters, page }),
    getProjectActivityActors(project._id),
  ]);

  res.render('pages/projects/activity', {
    title: `Activity – ${project.name}`,
    project,
    ...result,
    events: result.events.map(toRow),
    actors,
    categories: Object.entries(ACTIVITY_CATEGORIES).map(([key, { label }]) => ({ key, label })),
    filters,
    hasFilters: FILTER_KEYS.some((key) => filters[key] !== ''),
  });
});

export const getProjectActivityExport = asyncHandler(async (req, res) => {
  const project = req.project;
  const filters = readFilters(req.query);
  const events = await exportProjectActivity(project._id, filters);

  await writeAuditEvent({
    action: 'project.audit_exported',
    outcome: AuditOutcome.SUCCESS,
    actorId: req.session.user.id,
    actorRole: req.membership.role,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp: req.ip,
    correlationId: req.correlationId,
    metadata: { count: events.length, filters },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${project.slug}-activity.csv"`);
  res.send(toActivityCsv(events));
});

/**
 * The export as CSV text. IP addresses and user agents are left out: they are
 * admin-only data, not something project members see.
 */
export function toActivityCsv(events) {
  const header = ['time', 'event', 'action', 'outcome', 'actor', 'details'];
  const rows = events.map((event) => {
    const row = toRow(event);
    return [
      new Date(event.createdAt).toISOString(),
      row.label,
      event.action,
      event.outcome,
      row.actorLabel,
      row.details,
    ]
      .map(csvCell)
      .join(',');
  });
  return `${header.map(csvCell).join(',')}\n${rows.join('\n')}\n`;
}

function readFilters(query) {
  return Object.fromEntries(
    FILTER_KEYS.map((key) => [key, typeof query[key] === 'string' ? query[key].slice(0, 100) : '']),
  );
}

function toRow(event) {
  return {
    createdAt: event.createdAt,
    action: event.action,
    outcome: event.outcome,
    label: describeAction(event.action),
    actorLabel: event.actorLabel,
    details: describeDetails(event.metadata),
  };
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
