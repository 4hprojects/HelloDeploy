import { Project, ProjectMembership } from '@hellodeploy/database';

function forbidden(res) {
  return res.status(403).render('pages/error', {
    title: 'Forbidden',
    layout: 'layouts/main',
    message: 'You do not have permission to access this project.',
  });
}

function notFound(res) {
  return res.status(404).render('pages/error', {
    title: 'Not Found',
    layout: 'layouts/main',
    message: 'Project not found.',
  });
}

/**
 * Middleware factory. Resolves the project from :slug, finds the user's
 * membership, and enforces that the role is one of the allowed roles.
 * Attaches req.project and req.membership for downstream handlers.
 */
export function requireProjectRole(...allowedRoles) {
  return async (req, res, next) => {
    const { slug } = req.params;
    if (!slug) {
      return notFound(res);
    }

    const project = await Project.findOne({ slug }).lean();
    if (!project) {
      return notFound(res);
    }

    const userId = req.session.user.id;
    const membership = await ProjectMembership.findOne({
      projectId: project._id,
      userId,
    }).lean();

    if (!membership || !allowedRoles.includes(membership.role)) {
      return forbidden(res);
    }

    req.project = project;
    req.membership = membership;
    res.locals.currentProject = project;
    res.locals.currentMembership = membership;
    next();
  };
}
