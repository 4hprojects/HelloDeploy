import { Project, Repository } from '@hellodeploy/database';
import {
  RuntimeType,
  AuditOutcome,
  RepositorySourceType,
  DetectionStatus,
  DetectionConfidence,
  PackageManager,
} from '@hellodeploy/contracts';
import { logger, writeAuditEvent } from '@hellodeploy/observability';
import { getInstallationToken } from './github.service.js';

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
 *   packageManager: string,
 *   confidence: string,
 *   fieldConfidence: { [field: string]: string },
 *   issues: Array<{ level: 'ERROR' | 'WARNING', message: string }>,
 *   isValid: boolean,
 * }}
 */
// Order matters: the weakest evidence for any single field decides the overall
// confidence, so a strong framework match cannot mask a guessed port.
const CONFIDENCE_RANK = {
  [DetectionConfidence.HIGH]: 3,
  [DetectionConfidence.MEDIUM]: 2,
  [DetectionConfidence.LOW]: 1,
};

function lowestConfidence(fieldConfidence) {
  const scored = Object.values(fieldConfidence).filter((level) => CONFIDENCE_RANK[level]);
  if (scored.length === 0) {
    return DetectionConfidence.LOW;
  }
  return scored.reduce((worst, level) =>
    CONFIDENCE_RANK[level] < CONFIDENCE_RANK[worst] ? level : worst,
  );
}

/** Infer the package manager from whichever lock file is committed. */
export function detectPackageManager(files) {
  if (files['pnpm-lock.yaml']) {
    return PackageManager.PNPM;
  }
  if (files['yarn.lock']) {
    return PackageManager.YARN;
  }
  if (files['package-lock.json']) {
    return PackageManager.NPM;
  }
  return PackageManager.UNKNOWN;
}

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
        packageManager: PackageManager.UNKNOWN,
        confidence: DetectionConfidence.HIGH,
        fieldConfidence: {
          runtimeType: DetectionConfidence.HIGH,
          outputDirectory: DetectionConfidence.HIGH,
        },
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
      packageManager: detectPackageManager(files),
      confidence: DetectionConfidence.LOW,
      fieldConfidence: { runtimeType: DetectionConfidence.LOW },
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
      packageManager: detectPackageManager(files),
      confidence: DetectionConfidence.LOW,
      fieldConfidence: { runtimeType: DetectionConfidence.LOW },
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

  // A command declared by the project is strong evidence; one filled in from a
  // framework's convention is weaker, and a port we simply assume is weakest.
  const fieldConfidence = {};
  const declared = (value) => (value ? DetectionConfidence.HIGH : DetectionConfidence.MEDIUM);

  if ('next' in deps) {
    runtimeType = RuntimeType.NEXTJS;
    fieldConfidence.runtimeType = DetectionConfidence.HIGH;
    fieldConfidence.buildCommand = declared(scripts.build);
    fieldConfidence.startCommand = declared(scripts.start);
    fieldConfidence.outputDirectory = DetectionConfidence.HIGH;
    buildCommand = buildCommand ?? 'npm run build';
    startCommand = startCommand ?? 'npm start';
    outputDirectory = '.next';
  } else if ('react-scripts' in deps) {
    runtimeType = RuntimeType.REACT;
    fieldConfidence.runtimeType = DetectionConfidence.HIGH;
    fieldConfidence.buildCommand = declared(scripts.build);
    fieldConfidence.outputDirectory = DetectionConfidence.HIGH;
    buildCommand = buildCommand ?? 'npm run build';
    startCommand = null; // static output, served via nginx in prod
    outputDirectory = pkg.homepage?.startsWith('.') ? 'build' : 'build';
  } else if (
    'react' in deps &&
    (files['vite.config.js'] !== null || files['vite.config.ts'] !== null)
  ) {
    runtimeType = RuntimeType.REACT;
    fieldConfidence.runtimeType = DetectionConfidence.HIGH;
    fieldConfidence.buildCommand = declared(scripts.build);
    fieldConfidence.outputDirectory = DetectionConfidence.HIGH;
    buildCommand = buildCommand ?? 'npm run build';
    startCommand = null;
    outputDirectory = 'dist';
  } else if (
    'vue' in deps &&
    (files['vite.config.js'] !== null || files['vite.config.ts'] !== null)
  ) {
    runtimeType = RuntimeType.VUE;
    fieldConfidence.runtimeType = DetectionConfidence.HIGH;
    fieldConfidence.buildCommand = declared(scripts.build);
    fieldConfidence.outputDirectory = DetectionConfidence.HIGH;
    buildCommand = buildCommand ?? 'npm run build';
    startCommand = null;
    outputDirectory = 'dist';
  } else if ('vue' in deps && '@vue/cli-service' in deps) {
    runtimeType = RuntimeType.VUE;
    fieldConfidence.runtimeType = DetectionConfidence.HIGH;
    fieldConfidence.buildCommand = declared(scripts.build);
    fieldConfidence.outputDirectory = DetectionConfidence.HIGH;
    buildCommand = buildCommand ?? 'npm run build';
    startCommand = null;
    outputDirectory = 'dist';
  } else if ('express' in deps) {
    runtimeType = RuntimeType.EXPRESS;
    fieldConfidence.runtimeType = DetectionConfidence.HIGH;
    fieldConfidence.startCommand = declared(scripts.start);
    // Nothing in the project states the port; 3000 is a convention we assume.
    fieldConfidence.applicationPort = DetectionConfidence.LOW;
    applicationPort = 3000;
  } else if (scripts.start) {
    // Only evidence is that *something* can be started. No framework marker.
    runtimeType = RuntimeType.NODEJS;
    fieldConfidence.runtimeType = DetectionConfidence.LOW;
    fieldConfidence.startCommand = DetectionConfidence.HIGH;
    fieldConfidence.applicationPort = DetectionConfidence.LOW;
    applicationPort = 3000;
  } else {
    runtimeType = RuntimeType.UNKNOWN;
    fieldConfidence.runtimeType = DetectionConfidence.LOW;
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

  // ── Lock file / package manager ─────────────────────────────────────────────
  const packageManager = detectPackageManager(files);

  if (packageManager === PackageManager.UNKNOWN) {
    issues.push({
      level: 'WARNING',
      message:
        'No lock file found (package-lock.json / yarn.lock / pnpm-lock.yaml). Commit a lock file for reproducible builds.',
    });
  } else if (packageManager !== PackageManager.NPM) {
    // Builds install with `npm ci`, which needs package-lock.json. Surface this
    // rather than letting the build fail with an opaque npm error.
    issues.push({
      level: 'WARNING',
      message:
        packageManager === PackageManager.PNPM
          ? 'This project uses pnpm, but HelloDeploy installs packages with npm. Commit a package-lock.json so the build can install your dependencies.'
          : 'This project uses Yarn, but HelloDeploy installs packages with npm. Commit a package-lock.json so the build can install your dependencies.',
    });
  }

  // ── Dockerfile warning ──────────────────────────────────────────────────────
  if (files['Dockerfile'] !== null) {
    issues.push({
      level: 'WARNING',
      message:
        'A Dockerfile was found. HelloDeploy manages containerisation — your Dockerfile will be ignored.',
    });
  }

  const hasErrors = issues.some((i) => i.level === 'ERROR');
  return {
    runtimeType,
    buildCommand: buildCommand ?? null,
    startCommand: startCommand ?? null,
    outputDirectory,
    applicationPort,
    packageManager,
    confidence: lowestConfidence(fieldConfidence),
    fieldConfidence,
    issues,
    isValid: !hasErrors,
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
  'next.config.mjs',
  'next.config.ts',
  'bun.lock',
  'astro.config.mjs',
  'nuxt.config.ts',
  'Procfile',
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
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`;
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
export async function fetchProjectFiles(installationId, fullName, ref) {
  const token = await getInstallationToken(installationId);
  const [owner, repo] = fullName.split('/');

  const results = await Promise.allSettled(
    FILES_TO_FETCH.map((path) => fetchGithubFile(token, owner, repo, path, ref)),
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

export async function fetchProjectFilesForRepository(repository, ref) {
  const token =
    repository.sourceType === RepositorySourceType.PUBLIC_GIT
      ? null
      : await getInstallationToken(repository.installationId);
  const [owner, repo] = repository.fullName.split('/');
  const results = await Promise.allSettled(
    FILES_TO_FETCH.map((path) => fetchGithubFile(token, owner, repo, path, ref)),
  );
  const files = {};
  FILES_TO_FETCH.forEach((path, index) => {
    files[path] = results[index].status === 'fulfilled' ? results[index].value : null;
  });
  return files;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

function safeDetectionIssues(issues) {
  return issues.map(({ level, message }) => ({
    level: level === 'WARNING' ? 'WARNING' : 'ERROR',
    message: String(message).slice(0, 500),
  }));
}

async function persistDetectionResult(projectId, result, checkedCommitSha = null) {
  await Project.updateOne(
    { _id: projectId },
    {
      $set: {
        detection: {
          status: result.isValid ? DetectionStatus.READY : DetectionStatus.NEEDS_ATTENTION,
          issues: safeDetectionIssues(result.issues),
          confidence: result.confidence ?? DetectionConfidence.LOW,
          fieldConfidence: result.fieldConfidence ?? {},
          packageManager: result.packageManager ?? PackageManager.UNKNOWN,
          checkedCommitSha,
          checkedAt: new Date(),
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
    files = await fetchProjectFilesForRepository(repo, ref);
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

  // Persist detected config to project
  await Project.updateOne(
    { _id: project._id },
    {
      $set: {
        runtimeType: result.runtimeType,
        'buildConfiguration.buildCommand': result.buildCommand,
        'buildConfiguration.startCommand': result.startCommand,
        'buildConfiguration.outputDirectory': result.outputDirectory,
        'buildConfiguration.applicationPort': result.applicationPort,
        detection: {
          status: result.isValid ? DetectionStatus.READY : DetectionStatus.NEEDS_ATTENTION,
          issues: safeDetectionIssues(result.issues),
          confidence: result.confidence ?? DetectionConfidence.LOW,
          fieldConfidence: result.fieldConfidence ?? {},
          packageManager: result.packageManager ?? PackageManager.UNKNOWN,
          checkedCommitSha: repo.lastCommitSha,
          checkedAt: new Date(),
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

  return result;
}
