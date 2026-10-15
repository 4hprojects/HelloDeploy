import { createHash, randomUUID } from 'node:crypto';

import {
  AuditEvent,
  PlatformSetting,
  Project,
  ProjectMembership,
  StudyAuditEvent,
  User,
} from '@hellodeploy/database';
import { DeploymentTrigger, PlatformRole, ProjectRole } from '@hellodeploy/contracts';

export const AUDIT_STUDY_CURSOR_KEY = 'study.audit_cursor';
// Web and worker stamp createdAt with their own clocks, so a just-written
// event can land behind the cursor. Waiting this long lets them all arrive.
const SETTLE_MS = 10 * 60 * 1000;
const BATCH_SIZE = 200;

const ADMIN_ROLES = new Set([PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN]);
const PROJECT_ROLES = new Set(Object.values(ProjectRole));
const TRIGGER_TYPES = new Set(Object.values(DeploymentTrigger));
const FAILURE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

/**
 * Copy project audit events into the anonymized study archive before the raw
 * events expire (90-day TTL). Audit events are never modified: progress is a
 * cursor in PlatformSetting, and rows are upserted by a deterministic studyId,
 * so a sweep interrupted before saving its cursor repeats harmlessly.
 *
 * @returns {Promise<number>} events archived in this sweep
 */
export async function archiveAuditEventsForStudy({
  now = () => new Date(),
  newKey = randomUUID,
  batchSize = BATCH_SIZE,
} = {}) {
  const settledBefore = new Date(now().getTime() - SETTLE_MS);
  let cursor = await readCursor();
  let archived = 0;

  while (true) {
    const batch = await AuditEvent.find({
      projectId: { $ne: null },
      createdAt: { $lte: settledBefore },
      ...(cursor && {
        $or: [
          { createdAt: { $gt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $gt: cursor.id } },
        ],
      }),
    })
      .sort({ createdAt: 1, _id: 1 })
      .limit(batchSize)
      .lean();
    if (batch.length === 0) {
      return archived;
    }

    archived += await archiveBatch(batch, newKey);
    const last = batch.at(-1);
    cursor = { createdAt: last.createdAt, id: last._id };
    await PlatformSetting.updateOne(
      { key: AUDIT_STUDY_CURSOR_KEY },
      { $set: { value: { createdAt: last.createdAt, id: last._id.toString() } } },
      { upsert: true },
    );

    if (batch.length < batchSize) {
      return archived;
    }
  }
}

/**
 * The anonymized study row for one audit event. Pure: everything it needs is
 * passed in, and only allowlisted, non-identifying values are copied through.
 */
export function buildStudyAuditDocument({ event, studyProjectKey, actorKind, actorProjectRole }) {
  const createdAt = new Date(event.createdAt);
  return {
    studyId: toStudyId(studyProjectKey, event._id),
    studyProjectKey,
    action: event.action,
    outcome: event.outcome,
    actorKind,
    actorProjectRole: actorProjectRole ?? null,
    day: new Date(
      Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), createdAt.getUTCDate()),
    ),
    hourOfDay: createdAt.getUTCHours(),
    metadata: pickStudyMetadata(event.metadata),
  };
}

async function readCursor() {
  const setting = await PlatformSetting.findOne({ key: AUDIT_STUDY_CURSOR_KEY }).lean();
  if (!setting?.value?.createdAt || !setting.value.id) {
    return null;
  }
  return { createdAt: new Date(setting.value.createdAt), id: setting.value.id };
}

async function archiveBatch(batch, newKey) {
  const projectIds = unique(batch.map((event) => event.projectId));
  const actorIds = unique(batch.map((event) => event.actorId).filter(Boolean));

  const [projects, memberships, users] = await Promise.all([
    Project.find({ _id: { $in: projectIds } })
      .select('studyKey')
      .lean(),
    ProjectMembership.find({ projectId: { $in: projectIds }, userId: { $in: actorIds } })
      .select('projectId userId role')
      .lean(),
    User.find({ _id: { $in: actorIds } })
      .select('platformRole')
      .lean(),
  ]);

  const studyKeys = new Map();
  for (const project of projects) {
    studyKeys.set(project._id.toString(), await ensureStudyKey(project, newKey));
  }
  const roleByMember = new Map(memberships.map((m) => [`${m.projectId}:${m.userId}`, m.role]));
  const adminIds = new Set(
    users.filter((u) => ADMIN_ROLES.has(u.platformRole)).map((u) => u._id.toString()),
  );

  // A deleted project's events are skipped: the archive must not outlive the
  // link the owner removed.
  const operations = batch
    .filter((event) => studyKeys.has(event.projectId.toString()))
    .map((event) => {
      const actorProjectRole = event.actorId
        ? (roleByMember.get(`${event.projectId}:${event.actorId}`) ?? null)
        : null;
      const document = buildStudyAuditDocument({
        event,
        studyProjectKey: studyKeys.get(event.projectId.toString()),
        actorKind: toActorKind(event, actorProjectRole, adminIds),
        actorProjectRole,
      });
      return {
        updateOne: {
          filter: { studyId: document.studyId },
          update: { $set: document },
          upsert: true,
        },
      };
    });

  if (operations.length > 0) {
    await StudyAuditEvent.bulkWrite(operations, { ordered: false });
  }
  return operations.length;
}

// Same race-safe pattern as the deployment archive: concurrent sweeps reuse whichever key won.
async function ensureStudyKey(project, newKey) {
  if (project.studyKey) {
    return project.studyKey;
  }
  await Project.updateOne({ _id: project._id, studyKey: null }, { $set: { studyKey: newKey() } });
  const updated = await Project.findById(project._id).select('studyKey').lean();
  return updated.studyKey;
}

function toActorKind(event, actorProjectRole, adminIds) {
  if (!event.actorId) {
    return 'system';
  }
  if (actorProjectRole) {
    return 'member';
  }
  return adminIds.has(event.actorId.toString()) ? 'admin' : 'other';
}

function pickStudyMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }
  const picked = {};
  if (Number.isInteger(metadata.count)) {
    picked.count = metadata.count;
  }
  if (Number.isInteger(metadata.sequenceNumber)) {
    picked.sequenceNumber = metadata.sequenceNumber;
  }
  if (TRIGGER_TYPES.has(metadata.triggerType)) {
    picked.triggerType = metadata.triggerType;
  }
  if (typeof metadata.failureCode === 'string' && FAILURE_CODE.test(metadata.failureCode)) {
    picked.failureCode = metadata.failureCode;
  }
  for (const key of ['role', 'newRole']) {
    if (PROJECT_ROLES.has(metadata[key])) {
      picked[key] = metadata[key];
    }
  }
  if (typeof metadata.viaInvitation === 'boolean') {
    picked.viaInvitation = metadata.viaInvitation;
  }
  return picked;
}

function toStudyId(studyProjectKey, eventId) {
  return createHash('sha256').update(`${studyProjectKey}:${eventId}`).digest('hex');
}

function unique(ids) {
  return [...new Set(ids.map((id) => id.toString()))];
}
