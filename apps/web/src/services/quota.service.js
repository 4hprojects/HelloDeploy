import {
  Project,
  ProjectMembership,
  getPlanDefaults,
  resolveUserQuota,
  resolveProjectQuota,
} from '@hellodeploy/database';
import { ProjectStatus } from '@hellodeploy/contracts';

// Resolution lives in @hellodeploy/database so the worker can reach it too.
// Re-exported here because these are the established import paths.
export { getPlanDefaults, resolveUserQuota, resolveProjectQuota };

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
