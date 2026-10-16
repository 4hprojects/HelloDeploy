import { RuntimeType } from './enums.js';

export const BuildStrategy = Object.freeze({
  LEGACY_GENERATED: 'legacy_generated',
  NEXT_STANDARD_V1: 'next_standard_v1',
  NEXT_STANDALONE_V1: 'next_standalone_v1',
  NEXT_EXPORT_V1: 'next_export_v1',
  PYTHON_FLASK_V1: 'python_flask_v1',
  PYTHON_FASTAPI_V1: 'python_fastapi_v1',
  PYTHON_DJANGO_V1: 'python_django_v1',
});

export const NEXT_BUILD_STRATEGIES = Object.freeze([
  BuildStrategy.NEXT_STANDARD_V1,
  BuildStrategy.NEXT_STANDALONE_V1,
  BuildStrategy.NEXT_EXPORT_V1,
]);

export function isNextBuildStrategy(value) {
  return NEXT_BUILD_STRATEGIES.includes(value);
}

export const PYTHON_BUILD_STRATEGIES = Object.freeze([
  BuildStrategy.PYTHON_FLASK_V1,
  BuildStrategy.PYTHON_FASTAPI_V1,
  BuildStrategy.PYTHON_DJANGO_V1,
]);

export function isPythonBuildStrategy(value) {
  return PYTHON_BUILD_STRATEGIES.includes(value);
}

/** The runtime a versioned strategy requires; the legacy strategy is not bound to one. */
export function getBuildStrategyRuntime(strategy) {
  if (isNextBuildStrategy(strategy)) {
    return RuntimeType.NEXTJS;
  }
  if (isPythonBuildStrategy(strategy)) {
    return RuntimeType.PYTHON;
  }
  return null;
}

/**
 * Validate a repository-relative POSIX application root without normalizing
 * hostile input into an apparently safe value.
 */
export function validateApplicationRoot(value) {
  if (typeof value !== 'string') {
    return 'Application root must be a repository-relative path.';
  }
  if (value.length === 0 || value.length > 255) {
    return 'Application root must be between 1 and 255 characters.';
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) {
    return 'Application root must use a repository-relative POSIX path.';
  }
  if (value.startsWith('/') || value.endsWith('/') || value.includes('//')) {
    return 'Application root must be a normalized repository-relative path.';
  }
  if (value === '.') {
    return null;
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return 'Application root must not contain traversal or redundant path segments.';
  }
  return null;
}

export function normalizeApplicationRoot(value) {
  const normalized = String(value ?? '').trim() || '.';
  const error = validateApplicationRoot(normalized);
  if (error) {
    throw new TypeError(error);
  }
  return normalized;
}

/**
 * Decide whether a project may use a strategy. The legacy strategy is always
 * available; each versioned family needs its pilot flag and allowlist entry.
 *
 * @param {string|null|undefined} strategy
 * @param {unknown} projectId
 * @param {{ next: Pilot, python: Pilot }} pilots
 * @typedef {{ enabled: boolean, projectIds: Set<string> }} Pilot
 */
export function isPilotStrategyEnabledFor(strategy, projectId, pilots) {
  if (!strategy || strategy === BuildStrategy.LEGACY_GENERATED) {
    return true;
  }
  const pilot = isNextBuildStrategy(strategy)
    ? pilots.next
    : isPythonBuildStrategy(strategy)
      ? pilots.python
      : null;
  return Boolean(pilot?.enabled && pilot.projectIds.has(String(projectId ?? '').toLowerCase()));
}
