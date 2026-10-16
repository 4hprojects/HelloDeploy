// Python versions with official slim Debian images that are inside their upstream
// support window. Review against https://devguide.python.org/versions/ before
// adding or removing one.
export const APPROVED_PYTHON_VERSIONS = Object.freeze(['3.12', '3.13']);
export const DEFAULT_PYTHON_VERSION = '3.13';

const APPLICATION_MODULE_PATTERN =
  /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*:[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Validate a WSGI/ASGI entry point such as `mysite.wsgi:application`. The value
 * becomes one argument of the server command, so only identifiers are allowed.
 */
export function validateApplicationModule(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return 'Application module is required, such as main:app.';
  }
  if (value.length > 200) {
    return 'Application module must be 200 characters or fewer.';
  }
  if (!APPLICATION_MODULE_PATTERN.test(value)) {
    return 'Application module must use the module:attribute form, such as main:app.';
  }
  return null;
}

/**
 * Read a `.python-version` file and return the approved minor version it names.
 * A missing file selects the default version.
 */
export function resolvePythonVersion(fileContent) {
  if (fileContent === null || fileContent === undefined) {
    return { version: DEFAULT_PYTHON_VERSION, error: null };
  }
  const requested = String(fileContent)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'));
  const match = requested?.match(/^(3\.\d{1,2})(?:\.\d{1,3})?$/);
  if (!match) {
    return {
      version: null,
      error: `.python-version names ${requested ? `"${requested.slice(0, 40)}"` : 'nothing'}, which is not a supported Python version. Use one of ${APPROVED_PYTHON_VERSIONS.join(', ')}.`,
    };
  }
  if (!APPROVED_PYTHON_VERSIONS.includes(match[1])) {
    return {
      version: null,
      error: `Python ${match[1]} is not supported. Use one of ${APPROVED_PYTHON_VERSIONS.join(', ')} in .python-version.`,
    };
  }
  return { version: match[1], error: null };
}

/**
 * Collect the normalized (PEP 503) distribution names listed in a requirements
 * file. Options and includes are skipped; only direct names are reported.
 */
export function parsePythonRequirementNames(content) {
  const names = new Set();
  for (const rawLine of String(content ?? '').split('\n')) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#') || line.startsWith('-')) {
      continue;
    }
    const match = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)/);
    if (match) {
      names.add(normalizePythonPackageName(match[1]));
    }
  }
  return names;
}

export function normalizePythonPackageName(name) {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}
