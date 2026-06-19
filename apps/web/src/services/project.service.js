import { randomBytes } from 'node:crypto';
import { Project, ProjectMembership, ApprovalRequest, User } from '@hellodeploy/database';
import { ProjectRole, ProjectStatus, ApprovalStatus, AuditOutcome } from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';
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
