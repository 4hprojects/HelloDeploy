import { asyncHandler } from '../utils/async-handler.js';
import { Project, Repository } from '@hellodeploy/database';
import { runProjectDetection } from '../services/detection.service.js';
import { updateBuildConfiguration, updateBuildFilters } from '../services/project.service.js';
import {
  validateUpdateBuildConfiguration,
  validateUpdateBuildFilters,
} from '../validators/project.validator.js';

export const getDetection = asyncHandler(async (req, res) => {
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
  });
});

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
    req.flash('error', Object.values(errors)[0]);
    return res.redirect(`/projects/${project.slug}/detection`);
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
    req.flash('error', result.error);
    return res.redirect(`/projects/${project.slug}/detection`);
  }

  req.flash('success', 'Build configuration saved.');
  res.redirect(`/projects/${project.slug}/detection`);
});

export const postUpdateBuildFilters = asyncHandler(async (req, res) => {
  const project = req.project;
  const { errors, hasErrors, includedPaths, ignoredPaths } = validateUpdateBuildFilters(req.body);

  if (hasErrors) {
    req.flash('error', Object.values(errors)[0]);
    return res.redirect(`/projects/${project.slug}/detection`);
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
    req.flash('error', result.error);
    return res.redirect(`/projects/${project.slug}/detection`);
  }

  req.flash('success', 'Build filters saved.');
  res.redirect(`/projects/${project.slug}/detection`);
});
