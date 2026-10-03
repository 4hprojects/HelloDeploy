import { timingSafeEqual } from 'node:crypto';
import {
  Project,
  ProjectMembership,
  ApprovalRequest,
  User,
  Deployment,
  DeploymentEvent,
  EnvironmentSecret,
  Domain,
  Repository,
  mongoose,
} from '@hellodeploy/database';
import {
  ProjectRole,
  ProjectStatus,
  ApprovalStatus,
  AuditOutcome,
  JobType,
  normalizeSubdomainLabel,
  isReservedSubdomain,
  isValidSubdomainLabel,
} from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';
import { enqueueJob } from '@hellodeploy/queue';
import { generateToken, hashToken } from '@hellodeploy/security';
import { getDeploymentQueue } from '../queue/client.js';
import { checkCanCreateProject, checkCanAddMember } from './quota.service.js';
import { assessInitialApprovalReadiness } from './approval-readiness.service.js';
import { recordProductEvent } from './product-analytics.service.js';

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

  project.buildConfiguration = {
    buildCommand: buildCommand?.trim() || null,
    startCommand: startCommand?.trim() || null,
    outputDirectory: outputDirectory?.trim() || null,
    applicationPort: applicationPort?.trim() ? Number(applicationPort.trim()) : null,
    healthCheckPath: healthCheckPath?.trim() || '/',
  };
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
    metadata: { buildConfiguration: project.buildConfiguration },
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
export async function deleteProject({ projectId, actorId, sourceIp, correlationId }) {
  const project = await Project.findById(projectId).lean();
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }

  // Capture the complete infrastructure inventory before deleting deployment
  // records. The worker cannot reconstruct retained containers/images later.
  const deployments = await Deployment.find({ projectId }, '_id activeContainerId imageTag').lean();
  const deploymentIds = deployments.map((deployment) => deployment._id);
  const containerIds = [
    ...new Set(deployments.map((deployment) => deployment.activeContainerId).filter(Boolean)),
  ];
  const imageTags = [
    ...new Set(deployments.map((deployment) => deployment.imageTag).filter(Boolean)),
  ];

  const queue = getDeploymentQueue();
  if (!queue) {
    return {
      success: false,
      error:
        'Project deletion is temporarily unavailable because the deployment worker queue is offline.',
    };
  }

  try {
    await enqueueJob(
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

export async function submitForReview({ projectId, actorId, purpose, sourceIp, correlationId }) {
  const normalizedPurpose = purpose?.trim() ?? '';
  if (normalizedPurpose.length < 10 || normalizedPurpose.length > 500) {
    return {
      success: false,
      error: 'Describe what your application does in 10 to 500 characters.',
      field: 'purpose',
    };
  }

  const session = await mongoose.startSession();
  let result = { success: false, error: 'This project could not be approved.' };
  try {
    await session.withTransaction(async () => {
      const project = await Project.findById(projectId).session(session);
      if (!project) {
        result = { success: false, error: 'Project not found.' };
        return;
      }
      if (project.status !== ProjectStatus.DRAFT) {
        result = { success: false, error: 'Only draft projects can be approved.' };
        return;
      }

      const existing = await ApprovalRequest.findOne({
        projectId,
        status: ApprovalStatus.PENDING,
      }).session(session);
      if (existing) {
        result = { success: false, error: 'A review request is already pending for this project.' };
        return;
      }

      const repository = project.repositoryId
        ? await Repository.findById(project.repositoryId).session(session)
        : null;
      const secretRecords = await EnvironmentSecret.find({ projectId })
        .select('name')
        .session(session)
        .lean();
      const readiness = assessInitialApprovalReadiness({
        project,
        repository,
        configuredEnvironmentVariables: secretRecords.map(({ name }) => name),
      });
      if (!readiness.isReady) {
        result = {
          success: false,
          error: 'Complete the required items before approving your project.',
          readiness,
        };
        return;
      }

      const activated = await Project.updateOne(
        { _id: project._id, status: ProjectStatus.DRAFT },
        { $set: { status: ProjectStatus.ACTIVE } },
        { session },
      );
      if (activated.modifiedCount !== 1) {
        result = { success: false, error: 'The project changed while it was being approved.' };
        return;
      }

      const [request] = await ApprovalRequest.create(
        [
          {
            projectId,
            requestedBy: actorId,
            requestType: 'INITIAL_DEPLOYMENT',
            purpose: normalizedPurpose,
            status: ApprovalStatus.APPROVED,
            reviewedAt: new Date(),
            decisionSource: 'AUTOMATIC',
            snapshotConfigurationVersion: project.configurationVersion,
            snapshotCommitSha: readiness.currentCommitSha,
            validationFindings: readiness.findings,
          },
        ],
        { session },
      );
      result = { success: true, request, readiness };
    });
  } finally {
    await session.endSession();
  }

  if (!result.success && result.readiness) {
    await recordProductEvent({
      name: 'readiness_blocked',
      userId: actorId,
      projectId,
      properties: {
        reason: result.readiness.findings.find((item) => item.status === 'BLOCKING')?.code,
      },
    });
  }
  if (!result.success) {
    return result;
  }

  await writeAuditEvent({
    action: 'project.auto_approved',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: projectId.toString(),
    sourceIp,
    correlationId,
    metadata: {
      approvalRequestId: result.request._id.toString(),
      configurationVersion: result.request.snapshotConfigurationVersion,
      commitSha: result.readiness.currentCommitSha,
      decisionSource: 'AUTOMATIC',
    },
  });
  await recordProductEvent({ name: 'approval_submitted', userId: actorId, projectId });

  return result;
}

// ─── Membership ────────────────────────────────────────────────────────────────

export async function getProjectMembers(projectId) {
  return ProjectMembership.find({ projectId })
    .populate('userId', 'firstName lastName email')
    .lean();
}

export async function inviteMember({
  projectId,
  ownerId,
  inviteeEmail,
  role,
  actorId,
  sourceIp,
  correlationId,
}) {
  const invitee = await User.findOne({ email: inviteeEmail.toLowerCase() });
  if (!invitee) {
    return { success: false, error: 'No account found with that email address.' };
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

  return { success: true };
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
