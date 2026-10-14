import { Domain, Project } from '@hellodeploy/database';
import { logger } from '@hellodeploy/observability';

import {
  PENDING_DOMAIN_FILTER,
  withDomainMark,
  withSetupMarks,
} from '../config/project-navigation.js';
import { loadProjectOverviewState } from '../services/project-overview-loader.service.js';
import { toSetupGuide } from '../services/project-overview.service.js';

/** Marks a setup page so its render includes the setup stepper. */
export function attachSetupGuide(page) {
  return (req, res, next) => {
    res.locals.setupGuidePage = page;
    next();
  };
}

// Builds setup state when the page renders, not when the request arrives, so a POST that
// re-renders (e.g. running the app check) shows the step that comes after it. JSON and
// redirect responses never call render, so they pay nothing.
export function attachSetupState(req, res) {
  const render = res.render.bind(res);
  res.render = (view, locals = {}, callback = undefined) => {
    const project = req.project;
    const base = `/projects/${project.slug}`;
    const page = res.locals.setupGuidePage;
    Promise.all([
      loadOverviewState(project, req.membership.role, locals.overviewState),
      Domain.exists({ projectId: project._id, ...PENDING_DOMAIN_FILTER }),
    ])
      .then(([overviewState, pendingDomain]) => {
        const guide = toSetupGuide(overviewState, {
          base,
          currentPath: page ? `${base}/${page}` : base,
        });
        render(
          view,
          {
            ...locals,
            projectNavigation: withDomainMark(
              withSetupMarks(res.locals.projectNavigation, guide),
              Boolean(pendingDomain),
            ),
            setupGuide: page ? guide : null,
          },
          callback,
        );
      })
      .catch((err) => {
        // The guide is optional wayfinding; never fail the page because it could not load.
        logger.warn('Could not load project setup guide', {
          projectId: project._id?.toString(),
          error: err.message,
          correlationId: req.correlationId,
        });
        render(view, locals, callback);
      });
  };
}

async function loadOverviewState(project, membershipRole, overviewState) {
  if (overviewState) {
    return overviewState;
  }
  const freshProject = await Project.findById(project._id).lean();
  const state = await loadProjectOverviewState(freshProject ?? project, membershipRole);
  return state.overviewState;
}
