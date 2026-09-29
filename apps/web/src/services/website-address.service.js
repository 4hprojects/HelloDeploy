/**
 * Validate and check availability of a website's platform address.
 *
 * The same rules the worker enforces when it writes nginx routes are applied
 * here, while the owner is still choosing, so a bad address is refused with an
 * explanation instead of failing a deployment later with SUBDOMAIN_INVALID.
 */

import { Project } from '@hellodeploy/database';
import { isReservedSubdomain, isValidSubdomainLabel } from '@hellodeploy/contracts';

export const ADDRESS_STATUS = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  TAKEN: 'TAKEN',
  RESERVED: 'RESERVED',
  INVALID: 'INVALID',
  EMPTY: 'EMPTY',
});

const STATUS_COPY = Object.freeze({
  [ADDRESS_STATUS.AVAILABLE]: 'Available',
  [ADDRESS_STATUS.TAKEN]: 'That address is already taken. Try another one.',
  [ADDRESS_STATUS.RESERVED]: 'That address is kept for HelloDeploy itself. Try another one.',
  [ADDRESS_STATUS.INVALID]:
    'Use lowercase letters, numbers and hyphens only, and do not start or end with a hyphen.',
  [ADDRESS_STATUS.EMPTY]: 'Choose an address for your website.',
});

/**
 * Turn any text into a candidate address. Applied to what the owner types so
 * the suggestion and the stored value always follow the same rules.
 *
 * @param {string} value
 * @returns {string}
 */
export function toAddressLabel(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/**
 * @param {string} label
 * @param {{ excludeProjectId?: string|null }} [options]
 *   excludeProjectId lets a project keep its own current address without being
 *   told it is taken.
 * @returns {Promise<{ status: string, message: string, isAvailable: boolean, label: string }>}
 */
export async function checkAddressAvailability(label, { excludeProjectId = null } = {}) {
  const normalized = toAddressLabel(label);

  const status = await resolveStatus(normalized, label, excludeProjectId);

  return {
    label: normalized,
    status,
    message: STATUS_COPY[status],
    isAvailable: status === ADDRESS_STATUS.AVAILABLE,
  };
}

async function resolveStatus(normalized, raw, excludeProjectId) {
  if (!String(raw ?? '').trim()) {
    return ADDRESS_STATUS.EMPTY;
  }

  // Compare against what the owner typed, not the cleaned-up version, so
  // "My App!" is reported as invalid rather than silently becoming "my-app".
  if (!isValidSubdomainLabel(String(raw).trim().toLowerCase()) || !normalized) {
    return ADDRESS_STATUS.INVALID;
  }

  if (isReservedSubdomain(normalized)) {
    return ADDRESS_STATUS.RESERVED;
  }

  const query = { platformSubdomain: normalized };
  if (excludeProjectId) {
    query._id = { $ne: excludeProjectId };
  }

  if (await Project.exists(query)) {
    return ADDRESS_STATUS.TAKEN;
  }

  // The slug is what nginx route files are named after, so a clash there also
  // makes the address unusable even when no project claims the subdomain.
  const slugQuery = { slug: normalized };
  if (excludeProjectId) {
    slugQuery._id = { $ne: excludeProjectId };
  }

  if (await Project.exists(slugQuery)) {
    return ADDRESS_STATUS.TAKEN;
  }

  return ADDRESS_STATUS.AVAILABLE;
}
