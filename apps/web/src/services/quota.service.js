import {
  Deployment,
  Domain,
  Project,
  ProjectMembership,
  resolveUserQuota,
  resolveProjectQuota,
} from '@hellodeploy/database';
import {
  ApiError,
  DeploymentStatus,
  DeploymentTrigger,
  DomainStatus,
  ProjectStatus,
} from '@hellodeploy/contracts';

export async function checkCanCreateProject(userId) {
  const [ownedCount, quota] = await Promise.all([
    Project.countDocuments({
      ownerId: userId,
      status: { $nin: [ProjectStatus.ARCHIVED] },
    }),
    resolveUserQuota(userId),
  ]);
  return ownedCount < quota.maxOwnedProjects;
}

export async function checkCanAddMember(projectId, ownerId) {
  const [memberCount, quota] = await Promise.all([
    ProjectMembership.countDocuments({ projectId }),
    resolveProjectQuota(projectId, ownerId),
  ]);
  return memberCount < quota.maxProjectMembers;
}

export function startOfUtcMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Deployments a project started this UTC month. Rollbacks reuse an existing
 * image and are not counted.
 */
export function countDeploymentsThisMonth(projectId, now = new Date()) {
  return Deployment.countDocuments({
    projectId,
    triggerType: { $ne: DeploymentTrigger.ROLLBACK },
    createdAt: { $gte: startOfUtcMonth(now) },
  });
}

/** Projects of `ownerId` that currently serve a live container. */
export async function countRunningApps(ownerId) {
  const projectIds = await Project.find({
    ownerId,
    status: { $ne: ProjectStatus.ARCHIVED },
  }).distinct('_id');
  const running = await Deployment.distinct('projectId', {
    projectId: { $in: projectIds },
    status: DeploymentStatus.HEALTHY,
    activeContainerId: { $ne: null },
  });
  return running.length;
}

/**
 * Refusal for a new deployment of `project`, or null when quota allows it.
 * A project that is already running only replaces its own app, so the
 * running-app cap applies only to its first live release.
 *
 * @returns {Promise<{ error: string, code: string } | null>}
 */
export async function checkDeploymentQuota(project) {
  const [quota, ownerQuota, deploymentsThisMonth, isRunning] = await Promise.all([
    resolveProjectQuota(project._id, project.ownerId),
    resolveUserQuota(project.ownerId),
    countDeploymentsThisMonth(project._id),
    Deployment.exists({
      projectId: project._id,
      status: DeploymentStatus.HEALTHY,
      activeContainerId: { $ne: null },
    }),
  ]);

  if (deploymentsThisMonth >= quota.deploymentsPerMonth) {
    return {
      code: ApiError.QUOTA_EXCEEDED,
      error: `This project has used ${deploymentsThisMonth} of ${quota.deploymentsPerMonth} deployments this month. The allowance resets on the 1st (UTC).`,
    };
  }

  if (!isRunning) {
    const runningApps = await countRunningApps(project.ownerId);
    if (runningApps >= ownerQuota.maxRunningApps) {
      return {
        code: ApiError.QUOTA_EXCEEDED,
        error: `The project owner already has ${runningApps} of ${ownerQuota.maxRunningApps} running apps. Stop or delete another project before deploying this one.`,
      };
    }
  }

  return null;
}

/** Refusal for adding a custom domain to `project`, or null when allowed. */
export async function checkDomainQuota(project) {
  const [quota, domainCount] = await Promise.all([
    resolveProjectQuota(project._id, project.ownerId),
    Domain.countDocuments({ projectId: project._id, status: { $ne: DomainStatus.REMOVED } }),
  ]);
  if (domainCount >= quota.maxCustomDomains) {
    return {
      code: ApiError.QUOTA_EXCEEDED,
      error: `This project has ${domainCount} of ${quota.maxCustomDomains} custom domains allowed. Remove one before adding another.`,
    };
  }
  return null;
}
