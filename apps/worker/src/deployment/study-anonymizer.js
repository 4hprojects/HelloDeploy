import { redactLogLine } from './log-capture.js';

// Hosts whose names say something about the build (a registry outage, a
// missing package) and nothing about the user, so they survive anonymization.
const PUBLIC_HOSTS = [
  'github.com',
  'githubusercontent.com',
  'registry.npmjs.org',
  'registry.yarnpkg.com',
  'nodejs.org',
  'docker.io',
  'docker.com',
  'pypi.org',
  'files.pythonhosted.org',
  'deb.debian.org',
  'dl-cdn.alpinelinux.org',
];

// Shorter identifiers ("app", "web") are too common in ordinary log text.
const MIN_IDENTIFIER_LENGTH = 4;

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_HOST_PATTERN = /\b((?:https?|git|ssh|wss?):\/\/)([^\s/@]+@)?([A-Za-z0-9.-]+)/gi;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
// At least four groups, so HH:MM:SS timestamps are left alone.
const IPV6_PATTERN = /\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi;
const HOME_PATH_PATTERN = /\/(home|Users)\/[^/\s]+/g;
const DIGEST_PATTERN = /\b[0-9a-f]{64}\b/gi;
const SHA_PATTERN = /\b[0-9a-f]{40}\b/gi;
const OBJECT_ID_PATTERN = /\b[0-9a-f]{24}\b/gi;

function isPublicHost(host) {
  const normalized = host.toLowerCase();
  return PUBLIC_HOSTS.some(
    (publicHost) => normalized === publicHost || normalized.endsWith(`.${publicHost}`),
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ordered [pattern, placeholder] pairs for one deployment's own identifiers,
 * longest first so "owner/repo" is replaced before "owner".
 *
 * @param {{ domains?: string[], repoFullName?: string|null, repoOwner?: string|null,
 *   repoName?: string|null, slug?: string|null, subdomain?: string|null,
 *   ownerName?: string|null, ownerEmail?: string|null, commitShas?: string[] }} identifiers
 */
export function buildIdentifierReplacements(identifiers) {
  const entries = [
    ...(identifiers.domains ?? []).map((domain) => [domain, '[domain]']),
    [identifiers.repoFullName, '[repo]'],
    [identifiers.ownerEmail, '[email]'],
    [identifiers.ownerName, '[owner]'],
    [identifiers.subdomain, '[project]'],
    [identifiers.slug, '[project]'],
    [identifiers.repoName, '[repo]'],
    [identifiers.repoOwner, '[owner]'],
    ...(identifiers.commitShas ?? []).flatMap((sha) => [
      [sha, '[sha]'],
      [sha.slice(0, 7), '[sha]'],
    ]),
  ].filter(([value]) => typeof value === 'string' && value.trim().length >= MIN_IDENTIFIER_LENGTH);

  const seen = new Set();
  return entries
    .filter(([value]) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort(([a], [b]) => b.length - a.length)
    .map(([value, placeholder]) => [
      new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(value.trim())}(?![A-Za-z0-9])`, 'gi'),
      placeholder,
    ]);
}

/**
 * Anonymize one log line for the long-term study archive: secrets are
 * redacted first, then this deployment's own identifiers, then anything that
 * looks like personal or infrastructure data in any log.
 *
 * @param {string} line
 * @param {Array<[RegExp, string]>} replacements from buildIdentifierReplacements
 */
export function anonymizeLine(line, replacements = []) {
  let result = redactLogLine(String(line ?? ''));
  for (const [pattern, placeholder] of replacements) {
    result = result.replace(pattern, placeholder);
  }
  return result
    .replace(EMAIL_PATTERN, '[email]')
    .replace(URL_HOST_PATTERN, (match, scheme, _userInfo, host) =>
      isPublicHost(host) ? `${scheme}${host}` : `${scheme}[host]`,
    )
    .replace(IPV4_PATTERN, '[ip]')
    .replace(IPV6_PATTERN, '[ip]')
    .replace(HOME_PATH_PATTERN, '/$1/[user]')
    .replace(DIGEST_PATTERN, '[digest]')
    .replace(SHA_PATTERN, '[sha]')
    .replace(OBJECT_ID_PATTERN, '[id]');
}
