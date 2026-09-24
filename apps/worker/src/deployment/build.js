import { selectPublicBuildEnv } from './public-build-env.js';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '@hellodeploy/observability';
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
 *   noCache?: boolean,
 *   buildArgs?: Record<string, string>,
 *   onLogLine: (line: string, stream: 'stdout'|'stderr') => void,
 * }} params
 * @returns {Promise<{ imageId: string }>}
 */
export async function buildDockerImage({
  contextDir,
  imageTag,
  buildTimeoutMs,
  noCache = false,
  buildArgs = {},
  onLogLine,
}) {
  return new Promise((resolve, reject) => {
    // SECURITY: command array — no shell, no string interpolation
    const args = [
      'build',
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
      // Resource limits on the build process itself
      '--memory',
      '1g',
      '--network',
      // Generated Node Dockerfiles install the lockfile's dependencies inside
      // the build. Use Docker's isolated builder network so a clean host can
      // reach the package registry, but never grant host networking. Runtime
      // secrets are injected only when the finished container starts.
      'default',
      ...(noCache ? ['--no-cache'] : []),
      contextDir,
    ];

    logger.info('Docker: starting build', {
      imageTag,
      // Names only. The values are public to browsers but there is no reason
      // to write them to the platform's own logs.
      buildArgNames: Object.keys(buildArgs),
    });

    const publicValues = selectPublicBuildEnv(buildArgs);
    for (const name of Object.keys(publicValues)) {
      args.splice(args.length - 1, 0, '--build-arg', name);
    }
    const proc = spawn('docker', args, {
      env: { ...process.env, ...publicValues, DOCKER_BUILDKIT: '1' },
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
 * Remove a Docker image by tag and report whether Docker confirmed removal.
 * SECURITY: command array.
 */
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
