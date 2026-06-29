import { asyncHandler } from '../utils/async-handler.js';
import { Project, Repository } from '@hellodeploy/database';
import { runProjectDetection } from '../services/detection.service.js';

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
