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
 *   onLogLine: (line: string, stream: 'stdout'|'stderr') => void,
 * }} params
 * @returns {Promise<{ imageId: string }>}
 */
export async function buildDockerImage({
  contextDir,
  imageTag,
  buildTimeoutMs,
  noCache = false,
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
      // Resource limits on the build process itself
      '--memory',
      '1g',
      '--network',
      'none', // no network during build — dependencies must be in the image
      ...(noCache ? ['--no-cache'] : []),
      contextDir,
    ];

    logger.info('Docker: starting build', { imageTag });

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
 * Remove a Docker image by tag. Non-fatal — logs a warning on failure.
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
      resolve(); // always resolve — cleanup is best-effort
    });
    proc.on('error', () => resolve());
  });
}
