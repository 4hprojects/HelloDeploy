import { MonitoringIncident, User } from '@hellodeploy/database';
import {
  ADMIN_OPS_EVENT_CHANNEL,
  AuditOutcome,
  IncidentState,
  OPEN_INCIDENT_STATES,
} from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';

import { getRedisConnection } from '../../queue/client.js';

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

export class IncidentNotFoundError extends Error {
  constructor() {
    super('That incident is not open.');
    this.code = 'INCIDENT_NOT_OPEN';
  }
}

/** Open incidents, most severe and most recent first. */
export async function listOpenIncidents({ limit = 50 } = {}) {
  const docs = await MonitoringIncident.find({ state: { $in: OPEN_INCIDENT_STATES } })
    .sort({ lastSeen: -1 })
    .limit(limit)
    .lean();
  const ackIds = [
    ...new Set(
      docs
        .map((d) => d.acknowledgedBy)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const users = ackIds.length
    ? await User.find({ _id: { $in: ackIds } })
        .select('_id firstName lastName')
        .lean()
    : [];
  return docs
    .map((doc) => toView(doc, users))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

/** Incidents resolved in the last `hours`, newest first, for the recovery record. */
export async function listRecentlyResolved({ hours = 24, limit = 8, now = new Date() } = {}) {
  const docs = await MonitoringIncident.find({
    state: IncidentState.RESOLVED,
    resolvedAt: { $gte: new Date(now.getTime() - hours * 3_600_000) },
  })
    .sort({ resolvedAt: -1 })
    .limit(limit)
    .lean();
  return docs.map((doc) => toView(doc, []));
}

/**
 * Record that an administrator is handling an incident. It stays open: only
 * its rule recovering resolves it.
 */
export async function acknowledgeIncident({ incidentId, actor, redis = getRedisConnection() }) {
  const doc = await MonitoringIncident.findOneAndUpdate(
    { _id: incidentId, state: IncidentState.ACTIVE },
    {
      $set: {
        state: IncidentState.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedBy: actor.id,
      },
    },
    { new: true },
  ).lean();
  await writeAuditEvent({
    action: 'admin.incident_acknowledged',
    outcome: doc ? AuditOutcome.SUCCESS : AuditOutcome.FAILURE,
    actorId: actor.id,
    actorRole: actor.role,
    targetType: 'monitoring_incident',
    targetId: String(incidentId),
    sourceIp: actor.sourceIp,
    correlationId: actor.correlationId,
    metadata: doc
      ? { fingerprint: doc.fingerprint, severity: doc.severity }
      : { reason: 'not_active' },
  });
  if (!doc) {
    throw new IncidentNotFoundError();
  }
  if (redis && redis.status === 'ready') {
    redis
      .publish(
        ADMIN_OPS_EVENT_CHANNEL,
        JSON.stringify({
          type: 'incident',
          id: String(doc._id),
          fingerprint: doc.fingerprint,
          severity: doc.severity,
          state: doc.state,
          title: doc.title,
          at: new Date().toISOString(),
          muted: true,
        }),
      )
      .catch(() => {});
  }
  return doc;
}

function toView(doc, users) {
  const acknowledger = users.find((u) => String(u._id) === String(doc.acknowledgedBy));
  return {
    id: String(doc._id),
    fingerprint: doc.fingerprint,
    rule: doc.rule,
    severity: doc.severity,
    state: doc.state,
    title: doc.title,
    detail: doc.detail,
    href: doc.href,
    firstSeen: doc.firstSeen,
    lastSeen: doc.lastSeen,
    occurrences: doc.occurrences,
    resolvedAt: doc.resolvedAt,
    resolution: doc.resolution,
    acknowledgedAt: doc.acknowledgedAt,
    acknowledgedByName: acknowledger
      ? `${acknowledger.firstName} ${acknowledger.lastName}`.trim()
      : null,
  };
}
