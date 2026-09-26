/**
 * Classify a project's environment settings for the owner-facing view.
 *
 * Pure: callers pass in the detected keys and the names already stored, and get
 * back one row per setting plus what is still missing. Nothing here reads or
 * decrypts a value — classification never needs the secret itself.
 */

import {
  EnvVarCategory,
  isPlatformManagedEnv,
  platformManagedReason,
} from '@hellodeploy/contracts';

/**
 * @param {{
 *   requiredKeys?: string[],
 *   optionalKeys?: string[],
 *   storedNames?: string[],
 * }} params
 * @returns {{
 *   rows: Array<{
 *     name: string,
 *     category: string,
 *     isStored: boolean,
 *     isBlocking: boolean,
 *     note: string|null,
 *   }>,
 *   missingRequired: string[],
 * }}
 */
export function classifyEnvironment({ requiredKeys = [], optionalKeys = [], storedNames = [] }) {
  const stored = new Set(storedNames);
  const rows = [];
  const seen = new Set();

  const add = (name, category, note) => {
    const upper = name.toUpperCase();
    if (seen.has(upper)) {
      return;
    }
    seen.add(upper);

    const isStored = stored.has(upper);
    rows.push({
      name: upper,
      category,
      isStored,
      isBlocking: category === EnvVarCategory.REQUIRED_USER_INPUT && !isStored,
      note,
    });
  };

  requiredKeys.forEach((name) => {
    // A required key that is already stored is no longer something to ask for.
    const category = stored.has(name.toUpperCase())
      ? EnvVarCategory.OPTIONAL_USER_INPUT
      : EnvVarCategory.REQUIRED_USER_INPUT;
    add(name, category, null);
  });

  optionalKeys.forEach((name) => add(name, EnvVarCategory.OPTIONAL_USER_INPUT, null));

  // Anything already stored that detection did not mention. Kept and shown, not
  // flagged as stray — the owner may have added it deliberately.
  storedNames.forEach((name) => {
    if (isPlatformManagedEnv(name)) {
      add(name, EnvVarCategory.PLATFORM_MANAGED, platformManagedReason(name));
      return;
    }
    add(name, EnvVarCategory.DETECTED_EXISTING, null);
  });

  return {
    rows: rows.sort(compareRows),
    missingRequired: rows.filter((row) => row.isBlocking).map((row) => row.name),
  };
}

// Blocking settings first so the owner sees what is stopping them, then the rest
// alphabetically for a stable order.
const CATEGORY_ORDER = [
  EnvVarCategory.REQUIRED_USER_INPUT,
  EnvVarCategory.OPTIONAL_USER_INPUT,
  EnvVarCategory.DETECTED_EXISTING,
  EnvVarCategory.PLATFORM_MANAGED,
  EnvVarCategory.UNKNOWN,
];

function compareRows(a, b) {
  if (a.isBlocking !== b.isBlocking) {
    return a.isBlocking ? -1 : 1;
  }
  const byCategory = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  return byCategory !== 0 ? byCategory : a.name.localeCompare(b.name);
}

/**
 * Shape checks for a supplied value. Format only — nothing here connects to a
 * database or calls a remote service, so a valid-looking value that happens to
 * be wrong is still accepted.
 *
 * @param {string} name
 * @param {string} value
 * @returns {string|null} message, or null when acceptable
 */
export function validateEnvValue(name, value) {
  const text = String(value ?? '');
  if (!text.trim()) {
    return 'Enter a value, or remove this setting.';
  }

  if (/_URL$|^DATABASE_URL$|_URI$/.test(name) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(text.trim())) {
    return 'This looks like it should be a web or database address, starting with something like https:// or postgres://.';
  }

  if (/_PORT$|^PORT_/.test(name) && !/^\d+$/.test(text.trim())) {
    return 'This should be a number.';
  }

  return null;
}
