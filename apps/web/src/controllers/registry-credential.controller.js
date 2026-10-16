import { asyncHandler } from '../utils/async-handler.js';
import {
  deleteRegistryCredential,
  saveRegistryCredential,
} from '../services/registry-credential.service.js';

function settingsUrl(project) {
  return `/projects/${project.slug}/settings#registry-credentials`;
}

export const postSaveRegistryCredential = asyncHandler(async (req, res) => {
  const project = req.project;
  const result = await saveRegistryCredential({
    projectId: project._id,
    registry: req.body.registry,
    username: req.body.username,
    token: req.body.token,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });
  req.flash(
    result.success ? 'success' : 'error',
    result.success ? 'Registry credential saved.' : result.error,
  );
  res.redirect(settingsUrl(project));
});

export const postDeleteRegistryCredential = asyncHandler(async (req, res) => {
  const project = req.project;
  const result = await deleteRegistryCredential({
    projectId: project._id,
    registry: req.params.registry,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });
  req.flash(
    result.success ? 'success' : 'error',
    result.success ? 'Registry credential removed.' : result.error,
  );
  res.redirect(settingsUrl(project));
});
