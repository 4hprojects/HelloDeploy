/**
 * What an account is using, against what its plan allows.
 *
 * Shows only limits HelloDeploy actually enforces. `deploymentsPerMonth`,
 * `storageMb`, `maxRunningApps`, `buildTimeoutSeconds` and `logRetentionDays`
 * exist on the quota model and are editable by an administrator, but nothing in
 * the platform checks them. Presenting a usage bar for an unenforced limit would
 * tell the owner something untrue about what happens when they reach it, so they
 * are deliberately absent until enforcement exists.
 *
 * @module services/usage-view
 */

/** Limits with a real check path in the codebase today. */
const ENFORCED = Object.freeze([
  {
    key: 'websites',
    label: 'Websites',
    limitField: 'maxOwnedProjects',
    unit: null,
    explain: 'Websites you own.',
  },
  {
    key: 'domains',
    label: 'Your own domains',
    limitField: 'maxCustomDomains',
    unit: null,
    explain: 'Custom web addresses across all your websites.',
  },
  {
    key: 'members',
    label: 'People per website',
    limitField: 'maxProjectMembers',
    unit: null,
    explain: 'People you can invite to a single website.',
  },
]);

/**
 * @param {{
 *   quota: object,
 *   counts: { websites: number, domains: number, members: number },
 * }} params
 * @returns {{
 *   rows: Array<{
 *     key: string,
 *     label: string,
 *     used: number,
 *     limit: number|null,
 *     explain: string,
 *     isUnlimited: boolean,
 *     isAtLimit: boolean,
 *     isNearLimit: boolean,
 *     summary: string,
 *   }>,
 *   isAnyAtLimit: boolean,
 * }}
 */
export function buildUsageRows({ quota, counts }) {
  const rows = ENFORCED.map((entry) => {
    const limit = quota?.[entry.limitField] ?? null;
    const used = counts[entry.key] ?? 0;
    const isUnlimited = limit === null || limit === undefined;

    return {
      key: entry.key,
      label: entry.label,
      used,
      limit: isUnlimited ? null : limit,
      explain: entry.explain,
      isUnlimited,
      isAtLimit: !isUnlimited && used >= limit,
      // Warn one short of the limit, so the owner is not surprised by a refusal.
      isNearLimit: !isUnlimited && limit > 1 && used === limit - 1,
      summary: isUnlimited ? `${used} — no limit` : `${used} of ${limit}`,
    };
  });

  return { rows, isAnyAtLimit: rows.some((row) => row.isAtLimit) };
}

/**
 * Resource allocation for one website. Advanced mode only — these are the
 * container's limits, which mean nothing to an owner who does not run servers.
 *
 * @param {object} quota
 * @returns {Array<{ label: string, value: string }>}
 */
export function buildAllocationRows(quota) {
  return [
    { label: 'Memory', value: quota?.memoryMb ? `${quota.memoryMb} MB` : 'Platform default' },
    { label: 'CPU', value: quota?.cpuCores ? `${quota.cpuCores} cores` : 'Platform default' },
    {
      label: 'Versions kept for restoring',
      value: quota?.maxRollbackReleases ? String(quota.maxRollbackReleases) : 'Platform default',
    },
  ];
}
