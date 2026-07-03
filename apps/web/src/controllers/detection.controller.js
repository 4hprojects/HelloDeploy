import { asyncHandler } from '../utils/async-handler.js';
import { Project, Repository } from '@hellodeploy/database';
import { runProjectDetection } from '../services/detection.service.js';
import { updateBuildConfiguration, updateBuildFilters } from '../services/project.service.js';
import {
  validateUpdateBuildConfiguration,
  validateUpdateBuildFilters,
} from '../validators/project.validator.js';

async function renderDetection(req, res, extras = {}) {
  const project = req.project;

  let repo = null;
  if (project.repositoryId) {
    repo = await Repository.findById(project.repositoryId).lean();
  }

  res.render('pages/projects/detection', {
    title: `Detection – ${project.name}`,
    project,
    membership: req.membership,
    repo,
    detectionResult: null,
    ...extras,
  });
}

export const getDetection = asyncHandler((req, res) => renderDetection(req, res));

export const postRunDetection = asyncHandler(async (req, res) => {
  const project = req.project;

  const result = await runProjectDetection(project._id.toString(), req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  // Re-fetch project to get updated runtimeType
  const updatedProject = await Project.findById(project._id).lean();
  let repo = null;
  if (updatedProject.repositoryId) {
    repo = await Repository.findById(updatedProject.repositoryId).lean();
  }

  res.render('pages/projects/detection', {
    title: `Detection – ${project.name}`,
    project: updatedProject,
    membership: req.membership,
    repo,
    detectionResult: result,
  });
});

export const postUpdateBuildConfiguration = asyncHandler(async (req, res) => {
  const project = req.project;
  const { errors, hasErrors } = validateUpdateBuildConfiguration(req.body);

  if (hasErrors) {
    return renderDetection(req, res, { bcErrors: errors, bcValues: req.body });
  }

  const result = await updateBuildConfiguration({
    projectId: project._id,
    buildCommand: req.body.buildCommand,
    startCommand: req.body.startCommand,
    outputDirectory: req.body.outputDirectory,
    applicationPort: req.body.applicationPort,
    healthCheckPath: req.body.healthCheckPath,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    return renderDetection(req, res, { bcErrors: { form: result.error }, bcValues: req.body });
  }

  req.flash('success', 'Build configuration saved.');
  res.redirect(`/projects/${project.slug}/detection`);
});

export const postUpdateBuildFilters = asyncHandler(async (req, res) => {
  const project = req.project;
  const { errors, hasErrors, includedPaths, ignoredPaths } = validateUpdateBuildFilters(req.body);

  if (hasErrors) {
    return renderDetection(req, res, { bfErrors: errors, bfValues: req.body });
  }

  const result = await updateBuildFilters({
    projectId: project._id,
    includedPaths,
    ignoredPaths,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    return renderDetection(req, res, { bfErrors: { form: result.error }, bfValues: req.body });
  }

  req.flash('success', 'Build filters saved.');
  res.redirect(`/projects/${project.slug}/detection`);
});
