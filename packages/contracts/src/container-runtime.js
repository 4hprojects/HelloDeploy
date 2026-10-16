import { validateApplicationRoot } from './build-strategies.js';

// Registries an owner-supplied image or Dockerfile base image may come from.
export const APPROVED_IMAGE_REGISTRIES = Object.freeze(['docker.io', 'ghcr.io']);

const REPOSITORY_COMPONENT = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;
const TAG_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const OFFICIAL_FRONTEND = /^docker\/dockerfile(?::1(?:\.\d+)*(?:-labs)?)?$/;

/**
 * Parse an OCI image reference and normalize Docker Hub shorthand. The result
 * names only approved registries; anything else carries an `error`.
 */
export function parseImageReference(value) {
  const invalid = (message) => ({
    registry: null,
    repository: null,
    tag: null,
    digest: null,
    name: null,
    error: message,
  });
  const reference = typeof value === 'string' ? value.trim() : '';
  if (!reference || reference.length > 512) {
    return invalid('Enter an image reference such as ghcr.io/owner/app@sha256:….');
  }
  const [withoutDigest, digest = null, extra] = reference.split('@');
  if (extra !== undefined || (digest !== null && !DIGEST_PATTERN.test(digest))) {
    return invalid('The image reference is not valid; digests must be sha256.');
  }
  const lastSlash = withoutDigest.lastIndexOf('/');
  const tagSeparator = withoutDigest.lastIndexOf(':');
  const hasTag = tagSeparator > lastSlash;
  const path = hasTag ? withoutDigest.slice(0, tagSeparator) : withoutDigest;
  const tag = hasTag ? withoutDigest.slice(tagSeparator + 1) : null;

  const segments = path.split('/');
  const hasRegistry =
    segments.length > 1 && (segments[0].includes('.') || segments[0].includes(':'));
  const registry = hasRegistry ? segments.shift() : 'docker.io';
  if (registry === 'docker.io' && segments.length === 1) {
    segments.unshift('library');
  }
  if (
    segments.length === 0 ||
    !segments.every((segment) => REPOSITORY_COMPONENT.test(segment)) ||
    (tag !== null && !TAG_PATTERN.test(tag))
  ) {
    return invalid('The image reference is not valid; use lowercase names such as owner/app:1.0.');
  }
  if (!APPROVED_IMAGE_REGISTRIES.includes(registry)) {
    return invalid(
      `Images must come from ${APPROVED_IMAGE_REGISTRIES.join(', ')}; ${registry} is not approved.`,
    );
  }
  const repository = segments.join('/');
  return {
    registry,
    repository,
    tag: tag ?? (digest ? null : 'latest'),
    digest,
    name: `${registry}/${repository}`,
    error: null,
  };
}

/** A Dockerfile path relative to the application root, never the root itself. */
export function validateDockerfilePath(value) {
  if (value === '.') {
    return 'The Dockerfile path must name a file inside the application root.';
  }
  const error = validateApplicationRoot(value);
  return error ? error.replace('Application root', 'Dockerfile path') : null;
}

/** True when an image `User` value names neither root nor uid 0. */
export function isNonRootImageUser(user) {
  const name = String(user ?? '')
    .trim()
    .split(':')[0];
  return Boolean(name) && name !== 'root' && name !== '0';
}

/**
 * Statically check an owner Dockerfile against the build policy. BuildKit's
 * missing entitlements and the runtime container profile still apply; this
 * check exists so violations fail early with a precise explanation.
 *
 * @returns {Array<{ line: number, message: string }>}
 */
export function findDockerfilePolicyViolations(content) {
  const violations = [];
  const lines = String(content ?? '').split(/\r?\n/);
  const instructions = [];
  let parserDirectives = true;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (parserDirectives) {
      const directive = trimmed.match(/^#\s*([a-z]+)\s*=\s*(.+)$/i);
      if (directive) {
        if (
          directive[1].toLowerCase() === 'syntax' &&
          !OFFICIAL_FRONTEND.test(directive[2].trim())
        ) {
          violations.push({
            line: index + 1,
            message:
              'Only the official docker/dockerfile:1 syntax is allowed; custom BuildKit frontends run their own code in the builder.',
          });
        }
        continue;
      }
      parserDirectives = false;
    }
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    // Join line continuations so flags split across lines are still seen.
    let text = trimmed;
    const startLine = index + 1;
    while (text.endsWith('\\') && index + 1 < lines.length) {
      index += 1;
      text = `${text.slice(0, -1)} ${lines[index].trim()}`;
    }
    const [keyword = '', ...rest] = text.split(/\s+/);
    instructions.push({ line: startLine, keyword: keyword.toUpperCase(), args: rest.join(' ') });
  }

  const stageNames = new Set();
  // ARGs declared before the first FROM can name base images; only their
  // defaults are known statically, so an ARG without one cannot be checked.
  const globalArgs = new Map();
  let seenFrom = false;
  let finalStageUser = null;
  let finalStageLine = 0;
  for (const { line, keyword, args } of instructions) {
    if (keyword === 'ARG' && !seenFrom) {
      const [name, ...value] = args.split('=');
      globalArgs.set(
        name.trim(),
        value.length > 0
          ? value
              .join('=')
              .trim()
              .replace(/^["']|["']$/g, '')
          : null,
      );
    } else if (keyword === 'FROM') {
      seenFrom = true;
      const tokens = args.split(/\s+/).filter((token) => !token.startsWith('--'));
      const [image = '', as, alias] = tokens;
      finalStageUser = null;
      finalStageLine = line;
      let isResolved = true;
      const baseImage = image.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_, name) => {
        const value = globalArgs.get(name);
        isResolved &&= typeof value === 'string';
        return value ?? '';
      });
      if (!isResolved) {
        violations.push({
          line,
          message: `Base image ${image} must be written out or use a global ARG default.`,
        });
      } else if (baseImage !== 'scratch' && !stageNames.has(baseImage.toLowerCase())) {
        const parsed = parseImageReference(baseImage);
        if (parsed.error) {
          violations.push({ line, message: `Base image ${baseImage}: ${parsed.error}` });
        }
      }
      if (as?.toUpperCase() === 'AS' && alias) {
        stageNames.add(alias.toLowerCase());
      }
    } else if (keyword === 'RUN') {
      if (/--security[= ]insecure/i.test(args)) {
        violations.push({ line, message: 'RUN --security=insecure is not allowed.' });
      }
      if (/--network[= ]host/i.test(args)) {
        violations.push({
          line,
          message: 'RUN --network=host is not allowed; builds cannot use the host network.',
        });
      }
      if (/--mount=[^\s]*type=(ssh|secret)/i.test(args)) {
        violations.push({
          line,
          message:
            'SSH and secret mounts are not available; HelloDeploy never passes private credentials to a build.',
        });
      }
    } else if (keyword === 'VOLUME') {
      violations.push({
        line,
        message:
          'VOLUME is not allowed; it creates storage on the host that HelloDeploy does not manage.',
      });
    } else if (keyword === 'USER') {
      finalStageUser = args.trim();
    }
  }
  if (instructions.length > 0 && !isNonRootImageUser(finalStageUser)) {
    violations.push({
      line: finalStageLine,
      message: 'The final stage must switch to a non-root USER, such as USER 10001.',
    });
  }
  return violations;
}
