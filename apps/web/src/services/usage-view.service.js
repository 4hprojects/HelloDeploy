/**
 * What an account is using, against what its plan allows.
 *
 * A limit is shown as a limit only where the platform actually refuses to exceed
 * it. `maxOwnedProjects` and `maxProjectMembers` have real check paths
 * (`checkCanCreateProject`, `checkCanAddMember`); nothing else does.
 *
 * `maxCustomDomains` is configured and displayed elsewhere but is **not**
 * enforced — `addDomain` never consults it. It is reported here as a plain count
 * rather than as an allowance, because telling an owner they are "at the limit"
 * of something they can still exceed is worse than telling them nothing.
 *
 * `deploymentsPerMonth`, `storageMb`, `maxRunningApps`, `buildTimeoutSeconds` and
 * `logRetentionDays` are editable by an administrator and equally unenforced, and
 * are absent for the same reason.
 *
 * @module services/usage-view
 */

/** Limits the platform refuses to exceed. */
const ENFORCED = Object.freeze([
  {
    key: 'websites',
    label: 'Websites',
    limitField: 'maxOwnedProjects',
    explain: 'Websites you own.',
  },
  {
    key: 'members',
    label: 'People per website',
    limitField: 'maxProjectMembers',
    explain: 'People you can invite to a single website.',
  },
]);

/** Counts worth showing that carry no enforced limit. */
const INFORMATIONAL = Object.freeze([
  {
    key: 'domains',
    label: 'Your own domains',
    explain: 'Custom web addresses connected to this website.',
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
 *   counts: Array<{ key: string, label: string, used: number, explain: string }>,
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

  const counts_ = INFORMATIONAL.map((entry) => ({
    key: entry.key,
    label: entry.label,
    used: counts[entry.key] ?? 0,
    explain: entry.explain,
  }));

  return {
    rows,
    counts: counts_,
    isAnyAtLimit: rows.some((row) => row.isAtLimit),
  };
}

/**
 * Resource figures recorded against the plan.
 *
 * These are **not** what the container gets. The worker uses
 * `env.RUNTIME_MEMORY_MB` and a fixed 0.25 CPU, retention keeps a hardcoded three
 * releases, and the build timeout comes from `env.BUILD_TIMEOUT_MS` — none of them
 * read the quota. Presenting them as this website's limits is the same false
 * promise that was just removed for custom domains, so they are labelled as
 * configured-but-unapplied rather than described as allocation.
 *
 * Kept visible because an administrator who edits them should be able to see what
 * they set; removed from Simple mode because they mean nothing to an owner.
 *
 * @param {object} quota
 * @returns {Array<{ label: string, value: string, isApplied: boolean }>}
 */
export function buildAllocationRows(quota) {
  return [
    {
      label: 'Memory',
      value: quota?.memoryMb ? `${quota.memoryMb} MB` : 'Not set',
      isApplied: false,
    },
    {
      label: 'CPU',
      value: quota?.cpuCores ? `${quota.cpuCores} cores` : 'Not set',
      isApplied: false,
    },
    {
      label: 'Versions kept for restoring',
      value: quota?.maxRollbackReleases ? String(quota.maxRollbackReleases) : 'Not set',
      isApplied: false,
    },
  ];
}
