import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '@hellodeploy/observability';
import { env } from '../config/env.js';
import { processOutputLines } from './log-capture.js';

/**
 * Write the generated Dockerfile to the build context directory.
 *
 * @param {string} contextDir
 * @param {string} dockerfileContent
 * @returns {Promise<string>} path to Dockerfile
 */
export async function writeDockerfile(contextDir, dockerfileContent) {
  const path = join(contextDir, 'Dockerfile');
  await writeFile(path, dockerfileContent, 'utf8');
  return path;
}

/**
 * Build a Docker image from the prepared context directory.
 * SECURITY: Uses command arrays — no shell interpolation.
 *
 * @param {{
 *   contextDir: string,
 *   imageTag: string,
 *   buildTimeoutMs: number,
 *   buildMemoryMb: number,
 *   noCache?: boolean,
 *   buildArgs?: Record<string, string>,
 *   builderName?: string|null,
 *   onLogLine: (line: string, stream: 'stdout'|'stderr') => void,
 * }} params
 * @returns {Promise<{ imageId: string }>}
 */
export async function buildDockerImage({
  contextDir,
  imageTag,
  buildTimeoutMs,
  buildMemoryMb,
  noCache = false,
  buildArgs = {},
  builderName = null,
  onLogLine,
}) {
  return new Promise((resolve, reject) => {
    const args = createDockerBuildArgs({
      contextDir,
      imageTag,
      buildMemoryMb,
      noCache,
      buildArgs,
      builderName,
    });

    logger.info('Docker: starting build', {
      imageTag,
      // Names only. The values are public to browsers but there is no reason
      // to write them to the platform's own logs.
      buildArgNames: Object.keys(buildArgs),
    });

    const proc = spawn('docker', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let imageId = null;
    const stdoutBuf = [];
    const stderrBuf = [];

    proc.stdout.on('data', (chunk) => {
      stdoutBuf.push(chunk);
      processOutputLines(chunk).forEach((line) => onLogLine(line, 'stdout'));
    });

    proc.stderr.on('data', (chunk) => {
      stderrBuf.push(chunk);
      processOutputLines(chunk).forEach((line) => {
        onLogLine(line, 'stderr');
        // Docker prints the image ID to stderr in some versions
        const match = line.match(/(?:Successfully built|sha256:)([a-f0-9]{12,64})/i);
        if (match) {
          imageId = match[1];
        }
      });
    });

    // Build timeout
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Docker build timed out after ${buildTimeoutMs / 1000}s`));
    }, buildTimeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        logger.info('Docker: build succeeded', { imageTag, imageId: imageId ?? 'unknown' });
        resolve({ imageId: imageId ?? imageTag });
      } else {
        logger.warn('Docker: build failed', { imageTag, code });
        reject(new Error(`docker build exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`docker build spawn error: ${err.message}`));
    });
  });
}

/**
 * Assemble the `docker build` argument vector.
 *
 * With BuildKit (the default `docker build` since Engine 23) the per-build
 * `--memory` flag is accepted and silently ignored. A dedicated
 * `docker-container` builder carries the memory limit on its own container
 * instead, so builds routed to one omit the flag and `--load` the result back
 * into the local image store where the release pipeline expects it.
 * SECURITY: returns an argument array for spawn; nothing passes through a shell.
 */
export function createDockerBuildArgs({
  contextDir,
  imageTag,
  buildMemoryMb,
  noCache = false,
  buildArgs = {},
  builderName = null,
}) {
  return [
    ...(builderName ? ['buildx', 'build', '--builder', builderName, '--load'] : ['build']),
    '--tag',
    imageTag,
    '--file',
    join(contextDir, 'Dockerfile'),
    '--label',
    `hellodeploy.image=true`,
    '--label',
    `hellodeploy.tag=${imageTag}`,
    // SECURITY: only values a framework compiles into its client bundle reach
    // this list — see selectPublicBuildEnv. `docker history` exposes build
    // arguments, so anything secret must stay out and arrive at container
    // start instead. Values are never logged.
    ...Object.entries(buildArgs).flatMap(([name, value]) => ['--build-arg', `${name}=${value}`]),
    ...(builderName ? [] : ['--memory', `${buildMemoryMb}m`]),
    '--network',
    // Generated Node Dockerfiles install the lockfile's dependencies inside
    // the build. Use the builder's isolated network so a clean host can reach
    // the package registry, but never grant host networking. Runtime secrets
    // are injected only when the finished container starts.
    'default',
    ...(noCache ? ['--no-cache'] : []),
    contextDir,
  ];
}

export function createRemoteDockerBuildArgs({
  contextDir,
  imageRef,
  builderName,
  metadataFile,
  layoutDir,
  noCache = false,
  buildArgs = {},
}) {
  // The builder exports to the worker and never pushes: a killed build then
  // leaves nothing in the registry, and the builder needs no push credential.
  return [
    'buildx',
    'build',
    '--builder',
    builderName,
    '--output',
    `type=oci,dest=${layoutDir},tar=false`,
    '--provenance=true',
    '--sbom=true',
    '--metadata-file',
    metadataFile,
    '--tag',
    imageRef,
    '--file',
    join(contextDir, 'Dockerfile'),
    '--network',
    'default',
    ...Object.entries(buildArgs).flatMap(([name, value]) => ['--build-arg', `${name}=${value}`]),
    ...(noCache ? ['--no-cache'] : []),
    contextDir,
  ];
}

const IMAGE_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

/** Push exactly the built digest from a local OCI layout to its registry tag. */
export function createOrasPushArgs({ layoutDir, imageDigest, imageRef }) {
  return ['cp', '--from-oci-layout', `${layoutDir}@${imageDigest}`, imageRef];
}

function runTimedProcess(command, args, timeoutMs, { onLogLine, label }) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    for (const [stream, output] of [
      ['stdout', proc.stdout],
      ['stderr', proc.stderr],
    ]) {
      output.on('data', (chunk) => {
        processOutputLines(chunk).forEach((line) => onLogLine?.(line, stream));
      });
    }
    proc.on('close', (code) => {
      clearTimeout(timeout);
      code === 0 ? resolve() : reject(new Error(`${label} exited with code ${code}`));
    });
    proc.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`${label} could not start: ${error.message}`));
    });
  });
}

export async function buildAndPushDockerImage({
  contextDir,
  imageRef,
  builderName,
  buildTimeoutMs,
  noCache = false,
  buildArgs = {},
  onLogLine,
}) {
  if (!builderName) {
    throw new Error('Remote BuildKit builder is not configured.');
  }
  // The exported layout can be gigabytes, so it lives on the build volume
  // beside the clones rather than in a possibly small system temp directory.
  const metadataDir = await mkdtemp(join(env.BUILD_WORKSPACE_ROOT, '.export-'));
  const metadataFile = join(metadataDir, 'metadata.json');
  const layoutDir = join(metadataDir, 'layout');
  const args = createRemoteDockerBuildArgs({
    contextDir,
    imageRef,
    builderName,
    metadataFile,
    layoutDir,
    noCache,
    buildArgs,
  });
  const startedAt = Date.now();
  try {
    await runTimedProcess('docker', args, buildTimeoutMs, {
      onLogLine,
      label: 'Remote Docker build',
    });
    const metadata = JSON.parse(await readFile(metadataFile, 'utf8'));
    const imageDigest = metadata['containerimage.digest'];
    if (!IMAGE_DIGEST_PATTERN.test(imageDigest ?? '')) {
      throw new Error('Remote builder did not return a valid immutable image digest.');
    }
    // The push gets whatever build time is left; the manifest is written last,
    // so an interrupted push never leaves a usable tag behind.
    await runTimedProcess(
      'oras',
      createOrasPushArgs({ layoutDir, imageDigest, imageRef }),
      Math.max(buildTimeoutMs - (Date.now() - startedAt), 60_000),
      { onLogLine, label: 'Image push' },
    );
    return {
      imageRef: `${imageRef.split('@')[0]}@${imageDigest}`,
      imageDigest,
      childDigests: await readLayoutChildDigests(layoutDir, imageDigest),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await rm(metadataDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * The manifests an exported image index lists: the platform image and its
 * provenance and SBOM attestations. Registry cleanup needs them because GHCR
 * keeps each as its own package version.
 */
export async function readLayoutChildDigests(layoutDir, imageDigest) {
  const blob = await readFile(
    join(layoutDir, 'blobs', 'sha256', imageDigest.slice('sha256:'.length)),
    'utf8',
  );
  return (JSON.parse(blob).manifests ?? [])
    .map((descriptor) => descriptor.digest)
    .filter((digest) => IMAGE_DIGEST_PATTERN.test(digest ?? ''));
}

export async function inspectLocalImageDigest(imageTag) {
  const result = await runDocker(['image', 'inspect', '--format', '{{.Id}}', imageTag]);
  const imageDigest = result.stdout.trim();
  if (result.code !== 0 || !IMAGE_DIGEST_PATTERN.test(imageDigest)) {
    throw new Error('Docker did not return a valid immutable image ID.');
  }
  return { imageRef: imageDigest, imageDigest };
}

/**
 * Create the dedicated memory-limited buildx builder when it does not exist.
 * Builder definitions live in the invoking user's Docker config, so the worker
 * must create its own. An existing builder is left untouched: after changing
 * the memory limit an operator removes it (`docker buildx rm <name>`) and the
 * next worker start recreates it.
 *
 * @returns {Promise<{ created: boolean }>}
 */
export async function ensureBuildBuilder({ name, memoryMb }, deps = { run: runDocker }) {
  const inspect = await deps.run(['buildx', 'inspect', name]);
  if (inspect.code === 0) {
    return { created: false };
  }

  const create = await deps.run([
    'buildx',
    'create',
    '--name',
    name,
    '--driver',
    'docker-container',
    '--driver-opt',
    `memory=${memoryMb}m`,
    // Equal to memory: the build may not escape the limit through swap.
    '--driver-opt',
    `memory-swap=${memoryMb}m`,
    '--bootstrap',
  ]);
  if (create.code !== 0) {
    throw new Error(
      `Could not create build builder ${name}: ${create.stderr.trim().slice(0, 500)}`,
    );
  }
  return { created: true };
}

/**
 * Confirm that a pre-provisioned remote builder is reachable. Remote builders
 * are infrastructure-owned: the runtime worker must never create or silently
 * replace one with a local builder.
 */
export async function verifyRemoteBuildBuilder(name, deps = { run: runDocker }) {
  const inspect = await deps.run(['buildx', 'inspect', name, '--bootstrap']);
  if (inspect.code !== 0) {
    throw new Error(
      `Remote build builder ${name} is unavailable: ${inspect.stderr.trim().slice(0, 500)}`,
    );
  }
  return { ready: true };
}

function runDocker(args) {
  return new Promise((resolve) => {
    const stdout = [];
    const stderr = [];
    const proc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', (chunk) => stdout.push(chunk));
    proc.stderr.on('data', (chunk) => stderr.push(chunk));
    proc.on('close', (code) =>
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }),
    );
    proc.on('error', (err) => resolve({ code: -1, stdout: '', stderr: err.message }));
  });
}

/**
 * Remove a Docker image by tag and report whether Docker confirmed removal.
 * SECURITY: command array.
 */
/**
 * The reference to remove a failed build's image by. A bare image ID is shared
 * by every identical build, including retained releases kept for rollback, so
 * removal falls back to the deployment's unique tag.
 */
export function removableImageReference({ imageRef, imageTag }) {
  return imageRef && !imageRef.startsWith('sha256:') ? imageRef : imageTag;
}

export async function removeDockerImage(imageTag) {
  return new Promise((resolve) => {
    const proc = spawn('docker', ['rmi', '--force', imageTag], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        logger.warn('Docker: failed to remove image', { imageTag });
      }
      resolve(code === 0);
    });
    proc.on('error', () => resolve(false));
  });
}

/**
 * Remove dangling (untagged, unreferenced) images left behind by interrupted
 * or superseded builds. Only ever touches untagged images — a tagged,
 * in-use release image is never a candidate, so this cannot affect a live
 * deployment. Returns the number of images removed.
 */
export async function pruneDanglingImages() {
  return new Promise((resolve) => {
    const out = [];
    const proc = spawn('docker', ['image', 'prune', '--force'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', (d) => out.push(d));
    proc.on('close', (code) => {
      if (code !== 0) {
        logger.warn('Docker: dangling image prune failed');
        return resolve(0);
      }
      const stdout = Buffer.concat(out).toString('utf8');
      const deleted = stdout.match(/^deleted:/gim)?.length ?? 0;
      resolve(deleted);
    });
    proc.on('error', () => resolve(0));
  });
}
