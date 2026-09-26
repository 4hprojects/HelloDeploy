import { Domain, Project, ProjectMembership } from '@hellodeploy/database';
import { DomainStatus, UiMode } from '@hellodeploy/contracts';

import { asyncHandler } from '../utils/async-handler.js';
import { resolveProjectQuota } from '../services/quota.service.js';
import { buildAllocationRows, buildUsageRows } from '../services/usage-view.service.js';

/**
 * What this website's owner is using against what their plan allows.
 *
 * Counts are scoped to the owner, not the viewer, because the limits belong to
 * whoever owns the website.
 */
export const getUsage = asyncHandler(async (req, res) => {
  const project = req.project;
  const ownerId = project.ownerId;

  const [quota, websites, domains, members] = await Promise.all([
    resolveProjectQuota(project._id, ownerId),
    Project.countDocuments({ ownerId, status: { $ne: 'ARCHIVED' } }),
    Domain.countDocuments({ projectId: project._id, status: { $ne: DomainStatus.REMOVED } }),
    ProjectMembership.countDocuments({ projectId: project._id }),
  ]);

  const usage = buildUsageRows({ quota, counts: { websites, domains, members } });

  res.render('pages/projects/usage', {
    title: `Usage – ${project.name}`,
    project,
    membership: req.membership,
    rows: usage.rows,
    isAnyAtLimit: usage.isAnyAtLimit,
    allocation: res.locals.uiMode === UiMode.ADVANCED ? buildAllocationRows(quota) : null,
  });
});
