import { Project, Repository } from '@hellodeploy/database';
import {
  RuntimeType,
  AuditOutcome,
  RepositorySourceType,
  DetectionStatus,
  PLATFORM_MANAGED_ENV_NAMES,
  BuildStrategy,
  normalizeApplicationRoot,
} from '@hellodeploy/contracts';
import { logger, writeAuditEvent } from '@hellodeploy/observability';
import { getInstallationToken } from './github.service.js';
import { recordProductEvent } from './product-analytics.service.js';

const NEXT_OUTPUT_PATTERNS = Object.freeze({
  [BuildStrategy.NEXT_EXPORT_V1]: /\boutput\s*:\s*['"]export['"]/,
  [BuildStrategy.NEXT_STANDALONE_V1]: /\boutput\s*:\s*['"]standalone['"]/,
});

function detectNextStrategy(files) {
  const configs = [
    'next.config.js',
    'next.config.cjs',
    'next.config.mjs',
    'next.config.ts',
    'next.config.mts',
  ]
    .map((path) => files[path])
    .filter((content) => typeof content === 'string');
  // This is deliberately a static, conservative read. Removing comments avoids
  // confirming examples that are not active configuration; anything more
  // dynamic falls back to an explicit standard-mode recommendation.
  const content = configs
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const matches = Object.entries(NEXT_OUTPUT_PATTERNS).filter(([, pattern]) =>
    pattern.test(content),
  );
  if (matches.length === 1) {
    const [strategy] = matches[0];
    return {
      strategy,
      ambiguous: false,
      rationale:
        strategy === BuildStrategy.NEXT_EXPORT_V1
          ? 'Next.js output: export was found; the generated files can be served statically.'
          : 'Next.js output: standalone was found; the minimal standalone server can be used.',
    };
  }
  const ambiguous = matches.length > 1 || /\boutput\s*:/.test(content);
  return {
    strategy: BuildStrategy.NEXT_STANDARD_V1,
    ambiguous,
    rationale: ambiguous
      ? 'The Next.js output setting is dynamic or unsupported, so standard next start is recommended.'
      : 'No static export or standalone output setting was found, so standard next start is recommended.',
  };
}

// ─── Pure runtime analyzer ────────────────────────────────────────────────────
// Exported so tests can call it directly without any HTTP or DB interaction.

/**
 * Detect the runtime type and validate project configuration from fetched files.
 *
 * @param {{ [filename: string]: string | null }} files
 *   Keys are paths relative to repo root. Values are file content strings,
 *   or null if the file is not present in the repository.
 *
 * @returns {{
 *   runtimeType: string,
 *   buildCommand: string | null,
 *   startCommand: string | null,
 *   outputDirectory: string | null,
 *   applicationPort: number | null,
 *   issues: Array<{ level: 'ERROR' | 'WARNING' | 'INFO', message: string }>,
 *   isValid: boolean,
 * }}
 */
export function detectRuntime(files) {
  const issues = [];

  // ── No package.json — static or unknown ────────────────────────────────────
  if (!files['package.json']) {
    if (files['index.html'] !== null) {
      return {
        runtimeType: RuntimeType.STATIC,
        buildCommand: null,
        startCommand: null,
        outputDirectory: '.',
        applicationPort: null,
        issues: [],
        isValid: true,
      };
    }
    issues.push({
      level: 'ERROR',
      message:
        'No package.json or index.html found. Only static (HTML) and Node.js projects are supported.',
    });
    return {
      runtimeType: RuntimeType.UNKNOWN,
      buildCommand: null,
      startCommand: null,
      outputDirectory: null,
      applicationPort: null,
      issues,
      isValid: false,
    };
  }

  // ── Parse package.json ──────────────────────────────────────────────────────
  let pkg;
  try {
    pkg = JSON.parse(files['package.json']);
  } catch {
    issues.push({ level: 'ERROR', message: 'package.json is not valid JSON.' });
    return {
      runtimeType: RuntimeType.UNKNOWN,
      buildCommand: null,
      startCommand: null,
      outputDirectory: null,
      applicationPort: null,
      issues,
      isValid: false,
    };
  }

  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const scripts = pkg.scripts ?? {};

  // ── Detect framework ────────────────────────────────────────────────────────

  let runtimeType;
  let buildCommand = scripts.build ?? null;
  let startCommand = scripts.start ?? null;
  let outputDirectory = null;
  let applicationPort = null;

  if ('next' in deps) {
    runtimeType = RuntimeType.NEXTJS;
    buildCommand = buildCommand ?? 'npm run build';
    const nextStrategy = detectNextStrategy(files);
    if (nextStrategy.strategy === BuildStrategy.NEXT_EXPORT_V1) {
      startCommand = null;
      outputDirectory = 'out';
      applicationPort = null;
    } else if (nextStrategy.strategy === BuildStrategy.NEXT_STANDALONE_V1) {
      startCommand = 'node server.js';
      outputDirectory = '.next';
      applicationPort = 3000;
    } else {
      startCommand = startCommand ?? 'npm start';
      outputDirectory = '.next';
      applicationPort = 3000;
    }
    if (nextStrategy.ambiguous) {
      issues.push({
        level: 'WARNING',
        message:
          'HelloDeploy could not statically confirm the Next.js output mode. Review the recommended standard-server mode before deploying.',
      });
    }
  } else if ('react-scripts' in deps) {
    runtimeType = RuntimeType.REACT;
    buildCommand = buildCommand ?? 'npm run build';
    startCommand = null; // static output, served via nginx in prod
    outputDirectory = pkg.homepage?.startsWith('.') ? 'build' : 'build';
  } else if (
    'react' in deps &&
    (files['vite.config.js'] !== null || files['vite.config.ts'] !== null)
  ) {
    runtimeType = RuntimeType.REACT;
    buildCommand = buildCommand ?? 'npm run build';
    startCommand = null;
    outputDirectory = 'dist';
  } else if (
    'vue' in deps &&
    (files['vite.config.js'] !== null || files['vite.config.ts'] !== null)
  ) {
    runtimeType = RuntimeType.VUE;
    buildCommand = buildCommand ?? 'npm run build';
    startCommand = null;
    outputDirectory = 'dist';
  } else if ('vue' in deps && '@vue/cli-service' in deps) {
    runtimeType = RuntimeType.VUE;
    buildCommand = buildCommand ?? 'npm run build';
    startCommand = null;
    outputDirectory = 'dist';
  } else if ('express' in deps) {
    runtimeType = RuntimeType.EXPRESS;
    applicationPort = findSamplePort(files) ?? 3000;
  } else if (scripts.start) {
    runtimeType = RuntimeType.NODEJS;
    applicationPort = findSamplePort(files) ?? 3000;
  } else {
    runtimeType = RuntimeType.UNKNOWN;
    issues.push({
      level: 'ERROR',
      message:
        'Could not identify a supported runtime. Ensure a "start" script exists in package.json, or that a supported framework (Express, React, Vue, Next.js) is listed as a dependency.',
    });
  }

  // ── Validate start/build requirements ──────────────────────────────────────

  if ([RuntimeType.EXPRESS, RuntimeType.NODEJS].includes(runtimeType)) {
    if (!scripts.start) {
      issues.push({
        level: 'ERROR',
        message:
          'No "start" script found in package.json. Add "start": "node server.js" (or similar).',
      });
    }
    // Warn if start script hardcodes a port number (not using PORT env var)
    if (scripts.start && /\b(?:port|PORT)\s*=?\s*\d{4,5}/i.test(scripts.start)) {
      issues.push({
        level: 'WARNING',
        message:
          'The "start" script appears to hardcode a port. Use the PORT environment variable: process.env.PORT || 3000.',
      });
    }
  }

  if ([RuntimeType.NEXTJS, RuntimeType.REACT, RuntimeType.VUE].includes(runtimeType)) {
    if (!scripts.build) {
      issues.push({
        level: 'ERROR',
        message:
          'No "build" script found in package.json. Add "build": "...' + '" to package.json.',
      });
    }
  }

  // ── Lock file check ─────────────────────────────────────────────────────────
  const hasPackageLock = files['package-lock.json'] !== null;
  const hasUnsupportedLockFile = files['yarn.lock'] !== null || files['pnpm-lock.yaml'] !== null;

  if (!hasPackageLock) {
    issues.push({
      level: 'ERROR',
      message: hasUnsupportedLockFile
        ? 'HelloDeploy currently supports npm projects only. Commit package-lock.json; Yarn and pnpm lockfiles are not yet supported.'
        : 'No package-lock.json found. HelloDeploy uses npm ci and requires an npm lockfile for reproducible builds.',
    });
  }

  // ── Dockerfile ──────────────────────────────────────────────────────────────
  // The build always uses a generated Dockerfile, so a user's one only matters
  // when the app relies on system packages it installs.
  if (files['Dockerfile'] !== null) {
    const systemPackages = findDockerfileSystemPackages(files['Dockerfile']);
    issues.push(
      systemPackages.length > 0
        ? {
            level: 'WARNING',
            message: `Your Dockerfile installs extra packages (${systemPackages.join(', ')}). HelloDeploy builds its own image and ignores your Dockerfile, so these will not be available and the app may fail at runtime.`,
          }
        : {
            level: 'INFO',
            message:
              'A Dockerfile was found. HelloDeploy builds its own container image, so your Dockerfile is ignored. No action is needed.',
          },
    );
  }

  const hasErrors = issues.some((i) => i.level === 'ERROR');
  const nextStrategy = runtimeType === RuntimeType.NEXTJS ? detectNextStrategy(files) : null;
  return {
    runtimeType,
    buildCommand: buildCommand ?? null,
    startCommand: startCommand ?? null,
    outputDirectory,
    applicationPort,
    issues,
    isValid: !hasErrors,
    recommendedBuildStrategy: nextStrategy?.strategy ?? BuildStrategy.LEGACY_GENERATED,
    strategyRationale: nextStrategy?.rationale ?? 'Existing generated-image behavior is preserved.',
  };
}

// ─── GitHub file fetching ─────────────────────────────────────────────────────

const FILES_TO_FETCH = [
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'index.html',
  'Dockerfile',
  'vite.config.js',
  'vite.config.ts',
  'next.config.js',
  'next.config.cjs',
  'next.config.mjs',
  'next.config.ts',
  'next.config.mts',
  '.env.example',
  '.env.sample',
  '.env.template',
];
const DETECTION_REQUEST_TIMEOUT_MS = 10_000;
const DETECTION_RESPONSE_MAX_BYTES = 750_000;

async function readBoundedDetectionResponse(res, path) {
  const declaredLength = Number.parseInt(res.headers.get('content-length') ?? '0', 10);
  if (declaredLength > DETECTION_RESPONSE_MAX_BYTES) {
    throw new Error(`GitHub API response too large for ${path}`);
  }
  const chunks = [];
  let receivedBytes = 0;
  const reader = res.body?.getReader();
  if (!reader) {
    return res.text();
  }
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    receivedBytes += value.byteLength;
    if (receivedBytes > DETECTION_RESPONSE_MAX_BYTES) {
      await reader.cancel();
      throw new Error(`GitHub API response too large for ${path}`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchGithubFile(token, owner, repo, path, ref) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(DETECTION_REQUEST_TIMEOUT_MS),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hellodeploy',
    },
  });
  if (res.status === 404) {
    return null; // file does not exist in this repo
  }
  if (!res.ok) {
    throw new Error(`GitHub API error fetching ${path}: ${res.status}`);
  }
  const responseText = await readBoundedDetectionResponse(res, path);
  const data = JSON.parse(responseText);
  // Directories return an array — treat as missing
  if (Array.isArray(data)) {
    return null;
  }
  if (data.encoding === 'base64') {
    return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
  }
  return data.content ?? null;
}

/**
 * Fetch key project files from GitHub for a specific commit ref.
 * Returns a map of filename → content (string) or null if absent.
 *
 * @param {number} installationId
 * @param {string} fullName - "owner/repo"
 * @param {string} ref - branch name or commit SHA
 * @returns {Promise<{ [filename: string]: string | null }>}
 */
function fileAtApplicationRoot(applicationRoot, path) {
  return applicationRoot === '.' ? path : `${applicationRoot}/${path}`;
}

export async function fetchProjectFiles(installationId, fullName, ref, applicationRoot = '.') {
  const token = await getInstallationToken(installationId);
  const [owner, repo] = fullName.split('/');

  const results = await Promise.allSettled(
    FILES_TO_FETCH.map((path) =>
      fetchGithubFile(token, owner, repo, fileAtApplicationRoot(applicationRoot, path), ref),
    ),
  );

  const files = {};
  FILES_TO_FETCH.forEach((path, i) => {
    const result = results[i];
    if (result.status === 'fulfilled') {
      files[path] = result.value; // string or null
    } else {
      logger.warn('Detection: failed to fetch file', { path, error: result.reason?.message });
      files[path] = null;
    }
  });
  return files;
}

export async function fetchProjectFilesForRepository(repository, ref, applicationRoot = '.') {
  const token =
    repository.sourceType === RepositorySourceType.PUBLIC_GIT
      ? null
      : await getInstallationToken(repository.installationId);
  const [owner, repo] = repository.fullName.split('/');
  const results = await Promise.allSettled(
    FILES_TO_FETCH.map((path) =>
      fetchGithubFile(token, owner, repo, fileAtApplicationRoot(applicationRoot, path), ref),
    ),
  );
  const files = {};
  FILES_TO_FETCH.forEach((path, index) => {
    files[path] = results[index].status === 'fulfilled' ? results[index].value : null;
  });
  return files;
}

const INSTALL_VERBS = Object.freeze({
  'apt-get': 'install',
  apt: 'install',
  apk: 'add',
  yum: 'install',
  dnf: 'install',
  pip: 'install',
  pip3: 'install',
});
const MAX_REPORTED_PACKAGES = 8;

/**
 * Names of the system and pip packages a Dockerfile's RUN steps install.
 * A best-effort read of common install commands, not a shell parser.
 */
export function findDockerfileSystemPackages(content) {
  const lines = String(content ?? '')
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n/);
  const packages = new Set();
  for (const line of lines) {
    const run = line.match(/^\s*RUN\s+(.*)$/i);
    if (!run) {
      continue;
    }
    for (const command of run[1].split(/&&|\|\||;|\|/)) {
      for (const name of installedPackages(command.trim().split(/\s+/))) {
        packages.add(name);
      }
    }
  }
  return [...packages].slice(0, MAX_REPORTED_PACKAGES);
}

function installedPackages(tokens) {
  const managerIndex = tokens.findIndex((token) => Object.hasOwn(INSTALL_VERBS, token));
  if (managerIndex === -1) {
    return [];
  }
  const verbIndex = tokens.indexOf(INSTALL_VERBS[tokens[managerIndex]], managerIndex + 1);
  if (verbIndex === -1) {
    return [];
  }
  const names = [];
  for (let index = verbIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '-r' || token === '--requirement') {
      const file = tokens[index + 1];
      if (file) {
        names.push(`packages from ${file.slice(0, 60)}`);
      }
      index += 1;
    } else if (token && !token.startsWith('-')) {
      // Drop version pins such as ffmpeg=7.* or flask==3.0.
      names.push(token.replace(/[=<>~!].*$/, '').slice(0, 60));
    }
  }
  return names.filter(Boolean);
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

function safeDetectionIssues(issues) {
  return issues.map(({ level, message }) => ({
    level: ['WARNING', 'INFO'].includes(level) ? level : 'ERROR',
    message: String(message).slice(0, 500),
  }));
}

/** Extract names only from conventional environment sample files. Values are never retained. */
// An app that ignores PORT and listens on its own fixed port usually documents
// that port in its sample env file; starting from it avoids a first deploy
// that health-checks the wrong port.
function findSamplePort(files) {
  for (const path of ['.env.example', '.env.sample', '.env.template']) {
    const match = files[path]?.match?.(
      /^\s*(?:export\s+)?PORT\s*=\s*["']?(\d{2,5})["']?\s*(?:#.*)?$/m,
    );
    const port = match ? Number(match[1]) : null;
    if (port >= 1 && port <= 65535) {
      return port;
    }
  }
  return null;
}

export function detectRequiredEnvironmentVariables(files) {
  const names = new Set();
  for (const path of ['.env.example', '.env.sample', '.env.template']) {
    const content = files[path];
    if (typeof content !== 'string') {
      continue;
    }
    for (const line of content.split(/\r?\n/).slice(0, 500)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=/i);
      const name = match?.[1].toUpperCase();
      if (name && !PLATFORM_MANAGED_ENV_NAMES.includes(name)) {
        names.add(name);
      }
      if (names.size >= 100) {
        break;
      }
    }
  }
  return [...names].sort();
}

function detectedConfiguration(result) {
  return {
    buildCommand: result.buildCommand ?? null,
    startCommand: result.startCommand ?? null,
    outputDirectory: result.outputDirectory ?? null,
    applicationPort: result.applicationPort ?? null,
    healthCheckPath: '/',
    applicationRoot: result.applicationRoot ?? '.',
  };
}

async function persistDetectionResult(projectId, result, checkedCommitSha = null) {
  await Project.updateOne(
    { _id: projectId },
    {
      $set: {
        detection: {
          status: result.isValid ? DetectionStatus.READY : DetectionStatus.NEEDS_ATTENTION,
          issues: safeDetectionIssues(result.issues),
          checkedCommitSha,
          checkedAt: new Date(),
          detectedConfiguration: null,
          requiredEnvironmentVariables: [],
        },
      },
    },
  );
}

/**
 * Run full project detection against the connected repository.
 * Fetches files from GitHub, runs the analyzer, and persists results to the project.
 *
 * @param {string} projectId
 * @param {string} actorId
 * @param {{ sourceIp?: string, correlationId?: string }} opts
 * @returns {Promise<{ isValid: boolean, runtimeType: string, issues: Array }>}
 */
export async function runProjectDetection(projectId, actorId, opts = {}) {
  const project = await Project.findById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (!project.repositoryId) {
    const result = {
      isValid: false,
      runtimeType: RuntimeType.UNKNOWN,
      issues: [{ level: 'ERROR', message: 'No repository connected. Connect a repository first.' }],
    };
    await persistDetectionResult(project._id, result);
    return result;
  }

  const repo = await Repository.findById(project.repositoryId);
  if (!repo || repo.accessStatus !== 'ACTIVE') {
    const result = {
      isValid: false,
      runtimeType: RuntimeType.UNKNOWN,
      issues: [{ level: 'ERROR', message: 'Repository access is no longer active.' }],
    };
    await persistDetectionResult(project._id, result);
    return result;
  }

  const ref = repo.lastCommitSha ?? project.productionBranch ?? repo.defaultBranch;

  let files;
  try {
    const applicationRoot = normalizeApplicationRoot(
      project.buildConfiguration?.applicationRoot ?? '.',
    );
    files = await fetchProjectFilesForRepository(repo, ref, applicationRoot);
  } catch (err) {
    logger.warn('Detection: GitHub fetch failed', { projectId, error: err.message });
    const result = {
      isValid: false,
      runtimeType: RuntimeType.UNKNOWN,
      issues: [
        {
          level: 'ERROR',
          message: 'Could not retrieve repository files from GitHub. Check access and try again.',
        },
      ],
    };
    await persistDetectionResult(project._id, result, repo.lastCommitSha);
    return result;
  }

  const result = detectRuntime(files);
  result.recommendedBuildStrategy ??= BuildStrategy.LEGACY_GENERATED;
  result.strategyRationale ??= 'Existing generated-image behavior is preserved.';
  result.applicationRoot = normalizeApplicationRoot(
    project.buildConfiguration?.applicationRoot ?? '.',
  );
  result.requiredEnvironmentVariables = detectRequiredEnvironmentVariables(files);
  const detected = detectedConfiguration(result);

  // Persist detected config to project
  await Project.updateOne(
    { _id: project._id },
    {
      $set: {
        runtimeType: result.runtimeType,
        buildConfiguration: detected,
        detection: {
          status: result.isValid ? DetectionStatus.READY : DetectionStatus.NEEDS_ATTENTION,
          issues: safeDetectionIssues(result.issues),
          checkedCommitSha: repo.lastCommitSha,
          checkedAt: new Date(),
          detectedConfiguration: detected,
          recommendedBuildStrategy: result.recommendedBuildStrategy,
          strategyRationale: result.strategyRationale,
          requiredEnvironmentVariables: result.requiredEnvironmentVariables,
        },
        configurationVersion: project.configurationVersion + 1,
      },
    },
  );

  await writeAuditEvent({
    action: 'project.detection_run',
    outcome: result.isValid ? AuditOutcome.SUCCESS : AuditOutcome.FAILURE,
    actorId,
    targetType: 'project',
    targetId: projectId,
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: {
      runtimeType: result.runtimeType,
      issueCount: result.issues.length,
      errorCount: result.issues.filter((i) => i.level === 'ERROR').length,
    },
  });
  await recordProductEvent({
    name: 'detection_completed',
    userId: actorId,
    projectId,
    properties: result.isValid ? null : { reason: 'fix_required' },
  });

  return result;
}
