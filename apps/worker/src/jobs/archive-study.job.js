import { randomUUID } from 'node:crypto';

import {
  Deployment,
  DeploymentEvent,
  Domain,
  Project,
  Repository,
  StudyDeployment,
  User,
} from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { isTerminal } from '@hellodeploy/deployment-core';
import { logger } from '@hellodeploy/observability';

import { anonymizeLine, buildIdentifierReplacements } from '../deployment/study-anonymizer.js';

export const MAX_STUDY_LOG_LINES = 2000;
const TERMINAL_STATUSES = Object.values(DeploymentStatus).filter(isTerminal);
// Lets the last log lines and status writes land before a deployment is copied.
const SETTLE_MS = 10 * 60 * 1000;
const BATCH_SIZE = 50;

function startOfUtcDay(date) {
  const day = new Date(date);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
}

/**
 * The anonymized study row for one finished deployment. Pure: everything it
 * needs is passed in, and nothing identifying is copied through.
 */
export function buildStudyDocument({
  deployment,
  events,
  runtimeType,
  studyId,
  studyProjectKey,
  replacements,
}) {
  const createdAt = new Date(deployment.createdAt).getTime();
  const completedAt = deployment.completedAt ? new Date(deployment.completedAt).getTime() : null;
  const firstEventAt = events.length > 0 ? new Date(events[0].createdAt).getTime() : null;

  const stageMs = {};
  const stageStarts = [];
  for (const event of events) {
    if (stageStarts.at(-1)?.stage !== event.stage) {
      stageStarts.push({ stage: event.stage, at: new Date(event.createdAt).getTime() });
    }
  }
  stageStarts.forEach(({ stage, at }, index) => {
    const end = stageStarts[index + 1]?.at ?? completedAt;
    if (end !== null && end >= at) {
      stageMs[stage] = (stageMs[stage] ?? 0) + (end - at);
    }
  });

  return {
    studyId,
    studyProjectKey,
    runtimeType: runtimeType ?? null,
    triggerType: deployment.triggerType ?? null,
    status: deployment.status,
    finalStage: deployment.currentStage ?? events.at(-1)?.stage ?? null,
    failureCode: deployment.failureCode ?? null,
    failureSummary: deployment.failureSummary
      ? anonymizeLine(deployment.failureSummary, replacements).slice(0, 1000)
      : null,
    sequenceNumber: deployment.sequenceNumber ?? null,
    day: startOfUtcDay(deployment.createdAt),
    queueWaitMs: firstEventAt === null ? null : Math.max(0, firstEventAt - createdAt),
    totalMs: completedAt === null ? null : Math.max(0, completedAt - createdAt),
    stageMs,
    logLineCount: events.length,
    logs: events.slice(0, MAX_STUDY_LOG_LINES).map((event) => ({
      offsetMs: Math.max(0, new Date(event.createdAt).getTime() - createdAt),
      stage: event.stage,
      level: event.level,
      message: anonymizeLine(event.messageRedacted, replacements),
    })),
  };
}

// Random keys are created once and only ever stored on the live record, so
// a concurrent sweep must reuse whichever value won.
async function ensureRandomKey(Model, id, field, newKey) {
  await Model.updateOne({ _id: id, [field]: null }, { $set: { [field]: newKey() } });
  const record = await Model.findById(id).select(field).lean();
  return record[field];
}

async function archiveOne(deployment, { now, newKey }) {
  const project = await Project.findById(deployment.projectId)
    .select('slug platformSubdomain ownerId repositoryId runtimeType studyKey')
    .lean();
  if (!project) {
    // Project deletion removes its deployments; an orphan has nothing to anonymize against.
    await Deployment.updateOne({ _id: deployment._id }, { $set: { studyArchivedAt: now() } });
    return false;
  }

  const [studyProjectKey, studyId, events, repo, domains, owner] = await Promise.all([
    ensureRandomKey(Project, project._id, 'studyKey', newKey),
    ensureRandomKey(Deployment, deployment._id, 'studyId', newKey),
    DeploymentEvent.find({ deploymentId: deployment._id }).sort({ createdAt: 1, _id: 1 }).lean(),
    project.repositoryId
      ? Repository.findById(project.repositoryId).select('fullName name ownerLogin').lean()
      : null,
    Domain.find({ projectId: project._id }).select('hostnameNormalized').lean(),
    User.findById(project.ownerId).select('firstName lastName email').lean(),
  ]);

  const replacements = buildIdentifierReplacements({
    domains: domains.map((domain) => domain.hostnameNormalized),
    repoFullName: repo?.fullName,
    repoOwner: repo?.ownerLogin,
    repoName: repo?.name,
    slug: project.slug,
    subdomain: project.platformSubdomain,
    ownerName: [owner?.firstName, owner?.lastName].filter(Boolean).join(' ') || null,
    ownerEmail: owner?.email,
    commitShas: [deployment.commitSha].filter(Boolean),
  });

  const document = buildStudyDocument({
    deployment,
    events,
    runtimeType: project.runtimeType,
    studyId,
    studyProjectKey,
    replacements,
  });
  await StudyDeployment.updateOne({ studyId }, { $set: document }, { upsert: true });
  await Deployment.updateOne({ _id: deployment._id }, { $set: { studyArchivedAt: now() } });
  return true;
}

/**
 * Copy finished deployments into the anonymized study archive before their
 * raw logs expire (30-day TTL). Safe to re-run: rows are upserted by studyId.
 *
 * @returns {Promise<number>} deployments archived in this sweep
 */
export async function archiveDeploymentsForStudy({
  now = () => new Date(),
  newKey = randomUUID,
  batchSize = BATCH_SIZE,
} = {}) {
  let archived = 0;
  while (true) {
    const batch = await Deployment.find({
      studyArchivedAt: null,
      status: { $in: TERMINAL_STATUSES },
      completedAt: { $ne: null, $lte: new Date(now().getTime() - SETTLE_MS) },
    })
      .sort({ completedAt: 1 })
      .limit(batchSize)
      .lean();

    let failed = 0;
    for (const deployment of batch) {
      try {
        if (await archiveOne(deployment, { now, newKey })) {
          archived += 1;
        }
      } catch (err) {
        failed += 1;
        logger.error('StudyArchive: could not archive deployment', {
          deploymentId: deployment._id.toString(),
          error: err.message,
        });
      }
    }

    // A batch where every item failed would be fetched again forever.
    if (batch.length < batchSize || failed === batch.length) {
      return archived;
    }
  }
}
