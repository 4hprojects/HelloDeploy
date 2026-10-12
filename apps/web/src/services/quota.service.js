import {
  Project,
  ProjectMembership,
  resolveUserQuota,
  resolveProjectQuota,
} from '@hellodeploy/database';
import { ProjectStatus } from '@hellodeploy/contracts';

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
