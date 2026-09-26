/**
 * Guided setup ("Deploy a Website").
 *
 * Source selection and repository choice happen before a project exists: the
 * project is created when a repository is picked, named after it, so an
 * abandoned wizard does not leave a placeholder project or burn a slug. From
 * there every step operates on a real project and the current step is derived
 * from persisted state.
 */

import { Project, Repository, User } from '@hellodeploy/database';
import {
  DetectionConfidence,
  DetectionStatus,
  PackageManager,
  RuntimeType,
} from '@hellodeploy/contracts';

import { logger } from '@hellodeploy/observability';

import { asyncHandler } from '../utils/async-handler.js';
import { env } from '../config/env.js';
import { createProject } from '../services/project.service.js';
import { listInstallationRepos, getInstallationUrl } from '../services/github.service.js';
import { connectGithubRepository } from '../services/repository-connect.service.js';
import { runProjectDetection } from '../services/detection.service.js';
import { checkAddressAvailability } from '../services/website-address.service.js';
import {
  resolveWizardState,
  canEnterStep,
  withConfirmedStep,
} from '../services/deploy-wizard.service.js';

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

  // Analyse straight away rather than making the owner press "Check my app".
  // A failure here is not fatal — the analyse step shows what happened and
  // offers a retry, so it must not strand a project that is already connected.
  try {
    await runProjectDetection(created.project._id, req.session.user.id, {
      sourceIp: req.ip,
      correlationId: req.correlationId,
    });
  } catch (err) {
    logger.warn('Guided setup: automatic analysis failed', {
      projectId: created.project._id.toString(),
      error: err.message,
    });
  }

  return res.redirect(`/projects/${created.project.slug}/setup/analyze`);
});

// ─── Shared setup shell ───────────────────────────────────────────────────────

/**
 * Load the facts the step machine needs. Kept in one place so every step sees
 * the same picture of the project.
 */
async function loadWizardContext(project) {
  const repository = project.repositoryId
    ? await Repository.findById(project.repositoryId).lean()
    : null;

  const state = resolveWizardState({ project, repository, missingEnvKeys: [] });
  return { repository, state };
}

/**
 * Render a step, or redirect if the owner has jumped ahead of their progress.
 * A deep link to a step that depends on decisions not yet made would otherwise
 * render a form over missing data.
 */
export const getSetupStep = asyncHandler(async (req, res) => {
  const project = req.project;
  const step = req.params.step;
  const { repository, state } = await loadWizardContext(project);

  if (!canEnterStep(step, state)) {
    return res.redirect(state.nextHref);
  }

  if (step === 'analyze') {
    return renderAnalyzeStep(req, res, { project, repository, state });
  }

  if (step === 'identity') {
    return renderIdentityStep(req, res, { project, state, extras: { repository } });
  }

  // Remaining steps arrive in later work; until then send the owner onward
  // rather than rendering a placeholder.
  return res.redirect(`/projects/${project.slug}`);
});

// ─── Step 3: check your project ───────────────────────────────────────────────

async function renderAnalyzeStep(req, res, { project, repository, state }) {
  const detection = project.detection ?? {};
  const fieldConfidence =
    detection.fieldConfidence instanceof Map
      ? Object.fromEntries(detection.fieldConfidence)
      : (detection.fieldConfidence ?? {});

  res.render('pages/projects/wizard/analyze', {
    title: 'Check your project',
    project,
    membership: req.membership,
    repository,
    wizardSteps: state.steps,
    detection,
    fieldConfidence,
    findings: buildAnalysisFindings(project, detection),
    needsReview: detection.confidence === DetectionConfidence.LOW,
    hasRun: detection.status !== DetectionStatus.NOT_RUN,
    isReady: detection.status === DetectionStatus.READY,
  });
}

/**
 * Turn a detection result into the checklist the owner reads.
 *
 * Only states what was actually established — no line is emitted for a value
 * detection did not produce, so the list never implies more certainty than
 * the evidence supports.
 */
export function buildAnalysisFindings(project, detection) {
  const findings = [];
  const runtimeLabel = RUNTIME_LABELS[project.runtimeType];

  if (runtimeLabel) {
    findings.push({ key: 'runtime', label: `${runtimeLabel} detected`, status: 'OK' });
  }

  const build = project.buildConfiguration ?? {};
  if (build.buildCommand) {
    findings.push({ key: 'build', label: 'Build settings found', status: 'OK' });
  }
  if (build.startCommand) {
    findings.push({ key: 'start', label: 'Start settings found', status: 'OK' });
  }
  if (build.outputDirectory) {
    findings.push({ key: 'output', label: 'Published folder found', status: 'OK' });
  }

  if (detection.packageManager && detection.packageManager !== PackageManager.UNKNOWN) {
    findings.push({
      key: 'packageManager',
      label: `Packages managed with ${PACKAGE_MANAGER_LABELS[detection.packageManager]}`,
      status: 'OK',
    });
  }

  (detection.issues ?? []).forEach((issue, index) => {
    findings.push({
      key: `issue-${index}`,
      label: issue.message,
      status: issue.level === 'ERROR' ? 'BLOCKED' : 'WARNING',
    });
  });

  return findings;
}

const RUNTIME_LABELS = Object.freeze({
  [RuntimeType.STATIC]: 'A plain HTML website',
  [RuntimeType.NODEJS]: 'A Node.js app',
  [RuntimeType.EXPRESS]: 'An Express app',
  [RuntimeType.REACT]: 'A React website',
  [RuntimeType.VUE]: 'A Vue website',
  [RuntimeType.NEXTJS]: 'A Next.js website',
});

const PACKAGE_MANAGER_LABELS = Object.freeze({
  [PackageManager.NPM]: 'npm',
  [PackageManager.PNPM]: 'pnpm',
  [PackageManager.YARN]: 'Yarn',
});

/** Re-run detection, then land back on the step so the result is visible. */
export const postSetupAnalyze = asyncHandler(async (req, res) => {
  const project = req.project;

  await runProjectDetection(project._id, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  res.redirect(`/projects/${project.slug}/setup/analyze`);
});

/** Accept weakly-evidenced detection and move on. */
export const postSetupAnalyzeConfirm = asyncHandler(async (req, res) => {
  const project = req.project;

  await Project.updateOne(
    { _id: project._id },
    { $set: { 'setup.confirmedSteps': withConfirmedStep(project, 'analyze') } },
  );

  const fresh = await Project.findById(project._id).lean();
  const { state } = await loadWizardContext(fresh);
  res.redirect(state.nextHref);
});

// ─── Step 4: name your website ────────────────────────────────────────────────

function renderIdentityStep(req, res, { project, state, extras = {} }) {
  res.render('pages/projects/wizard/identity', {
    title: 'Name your website',
    project,
    membership: req.membership,
    wizardSteps: state.steps,
    deploymentDomain: env.DEPLOYMENT_DOMAIN,
    values: {
      name: project.name,
      address: project.platformSubdomain ?? project.slug,
    },
    errors: {},
    ...extras,
  });
}

/**
 * Live availability for the address field.
 *
 * Owner-scoped rather than public: the response reveals whether a given address
 * is in use, which is not something an unauthenticated caller should be able to
 * enumerate.
 */
export const getAddressAvailability = asyncHandler(async (req, res) => {
  const result = await checkAddressAvailability(req.query.address, {
    excludeProjectId: req.project._id,
  });

  res.set('Cache-Control', 'no-store');
  res.json(result);
});

export const postSetupIdentity = asyncHandler(async (req, res) => {
  const project = req.project;
  const { repository, state } = await loadWizardContext(project);
  const name = String(req.body.name ?? '').trim();
  const address = String(req.body.address ?? '').trim();

  const errors = {};
  if (name.length < 2 || name.length > 100) {
    errors.name = 'Give your website a name between 2 and 100 characters.';
  }

  const availability = await checkAddressAvailability(address, {
    excludeProjectId: project._id,
  });
  if (!availability.isAvailable) {
    errors.address = availability.message;
  }

  if (Object.keys(errors).length > 0) {
    return renderIdentityStep(req, res, {
      project: { ...project, name: name || project.name },
      state,
      extras: { errors, values: { name, address }, repository },
    });
  }

  await Project.updateOne(
    { _id: project._id },
    {
      $set: {
        name,
        platformSubdomain: availability.label,
        'setup.confirmedSteps': withConfirmedStep(project, 'identity'),
      },
    },
  );

  const fresh = await Project.findById(project._id).lean();
  const next = await loadWizardContext(fresh);
  res.redirect(next.state.nextHref);
});
