const INTEGER_QUOTA_FIELDS = [
  ['maxOwnedProjects', 'Max owned projects'],
  ['maxRunningApps', 'Max running apps'],
  ['maxProjectMembers', 'Max project members'],
  ['memoryMb', 'Memory (MB)'],
  ['deploymentsPerMonth', 'Deployments / month'],
  ['buildTimeoutSeconds', 'Build timeout (seconds)'],
  ['maxCustomDomains', 'Max custom domains'],
  ['maxRollbackReleases', 'Max rollback releases'],
  ['logRetentionDays', 'Log retention (days)'],
];

const FLOAT_QUOTA_FIELDS = [['cpuCores', 'CPU cores']];

/**
 * Validate the admin quota-override form. Empty fields mean "no override"
 * and are omitted from `limits`; a non-empty field that isn't a valid
 * non-negative number is reported per-field instead of being silently
 * dropped.
 *
 * @returns {{ errors: Record<string,string>, hasErrors: boolean, limits: Record<string,number> }}
 */
export function validateSetQuota(body) {
  const errors = {};
  const limits = {};

  for (const [key, label] of INTEGER_QUOTA_FIELDS) {
    const raw = body[key]?.trim?.() ?? '';
    if (raw === '') {
      continue;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      errors[key] = `${label} must be a whole number of 0 or more.`;
    } else {
      limits[key] = parsed;
    }
  }

  for (const [key, label] of FLOAT_QUOTA_FIELDS) {
    const raw = body[key]?.trim?.() ?? '';
    if (raw === '') {
      continue;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors[key] = `${label} must be a number of 0 or more.`;
    } else {
      limits[key] = parsed;
    }
  }

  return { errors, hasErrors: Object.keys(errors).length > 0, limits };
}
