import { timingSafeEqual } from 'node:crypto';
import {
  Project,
  ProjectMembership,
  ProjectInvitation,
  ApprovalRequest,
  User,
  Deployment,
  DeploymentEvent,
  EnvironmentSecret,
  Domain,
  Repository,
  Quota,
  mongoose,
} from '@hellodeploy/database';
import {
  ProjectRole,
  ProjectStatus,
  ApprovalStatus,
  QuotaScope,
  AuditOutcome,
  JobType,
  normalizeSubdomainLabel,
  isReservedSubdomain,
  isValidSubdomainLabel,
  BuildStrategy,
  getBuildStrategyRuntime,
  isPythonBuildStrategy,
  normalizeApplicationRoot,
} from '@hellodeploy/contracts';
import { logger, writeAuditEvent } from '@hellodeploy/observability';
import { enqueueJob } from '@hellodeploy/queue';
import { generateToken, hashToken } from '@hellodeploy/security';
import { env } from '../config/env.js';
import { getDeploymentQueue } from '../queue/client.js';
import { checkCanCreateProject, checkCanAddMember } from './quota.service.js';
import {
  assessAutoApprovalEligibility,
  assessInitialApprovalReadiness,
} from './approval-readiness.service.js';
import { notifyAdminsOfPendingReview } from './provisional-approval.service.js';
import { recordProductEvent } from './product-analytics.service.js';
import { sendProjectInviteEmail } from './email.service.js';
import { queueEmailNotification } from './notification.service.js';

const INVITATION_TTL_DAYS = 14;

export async function checkSlugAvailability(value) {
  const slug = normalizeSubdomainLabel(value);
  const valid = isValidSubdomainLabel(slug) && !isReservedSubdomain(slug);
  return { slug, available: valid && !(await Project.exists({ slug })) };
}

// ─── Project CRUD ──────────────────────────────────────────────────────────────

export async function createProject({
  name,
  slug: requestedSlug,
  ownerId,
  sourceIp,
  correlationId,
}) {
  const canCreate = await checkCanCreateProject(ownerId);
  if (!canCreate) {
    return { success: false, error: 'You have reached your project limit.' };
  }

  const slug = normalizeSubdomainLabel(requestedSlug ?? name);
  if (!isValidSubdomainLabel(slug) || isReservedSubdomain(slug)) {
    return {
      success: false,
      error: 'Choose a valid, non-reserved project address.',
      field: 'slug',
    };
  }
  if (await Project.exists({ slug })) {
    return { success: false, error: 'That project address is already in use.', field: 'slug' };
  }

  let project;
  try {
    project = await Project.create({
      name,
      slug,
      ownerId,
      status: ProjectStatus.DRAFT,
      platformSubdomain: slug,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return { success: false, error: 'That project address is already in use.', field: 'slug' };
    }
    throw error;
  }

  await ProjectMembership.create({
    projectId: project._id,
    userId: ownerId,
    role: ProjectRole.OWNER,
    acceptedAt: new Date(),
  });

  await writeAuditEvent({
    action: 'project.created',
    outcome: AuditOutcome.SUCCESS,
    actorId: ownerId.toString(),
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp,
    correlationId,
    metadata: { name, slug },
  });
  await recordProductEvent({ name: 'project_created', userId: ownerId, projectId: project._id });

  return { success: true, project };
}

export async function getUserProjects(userId) {
  const memberships = await ProjectMembership.find({ userId })
    .populate({ path: 'projectId', model: 'Project' })
    .lean();

  return memberships
    .filter((m) => m.projectId)
    .map((m) => ({ project: m.projectId, role: m.role }))
    .sort((a, b) => new Date(b.project.createdAt) - new Date(a.project.createdAt));
}

export async function getProjectBySlug(slug) {
  return Project.findOne({ slug }).lean();
}

export async function getProjectById(id) {
  return Project.findById(id).lean();
}

export async function getUserMembership(userId, projectId) {
  return ProjectMembership.findOne({ userId, projectId }).lean();
}

export async function updateProject({ projectId, name, actorId, sourceIp, correlationId }) {
  const project = await Project.findById(projectId);
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }

  if (project.status === ProjectStatus.ARCHIVED) {
    return { success: false, error: 'Archived projects cannot be edited.' };
  }

  const trimmedName = name?.trim();
  if (!trimmedName || trimmedName === project.name) {
    return { success: true, project: project.toObject() };
  }

  project.name = trimmedName;
  project.configurationVersion += 1;
  await project.save();

  await writeAuditEvent({
    action: 'project.updated',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp,
    correlationId,
    metadata: { name: trimmedName },
  });

  return { success: true, project: project.toObject() };
}

export async function updateBuildConfiguration({
  projectId,
  buildCommand,
  startCommand,
  outputDirectory,
  applicationPort,
  healthCheckPath,
  applicationRoot,
  applicationModule,
  buildStrategy,
  actorId,
  sourceIp,
  correlationId,
}) {
  const project = await Project.findById(projectId);
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }

  if (project.status === ProjectStatus.ARCHIVED) {
    return { success: false, error: 'Archived projects cannot be edited.' };
  }

  const selectedStrategy = buildStrategy?.trim() || BuildStrategy.LEGACY_GENERATED;
  if (selectedStrategy !== BuildStrategy.LEGACY_GENERATED) {
    if (
      project.runtimeType !== getBuildStrategyRuntime(selectedStrategy) ||
      !env.isStrategyEnabledFor(selectedStrategy, project._id)
    ) {
      return { success: false, error: 'That build strategy is not enabled for this project.' };
    }
  }

  project.buildConfiguration = {
    buildCommand: buildCommand?.trim() || null,
    startCommand: startCommand?.trim() || null,
    outputDirectory: outputDirectory?.trim() || null,
    applicationPort: applicationPort?.trim() ? Number(applicationPort.trim()) : null,
    healthCheckPath: healthCheckPath?.trim() || '/',
    applicationRoot: normalizeApplicationRoot(applicationRoot),
    applicationModule: isPythonBuildStrategy(selectedStrategy)
      ? applicationModule?.trim() || null
      : null,
  };
  project.buildStrategy = selectedStrategy;
  project.configurationVersion += 1;
  await project.save();

  await writeAuditEvent({
    action: 'project.build_configuration_updated',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp,
    correlationId,
    metadata: {
      buildConfiguration: project.buildConfiguration,
      buildStrategy: project.buildStrategy,
    },
  });

  return { success: true, project: project.toObject() };
}

export async function resetBuildConfigurationToDetected({
  projectId,
  actorId,
  sourceIp,
  correlationId,
}) {
  const project = await Project.findById(projectId);
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }
  if (project.status === ProjectStatus.ARCHIVED) {
    return { success: false, error: 'Archived projects cannot be edited.' };
  }
  const detected = project.detection?.detectedConfiguration;
  if (!detected) {
    return { success: false, error: 'Run app setup detection before resetting.' };
  }

  project.buildConfiguration = detected.toObject?.() ?? { ...detected };
  const recommendedStrategy =
    project.detection?.recommendedBuildStrategy ?? BuildStrategy.LEGACY_GENERATED;
  project.buildStrategy = env.isStrategyEnabledFor(recommendedStrategy, project._id)
    ? recommendedStrategy
    : BuildStrategy.LEGACY_GENERATED;
  project.configurationVersion += 1;
  await project.save();
  await writeAuditEvent({
    action: 'project.build_configuration_reset',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp,
    correlationId,
  });
  return { success: true, project: project.toObject() };
}

/**
 * Generates a new deploy hook token for a project, replacing any existing one.
 * Only the hash is persisted — the raw token is returned once and must be
 * shown to the caller immediately; it cannot be recovered afterward.
 */
export async function generateDeployHookToken({ projectId, actorId, sourceIp, correlationId }) {
  const project = await Project.findById(projectId);
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }

  const { raw, hash } = generateToken();
  project.deployHookTokenHash = hash;
  await project.save();

  await writeAuditEvent({
    action: 'project.deploy_hook_token_generated',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp,
    correlationId,
  });

  return { success: true, rawToken: raw };
}

export async function revokeDeployHookToken({ projectId, actorId, sourceIp, correlationId }) {
  const project = await Project.findById(projectId);
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }

  project.deployHookTokenHash = null;
  await project.save();

  await writeAuditEvent({
    action: 'project.deploy_hook_token_revoked',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp,
    correlationId,
  });

  return { success: true };
}

/**
 * Verifies a raw deploy hook token against the project's stored hash.
 * Used by the unauthenticated /api/deploy-hooks route.
 */
export async function verifyDeployHookToken(projectId, rawToken) {
  if (!rawToken || !mongoose.isValidObjectId(projectId)) {
    return null;
  }

  const project = await Project.findById(projectId).lean();
  if (!project?.deployHookTokenHash) {
    return null;
  }

  const submitted = Buffer.from(hashToken(rawToken), 'hex');
  const stored = Buffer.from(project.deployHookTokenHash, 'hex');
  if (submitted.length !== stored.length || !timingSafeEqual(submitted, stored)) {
    return null;
  }

  return project;
}

export async function updateBuildFilters({
  projectId,
  includedPaths,
  ignoredPaths,
  actorId,
  sourceIp,
  correlationId,
}) {
  const project = await Project.findById(projectId);
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }

  if (project.status === ProjectStatus.ARCHIVED) {
    return { success: false, error: 'Archived projects cannot be edited.' };
  }

  project.buildFilters = { includedPaths, ignoredPaths };
  await project.save();

  await writeAuditEvent({
    action: 'project.build_filters_updated',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp,
    correlationId,
    metadata: { includedPaths, ignoredPaths },
  });

  return { success: true, project: project.toObject() };
}

export async function enableProjectMaintenance({
  projectId,
  message,
  actorId,
  sourceIp,
  correlationId,
}) {
  const project = await Project.findById(projectId);
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }

  project.maintenanceMode = {
    enabled: true,
    message: message?.trim() || null,
    enabledAt: new Date(),
  };
  await project.save();

  const queue = getDeploymentQueue();
  if (queue) {
    await enqueueJob(
      queue,
      JobType.SET_PROJECT_MAINTENANCE,
      {
        version: 1,
        correlationId,
        actorId: actorId.toString(),
        actorRole: 'OWNER',
        projectId: projectId.toString(),
        enabled: true,
        message: project.maintenanceMode.message,
      },
      { jobId: `maintenance-${projectId}-${Date.now()}` },
    );
  }

  await writeAuditEvent({
    action: 'project.maintenance_enabled',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp,
    correlationId,
  });

  return { success: true };
}

export async function disableProjectMaintenance({ projectId, actorId, sourceIp, correlationId }) {
  const project = await Project.findById(projectId);
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }

  project.maintenanceMode = { enabled: false, message: null, enabledAt: null };
  await project.save();

  const queue = getDeploymentQueue();
  if (queue) {
    await enqueueJob(
      queue,
      JobType.SET_PROJECT_MAINTENANCE,
      {
        version: 1,
        correlationId,
        actorId: actorId.toString(),
        actorRole: 'OWNER',
        projectId: projectId.toString(),
        enabled: false,
      },
      { jobId: `maintenance-${projectId}-${Date.now()}` },
    );
  }

  await writeAuditEvent({
    action: 'project.maintenance_disabled',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp,
    correlationId,
  });

  return { success: true };
}

export async function archiveProject({ projectId, actorId, sourceIp, correlationId }) {
  const project = await Project.findById(projectId);
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }

  if (project.status === ProjectStatus.ARCHIVED) {
    return { success: false, error: 'Project is already archived.' };
  }

  project.status = ProjectStatus.ARCHIVED;
  project.archivedAt = new Date();
  await project.save();

  await writeAuditEvent({
    action: 'project.archived',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp,
    correlationId,
  });

  return { success: true };
}

/**
 * Permanently deletes a project: tears down its running container/nginx route
 * (via a worker job, since only the worker can reach docker/nginx) and
 * cascade-deletes all associated database records. Unlike archiveProject,
 * this is irreversible.
 */
export async function deleteProject({ projectId, actorId, sourceIp, correlationId }, deps = {}) {
  const getQueue = deps.getDeploymentQueue ?? getDeploymentQueue;
  const addJob = deps.enqueueJob ?? enqueueJob;
  const project = await Project.findById(projectId).lean();
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }

  // Capture the complete infrastructure inventory before deleting deployment
  // records. The worker cannot reconstruct retained containers/images later.
  const deployments = await Deployment.find(
    { projectId },
    '_id activeContainerId imageTag imageRef imageDigest',
  ).lean();
  const deploymentIds = deployments.map((deployment) => deployment._id);
  const containerIds = [
    ...new Set(deployments.map((deployment) => deployment.activeContainerId).filter(Boolean)),
  ];
  const imageTags = [
    ...new Set(deployments.map((deployment) => deployment.imageTag).filter(Boolean)),
  ];
  const registryImageRefs = [
    ...new Map(
      deployments
        .filter((deployment) => deployment.imageRef && deployment.imageDigest)
        .map((deployment) => [deployment.imageDigest, deployment.imageRef]),
    ).values(),
  ];

  const queue = getQueue();
  if (!queue) {
    return {
      success: false,
      error:
        'Project deletion is temporarily unavailable because the deployment worker queue is offline.',
    };
  }

  try {
    await addJob(
      queue,
      JobType.DELETE_PROJECT,
      {
        version: 2,
        correlationId,
        actorId: actorId.toString(),
        actorRole: 'OWNER',
        projectId: projectId.toString(),
        subdomain: project.platformSubdomain ?? project.slug,
        containerIds,
        imageTags,
        registryImageRefs,
        projectSlug: project.slug,
      },
      { jobId: `delete-${projectId}` },
    );
  } catch {
    return {
      success: false,
      error: 'Could not schedule infrastructure teardown. The project was not deleted.',
    };
  }

  await Promise.all([
    ProjectMembership.deleteMany({ projectId }),
    ApprovalRequest.deleteMany({ projectId }),
    EnvironmentSecret.deleteMany({ projectId }),
    Domain.deleteMany({ projectId }),
    DeploymentEvent.deleteMany({ deploymentId: { $in: deploymentIds } }),
    Deployment.deleteMany({ projectId }),
    Quota.deleteMany({ scopeType: QuotaScope.PROJECT, scopeId: projectId }),
  ]);

  await Project.deleteOne({ _id: projectId });

  await writeAuditEvent({
    action: 'project.deleted',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: projectId.toString(),
    sourceIp,
    correlationId,
    metadata: { name: project.name, slug: project.slug },
  });

  return { success: true };
}

// ─── Approval ─────────────────────────────────────────────────────────────────

export async function getLatestApprovalRequest(projectId) {
  return ApprovalRequest.findOne({ projectId }).sort({ createdAt: -1 }).lean();
}

export async function submitForReview(
  { projectId, actorId, purpose, sourceIp, correlationId },
  deps = {},
) {
  const isAutoApprovalEnabled = deps.isAutoApprovalEnabled ?? env.AUTO_APPROVAL_ENABLED;
  const project = await Project.findById(projectId);
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }

  if (project.status !== ProjectStatus.DRAFT) {
    return { success: false, error: 'Only draft projects can be submitted for review.' };
  }

  const normalizedPurpose = purpose?.trim() ?? '';
  if (normalizedPurpose.length < 10 || normalizedPurpose.length > 500) {
    return {
      success: false,
      error: 'Describe what your application does in 10 to 500 characters.',
      field: 'purpose',
    };
  }

  const existing = await ApprovalRequest.findOne({
    projectId,
    status: ApprovalStatus.PENDING,
  });
  if (existing) {
    return { success: false, error: 'A review request is already pending for this project.' };
  }

  const [repository, secretRecords] = await Promise.all([
    project.repositoryId ? Repository.findById(project.repositoryId) : null,
    EnvironmentSecret.find({ projectId }).select('name').lean(),
  ]);
  const readiness = assessInitialApprovalReadiness({
    project,
    repository,
    configuredEnvironmentVariables: secretRecords.map(({ name }) => name),
  });
  if (!readiness.isReady) {
    await recordProductEvent({
      name: 'readiness_blocked',
      userId: actorId,
      projectId,
      properties: { reason: readiness.findings.find((item) => item.status === 'BLOCKING')?.code },
    });
    return {
      success: false,
      error: 'Complete the required items before submitting your project.',
      readiness,
    };
  }

  const snapshot = {
    projectId,
    requestedBy: actorId,
    requestType: 'INITIAL_DEPLOYMENT',
    purpose: normalizedPurpose,
    snapshotConfigurationVersion: project.configurationVersion,
    snapshotCommitSha: readiness.currentCommitSha,
    validationFindings: readiness.findings,
  };

  if (isAutoApprovalEnabled) {
    const autoApproval = await tryAutoApprove({ project, readiness, snapshot });
    if (autoApproval) {
      await writeAuditEvent({
        action: 'project.auto_approved',
        outcome: AuditOutcome.SUCCESS,
        actorId,
        targetType: 'project',
        targetId: project._id.toString(),
        sourceIp,
        correlationId,
        metadata: {
          approvalRequestId: autoApproval._id.toString(),
          configurationVersion: project.configurationVersion,
          commitSha: readiness.currentCommitSha,
          reasons: autoApproval.autoApprovalReasons,
        },
      });
      await recordProductEvent({ name: 'approval_submitted', userId: actorId, projectId });
      return { success: true, request: autoApproval, isAutoApproved: true };
    }
  }

  let request;
  try {
    request = await ApprovalRequest.create(snapshot);
  } catch (err) {
    if (err?.code === 11000) {
      return { success: false, error: 'A review request is already pending for this project.' };
    }
    throw err;
  }

  await writeAuditEvent({
    action: 'project.review_requested',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp,
    correlationId,
    metadata: {
      approvalRequestId: request._id.toString(),
      configurationVersion: project.configurationVersion,
      commitSha: readiness.currentCommitSha,
    },
  });
  await recordProductEvent({ name: 'approval_submitted', userId: actorId, projectId });
  await notifyAdminsOfPendingReview({ project, correlationId }).catch((err) =>
    logger.warn('Approval: could not notify admins of a pending review', {
      projectId: project._id.toString(),
      error: err.message,
      correlationId,
    }),
  );

  return { success: true, request, isAutoApproved: false };
}

/**
 * Approve a ready submission without an admin when the owner and runtime qualify.
 * Returns the approved request, or null when the project must go to the queue.
 */
async function tryAutoApprove({ project, readiness, snapshot }) {
  const ownedProjectIds = await Project.find({
    ownerId: project.ownerId,
    _id: { $ne: project._id },
  }).distinct('_id');
  const [owner, hasPriorApproval] = await Promise.all([
    User.findById(project.ownerId).select('accountTier isTrustedForAutoApproval').lean(),
    ApprovalRequest.exists({
      projectId: { $in: ownedProjectIds },
      status: ApprovalStatus.APPROVED,
    }),
  ]);
  const eligibility = assessAutoApprovalEligibility({
    project,
    readiness,
    owner,
    hasPriorApproval: Boolean(hasPriorApproval),
  });
  if (!eligibility.isEligible) {
    return null;
  }

  const session = await mongoose.startSession();
  let request = null;
  try {
    await session.withTransaction(async () => {
      request = null;
      const activated = await Project.updateOne(
        { _id: project._id, status: ProjectStatus.DRAFT },
        { $set: { status: ProjectStatus.ACTIVE } },
        { session },
      );
      // Someone else moved the project out of DRAFT; let the normal path report it.
      if (activated.modifiedCount !== 1) {
        return;
      }
      [request] = await ApprovalRequest.create(
        [
          {
            ...snapshot,
            status: ApprovalStatus.APPROVED,
            reviewedAt: new Date(),
            isAutoApproved: true,
            autoApprovalReasons: eligibility.reasons,
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  return request;
}

// ─── Membership ────────────────────────────────────────────────────────────────

export async function getProjectMembers(projectId) {
  return ProjectMembership.find({ projectId })
    .populate('userId', 'firstName lastName email')
    .lean();
}

export async function inviteMember(
  {
    projectId,
    ownerId,
    inviteeEmail,
    role,
    projectName,
    projectSlug,
    inviterName,
    actorId,
    sourceIp,
    correlationId,
  },
  deps = {},
) {
  const email = inviteeEmail.toLowerCase();
  const invitee = await User.findOne({ email });
  if (!invitee) {
    return invitePendingMember(
      {
        projectId,
        ownerId,
        email,
        role,
        projectName,
        inviterName,
        actorId,
        sourceIp,
        correlationId,
      },
      deps,
    );
  }

  const existing = await ProjectMembership.findOne({ projectId, userId: invitee._id });
  if (existing) {
    return { success: false, error: 'This user is already a member of the project.' };
  }

  const canAdd = await checkCanAddMember(projectId, ownerId);
  if (!canAdd) {
    return { success: false, error: 'This project has reached its member limit.' };
  }

  await ProjectMembership.create({
    projectId,
    userId: invitee._id,
    role,
    invitedBy: actorId,
    acceptedAt: new Date(),
  });

  await writeAuditEvent({
    action: 'project.member_added',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: projectId.toString(),
    sourceIp,
    correlationId,
    metadata: { inviteeId: invitee._id.toString(), role },
  });

  const queueEmail = deps.queueEmailNotification ?? queueEmailNotification;
  try {
    await queueEmail({
      userId: invitee._id,
      kind: 'project-member-added',
      payload: {
        firstName: invitee.firstName,
        inviterName,
        projectName,
        role,
        projectUrl: `${baseUrl()}/projects/${projectSlug}`,
      },
      correlationId,
      projectId,
    });
  } catch (error) {
    // The membership is already in place; a missed notice must not undo it.
    logger.warn('[members] Member-added email could not be queued', {
      projectId: projectId.toString(),
      correlationId,
      errorType: error?.name ?? 'error',
    });
  }

  return { success: true, pending: false };
}

/**
 * Add every unexpired invitation for a newly verified email as a membership.
 * Never throws: a failed claim must not block sign-up.
 */
export async function claimPendingInvitations({ user, sourceIp, correlationId }) {
  try {
    const invitations = await ProjectInvitation.find({
      email: user.email.toLowerCase(),
      expiresAt: { $gt: new Date() },
    }).lean();
    for (const invitation of invitations) {
      await claimInvitation(invitation, user, { sourceIp, correlationId });
    }
    return invitations.length;
  } catch (error) {
    logger.error('[members] Pending invitations could not be claimed', {
      userId: user._id.toString(),
      correlationId,
      errorType: error?.name ?? 'error',
    });
    return 0;
  }
}

export async function getPendingInvitations(projectId) {
  return ProjectInvitation.find({ projectId, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: 1 })
    .lean();
}

export async function revokeInvitation({
  projectId,
  invitationId,
  actorId,
  sourceIp,
  correlationId,
}) {
  if (!mongoose.isValidObjectId(invitationId)) {
    return { success: false, error: 'Invitation not found.' };
  }
  const invitation = await ProjectInvitation.findOneAndDelete({ _id: invitationId, projectId });
  if (!invitation) {
    return { success: false, error: 'Invitation not found.' };
  }

  await writeAuditEvent({
    action: 'project.invitation_revoked',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: projectId.toString(),
    sourceIp,
    correlationId,
    metadata: { invitationId: invitation._id.toString(), role: invitation.role },
  });

  return { success: true };
}

async function invitePendingMember(
  { projectId, ownerId, email, role, projectName, inviterName, actorId, sourceIp, correlationId },
  deps,
) {
  const now = new Date();
  const pending = await ProjectInvitation.findOne({ projectId, email, expiresAt: { $gt: now } });
  if (pending) {
    return { success: false, error: 'This email has already been invited.' };
  }

  const canAdd = await checkCanAddMember(projectId, ownerId);
  if (!canAdd) {
    return { success: false, error: 'This project has reached its member limit.' };
  }

  // Upsert so an expired invite for the same address is refreshed in place.
  const invitation = await ProjectInvitation.findOneAndUpdate(
    { projectId, email },
    {
      $set: {
        role,
        invitedBy: actorId,
        expiresAt: new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await writeAuditEvent({
    action: 'project.member_invited',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: projectId.toString(),
    sourceIp,
    correlationId,
    metadata: { invitationId: invitation._id.toString(), role },
  });

  const sendInviteEmail = deps.sendInviteEmail ?? sendProjectInviteEmail;
  let emailStatus = 'failed';
  try {
    const result = await sendInviteEmail({
      to: email,
      inviterName,
      projectName,
      role,
      signupUrl: `${baseUrl()}/create-account`,
      expiresInDays: INVITATION_TTL_DAYS,
      correlationId,
    });
    emailStatus = result.status;
  } catch (error) {
    // The invite stays valid; the owner is told to pass the link on themselves.
    logger.warn('[members] Invitation email could not be sent', {
      projectId: projectId.toString(),
      correlationId,
      errorType: error?.name ?? 'error',
    });
  }

  return { success: true, pending: true, emailStatus };
}

async function claimInvitation(invitation, user, { sourceIp, correlationId }) {
  try {
    await ProjectMembership.create({
      projectId: invitation.projectId,
      userId: user._id,
      role: invitation.role,
      invitedBy: invitation.invitedBy,
      acceptedAt: new Date(),
    });
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }
  }
  await ProjectInvitation.deleteOne({ _id: invitation._id });

  await writeAuditEvent({
    action: 'project.member_added',
    outcome: AuditOutcome.SUCCESS,
    actorId: user._id.toString(),
    targetType: 'project',
    targetId: invitation.projectId.toString(),
    sourceIp,
    correlationId,
    metadata: { inviteeId: user._id.toString(), role: invitation.role, viaInvitation: true },
  });
}

function baseUrl() {
  return env.isProduction() ? `https://${env.PLATFORM_DOMAIN}` : `http://localhost:${env.PORT}`;
}

export async function removeMember({ projectId, userId, actorId, sourceIp, correlationId }) {
  const membership = await ProjectMembership.findOne({ projectId, userId });
  if (!membership) {
    return { success: false, error: 'Member not found.' };
  }

  if (membership.role === ProjectRole.OWNER) {
    return {
      success: false,
      error: 'Cannot remove the project owner. Transfer ownership first.',
    };
  }

  await ProjectMembership.deleteOne({ projectId, userId });

  await writeAuditEvent({
    action: 'project.member_removed',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: projectId.toString(),
    sourceIp,
    correlationId,
    metadata: { removedUserId: userId.toString() },
  });

  return { success: true };
}

export async function updateMemberRole({
  projectId,
  userId,
  role,
  actorId,
  sourceIp,
  correlationId,
}) {
  const membership = await ProjectMembership.findOne({ projectId, userId });
  if (!membership) {
    return { success: false, error: 'Member not found.' };
  }

  if (membership.role === ProjectRole.OWNER) {
    return { success: false, error: "Cannot change the owner's role. Use ownership transfer." };
  }

  if (role === ProjectRole.OWNER) {
    return { success: false, error: 'Use ownership transfer to assign ownership.' };
  }

  membership.role = role;
  await membership.save();

  await writeAuditEvent({
    action: 'project.member_role_updated',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: projectId.toString(),
    sourceIp,
    correlationId,
    metadata: { updatedUserId: userId.toString(), newRole: role },
  });

  return { success: true };
}

export async function transferOwnership({
  projectId,
  newOwnerId,
  actorId,
  sourceIp,
  correlationId,
}) {
  // `newOwnerId` arrives from the request body. Mongoose casts an operator's
  // operand but not the operator itself, so `{ $ne: null }` would reach the
  // query and match whichever membership happens to come first — handing the
  // project to someone the owner did not choose.
  if (!mongoose.isValidObjectId(newOwnerId)) {
    return { success: false, error: 'Choose a member to transfer ownership to.' };
  }

  const [currentMembership, newMembership] = await Promise.all([
    ProjectMembership.findOne({ projectId, userId: actorId }),
    ProjectMembership.findOne({ projectId, userId: newOwnerId }),
  ]);

  if (!currentMembership || currentMembership.role !== ProjectRole.OWNER) {
    return { success: false, error: 'Only the project owner can transfer ownership.' };
  }

  if (!newMembership) {
    return { success: false, error: 'New owner must be an existing project member.' };
  }

  if (newOwnerId.toString() === actorId.toString()) {
    return { success: false, error: 'You are already the owner.' };
  }

  await Promise.all([
    ProjectMembership.updateOne(
      { projectId, userId: actorId },
      { $set: { role: ProjectRole.MAINTAINER } },
    ),
    ProjectMembership.updateOne(
      { projectId, userId: newOwnerId },
      { $set: { role: ProjectRole.OWNER } },
    ),
    Project.updateOne({ _id: projectId }, { $set: { ownerId: newOwnerId } }),
  ]);

  await writeAuditEvent({
    action: 'project.ownership_transferred',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: projectId.toString(),
    sourceIp,
    correlationId,
    metadata: { previousOwnerId: actorId.toString(), newOwnerId: newOwnerId.toString() },
  });

  return { success: true };
}
