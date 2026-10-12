import { getQuotaFieldsForScope } from '@hellodeploy/database';

const REASON_MAX_LENGTH = 500;

/**
 * Validate the admin quota-override form for one scope. An empty field means
 * "no override" and is listed in `cleared` so the stored value is removed; a
 * non-empty field that isn't a valid non-negative number is reported per-field
 * instead of being silently dropped. Fields that don't apply to the scope are
 * ignored. `max` holds host ceilings keyed by field, so a typo can't hand one
 * app more memory or CPU than the host has.
 *
 * @param {Record<string, string>} body
 * @param {string} scopeType
 * @param {{ max?: Record<string, number> }} [options]
 * @returns {{ errors: Record<string,string>, hasErrors: boolean, limits: Record<string,number>, cleared: string[], reason: string }}
 */
export function validateSetQuota(body, scopeType, { max = {} } = {}) {
  const errors = {};
  const limits = {};
  const cleared = [];

  for (const { key, label, isInteger, min = 0 } of getQuotaFieldsForScope(scopeType)) {
    const raw = body[key]?.trim?.() ?? '';
    if (raw === '') {
      cleared.push(key);
      continue;
    }
    const parsed = Number(raw);
    if (isInteger && (!Number.isInteger(parsed) || parsed < min)) {
      errors[key] = `${label} must be a whole number of ${min} or more.`;
    } else if (!Number.isFinite(parsed) || parsed < min) {
      errors[key] = `${label} must be a number of ${min} or more.`;
    } else if (max[key] !== undefined && parsed > max[key]) {
      errors[key] = `${label} can be at most ${max[key]} on this host.`;
    } else {
      limits[key] = parsed;
    }
  }

  const reason = body.reason?.trim?.() ?? '';
  if (reason === '') {
    errors.reason = 'Give a reason — it is recorded in the audit log.';
  } else if (reason.length > REASON_MAX_LENGTH) {
    errors.reason = `Reason must be ${REASON_MAX_LENGTH} characters or fewer.`;
  }

  return { errors, hasErrors: Object.keys(errors).length > 0, limits, cleared, reason };
}
