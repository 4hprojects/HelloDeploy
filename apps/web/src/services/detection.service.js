import { Project, Repository } from '@hellodeploy/database';
import { RuntimeType, AuditOutcome } from '@hellodeploy/contracts';
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
 *   issues: Array<{ level: 'ERROR' | 'WARNING', message: string }>,
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
    startCommand = startCommand ?? 'npm start';
    outputDirectory = '.next';
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
    applicationPort = 3000;
  } else if (scripts.start) {
    runtimeType = RuntimeType.NODEJS;
    applicationPort = 3000;
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
  const hasLockFile =
    files['package-lock.json'] !== null ||
    files['yarn.lock'] !== null ||
    files['pnpm-lock.yaml'] !== null;

  if (!hasLockFile) {
    issues.push({
      level: 'WARNING',
      message:
        'No lock file found (package-lock.json / yarn.lock / pnpm-lock.yaml). Commit a lock file for reproducible builds.',
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
];

async function fetchGithubFile(token, owner, repo, path, ref) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
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
  const data = await res.json();
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

// ─── Orchestrator ─────────────────────────────────────────────────────────────

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
    return {
      isValid: false,
      runtimeType: RuntimeType.UNKNOWN,
      issues: [{ level: 'ERROR', message: 'No repository connected. Connect a repository first.' }],
    };
  }

  const repo = await Repository.findById(project.repositoryId);
  if (!repo || repo.accessStatus !== 'ACTIVE') {
    return {
      isValid: false,
      runtimeType: RuntimeType.UNKNOWN,
      issues: [{ level: 'ERROR', message: 'Repository access is no longer active.' }],
    };
  }

  const ref = repo.lastCommitSha ?? project.productionBranch ?? repo.defaultBranch;

  let files;
  try {
    files = await fetchProjectFiles(repo.installationId, repo.fullName, ref);
  } catch (err) {
    logger.warn('Detection: GitHub fetch failed', { projectId, error: err.message });
    return {
      isValid: false,
      runtimeType: RuntimeType.UNKNOWN,
      issues: [
        {
          level: 'ERROR',
          message: `Could not retrieve repository files from GitHub: ${err.message}`,
        },
      ],
    };
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
