import { ProjectStatus } from '@hellodeploy/contracts';
import { projectReturnTarget } from '../utils/project-return-target.js';

export function requireEditableProject(req, res, next) {
  if (req.project.status !== ProjectStatus.ARCHIVED) {
    return next();
  }

  req.flash(
    'error',
    'Archived projects are read-only. Permanently deleting the project is still available.',
  );
  return res.redirect(projectReturnTarget(req, `/projects/${req.project.slug}`));
}
