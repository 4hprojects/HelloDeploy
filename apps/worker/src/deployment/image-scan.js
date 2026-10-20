import { spawn } from 'node:child_process';

const MAX_REPORTED_IDS = 5;

/** The scanner itself could not run; the image was not judged. */
export class ImageScanUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImageScanUnavailableError';
    this.code = 'IMAGE_SCAN_UNAVAILABLE';
  }
}

function runTrivy(args, env) {
  return new Promise((resolve) => {
    const stdout = [];
    const stderr = [];
    const proc = spawn('trivy', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    proc.stdout.on('data', (chunk) => stdout.push(chunk));
    proc.stderr.on('data', (chunk) => stderr.push(chunk));
    proc.on('close', (code) =>
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }),
    );
    proc.on('error', (error) => resolve({ code: -1, stdout: '', stderr: error.message }));
  });
}

/**
 * Scan an owner image for fixable critical vulnerabilities with Trivy.
 *
 * @param {string} imageRef digest-pinned reference
 * @param {{ dockerConfigDir?: string, run?: Function }} options
 * @returns {Promise<{ criticalCount: number, ids: string[] }>}
 */
export async function scanImage(imageRef, { dockerConfigDir, platform, run = runTrivy } = {}) {
  const result = await run(
    [
      'image',
      // A digest may name a multi-platform index; scan the variant that runs here.
      ...(platform ? ['--platform', platform] : []),
      '--quiet',
      '--no-progress',
      '--severity',
      'CRITICAL',
      '--ignore-unfixed',
      '--format',
      'json',
      imageRef,
    ],
    dockerConfigDir ? { DOCKER_CONFIG: dockerConfigDir } : {},
  );
  if (result.code !== 0) {
    throw new ImageScanUnavailableError(
      `The image scanner could not run: ${result.stderr.trim().slice(0, 300)}`,
    );
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new ImageScanUnavailableError('The image scanner returned a report that is not JSON.');
  }
  const ids = (report.Results ?? []).flatMap((entry) =>
    (entry.Vulnerabilities ?? []).map((vulnerability) => vulnerability.VulnerabilityID),
  );
  // One CVE can appear in several packages of the same image; count it once.
  const uniqueIds = [...new Set(ids)];
  return { criticalCount: uniqueIds.length, ids: uniqueIds.slice(0, MAX_REPORTED_IDS) };
}
