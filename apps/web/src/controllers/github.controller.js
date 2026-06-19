import { User, Project, Repository } from '@hellodeploy/database';
import { DeploymentMode, ProjectStatus, AuditOutcome } from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';
import { env } from '../config/env.js';
import {
  getInstallationUrl,
  listInstallationRepos,
  listBranches,
  getLatestCommit,
} from '../services/github.service.js';

// ─── GitHub App installation flow ─────────────────────────────────────────────

/**
 * Redirect the user to GitHub to install (or reinstall) the GitHub App.
 * Stores the project slug in session so we can return here after callback.
 * GET /github/connect?project=:slug
 */
export function getGithubConnect(req, res) {
  if (!env.isGithubConfigured()) {
    req.flash('error', 'GitHub App integration is not configured on this server.');
    const slug = req.query.project;
    return res.redirect(slug ? `/projects/${slug}/repository` : '/dashboard');
  }

  const projectSlug = req.query.project;
  if (!projectSlug) {
    return res.redirect('/dashboard');
  }

  // Store state in session to verify on callback
  req.session.githubConnectState = {
    projectSlug,
    nonce: Math.random().toString(36).slice(2),
  };

  const installUrl = getInstallationUrl();
  req.session.save(() => {
    res.redirect(installUrl);
  });
}

/**
 * Handle GitHub's redirect after installation.
 * GitHub sends: ?installation_id=123&setup_action=install&state=...
 * GET /github/callback
 */
export async function getGithubCallback(req, res) {
  const { installation_id, setup_action } = req.query;
  const sessionState = req.session.githubConnectState;

  // Clean up session state
  delete req.session.githubConnectState;

  if (setup_action === 'request') {
    // User requested installation from an org — awaiting admin approval
    req.flash('info', 'Your installation request has been sent to your organization owner.');
    return req.session.save(() => res.redirect('/dashboard'));
  }

  if (!installation_id) {
    req.flash('error', 'GitHub installation was cancelled or did not return an ID.');
    const slug = sessionState?.projectSlug;
    return req.session.save(() => res.redirect(slug ? `/projects/${slug}/repository` : '/dashboard'));
  }

  const installationId = parseInt(installation_id, 10);
  if (isNaN(installationId)) {
    req.flash('error', 'Invalid installation ID from GitHub.');
    return req.session.save(() => res.redirect('/dashboard'));
  }

  // Store installation ID on the user record
  await User.findByIdAndUpdate(req.session.user.id, {
    $set: { githubInstallationId: installationId },
  });

  await writeAuditEvent({
    action: 'github.app_installed',
    outcome: AuditOutcome.SUCCESS,
    actorId: req.session.user.id,
    targetType: 'user',
    targetId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
    metadata: { installationId },
  });

  const returnSlug = sessionState?.projectSlug;
  req.flash('success', 'GitHub connected successfully.');
  req.session.save(() => {
    res.redirect(returnSlug ? `/projects/${returnSlug}/repository` : '/dashboard');
  });
}

// ─── Repository management ────────────────────────────────────────────────────

/**
 * Show the repository connection page for a project.
 * GET /projects/:slug/repository
 */
export async function getRepository(req, res) {
  const project = req.project;

  // Fetch current repository if connected
  let currentRepo = null;
  if (project.repositoryId) {
    currentRepo = await Repository.findById(project.repositoryId).lean();
  }

  // If already connected, show management view
  if (currentRepo) {
    return res.render('pages/projects/repository', {
      title: `Repository – ${project.name}`,
      project,
      membership: req.membership,
      currentRepo,
      repos: null,
      branches: null,
      githubConfigured: env.isGithubConfigured(),
      errors: {},
      values: {},
    });
  }

  // If not connected: check if user has a GitHub installation
  const user = await User.findById(req.session.user.id).lean();
  if (!user.githubInstallationId || !env.isGithubConfigured()) {
    return res.render('pages/projects/repository', {
      title: `Repository – ${project.name}`,
      project,
      membership: req.membership,
      currentRepo: null,
      repos: null,
      branches: null,
      githubConfigured: env.isGithubConfigured(),
      errors: {},
      values: {},
    });
  }

  // List repos available for this installation
  let repos = [];
  try {
    repos = await listInstallationRepos(user.githubInstallationId);
  } catch (err) {
    req.flash('error', 'Could not load repositories from GitHub. Please try again.');
  }

  res.render('pages/projects/repository', {
    title: `Repository – ${project.name}`,
    project,
    membership: req.membership,
    currentRepo: null,
    repos,
    branches: null,
    githubConfigured: env.isGithubConfigured(),
    installationId: user.githubInstallationId,
    errors: {},
    values: {},
  });
}

/**
 * Connect a repository to a project.
 * POST /projects/:slug/repository
 * body: { githubRepoId, fullName, defaultBranch, productionBranch, nodeId, ownerLogin, visibility }
 */
export async function postConnectRepository(req, res) {
  const project = req.project;
  const user = await User.findById(req.session.user.id).lean();

  if (!user.githubInstallationId) {
    req.flash('error', 'You need to connect your GitHub account first.');
    return res.redirect(`/projects/${project.slug}/repository`);
  }

  const { fullName, githubRepoId, nodeId, ownerLogin, defaultBranch, visibility, productionBranch } =
    req.body;

  if (!fullName || !githubRepoId || !productionBranch) {
    req.flash('error', 'Repository and branch selection are required.');
    return res.redirect(`/projects/${project.slug}/repository`);
  }

  // Verify this repo is actually accessible to the user's installation
  let repos;
  try {
    repos = await listInstallationRepos(user.githubInstallationId);
  } catch {
    req.flash('error', 'Could not verify repository access. Please try again.');
    return res.redirect(`/projects/${project.slug}/repository`);
  }

  const authorizedRepo = repos.find((r) => r.fullName === fullName);
  if (!authorizedRepo) {
    req.flash('error', 'This repository is not authorized for your GitHub App installation.');
    return res.redirect(`/projects/${project.slug}/repository`);
  }

  // Fetch the latest commit for the selected branch
  let latestCommit = null;
  try {
    latestCommit = await getLatestCommit(user.githubInstallationId, fullName, productionBranch);
  } catch {
    // Non-fatal — we'll just not have a commit SHA yet
  }

  // Create or update Repository record
  const repoData = {
    projectId: project._id,
    installationId: user.githubInstallationId,
    githubRepoId: parseInt(githubRepoId, 10),
    nodeId: nodeId ?? authorizedRepo.nodeId,
    fullName,
    name: fullName.split('/')[1],
    ownerLogin: ownerLogin ?? authorizedRepo.ownerLogin,
    defaultBranch: defaultBranch ?? authorizedRepo.defaultBranch,
    visibility: visibility ?? (authorizedRepo.private ? 'private' : 'public'),
    accessStatus: 'ACTIVE',
    lastCommitSha: latestCommit?.sha ?? null,
    lastCommitMessage: latestCommit?.message ?? null,
    lastCommitAt: latestCommit ? new Date() : null,
    connectedAt: new Date(),
    revokedAt: null,
  };

  let repo;
  const existing = await Repository.findOne({ projectId: project._id });
  if (existing) {
    Object.assign(existing, repoData);
    repo = await existing.save();
  } else {
    repo = await Repository.create(repoData);
  }

  // Update project with repository reference and production branch
  await Project.updateOne(
    { _id: project._id },
    {
      $set: {
        repositoryId: repo._id,
        productionBranch,
        configurationVersion: project.configurationVersion + 1,
      },
    },
  );

  await writeAuditEvent({
    action: 'project.repository_connected',
    outcome: AuditOutcome.SUCCESS,
    actorId: req.session.user.id,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp: req.ip,
    correlationId: req.correlationId,
    metadata: { fullName, productionBranch },
  });

  req.flash('success', `Repository ${fullName} connected on branch ${productionBranch}.`);
  res.redirect(`/projects/${project.slug}`);
}

/**
 * Disconnect the repository from a project.
 * POST /projects/:slug/repository/disconnect
 */
export async function postDisconnectRepository(req, res) {
  const project = req.project;

  if (!project.repositoryId) {
    req.flash('error', 'No repository is connected to this project.');
    return res.redirect(`/projects/${project.slug}/repository`);
  }

  await Repository.findByIdAndUpdate(project.repositoryId, {
    $set: { accessStatus: 'REVOKED', revokedAt: new Date() },
  });

  await Project.updateOne(
    { _id: project._id },
    { $set: { repositoryId: null, productionBranch: null } },
  );

  await writeAuditEvent({
    action: 'project.repository_disconnected',
    outcome: AuditOutcome.SUCCESS,
    actorId: req.session.user.id,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  req.flash('success', 'Repository disconnected.');
  res.redirect(`/projects/${project.slug}/repository`);
}

/**
 * List branches for the AJAX/form use — returns JSON for a given fullName.
 * GET /github/branches?fullName=owner/repo
 */
export async function getBranches(req, res) {
  const { fullName } = req.query;
  if (!fullName) {
    return res.status(400).json({ error: 'fullName is required' });
  }

  const user = await User.findById(req.session.user.id).lean();
  if (!user.githubInstallationId) {
    return res.status(403).json({ error: 'GitHub not connected' });
  }

  try {
    const branches = await listBranches(user.githubInstallationId, fullName);
    res.json({ branches });
  } catch (err) {
    res.status(500).json({ error: 'Could not load branches' });
  }
}

// ─── Deployment mode ──────────────────────────────────────────────────────────

/**
 * Update the project deployment mode (MANUAL / AUTOMATIC / APPROVAL_REQUIRED).
 * POST /projects/:slug/deployment-mode
 */
export async function postUpdateDeploymentMode(req, res) {
  const project = req.project;
  const { deploymentMode } = req.body;
  const allowed = Object.values(DeploymentMode);

  if (!allowed.includes(deploymentMode)) {
    req.flash('error', 'Invalid deployment mode.');
    return res.redirect(`/projects/${project.slug}`);
  }

  // AUTOMATIC requires the project to be ACTIVE (approved)
  if (deploymentMode === DeploymentMode.AUTOMATIC && project.status !== ProjectStatus.ACTIVE) {
    req.flash('error', 'Automatic deployment can only be enabled for approved projects.');
    return res.redirect(`/projects/${project.slug}`);
  }

  await Project.updateOne({ _id: project._id }, { $set: { deploymentMode } });

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
  res.redirect(`/projects/${project.slug}`);
}
