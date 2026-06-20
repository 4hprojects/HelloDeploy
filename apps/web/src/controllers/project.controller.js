import { ProjectRole } from '@hellodeploy/contracts';
import { Deployment, Repository } from '@hellodeploy/database';
import { getDeployments } from '../services/deployment.service.js';
import {
  createProject,
  getUserProjects,
  updateProject,
  archiveProject,
  getProjectMembers,
  inviteMember,
  removeMember,
  updateMemberRole,
  transferOwnership,
  submitForReview,
} from '../services/project.service.js';
import {
  validateCreateProject,
  validateUpdateProject,
  validateInviteMember,
} from '../validators/project.validator.js';

// ─── Project list ──────────────────────────────────────────────────────────────

export async function getProjectIndex(req, res) {
  const userProjects = await getUserProjects(req.session.user.id);
  res.render('pages/projects/index', {
    title: 'Projects',
    projects: userProjects,
  });
}

// ─── New project ───────────────────────────────────────────────────────────────

export function getNewProject(req, res) {
  res.render('pages/projects/new', {
    title: 'New Project',
    errors: {},
    values: { name: '' },
  });
}

export async function postNewProject(req, res) {
  const { errors, hasErrors } = validateCreateProject(req.body);

  if (hasErrors) {
    return res.render('pages/projects/new', {
      title: 'New Project',
      errors,
      values: { name: req.body.name ?? '' },
    });
  }

  const result = await createProject({
    name: req.body.name.trim(),
    ownerId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    return res.render('pages/projects/new', {
      title: 'New Project',
      errors: { form: result.error },
      values: { name: req.body.name ?? '' },
    });
  }

  req.flash('success', `Project "${result.project.name}" created.`);
  res.redirect(`/projects/${result.project.slug}`);
}

// ─── Show project ──────────────────────────────────────────────────────────────

export async function getProject(req, res) {
  const project = req.project;
  let repository = null;
  let newCommitAvailable = false;

  if (project.repositoryId) {
    repository = await Repository.findById(project.repositoryId).lean();
    if (repository?.lastCommitSha && project.activeDeploymentId) {
      const activeDeployment = await Deployment.findById(
        project.activeDeploymentId,
        'commitSha',
      ).lean();
      newCommitAvailable = activeDeployment?.commitSha !== repository.lastCommitSha;
    }
  }

  const deployments = await getDeployments(project._id, 5);

  res.render('pages/projects/show', {
    title: project.name,
    project,
    membership: req.membership,
    repository,
    newCommitAvailable,
    deployments,
  });
}

// ─── Edit project ──────────────────────────────────────────────────────────────

export function getEditProject(req, res) {
  res.render('pages/projects/edit', {
    title: `Edit – ${req.project.name}`,
    project: req.project,
    errors: {},
    values: { name: req.project.name },
  });
}

export async function postEditProject(req, res) {
  const { errors, hasErrors } = validateUpdateProject(req.body);

  if (hasErrors) {
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
    return res.render('pages/projects/edit', {
      title: `Edit – ${req.project.name}`,
      project: req.project,
      errors: { form: result.error },
      values: { name: req.body.name ?? '' },
    });
  }

  req.flash('success', 'Project settings saved.');
  res.redirect(`/projects/${req.project.slug}`);
}

// ─── Archive project ───────────────────────────────────────────────────────────

export async function postArchiveProject(req, res) {
  const result = await archiveProject({
    projectId: req.project._id,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
    return res.redirect(`/projects/${req.project.slug}`);
  }

  req.flash('success', `Project "${req.project.name}" has been archived.`);
  res.redirect('/projects');
}

// ─── Submit for review ─────────────────────────────────────────────────────────

export async function postSubmitForReview(req, res) {
  const result = await submitForReview({
    projectId: req.project._id,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Your project has been submitted for review.');
  }

  res.redirect(`/projects/${req.project.slug}`);
}

// ─── Members ───────────────────────────────────────────────────────────────────

export async function getProjectMembers_ctrl(req, res) {
  const members = await getProjectMembers(req.project._id);
  res.render('pages/projects/members', {
    title: `Members – ${req.project.name}`,
    project: req.project,
    members,
    membership: req.membership,
    errors: {},
    values: { email: '', role: '' },
  });
}

export async function postInviteMember(req, res) {
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
}

export async function postRemoveMember(req, res) {
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
}

export async function postUpdateMemberRole(req, res) {
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
}

export async function postTransferOwnership(req, res) {
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
}
