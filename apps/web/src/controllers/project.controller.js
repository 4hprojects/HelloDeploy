import { asyncHandler } from '../utils/async-handler.js';
import { DeploymentMode, ProjectRole, ProjectStatus, AuditOutcome } from '@hellodeploy/contracts';
import { Deployment, EnvironmentSecret, Project, Repository, User } from '@hellodeploy/database';
import { verifyPassword } from '@hellodeploy/auth';
import { writeAuditEvent } from '@hellodeploy/observability';
import { getDeployments } from '../services/deployment.service.js';
import {
  createProject,
  updateProject,
  archiveProject,
  deleteProject,
  enableProjectMaintenance,
  disableProjectMaintenance,
  getProjectMembers,
  inviteMember,
  removeMember,
  updateMemberRole,
  transferOwnership,
  submitForReview,
  getLatestApprovalRequest,
  checkSlugAvailability,
} from '../services/project.service.js';
import {
  validateCreateProject,
  validateUpdateProject,
  validateMaintenanceMessage,
  validateInviteMember,
} from '../validators/project.validator.js';
import { buildSettingsSections } from '../config/project-navigation.js';
import { getProjectDomains } from '../services/domain.service.js';
import { resolveProjectQuota } from '../services/quota.service.js';
import { projectReturnTarget } from '../utils/project-return-target.js';
import { assessInitialApprovalReadiness } from '../services/approval-readiness.service.js';
import {
  buildApplicationUrl,
  buildProjectOverviewState,
} from '../services/project-overview.service.js';
import { buildProjectSettingsView } from '../services/project-settings-view.service.js';
import { env } from '../config/env.js';
import { getProjectDiscovery } from '../services/project-discovery.service.js';

// ─── Project list ──────────────────────────────────────────────────────────────

export const getProjectIndex = asyncHandler(async (req, res) => {
  const discovery = await getProjectDiscovery(req.session.user.id, req.query);
  res.render('pages/projects/index', {
    title: 'Projects',
    ...discovery,
  });
});

// ─── New project ───────────────────────────────────────────────────────────────

export function getNewProject(req, res) {
  res.render('pages/projects/new', {
    title: 'New Project',
    errors: {},
    values: { name: '', slug: '' },
  });
}

export const postNewProject = asyncHandler(async (req, res) => {
  const { errors, hasErrors } = validateCreateProject(req.body);

  if (hasErrors) {
    return res.render('pages/projects/new', {
      title: 'New Project',
      errors,
      values: { name: req.body.name ?? '', slug: req.body.slug ?? '' },
    });
  }

  const result = await createProject({
    name: req.body.name.trim(),
    slug: req.body.slug,
    ownerId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    return res.render('pages/projects/new', {
      title: 'New Project',
      errors: result.field ? { [result.field]: result.error } : { form: result.error },
      values: { name: req.body.name ?? '', slug: req.body.slug ?? '' },
    });
  }

  req.flash('success', `Project "${result.project.name}" created.`);
  res.redirect(`/projects/${result.project.slug}`);
});

export const getSlugAvailability = asyncHandler(async (req, res) => {
  const result = await checkSlugAvailability(req.query.slug);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ...result,
    url: result.slug ? `https://${result.slug}${env.PLATFORM_SUBDOMAIN_SUFFIX}` : null,
  });
});

// ─── Show project ──────────────────────────────────────────────────────────────

async function renderProjectOverview(req, res, extras = {}) {
  const project = req.project;

  const [repository, deployments, latestApproval, activeDeployment, secretRecords, domains] =
    await Promise.all([
      project.repositoryId ? Repository.findById(project.repositoryId).lean() : null,
      getDeployments(project._id, 5),
      getLatestApprovalRequest(project._id),
      project.activeDeploymentId ? Deployment.findById(project.activeDeploymentId).lean() : null,
      EnvironmentSecret.find({ projectId: project._id }).select('name').lean(),
      getProjectDomains(project._id),
    ]);

  const approvalReadiness = assessInitialApprovalReadiness({
    project,
    repository,
    configuredEnvironmentVariables: secretRecords.map(({ name }) => name),
  });
  const appUrl = buildApplicationUrl({
    subdomain: project.platformSubdomain ?? project.slug,
    deploymentDomain: env.DEPLOYMENT_DOMAIN,
  });
  const overviewState = buildProjectOverviewState({
    project,
    repository,
    deployments,
    activeDeployment,
    latestApproval,
    approvalReadiness,
    membershipRole: req.membership.role,
    appUrl,
  });

  res.render('pages/projects/show', {
    title: project.name,
    project,
    membership: req.membership,
    repository,
    deployments,
    activeDeployment,
    latestApproval,
    approvalReadiness,
    overviewState,
    platformAppUrl: appUrl,
    activeDomain: domains.find((domain) => domain.status === 'ACTIVE') ?? null,
    approvalErrors: {},
    approvalValues: { purpose: latestApproval?.purpose ?? '' },
    ...extras,
  });
}

export const getProject = asyncHandler((req, res) => renderProjectOverview(req, res));

// ─── Edit project ──────────────────────────────────────────────────────────────

export function getEditProject(req, res) {
  res.render('pages/projects/edit', {
    title: `Edit – ${req.project.name}`,
    project: req.project,
    errors: {},
    values: { name: req.project.name },
  });
}

export async function renderProjectSettings(req, res, extras = {}) {
  const { deployHookTokenHash, ...projectForView } = req.project;
  const [repository, domains, quota] = await Promise.all([
    req.project.repositoryId ? Repository.findById(req.project.repositoryId).lean() : null,
    getProjectDomains(req.project._id),
    resolveProjectQuota(req.project._id, req.project.ownerId),
  ]);

  res.render('pages/projects/settings', {
    title: `Settings – ${req.project.name}`,
    project: projectForView,
    membership: req.membership,
    settingsSections: buildSettingsSections(req.project.slug),
    repository,
    domains,
    quota,
    hasDeployHook: Boolean(deployHookTokenHash),
    settingsState: buildProjectSettingsView({
      project: projectForView,
      repository,
      domainCount: domains.length,
      hasDeployHook: Boolean(deployHookTokenHash),
    }),
    activeSettingsEdit: null,
    settingsErrors: {},
    settingsValues: {},
    bcErrors: {},
    bcValues: null,
    bfErrors: {},
    bfValues: null,
    ...extras,
  });
}

export const getProjectSettings = asyncHandler((req, res) => renderProjectSettings(req, res));

export const postEditProject = asyncHandler(async (req, res) => {
  const { errors, hasErrors } = validateUpdateProject(req.body);

  if (hasErrors) {
    if (projectReturnTarget(req, '').endsWith('#general')) {
      return renderProjectSettings(req, res, {
        activeSettingsEdit: 'general',
        settingsErrors: errors,
        settingsValues: { name: req.body.name ?? '' },
      });
    }
    return res.render('pages/projects/edit', {
      title: `Edit – ${req.project.name}`,
      project: req.project,
      errors,
      values: { name: req.body.name ?? '' },
    });
  }

  const result = await updateProject({
    projectId: req.project._id,
    name: req.body.name,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    if (projectReturnTarget(req, '').endsWith('#general')) {
      return renderProjectSettings(req, res, {
        activeSettingsEdit: 'general',
        settingsErrors: { form: result.error },
        settingsValues: { name: req.body.name ?? '' },
      });
    }
    return res.render('pages/projects/edit', {
      title: `Edit – ${req.project.name}`,
      project: req.project,
      errors: { form: result.error },
      values: { name: req.body.name ?? '' },
    });
  }

  req.flash('success', 'Project settings saved.');
  res.redirect(projectReturnTarget(req, `/projects/${req.project.slug}`));
});

// ─── Archive project ───────────────────────────────────────────────────────────

export const postArchiveProject = asyncHandler(async (req, res) => {
  const result = await archiveProject({
    projectId: req.project._id,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
    return res.redirect(projectReturnTarget(req, `/projects/${req.project.slug}`));
  }

  req.flash('success', `Project "${req.project.name}" has been archived.`);
  res.redirect('/projects');
});

// ─── Delete project ────────────────────────────────────────────────────────────

export const postDeleteProject = asyncHandler(async (req, res) => {
  const project = req.project;
  const confirmSlug = req.body.confirmSlug?.trim();

  if (confirmSlug !== project.slug) {
    req.flash('error', 'Type the project slug exactly to confirm deletion.');
    return res.redirect(projectReturnTarget(req, `/projects/${project.slug}/edit`));
  }

  const result = await deleteProject({
    projectId: project._id,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
    return res.redirect(projectReturnTarget(req, `/projects/${project.slug}/edit`));
  }

  req.flash('success', `Project "${project.name}" has been permanently deleted.`);
  res.redirect('/projects');
});

// ─── Maintenance mode ──────────────────────────────────────────────────────────

export const postEnableMaintenance = asyncHandler(async (req, res) => {
  const project = req.project;
  const { errors, hasErrors } = validateMaintenanceMessage(req.body);

  if (hasErrors) {
    return renderProjectOverview(req, res, {
      maintenanceError: errors.message,
      maintenanceMessageValue: req.body.message ?? '',
    });
  }

  const result = await enableProjectMaintenance({
    projectId: project._id,
    message: req.body.message,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Maintenance mode enabled. Visitors will see a maintenance page shortly.');
  }

  res.redirect(`/projects/${project.slug}`);
});

export const postDisableMaintenance = asyncHandler(async (req, res) => {
  const project = req.project;
  const result = await disableProjectMaintenance({
    projectId: project._id,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Maintenance mode disabled. Traffic will resume shortly.');
  }

  res.redirect(`/projects/${project.slug}`);
});

// ─── Submit for review ─────────────────────────────────────────────────────────

export const postSubmitForReview = asyncHandler(async (req, res) => {
  const result = await submitForReview({
    projectId: req.project._id,
    actorId: req.session.user.id,
    purpose: req.body.purpose,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    return renderProjectOverview(req, res, {
      approvalErrors: result.field ? { [result.field]: result.error } : { form: result.error },
      approvalValues: { purpose: req.body.purpose ?? '' },
      approvalReadiness: result.readiness,
    });
  } else {
    req.flash('success', 'Your project has been submitted for review.');
  }

  return res.redirect(`/projects/${req.project.slug}`);
});

// ─── Members ───────────────────────────────────────────────────────────────────

export const getProjectMembersPage = asyncHandler(async (req, res) => {
  const members = await getProjectMembers(req.project._id);
  res.render('pages/projects/members', {
    title: `Members – ${req.project.name}`,
    project: req.project,
    members,
    membership: req.membership,
    errors: {},
    values: { email: '', role: '' },
  });
});

export const postInviteMember = asyncHandler(async (req, res) => {
  const { errors, hasErrors } = validateInviteMember(req.body);

  if (hasErrors) {
    const members = await getProjectMembers(req.project._id);
    return res.render('pages/projects/members', {
      title: `Members – ${req.project.name}`,
      project: req.project,
      members,
      membership: req.membership,
      errors,
      values: { email: req.body.email ?? '', role: req.body.role ?? '' },
    });
  }

  const result = await inviteMember({
    projectId: req.project._id,
    ownerId: req.project.ownerId,
    inviteeEmail: req.body.email.trim(),
    role: req.body.role,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    const members = await getProjectMembers(req.project._id);
    return res.render('pages/projects/members', {
      title: `Members – ${req.project.name}`,
      project: req.project,
      members,
      membership: req.membership,
      errors: { form: result.error },
      values: { email: req.body.email ?? '', role: req.body.role ?? '' },
    });
  }

  req.flash('success', 'Member added successfully.');
  res.redirect(`/projects/${req.project.slug}/members`);
});

export const postRemoveMember = asyncHandler(async (req, res) => {
  const result = await removeMember({
    projectId: req.project._id,
    userId: req.params.userId,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Member removed.');
  }

  res.redirect(`/projects/${req.project.slug}/members`);
});

export const postUpdateMemberRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const allowed = [ProjectRole.MAINTAINER, ProjectRole.VIEWER];

  if (!allowed.includes(role)) {
    req.flash('error', 'Invalid role selected.');
    return res.redirect(`/projects/${req.project.slug}/members`);
  }

  const result = await updateMemberRole({
    projectId: req.project._id,
    userId: req.params.userId,
    role,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Role updated.');
  }

  res.redirect(`/projects/${req.project.slug}/members`);
});

export const postTransferOwnership = asyncHandler(async (req, res) => {
  const owner = await User.findById(req.session.user.id).select('+passwordHash');
  if (!owner || !(await verifyPassword(owner.passwordHash, req.body.currentPassword ?? ''))) {
    req.flash('error', 'Current password is incorrect. Ownership was not transferred.');
    return res.redirect(`/projects/${req.project.slug}/members#transfer-ownership`);
  }
  const result = await transferOwnership({
    projectId: req.project._id,
    newOwnerId: req.body.newOwnerId,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Ownership transferred successfully.');
  }

  res.redirect(`/projects/${req.project.slug}/members`);
});

// ─── Deployment mode ───────────────────────────────────────────────────────────

export const postUpdateDeploymentMode = asyncHandler(async (req, res) => {
  const project = req.project;
  const { deploymentMode } = req.body;
  const allowed = [DeploymentMode.MANUAL, DeploymentMode.AUTOMATIC];

  if (!allowed.includes(deploymentMode)) {
    req.flash('error', 'Invalid deployment mode.');
    return res.redirect(projectReturnTarget(req, `/projects/${project.slug}`));
  }

  if (deploymentMode === DeploymentMode.AUTOMATIC && project.status !== ProjectStatus.ACTIVE) {
    req.flash('error', 'Automatic deployment can only be enabled for approved projects.');
    return res.redirect(projectReturnTarget(req, `/projects/${project.slug}`));
  }

  if (deploymentMode === DeploymentMode.AUTOMATIC && project.repositoryId) {
    const repository = await Repository.findById(project.repositoryId).lean();
    if (repository?.sourceType === 'PUBLIC_GIT') {
      req.flash('error', 'Automatic deployment requires a connected GitHub App repository.');
      return res.redirect(projectReturnTarget(req, `/projects/${project.slug}`));
    }
  }

  await Project.updateOne(
    { _id: project._id },
    { $set: { deploymentMode }, $inc: { configurationVersion: 1 } },
  );

  await writeAuditEvent({
    action: 'project.deployment_mode_updated',
    outcome: AuditOutcome.SUCCESS,
    actorId: req.session.user.id,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp: req.ip,
    correlationId: req.correlationId,
    metadata: { deploymentMode },
  });

  req.flash('success', `Deployment mode set to ${deploymentMode.toLowerCase().replace('_', ' ')}.`);
  res.redirect(projectReturnTarget(req, `/projects/${project.slug}`));
});

// ─── Notification preference ──────────────────────────────────────────────────

export const postUpdateNotificationPreference = asyncHandler(async (req, res) => {
  const project = req.project;
  const { notificationPreference } = req.body;
  const allowed = ['ALL', 'FAILURE_ONLY', 'NONE'];

  if (!allowed.includes(notificationPreference)) {
    req.flash('error', 'Invalid notification preference.');
    return res.redirect(projectReturnTarget(req, `/projects/${project.slug}`));
  }

  await Project.updateOne({ _id: project._id }, { $set: { notificationPreference } });

  await writeAuditEvent({
    action: 'project.notification_preference_updated',
    outcome: AuditOutcome.SUCCESS,
    actorId: req.session.user.id,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp: req.ip,
    correlationId: req.correlationId,
    metadata: { notificationPreference },
  });

  req.flash('success', 'Notification preference updated.');
  res.redirect(projectReturnTarget(req, `/projects/${project.slug}`));
});
