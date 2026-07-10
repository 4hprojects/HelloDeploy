import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  Project,
  ProjectMembership,
  ApprovalRequest,
  User,
  Deployment,
  DeploymentEvent,
  EnvironmentSecret,
  Domain,
  mongoose,
} from '@hellodeploy/database';
import {
  ProjectRole,
  ProjectStatus,
  ApprovalStatus,
  AuditOutcome,
  JobType,
} from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';
import { enqueueJob } from '@hellodeploy/queue';
import { generateToken, hashToken } from '@hellodeploy/security';
import { getDeploymentQueue } from '../queue/client.js';
import { checkCanCreateProject, checkCanAddMember } from './quota.service.js';

function slugify(name) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'project'
  );
}

async function reserveSlug(name) {
  const base = slugify(name);
  if (!(await Project.exists({ slug: base }))) {
    return base;
  }

  for (let i = 0; i < 5; i++) {
    const candidate = `${base.slice(0, 46)}-${randomBytes(2).toString('hex')}`;
    if (!(await Project.exists({ slug: candidate }))) {
      return candidate;
    }
  }

  throw new Error('Could not reserve a unique slug. Please try a different project name.');
}

// ─── Project CRUD ──────────────────────────────────────────────────────────────

export async function createProject({ name, ownerId, sourceIp, correlationId }) {
  const canCreate = await checkCanCreateProject(ownerId);
  if (!canCreate) {
    return { success: false, error: 'You have reached your project limit.' };
  }

  const slug = await reserveSlug(name);

  const project = await Project.create({
    name,
    slug,
    ownerId,
    status: ProjectStatus.DRAFT,
    platformSubdomain: slug,
  });

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

  let activeContainerId = null;
  if (project.activeDeploymentId) {
    const activeDeployment = await Deployment.findById(
      project.activeDeploymentId,
      'activeContainerId',
    ).lean();
    activeContainerId = activeDeployment?.activeContainerId ?? null;
  }

  const queue = getDeploymentQueue();
  if (queue) {
    await enqueueJob(
      queue,
      JobType.DELETE_PROJECT,
      {
        version: 1,
        correlationId,
        actorId: actorId.toString(),
        actorRole: 'OWNER',
        projectId: projectId.toString(),
        subdomain: project.platformSubdomain ?? project.slug,
        activeContainerId,
      },
      { jobId: `delete-${projectId}` },
    );
  }

  const deploymentIds = await Deployment.find({ projectId }).distinct('_id');

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

export async function submitForReview({ projectId, actorId, sourceIp, correlationId }) {
  const project = await Project.findById(projectId);
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }

  if (project.status !== ProjectStatus.DRAFT) {
    return { success: false, error: 'Only draft projects can be submitted for review.' };
  }

  const existing = await ApprovalRequest.findOne({
    projectId,
    status: ApprovalStatus.PENDING,
  });
  if (existing) {
    return { success: false, error: 'A review request is already pending for this project.' };
  }

  await ApprovalRequest.create({
    projectId,
    requestedBy: actorId,
    requestType: 'INITIAL_DEPLOYMENT',
  });

  await writeAuditEvent({
    action: 'project.review_requested',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp,
    correlationId,
  });

  return { success: true };
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
