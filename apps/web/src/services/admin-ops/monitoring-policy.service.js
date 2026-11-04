import { PlatformSetting } from '@hellodeploy/database';
import {
  AuditOutcome,
  MONITORING_POLICY_KEY,
  diffMonitoringPolicy,
  normalizeMonitoringPolicy,
} from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';

// Read by every overview render and live refresh; a short cache keeps a room
// of open dashboards from turning into a Mongo read per request.
const POLICY_CACHE_TTL_MS = 5_000;
let cached = null;
let cachedAt = 0;

export class PolicyConflictError extends Error {
  constructor() {
    super('The monitoring policy was changed by someone else.');
    this.code = 'POLICY_REVISION_CONFLICT';
  }
}

export async function getMonitoringPolicy({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cachedAt < POLICY_CACHE_TTL_MS) {
    return cached;
  }
  const setting = await PlatformSetting.findOne({ key: MONITORING_POLICY_KEY }).lean();
  cached = {
    ...normalizeMonitoringPolicy(setting?.value),
    updatedAt: setting?.updatedAt ?? null,
    updatedBy: setting?.updatedBy ?? null,
  };
  cachedAt = Date.now();
  return cached;
}

/**
 * Save a validated policy. `value.revision` is the revision the administrator
 * edited; a save against an older revision is refused instead of silently
 * overwriting someone else's change.
 */
export async function saveMonitoringPolicy({
  value,
  actor,
  action = 'admin.monitoring_policy_updated',
}) {
  const before = await getMonitoringPolicy({ fresh: true });
  if (value.revision !== before.revision) {
    await auditPolicy({
      actor,
      action,
      outcome: AuditOutcome.FAILURE,
      metadata: { reason: 'revision_conflict' },
    });
    throw new PolicyConflictError();
  }
  const next = normalizeMonitoringPolicy({ ...value, revision: before.revision + 1 });
  const filter =
    before.revision === 0
      ? {
          key: MONITORING_POLICY_KEY,
          $or: [{ 'value.revision': { $exists: false } }, { 'value.revision': 0 }],
        }
      : { key: MONITORING_POLICY_KEY, 'value.revision': before.revision };
  let setting;
  try {
    setting = await PlatformSetting.findOneAndUpdate(
      filter,
      { $set: { value: next, updatedBy: actor.id } },
      { upsert: before.revision === 0, new: true },
    ).lean();
  } catch (error) {
    // Two first-time saves racing: the loser's upsert hits the unique key.
    if (error?.code === 11000) {
      throw new PolicyConflictError();
    }
    throw error;
  }
  if (!setting) {
    throw new PolicyConflictError();
  }
  const changes = diffMonitoringPolicy(normalizeMonitoringPolicy(before), next);
  await auditPolicy({
    actor,
    action,
    outcome: AuditOutcome.SUCCESS,
    metadata: { revision: next.revision, changes },
  });
  cached = { ...next, updatedAt: setting.updatedAt, updatedBy: setting.updatedBy };
  cachedAt = Date.now();
  return { policy: cached, changes };
}

export async function resetMonitoringPolicy({ actor, revision }) {
  return saveMonitoringPolicy({
    value: { ...normalizeMonitoringPolicy(null), revision },
    actor,
    action: 'admin.monitoring_policy_reset',
  });
}

function auditPolicy({ actor, action, outcome, metadata }) {
  return writeAuditEvent({
    action,
    outcome,
    actorId: actor.id,
    actorRole: actor.role,
    targetType: 'platform_setting',
    targetId: MONITORING_POLICY_KEY,
    sourceIp: actor.sourceIp,
    correlationId: actor.correlationId,
    metadata,
  });
}

/** Test seam: forget the cached policy. */
export function clearMonitoringPolicyCache() {
  cached = null;
  cachedAt = 0;
}
