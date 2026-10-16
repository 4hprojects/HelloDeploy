// PHP versions with official Apache Debian images that are inside their active
// support window. Review against https://www.php.net/supported-versions.php
// before adding or removing one.
export const APPROVED_PHP_VERSIONS = Object.freeze(['8.3', '8.4']);
export const DEFAULT_PHP_VERSION = '8.3';

/** The unprivileged port the PHP web server listens on inside the container. */
export const PHP_PORT = 8080;

// The web server's document root is templated into its configuration, so only
// these two layouts are accepted.
export const PHP_DOCUMENT_ROOTS = Object.freeze(['.', 'public']);

export function validatePhpDocumentRoot(value) {
  return PHP_DOCUMENT_ROOTS.includes(value) ? null : 'The PHP document root must be . or public.';
}

/**
 * Choose the newest approved PHP version that composer.json's `require.php`
 * allows. Without composer.json or a constraint, the default version is used.
 */
export function resolvePhpVersion(composerJsonContent) {
  if (composerJsonContent === null || composerJsonContent === undefined) {
    return { version: DEFAULT_PHP_VERSION, error: null };
  }
  let composer;
  try {
    composer = JSON.parse(composerJsonContent);
  } catch {
    return { version: null, error: 'composer.json is not valid JSON.' };
  }
  const constraint = composer?.require?.php;
  if (typeof constraint !== 'string' || !constraint.trim()) {
    return { version: DEFAULT_PHP_VERSION, error: null };
  }
  const version = [...APPROVED_PHP_VERSIONS]
    .reverse()
    .find((candidate) => satisfiesComposerConstraint(candidate, constraint));
  return version
    ? { version, error: null }
    : {
        version: null,
        error: `composer.json requires PHP ${constraint.slice(0, 60)}, but HelloDeploy supports ${APPROVED_PHP_VERSIONS.join(', ')}.`,
      };
}

/**
 * Evaluate a Composer version constraint against an image's minor version
 * (`8.3`). The image ships the newest patch release, so the candidate is
 * compared as `8.3.99`. Supports `||`, AND by space or comma, `^`, `~`,
 * comparison operators, `*` wildcards, and hyphen ranges.
 */
export function satisfiesComposerConstraint(minorVersion, constraint) {
  const candidate = [...minorVersion.split('.').map(Number), 99];
  return String(constraint)
    .split('||')
    .some((alternative) => {
      const normalized = alternative
        .trim()
        .replace(/\s*-\s*/g, ' - ')
        .replace(/(>=|<=|>|<|!=|==|=|\^|~)\s+/g, '$1');
      const tokens = normalized.split(/[\s,]+/).filter(Boolean);
      const ranges = [];
      for (let index = 0; index < tokens.length; index += 1) {
        if (tokens[index + 1] === '-') {
          ranges.push(...hyphenRange(tokens[index], tokens[index + 2]));
          index += 2;
        } else {
          ranges.push(...tokenRange(tokens[index]));
        }
      }
      return ranges.length > 0 && ranges.every((check) => check(candidate));
    });
}

function parseVersion(text) {
  const match = String(text)
    .replace(/^v/i, '')
    .replace(/@.*$/, '')
    .match(/^(\d+|\*)(?:\.(\d+|\*))?(?:\.(\d+|\*))?/);
  if (!match) {
    return null;
  }
  const parts = match.slice(1).filter((part) => part !== undefined);
  const wildcardAt = parts.indexOf('*');
  const numbers = (wildcardAt === -1 ? parts : parts.slice(0, wildcardAt)).map(Number);
  return { numbers, precision: numbers.length, wildcard: wildcardAt !== -1 };
}

function compare(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

const atLeast = (bound) => (version) => compare(version, bound) >= 0;
const below = (bound) => (version) => compare(version, bound) < 0;

/** The exclusive upper bound that increments the last given part: 8.3 -> 8.4.0. */
function nextAt(numbers, position) {
  const bound = numbers.slice(0, position + 1);
  bound[position] += 1;
  return bound;
}

function tokenRange(token) {
  const operator = token.match(/^(>=|<=|>|<|!=|==|=|\^|~)?/)[0];
  const parsed = parseVersion(token.slice(operator.length));
  if (!parsed) {
    return [() => false];
  }
  const { numbers, precision, wildcard } = parsed;
  if (precision === 0) {
    return [() => true];
  }
  if (wildcard || (!operator && precision < 3)) {
    return [atLeast(numbers), below(nextAt(numbers, precision - 1))];
  }
  switch (operator) {
    case '^': {
      const significant = numbers.findIndex((part) => part !== 0);
      const position = significant === -1 ? precision - 1 : significant;
      return [atLeast(numbers), below(nextAt(numbers, position))];
    }
    case '~':
      return [atLeast(numbers), below(nextAt(numbers, Math.max(precision - 2, 0)))];
    case '>=':
      return [atLeast(numbers)];
    case '>':
      return [(version) => compare(version, numbers) > 0];
    case '<=':
      return [(version) => compare(version, numbers) <= 0];
    case '<':
      return [below(numbers)];
    case '!=':
      return [(version) => compare(version, numbers) !== 0];
    default:
      return [(version) => compare(version, numbers) === 0];
  }
}

function hyphenRange(lowerText, upperText) {
  const lower = parseVersion(lowerText);
  const upper = parseVersion(upperText);
  if (!lower || !upper) {
    return [() => false];
  }
  const upperCheck =
    upper.precision < 3
      ? below(nextAt(upper.numbers, upper.precision - 1))
      : (version) => compare(version, upper.numbers) <= 0;
  return [atLeast(lower.numbers), upperCheck];
}
