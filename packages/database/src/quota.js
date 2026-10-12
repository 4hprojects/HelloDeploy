import { QuotaScope } from '@hellodeploy/contracts';

import { Quota } from './models/quota.model.js';

// Default limits from product scope
const BASE_PLAN_DEFAULTS = Object.freeze({
  maxOwnedProjects: 1,
  maxRunningApps: 1,
  maxProjectMembers: 3, // Owner + 2
  memoryMb: 256,
  cpuCores: 0.25,
  storageMb: 500,
  deploymentsPerMonth: 10,
  buildTimeoutSeconds: 600,
  maxCustomDomains: 1,
  maxRollbackReleases: 3,
  logRetentionDays: 7,
});

let planDefaults = BASE_PLAN_DEFAULTS;

const BOTH_SCOPES = Object.freeze([QuotaScope.USER, QuotaScope.PROJECT]);
const USER_ONLY = Object.freeze([QuotaScope.USER]);

/**
 * Admin-editable quota fields. `min` exists where 0 would be unsafe — Docker
 * treats a 0 memory or CPU limit as unlimited, and a release count of 0 would
 * delete the live image. `scopes` lists where an override is meaningful:
 * owner-wide counts only make sense on a USER override, while per-project
 * limits can be set on the owner (applies to all their projects) or on one
 * project.
 */
export const QUOTA_FIELDS = Object.freeze([
  {
    key: 'maxOwnedProjects',
    label: 'Max owned projects',
    hint: 'Maximum projects this user can own.',
    isInteger: true,
    scopes: USER_ONLY,
  },
  {
    key: 'maxRunningApps',
    label: 'Max running apps',
    hint: 'Maximum apps this user can keep running at the same time.',
    isInteger: true,
    scopes: USER_ONLY,
  },
  {
    key: 'maxProjectMembers',
    label: 'Max project members',
    hint: 'Maximum members allowed on a project.',
    isInteger: true,
    scopes: BOTH_SCOPES,
  },
  {
    key: 'memoryMb',
    label: 'Memory (MB)',
    hint: 'Runtime memory limit in megabytes.',
    isInteger: true,
    min: 128,
    scopes: BOTH_SCOPES,
  },
  {
    key: 'cpuCores',
    label: 'CPU cores',
    hint: 'CPU core allocation for runtime containers.',
    isInteger: false,
    min: 0.05,
    scopes: BOTH_SCOPES,
  },
  {
    key: 'deploymentsPerMonth',
    label: 'Deployments / month',
    hint: 'Maximum deployment attempts allowed each month.',
    isInteger: true,
    scopes: BOTH_SCOPES,
  },
  {
    key: 'buildTimeoutSeconds',
    label: 'Build timeout (seconds)',
    hint: 'Maximum build time before a deployment is stopped.',
    isInteger: true,
    min: 60,
    scopes: BOTH_SCOPES,
  },
  {
    key: 'maxCustomDomains',
    label: 'Max custom domains',
    hint: 'Maximum custom domains allowed on a project.',
    isInteger: true,
    scopes: BOTH_SCOPES,
  },
  {
    key: 'maxRollbackReleases',
    label: 'Max rollback releases',
    hint: 'Number of healthy releases retained for rollback.',
    isInteger: true,
    min: 1,
    scopes: BOTH_SCOPES,
  },
  {
    key: 'logRetentionDays',
    label: 'Log retention (days)',
    hint: 'How long deployment logs should be retained.',
    isInteger: true,
    scopes: BOTH_SCOPES,
  },
]);

/**
 * Replace selected plan defaults at startup. Memory and build timeout come
 * from the operator's RUNTIME_MEMORY_MB / BUILD_TIMEOUT_MS so that projects
 * without an override keep exactly the limits the host already applies.
 *
 * @param {Partial<typeof BASE_PLAN_DEFAULTS>} overrides
 */
export function configurePlanDefaults(overrides) {
  planDefaults = Object.freeze({ ...BASE_PLAN_DEFAULTS, ...overrides });
}

export function getPlanDefaults() {
  return { ...planDefaults };
}

export function getQuotaFieldsForScope(scopeType) {
  return QUOTA_FIELDS.filter((field) => field.scopes.includes(scopeType));
}

// Merge a quota override document onto the plan defaults.
// Fields that are null/undefined in the override fall through to the fallback.
function mergeOnto(fallback, override) {
  if (!override) {
    return { ...fallback };
  }
  const result = { ...fallback };
  for (const key of Object.keys(BASE_PLAN_DEFAULTS)) {
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
  return mergeOnto(planDefaults, override);
}

export async function resolveProjectQuota(projectId, ownerId) {
  const [projectOverride, userOverride] = await Promise.all([
    Quota.findOne({ scopeType: QuotaScope.PROJECT, scopeId: projectId }).lean(),
    Quota.findOne({ scopeType: QuotaScope.USER, scopeId: ownerId }).lean(),
  ]);

  // Resolution order: project override → user override → plan defaults
  const userBase = mergeOnto(planDefaults, userOverride);
  return mergeOnto(userBase, projectOverride);
}
