import { RepositoryProvider, RepositorySourceType } from './enums.js';

const GITHUB_HOST = 'github.com';
const COMPONENT_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

function containsUnsafeCharacter(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 || character === '\\';
  });
}

export class RepositorySourceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RepositorySourceError';
    this.code = code;
  }
}

/**
 * Normalize a public GitHub HTTPS repository URL without performing I/O.
 * The returned URL is reconstructed from validated components.
 */
export function normalizePublicGithubRepositoryUrl(input) {
  if (typeof input !== 'string' || input.length === 0 || input.length > 2048) {
    throw new RepositorySourceError(
      'INVALID_REPOSITORY_URL',
      'Enter a valid public GitHub repository URL.',
    );
  }
  if (input !== input.trim() || containsUnsafeCharacter(input)) {
    throw new RepositorySourceError(
      'INVALID_REPOSITORY_URL',
      'Enter a valid public GitHub repository URL.',
    );
  }
  if (/^https:\/\/[^/]+:\d+(?:\/|$)/i.test(input)) {
    throw new RepositorySourceError(
      'INVALID_REPOSITORY_URL',
      'Repository URLs cannot specify a port.',
    );
  }

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new RepositorySourceError(
      'INVALID_REPOSITORY_URL',
      'Enter a valid public GitHub repository URL.',
    );
  }

  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== GITHUB_HOST) {
    throw new RepositorySourceError(
      'UNSUPPORTED_REPOSITORY_HOST',
      'Only public GitHub HTTPS repository URLs are supported.',
    );
  }
  if (parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) {
    throw new RepositorySourceError(
      'INVALID_REPOSITORY_URL',
      'Repository URLs cannot contain credentials, ports, query parameters, or fragments.',
    );
  }
  if (/%2f|%5c/i.test(parsed.pathname)) {
    throw new RepositorySourceError(
      'INVALID_REPOSITORY_URL',
      'Enter a valid public GitHub repository URL.',
    );
  }

  const rawSegments = parsed.pathname.split('/').filter(Boolean);
  if (rawSegments.length !== 2) {
    throw new RepositorySourceError(
      'INVALID_REPOSITORY_URL',
      'Use a repository URL in the form https://github.com/owner/repository.',
    );
  }

  let owner;
  let repository;
  try {
    owner = decodeURIComponent(rawSegments[0]);
    repository = decodeURIComponent(rawSegments[1]).replace(/\.git$/i, '');
  } catch {
    throw new RepositorySourceError(
      'INVALID_REPOSITORY_URL',
      'Enter a valid public GitHub repository URL.',
    );
  }
  if (
    owner.length > 39 ||
    repository.length > 100 ||
    !COMPONENT_PATTERN.test(owner) ||
    !COMPONENT_PATTERN.test(repository) ||
    owner.startsWith('-') ||
    repository.startsWith('-')
  ) {
    throw new RepositorySourceError(
      'INVALID_REPOSITORY_URL',
      'The GitHub owner or repository name is invalid.',
    );
  }

  const fullName = `${owner}/${repository}`;
  return Object.freeze({
    sourceType: RepositorySourceType.PUBLIC_GIT,
    provider: RepositoryProvider.GITHUB,
    ownerLogin: owner,
    name: repository,
    fullName,
    canonicalCloneUrl: `https://${GITHUB_HOST}/${fullName}.git`,
  });
}
