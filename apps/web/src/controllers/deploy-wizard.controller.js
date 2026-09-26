/**
 * Guided setup ("Deploy a Website").
 *
 * Source selection and repository choice happen before a project exists: the
 * project is created when a repository is picked, named after it, so an
 * abandoned wizard does not leave a placeholder project or burn a slug. From
 * there every step operates on a real project and the current step is derived
 * from persisted state.
 */

import { User } from '@hellodeploy/database';

import { asyncHandler } from '../utils/async-handler.js';
import { env } from '../config/env.js';
import { createProject } from '../services/project.service.js';
import { listInstallationRepos, getInstallationUrl } from '../services/github.service.js';
import { connectGithubRepository } from '../services/repository-connect.service.js';

/**
 * Sources a website can come from. A registry rather than hard-coded markup, so
 * upload and starter templates can be added without restructuring the step.
 * `available: false` entries render as not-yet-offered instead of being hidden,
 * so the roadmap is visible rather than mysterious.
 */
export const DEPLOY_SOURCES = Object.freeze([
  {
    key: 'github',
    label: 'GitHub',
    description: 'Connect a project you already keep on GitHub.',
    icon: 'repository',
    href: '/projects/new/github',
    available: true,
  },
  {
    key: 'upload',
    label: 'Upload a project',
    description: 'Send a folder or ZIP straight from your computer.',
    icon: 'projects',
    href: null,
    available: false,
  },
  {
    key: 'starter',
    label: 'Start from a template',
    description: 'Begin with a ready-made website and change it later.',
    icon: 'overview',
    href: null,
    available: false,
  },
]);

// ─── Step 1: where is your website? ───────────────────────────────────────────

export function getDeploySource(req, res) {
  res.render('pages/projects/wizard/source', {
    title: 'Deploy a website',
    sources: DEPLOY_SOURCES,
  });
}

// ─── Step 2: choose your website ──────────────────────────────────────────────

export const getDeployRepository = asyncHandler(async (req, res) => {
  const user = await User.findById(req.session.user.id).lean();
  const githubConfigured = env.isGithubConfigured();
  const installationId = user?.githubInstallationId ?? null;

  let repos = [];
  let loadError = null;

  if (githubConfigured && installationId) {
    try {
      repos = await listInstallationRepos(installationId);
    } catch {
      loadError =
        'HelloDeploy could not load your GitHub projects. Try again, or reconnect GitHub below.';
    }
  }

  res.render('pages/projects/wizard/repository', {
    title: 'Choose your website',
    sources: DEPLOY_SOURCES,
    repos: repos.sort((a, b) => a.fullName.localeCompare(b.fullName)),
    githubConfigured,
    isGithubConnected: Boolean(installationId),
    installUrl: githubConfigured ? getInstallationUrl() : null,
    loadError,
  });
});

export const postDeployRepository = asyncHandler(async (req, res) => {
  const { fullName, branch } = req.body;

  if (!fullName) {
    req.flash('error', 'Choose a GitHub project to continue.');
    return res.redirect('/projects/new/github');
  }

  // Name the website after the repository; the identity step lets the owner
  // change both the name and the address before anything is published.
  const suggestedName = fullName.split('/').pop();

  const created = await createProject({
    name: suggestedName,
    ownerId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!created.success) {
    req.flash('error', created.error);
    return res.redirect('/projects/new/github');
  }

  const user = await User.findById(req.session.user.id).lean();
  const connected = await connectGithubRepository({
    project: created.project,
    installationId: user?.githubInstallationId ?? null,
    selection: { fullName, branch },
    actor: {
      id: req.session.user.id,
      sourceIp: req.ip,
      correlationId: req.correlationId,
    },
  });

  if (!connected.success) {
    // The project exists but has no source. Send the owner to its own setup
    // rather than restarting, so a retry does not create a second project.
    req.flash('error', connected.error);
    return res.redirect(`/projects/${created.project.slug}/setup/repository`);
  }

  return res.redirect(`/projects/${created.project.slug}/setup/analyze`);
});
