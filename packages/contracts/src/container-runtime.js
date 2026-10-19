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
    segments.length > 1 &&
    (segments[0].includes('.') || segments[0].includes(':') || segments[0] === 'localhost');
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

/**
 * True when an image `User` value is a numeric uid other than 0. Names are not
 * accepted: Docker resolves them through the image's own /etc/passwd, which
 * the owner controls and can map to uid 0.
 */
export function isNonRootImageUser(user) {
  const uid = String(user ?? '')
    .trim()
    .split(':')[0];
  return /^\d+$/.test(uid) && Number(uid) > 0;
}

/**
 * Environment-variable prefixes a project can pass to its build. Each is a
 * framework's marker for values compiled into client code, so they are
 * already public.
 */
export const PUBLIC_BUILD_ENV_PREFIXES = Object.freeze([
  'NEXT_PUBLIC_',
  'VITE_',
  'REACT_APP_',
  'VUE_APP_',
]);

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
      const directive = trimmed.match(/^#\s*([a-z]+)\s*=(.*)$/i);
      if (directive) {
        // Continuations are joined on a backslash below, so another escape
        // character would make this check see different instructions than BuildKit.
        if (directive[1].toLowerCase() === 'escape' && directive[2].trim() !== '\\') {
          violations.push({
            line: index + 1,
            message: 'Only the default backslash escape character is supported.',
          });
        }
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
  // COPY --from and RUN --mount from= can read any image, not only a stage, so
  // they get the same registry rule as FROM.
  const checkImageSource = (source, line) => {
    if (/^\d+$/.test(source) || stageNames.has(source.toLowerCase())) {
      return;
    }
    const parsed = parseImageReference(source);
    if (parsed.error) {
      violations.push({ line, message: `Image ${source}: ${parsed.error}` });
    }
  };
  // ARGs declared before the first FROM can name base images; only their
  // defaults are known statically, so an ARG without one cannot be checked.
  const globalArgs = new Map();
  let seenFrom = false;
  // undefined means the user comes from an external base image, which the
  // activation check reads from the pulled image itself.
  const stageUsers = new Map();
  let currentStage = null;
  let finalStageUser;
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
      finalStageLine = line;
      let isResolved = true;
      let usesProjectBuildArg = false;
      const baseImage = image.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_, name) => {
        const value = globalArgs.get(name);
        isResolved &&= typeof value === 'string';
        usesProjectBuildArg ||= PUBLIC_BUILD_ENV_PREFIXES.some((prefix) => name.startsWith(prefix));
        return value ?? '';
      });
      finalStageUser = stageNames.has(baseImage.toLowerCase())
        ? stageUsers.get(baseImage.toLowerCase())
        : undefined;
      currentStage = as?.toUpperCase() === 'AS' && alias ? alias.toLowerCase() : null;
      if (currentStage) {
        stageUsers.set(currentStage, finalStageUser);
      }
      if (usesProjectBuildArg) {
        violations.push({
          line,
          message: `Base image ${image} uses a build argument the project environment can override; write the image out instead.`,
        });
      } else if (!isResolved) {
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
    } else if (keyword === 'COPY' || keyword === 'ADD') {
      for (const token of args.split(/\s+/)) {
        if (token.toLowerCase().startsWith('--from=')) {
          checkImageSource(token.slice('--from='.length), line);
        }
      }
    } else if (keyword === 'RUN') {
      for (const token of args.split(/\s+/)) {
        if (token.toLowerCase().startsWith('--mount=')) {
          for (const option of token.slice('--mount='.length).split(',')) {
            if (option.toLowerCase().startsWith('from=')) {
              checkImageSource(option.slice('from='.length), line);
            }
          }
        }
      }
      if (/--security[= ]insecure/i.test(args)) {
        violations.push({ line, message: 'RUN --security=insecure is not allowed.' });
      }
      if (/--network[= ]host/i.test(args)) {
        violations.push({
          line,
          message: 'RUN --network=host is not allowed; builds cannot use the host network.',
        });
      }
      if (
        args
          .split(/\s+/)
          .filter((token) => token.toLowerCase().startsWith('--mount='))
          .some((token) =>
            token
              .slice('--mount='.length)
              .split(',')
              .some((option) => ['type=ssh', 'type=secret'].includes(option.toLowerCase())),
          )
      ) {
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
      if (currentStage) {
        stageUsers.set(currentStage, finalStageUser);
      }
    }
  }
  if (finalStageUser !== undefined && !isNonRootImageUser(finalStageUser)) {
    violations.push({
      line: finalStageLine,
      message: 'The final stage must run as a numeric non-root USER, such as USER 10001.',
    });
  }
  return violations;
}
