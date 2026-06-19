import { Quota, Project, ProjectMembership } from '@hellodeploy/database';
import { QuotaScope, ProjectStatus } from '@hellodeploy/contracts';

// Default limits from product scope
const PLAN_DEFAULTS = Object.freeze({
  maxOwnedProjects: 1,
  maxRunningApps: 1,
  maxProjectMembers: 3, // Owner + 2
  memoryMb: 256,
  cpuCores: 0.25,
  storageMb: 500,
  deploymentsPerMonth: 10,
  buildTimeoutSeconds: 300,
  maxCustomDomains: 1,
  maxRollbackReleases: 3,
  logRetentionDays: 7,
});

export function getPlanDefaults() {
  return { ...PLAN_DEFAULTS };
}

// Merge a quota override document onto the plan defaults.
// Fields that are null/undefined in the override fall through to the fallback.
function mergeOnto(fallback, override) {
  if (!override) {
    return { ...fallback };
  }
  const result = { ...fallback };
  for (const key of Object.keys(PLAN_DEFAULTS)) {
    if (override[key] !== null && override[key] !== undefined) {
      result[key] = override[key];
    }
  }
  return result;
}

export async function resolveUserQuota(userId) {
  const override = await Quota.findOne({
    scopeType: QuotaScope.USER,
    scopeId: userId,
  }).lean();
  return mergeOnto(PLAN_DEFAULTS, override);
}

export async function resolveProjectQuota(projectId, ownerId) {
  const [projectOverride, userOverride] = await Promise.all([
    Quota.findOne({ scopeType: QuotaScope.PROJECT, scopeId: projectId }).lean(),
    Quota.findOne({ scopeType: QuotaScope.USER, scopeId: ownerId }).lean(),
  ]);

  // Resolution order: project override → user override → plan defaults
  const userBase = mergeOnto(PLAN_DEFAULTS, userOverride);
  return mergeOnto(userBase, projectOverride);
}

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
